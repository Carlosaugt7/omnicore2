import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, EyeOff, Wifi, WifiOff, Play, Save, QrCode, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type ReminderLog = Database['public']['Tables']['reminder_logs']['Row'];

const DEFAULT_TEMPLATE_BEFORE = `Olá {nome}! 👋
Seu plano *{plano}* no {servidor} vence amanhã ({vencimento}).

Para renovar, pague via PIX:
🔑 Chave: *{chavePix}*
💰 Valor: *R$ {valor}*

Após o pagamento, confirme aqui e reativo na hora! ✅`;

const DEFAULT_TEMPLATE_TODAY = `⚠️ {nome}, seu plano *{plano}* vence *HOJE*!

Não perca seu acesso. Renove agora:
🔑 PIX: *{chavePix}*
💰 Valor: *R$ {valor}*

Me avise quando pagar! 😊`;

const DEFAULT_TEMPLATE_OVERDUE = `❌ {nome}, seu acesso *{plano}* foi suspenso.

Para reativar:
🔑 PIX: *{chavePix}*
💰 Valor: *R$ {valor}*

Assim que confirmar o pagamento, reativo em instantes! 🚀`;

interface Settings {
  evolution_api_url: string;
  evolution_api_key: string;
  evolution_instance: string;
  pix_key: string;
  pix_key_type: string;
  pix_beneficiary: string;
  reminder_time: string;
  template_before: string;
  template_today: string;
  template_overdue: string;
  send_before_due: boolean;
  send_on_due: boolean;
  send_overdue: boolean;
}

