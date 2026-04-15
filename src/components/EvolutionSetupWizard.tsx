import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Eye, EyeOff, ArrowRight, Loader2, QrCode, CheckCircle2,
  Wifi, WifiOff, RefreshCw, LogOut, AlertCircle, Smartphone,
  Globe, Key, Link2,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface WizardProps {
  settings: {
    evolution_api_url: string;
    evolution_api_key: string;
    evolution_instance: string;
    n8n_url: string;
    n8n_webhook_url: string;
  };
  onSettingsChange: (patch: Partial<WizardProps['settings']>) => void;
  onSave: () => Promise<void>;
}

type Step = 1 | 2 | 3;

export default function EvolutionSetupWizard({ settings, onSettingsChange, onSave }: WizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [showApiKey, setShowApiKey] = useState(false);

  // Step 1
  const [pinging, setPinging] = useState(false);
  const [pingError, setPingError] = useState('');

  // Step 2
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [countdown, setCountdown] = useState(45);
  const [pollingActive, setPollingActive] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [connectionPhone, setConnectionPhone] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // Step 3
  const [disconnecting, setDisconnecting] = useState(false);

  const [n8nConfigured, setN8nConfigured] = useState(false);

  // On mount, check if already connected
  useEffect(() => {
    if (settings.evolution_api_url && settings.evolution_api_key && settings.evolution_instance) {
      checkStatus().then((connected) => {
        if (connected) setStep(3);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      stopPolling();
      stopCountdown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPolling = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    setPollingActive(false);
  };

  const stopCountdown = () => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  const checkStatus = async (): Promise<boolean> => {
    if (!user) return false;
    try {
      const result = await api.evolutionStatus(user.id);
      if (result.connected) {
        setConnectionStatus('connected');
        setConnectionPhone(result.phone || '');
        return true;
      }
      setConnectionStatus('disconnected');
      return false;
    } catch {
      setConnectionStatus('disconnected');
      return false;
    }
  };

  const startPolling = useCallback(() => {
    stopPolling();
    setPollingActive(true);
    pollingRef.current = setInterval(async () => {
      try {
        const result = await api.evolutionStatus(user?.id || '');
        if (result.connected) {
          setConnectionStatus('connected');
          setConnectionPhone(result.phone || '');
          setQrCode(null);
          stopPolling();
          stopCountdown();
          setShowSuccess(true);
          // Save settings
          await onSave();
          // Auto-advance after animation
          setTimeout(() => {
            setShowSuccess(false);
            setStep(3);
          }, 2500);
        }
      } catch { /* retry */ }
    }, 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSave]);

  const startCountdown = () => {
    stopCountdown();
    setCountdown(45);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          stopCountdown();
          setQrCode(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // === STEP 1: Ping ===
  const handlePing = async () => {
    if (!user) return;
    setPinging(true);
    setPingError('');
    try {
      const result = await api.evolutionPing(
        settings.evolution_api_url,
        settings.evolution_api_key,
      );
      if (result.ok) {
        toast.success('Evolution API acessível!');
        await onSave();
        setStep(2);
        setTimeout(() => handleSetup(), 300);
      } else {
        setPingError(result.error || 'Não foi possível conectar à Evolution API. Verifique a URL e a API Key.');
      }
    } catch {
      setPingError('Erro ao testar conexão. Verifique se a URL está correta.');
    }
    setPinging(false);
  };

  // === STEP 2: Setup instance ===
  const handleSetup = async () => {
    if (!user) return;
    setCreatingInstance(true);
    try {
      const result = await api.evolutionSetup({
        userId: user.id,
        evolutionUrl: settings.evolution_api_url,
        evolutionApiKey: settings.evolution_api_key,
        n8nWebhookUrl: settings.n8n_webhook_url || undefined,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        if (result.qrCode) {
          setQrCode(result.qrCode);
          startCountdown();
          startPolling();
        }
        if (result.instanceName) {
          onSettingsChange({ evolution_instance: result.instanceName });
        }
        if (result.n8nConfigured) {
          setN8nConfigured(true);
        }
      }
    } catch {
      toast.error('Erro ao criar instância.');
    }
    setCreatingInstance(false);
  };

  const handleRefreshQR = async () => {
    if (!user) return;
    try {
      const result = await api.evolutionConnectQr(user.id);
      if (result.qrCode) {
        setQrCode(result.qrCode);
        startCountdown();
        if (!pollingActive) startPolling();
      } else {
        const connected = await checkStatus();
        if (connected) {
          setStep(3);
        } else {
          toast.error('QR Code não disponível. Tente criar a instância novamente.');
        }
      }
    } catch {
      toast.error('Erro ao gerar QR Code.');
    }
  };

  // === STEP 3: Disconnect ===
  const handleDisconnect = async () => {
    if (!user) return;
    setDisconnecting(true);
    try {
      await api.evolutionDisconnect(user.id);
      setConnectionStatus('disconnected');
      setConnectionPhone('');
      toast.success('WhatsApp desconectado.');
      setStep(2);
      setTimeout(() => handleSetup(), 300);
    } catch {
      toast.error('Erro ao desconectar.');
    }
    setDisconnecting(false);
  };

  const handleReconnect = async () => {
    setStep(2);
    setConnectionStatus('disconnected');
    setTimeout(() => handleSetup(), 300);
  };

  // Step indicator
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
            ${step === s ? 'bg-primary text-primary-foreground scale-110' :
              step > s ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}
          `}>
            {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
          </div>
          {s < 3 && (
            <div className={`w-12 h-0.5 transition-all duration-300 ${step > s ? 'bg-primary' : 'bg-muted'}`} />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <StepIndicator />

        {/* ===== STEP 1: Credentials ===== */}
        <div className={`transition-all duration-300 ${step === 1 ? 'opacity-100' : 'opacity-0 hidden'}`}>
          <div className="text-center mb-6">
            <h3 className="text-lg font-bold">Etapa 1 — Credenciais</h3>
            <p className="text-sm text-muted-foreground">Configure sua Evolution API e N8N</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                URL da Evolution API
              </Label>
              <Input
                value={settings.evolution_api_url}
                onChange={(e) => onSettingsChange({ evolution_api_url: e.target.value })}
                placeholder="https://evolution.meudominio.com"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                API Key Global
              </Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.evolution_api_key}
                  onChange={(e) => onSettingsChange({ evolution_api_key: e.target.value })}
                  placeholder="Sua chave de API da Evolution"
                  className="pr-10"
                />
                <Button
                  type="button" variant="ghost" size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <p className="text-xs text-muted-foreground mb-3 font-medium">N8N (opcional)</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    URL do N8N
                  </Label>
                  <Input
                    value={settings.n8n_url}
                    onChange={(e) => onSettingsChange({ n8n_url: e.target.value })}
                    placeholder="https://n8n.meudominio.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Webhook N8N
                  </Label>
                  <Input
                    value={settings.n8n_webhook_url}
                    onChange={(e) => onSettingsChange({ n8n_webhook_url: e.target.value })}
                    placeholder="https://n8n.meudominio.com/webhook/whatsapp"
                  />
                </div>
              </div>
            </div>

            {pingError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {pingError}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handlePing}
              disabled={pinging || !settings.evolution_api_url || !settings.evolution_api_key}
            >
              {pinging ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando...</>
              ) : (
                <>Próximo → Criar Instância<ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </div>
        </div>

        {/* ===== STEP 2: QR Code ===== */}
        <div className={`transition-all duration-300 ${step === 2 ? 'opacity-100' : 'opacity-0 hidden'}`}>
          {/* Success animation overlay */}
          {showSuccess ? (
            <div className="flex flex-col items-center justify-center py-12 animate-scale-in">
              <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-14 w-14 text-green-500 animate-fade-in" />
              </div>
              <h3 className="text-xl font-bold text-green-600 dark:text-green-400">WhatsApp Conectado!</h3>
              <p className="text-sm text-muted-foreground mt-1">{connectionPhone || 'Número detectado'}</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h3 className="text-lg font-bold">Etapa 2 — Conectar WhatsApp</h3>
                <p className="text-sm text-muted-foreground">Escaneie o QR Code para vincular</p>
              </div>

              {creatingInstance ? (
                <div className="flex flex-col items-center py-12">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
                  <p className="text-sm text-muted-foreground">Criando instância e gerando QR Code...</p>
                </div>
              ) : qrCode ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 bg-white rounded-xl shadow-lg">
                    <img
                      src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                      alt="QR Code WhatsApp"
                      className="w-[220px] h-[220px]"
                    />
                  </div>

                  <div className="text-center space-y-2">
                    <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
                      <Smartphone className="h-4 w-4" />
                      <span>WhatsApp → Dispositivos Conectados → Conectar</span>
                    </div>

                    {countdown > 0 ? (
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-32 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-1000"
                            style={{ width: `${(countdown / 45) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">{countdown}s</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-destructive">QR Code expirado</p>
                        <Button variant="outline" size="sm" onClick={handleRefreshQR}>
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Gerar novo QR Code
                        </Button>
                      </div>
                    )}

                    {pollingActive && countdown > 0 && (
                      <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Aguardando conexão...
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-8 gap-4">
                  <QrCode className="h-16 w-16 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Clique para gerar o QR Code</p>
                  <Button onClick={handleSetup}>
                    <QrCode className="h-4 w-4 mr-2" />
                    Gerar QR Code
                  </Button>
                </div>
              )}

              <div className="mt-6 flex justify-start">
                <Button variant="ghost" size="sm" onClick={() => { stopPolling(); stopCountdown(); setStep(1); }}>
                  ← Voltar
                </Button>
              </div>
            </>
          )}
        </div>

        {/* ===== STEP 3: Connected / Final ===== */}
        <div className={`transition-all duration-300 ${step === 3 ? 'opacity-100' : 'opacity-0 hidden'}`}>
          <div className="text-center mb-6">
            <h3 className="text-lg font-bold">Etapa 3 — Configurações Finais</h3>
            <p className="text-sm text-muted-foreground">Seu WhatsApp está vinculado</p>
          </div>

          {/* Connection badge */}
          <div className="flex items-center justify-center mb-6">
            <Badge variant="secondary" className="px-4 py-2 text-sm bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse mr-2" />
              Conectado — {connectionPhone || 'Número não identificado'}
            </Badge>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-center mb-6">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={disconnecting}>
                  {disconnecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <LogOut className="h-4 w-4 mr-1" />}
                  Desconectar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desconectar WhatsApp?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O WhatsApp será desconectado da instância. Você precisará escanear o QR Code novamente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDisconnect}>Desconectar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button variant="outline" size="sm" onClick={handleReconnect}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Reconectar
            </Button>
          </div>

          {/* Setup summary */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <h4 className="font-medium text-sm">Resumo do Setup</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Instância criada: <code className="text-xs bg-muted px-1 rounded">{settings.evolution_instance}</code></span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Webhook ativo</span>
              </div>
              <div className="flex items-center gap-2">
                {settings.n8n_webhook_url ? (
                  <><CheckCircle2 className={`h-4 w-4 ${n8nConfigured ? 'text-green-500' : 'text-yellow-500'}`} /><span>{n8nConfigured ? 'N8N configurado ✓' : 'N8N configurado (verificando...)'}</span></>
                ) : (
                  <><AlertCircle className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">N8N não configurado (opcional)</span></>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-start">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              ← Editar Credenciais
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}