const INITIAL_SETTINGS: Settings = {
  evolution_api_url: '',
  evolution_api_key: '',
  evolution_instance: '',
  pix_key: '',
  pix_key_type: 'cpf',
  pix_beneficiary: '',
  reminder_time: '09:00',
  template_before: DEFAULT_TEMPLATE_BEFORE,
  template_today: DEFAULT_TEMPLATE_TODAY,
  template_overdue: DEFAULT_TEMPLATE_OVERDUE,
  send_before_due: true,
  send_on_due: true,
  send_overdue: true,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [connectionPhone, setConnectionPhone] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [triggeringManual, setTriggeringManual] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [pollingActive, setPollingActive] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recentLogs, setRecentLogs] = useState<ReminderLog[]>([]);
  const [sampleClient, setSampleClient] = useState<{ name: string; plan: string; value: string; due_date: string; server: string } | null>(null);

  useEffect(() => {
    if (!user) return;

    // Load settings
    supabase.from('settings').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings({
            evolution_api_url: data.evolution_api_url || '',
            evolution_api_key: data.evolution_api_key || '',
            evolution_instance: data.evolution_instance || '',
            pix_key: data.pix_key || '',
            pix_key_type: data.pix_key_type || 'cpf',
            pix_beneficiary: data.pix_beneficiary || '',
            reminder_time: data.reminder_time || '09:00',
            template_before: data.template_before || DEFAULT_TEMPLATE_BEFORE,
            template_today: data.template_today || DEFAULT_TEMPLATE_TODAY,
            template_overdue: data.template_overdue || DEFAULT_TEMPLATE_OVERDUE,
            send_before_due: data.send_before_due ?? true,
            send_on_due: data.send_on_due ?? true,
            send_overdue: data.send_overdue ?? true,
          });
        }
      });

    // Load recent reminder logs
    supabase.from('reminder_logs').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setRecentLogs(data); });

    // Load first client for preview
    supabase.from('clients').select('name, plan, value, due_date, server').eq('user_id', user.id).limit(1)
      .then(({ data }) => {
        if (data && data[0]) {
          setSampleClient({
            name: data[0].name,
            plan: data[0].plan || 'Plano Exemplo',
            value: data[0].value ? Number(data[0].value).toFixed(2) : '29.90',
            due_date: data[0].due_date || '2025-01-15',
            server: data[0].server || 'Servidor',
          });
        } else {
          setSampleClient({ name: 'João Silva', plan: '01 Acesso', value: '29.90', due_date: '2025-01-15', server: 'Warez' });
        }
      });
  }, [user]);

  // Polling: check connection status every 5s while QR is displayed
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setPollingActive(false);
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    setPollingActive(true);
    pollingRef.current = setInterval(async () => {
      try {
        const result = await api.invokeFunction('evolution-status');
        if (result.connected) {
          setConnectionStatus('connected');
          setConnectionPhone(result.phone || '');
          setQrCode(null);
          stopPolling();
          toast.success('✅ WhatsApp conectado com sucesso!');
        }
      } catch {
        // silently retry
      }
    }, 5000);
  }, [stopPolling]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('settings').upsert({
      user_id: user.id,
      ...settings,
    }, { onConflict: 'user_id' });
    if (error) toast.error(error.message); else toast.success('Configurações salvas!');
    setLoading(false);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const result = await api.invokeFunction('evolution-status');
      if (result.connected) {
        setConnectionStatus('connected');
        setConnectionPhone(result.phone || '');
        toast.success('Conectado!');
        setQrCode(null);
      } else {
        setConnectionStatus('disconnected');
        setConnectionPhone('');
        toast.error(result.error || 'Desconectado');
      }
    } catch {
      setConnectionStatus('disconnected');
      setConnectionPhone('');
      toast.error('Erro ao testar conexão.');
    }
    setTestingConnection(false);
  };

  const handleCreateInstance = async () => {
    setCreatingInstance(true);
    try {
      const result = await api.invokeFunction('evolution-create-instance');
      if (result.error) {
        toast.error(result.error);
      } else {
        if (result.qrcode) {
          setQrCode(result.qrcode);
          setConnectionStatus('disconnected');
          toast.success(result.message || 'Escaneie o QR Code com seu WhatsApp!');
          startPolling();
        } else {
          toast.info(result.message || 'Instância criada, mas sem QR Code.');
        }
        // Update instance name in local state if auto-generated
        if (result.instanceName && result.instanceName !== settings.evolution_instance) {
          setSettings(s => ({ ...s, evolution_instance: result.instanceName }));
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar instância.');
    }
    setCreatingInstance(false);
  };

  const handleRefreshQR = async () => {
    try {
      const result = await api.invokeFunction('evolution-qrcode');
      if (result.qrcode) {
        setQrCode(result.qrcode);
        if (!pollingActive) startPolling();
      } else {
        // Maybe already connected
        await handleTestConnection();
      }
    } catch {
      toast.error('Erro ao atualizar QR Code.');
    }
  };

  const handleManualTrigger = async () => {
    setTriggeringManual(true);
    try {
      toast.info('Função de disparo em massa será implementada em breve.');
      // Reload logs after a bit
      setTimeout(async () => {
        if (!user) return;
        const { data } = await supabase.from('reminder_logs').select('*').eq('user_id', user.id)
          .order('created_at', { ascending: false }).limit(10);
        if (data) setRecentLogs(data);
      }, 3000);
    } catch {
      toast.error('Erro ao disparar. Verifique o backend.');
    }
    setTriggeringManual(false);
  };

  const replaceVariables = (template: string) => {
    if (!sampleClient) return template;
    return template
      .replace(/\{nome\}/g, sampleClient.name)
      .replace(/\{plano\}/g, sampleClient.plan)
      .replace(/\{valor\}/g, sampleClient.value)
      .replace(/\{vencimento\}/g, sampleClient.due_date)
      .replace(/\{servidor\}/g, sampleClient.server)
      .replace(/\{chavePix\}/g, settings.pix_key || 'chave-pix-aqui');
  };

  const insertVariable = (
    field: 'template_before' | 'template_today' | 'template_overdue',
    variable: string
  ) => {
    setSettings(s => ({ ...s, [field]: s[field] + variable }));
  };

  const VariableButtons = ({ field }: { field: 'template_before' | 'template_today' | 'template_overdue' }) => (
    <div className="flex flex-wrap gap-1">
      {['{nome}', '{plano}', '{valor}', '{vencimento}', '{servidor}', '{chavePix}'].map(v => (
        <Button key={v} type="button" variant="outline" size="sm" className="text-xs h-6 px-2"
          onClick={() => insertVariable(field, v)}>{v}</Button>
      ))}
    </div>
  );

  const TemplateEditor = ({
    label,
    field,
  }: {
    label: string;
    field: 'template_before' | 'template_today' | 'template_overdue';
  }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{label}</Label>
        <span className="text-xs text-muted-foreground">{settings[field].length} caracteres</span>
      </div>
      <VariableButtons field={field} />
      <Textarea
        rows={6}
        value={settings[field]}
        onChange={(e) => setSettings(s => ({ ...s, [field]: e.target.value }))}
      />
      <div className="rounded-lg bg-muted p-3">
        <p className="text-xs font-medium text-muted-foreground mb-1">Preview:</p>
        <p className="text-sm whitespace-pre-wrap">{replaceVariables(settings[field])}</p>
      </div>
    </div>
  );

  const statusLogColors: Record<string, string> = {
    success: 'bg-green-500/10 text-green-500',
    failed: 'bg-red-500/10 text-red-500',
    pending: 'bg-yellow-500/10 text-yellow-500',
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <Button onClick={handleSave} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? 'Salvando...' : 'Salvar tudo'}
        </Button>
      </div>

      {/* Connection Status Indicator */}
      <div className="flex items-center gap-2 text-sm">
        {connectionStatus === 'connected' ? (
          <>
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-500 font-medium">Conectado — número: {connectionPhone}</span>
          </>
        ) : connectionStatus === 'disconnected' ? (
          <>
            <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="text-destructive font-medium">Desconectado</span>
          </>
        ) : (
          <>
            <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">Status desconhecido — teste a conexão</span>
          </>
        )}
      </div>

      <Tabs defaultValue="evolution">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="evolution">Evolution API</TabsTrigger>
          <TabsTrigger value="pix">PIX</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="schedule">Agendamento</TabsTrigger>
        </TabsList>

        {/* TAB 1: Evolution API */}
        <TabsContent value="evolution">
          <Card>
            <CardHeader>
              <CardTitle>Evolution API</CardTitle>
              <CardDescription>Configurações de integração com WhatsApp via Evolution API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>URL da API</Label>
                <Input
                  value={settings.evolution_api_url}
                  onChange={(e) => setSettings(s => ({ ...s, evolution_api_url: e.target.value }))}
                  placeholder="https://evolution.meudominio.com"
                />
              </div>
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.evolution_api_key}
                    onChange={(e) => setSettings(s => ({ ...s, evolution_api_key: e.target.value }))}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Nome da Instância</Label>
                <Input
                  value={settings.evolution_instance}
                  onChange={(e) => setSettings(s => ({ ...s, evolution_instance: e.target.value }))}
                  placeholder="minha-instancia"
                />
              </div>
              <Button onClick={handleTestConnection} disabled={testingConnection} variant="outline">
                {connectionStatus === 'connected' ? <Wifi className="h-4 w-4 mr-2" /> : <WifiOff className="h-4 w-4 mr-2" />}
                {testingConnection ? 'Testando...' : 'Testar Conexão'}
              </Button>

              <Button onClick={handleCreateInstance} disabled={creatingInstance || connectionStatus === 'connected'} variant="default">
                {creatingInstance ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
                {creatingInstance ? 'Criando...' : 'Conectar WhatsApp'}
              </Button>

              {/* Connected success state */}
              {connectionStatus === 'connected' && (
                <div className="mt-4 p-4 border border-green-500/30 rounded-lg bg-green-500/5 flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="font-medium text-green-600 dark:text-green-400">WhatsApp Conectado!</p>
                    <p className="text-sm text-muted-foreground">Número: {connectionPhone || 'Detectando...'}</p>
                  </div>
                </div>
              )}

              {/* QR Code Display */}
              {qrCode && connectionStatus !== 'connected' && (
                <div className="mt-4 p-6 border-2 border-dashed border-primary/30 rounded-lg bg-card flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2">
                    <QrCode className="h-5 w-5 text-primary" />
                    <p className="text-sm font-semibold">Escaneie o QR Code com seu WhatsApp</p>
                  </div>
                  <img
                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code WhatsApp"
                    className="w-72 h-72 border rounded-lg shadow-sm"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleRefreshQR} disabled={pollingActive && false}>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Novo QR Code
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleTestConnection}>
                      Verificar Conexão
                    </Button>
                  </div>
                  {pollingActive && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Aguardando conexão... verificando a cada 5s
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">O QR Code expira em ~60s. Clique "Novo QR Code" se expirar.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: PIX */}
        <TabsContent value="pix">
          <Card>
            <CardHeader>
              <CardTitle>PIX</CardTitle>
              <CardDescription>Chave PIX para cobranças automáticas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo da Chave</Label>
                <select
                  value={settings.pix_key_type}
                  onChange={(e) => setSettings(s => ({ ...s, pix_key_type: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="cpf">CPF</option>
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone</option>
                  <option value="aleatoria">Chave Aleatória</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Chave PIX</Label>
                <Input
                  value={settings.pix_key}
                  onChange={(e) => setSettings(s => ({ ...s, pix_key: e.target.value }))}
                  placeholder={settings.pix_key_type === 'cpf' ? '000.000.000-00' : settings.pix_key_type === 'email' ? 'email@exemplo.com' : settings.pix_key_type === 'telefone' ? '(11) 99999-9999' : 'xxxxxxxx-xxxx-xxxx-xxxx'}
                />
              </div>
              <div className="space-y-2">
                <Label>Nome do Beneficiário</Label>
                <Input
                  value={settings.pix_beneficiary}
                  onChange={(e) => setSettings(s => ({ ...s, pix_beneficiary: e.target.value }))}
                  placeholder="Nome que aparece no PIX"
                />
              </div>

              {/* Preview */}
              <div className="rounded-lg bg-muted p-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Preview na mensagem:</p>
                <p className="text-sm">
                  🔑 PIX ({settings.pix_key_type}): <strong>{settings.pix_key || '—'}</strong>
                </p>
                {settings.pix_beneficiary && (
                  <p className="text-sm">👤 Beneficiário: <strong>{settings.pix_beneficiary}</strong></p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Templates */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Templates de Mensagem</CardTitle>
              <CardDescription>
                Personalize as mensagens de lembrete. Use variáveis para dados dinâmicos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <TemplateEditor label="📅 1 Dia Antes" field="template_before" />
              <TemplateEditor label="⚠️ Vence Hoje" field="template_today" />
              <TemplateEditor label="❌ Vencido" field="template_overdue" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: Agendamento */}
        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle>Agendamento</CardTitle>
              <CardDescription>Configure horários e regras de disparo automático</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Horário de disparo automático</Label>
                <Input
                  type="time"
                  value={settings.reminder_time}
                  onChange={(e) => setSettings(s => ({ ...s, reminder_time: e.target.value }))}
                  className="w-40"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">Regras de envio</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="send_before"
                    checked={settings.send_before_due}
                    onCheckedChange={(checked) => setSettings(s => ({ ...s, send_before_due: !!checked }))}
                  />
                  <label htmlFor="send_before" className="text-sm">Enviar 1 dia antes do vencimento</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="send_on"
                    checked={settings.send_on_due}
                    onCheckedChange={(checked) => setSettings(s => ({ ...s, send_on_due: !!checked }))}
                  />
                  <label htmlFor="send_on" className="text-sm">Enviar no dia do vencimento</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="send_overdue"
                    checked={settings.send_overdue}
                    onCheckedChange={(checked) => setSettings(s => ({ ...s, send_overdue: !!checked }))}
                  />
                  <label htmlFor="send_overdue" className="text-sm">Enviar para clientes vencidos</label>
                </div>
              </div>

              <Button onClick={handleManualTrigger} disabled={triggeringManual} variant="outline">
                <Play className="h-4 w-4 mr-2" />
                {triggeringManual ? 'Disparando...' : 'Disparar manualmente agora'}
              </Button>
            </CardContent>
          </Card>

          {/* Recent Logs */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Últimos 10 disparos</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.client_name || '-'}</TableCell>
                      <TableCell>{log.phone || '-'}</TableCell>
                      <TableCell>{log.template_type || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusLogColors[log.status || ''] || ''}>
                          {log.status || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>{log.sent_at ? new Date(log.sent_at).toLocaleString('pt-BR') : '-'}</TableCell>
                    </TableRow>
                  ))}
                  {recentLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhum disparo registrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
