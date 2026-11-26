import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Cloud,
  Download,
  UploadCloud,
  CheckCircle2,
  XCircle,
  Copy,
  Save,
  Unlink,
  Clock,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';

interface BackupConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  send_time: string;
  timezone: string;
  retention_count: number;
  google_client_id: string;
  has_client_secret: boolean;
  connected: boolean;
  google_email: string | null;
  last_backup_at: string | null;
  last_backup_status: string | null;
  last_backup_error: string | null;
}

interface BackupLog {
  id: string;
  type: string;
  status: string;
  file_name: string | null;
  file_size_bytes: number | null;
  error_message: string | null;
  created_at: string;
}

const BRAZIL_TIMEZONES = [
  { value: 'America/Manaus', label: 'Manaus / Cuiabá (UTC-4)' },
  { value: 'America/Sao_Paulo', label: 'Brasília / São Paulo (UTC-3)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco / Acre (UTC-5)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC-2)' },
  { value: 'America/Belem', label: 'Belém / Fortaleza (UTC-3)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (UTC-4)' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (UTC-4)' },
  { value: 'Europe/Lisbon', label: 'Lisboa / Portugal (UTC+0/+1)' },
];

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Diária (todo dia)',
  weekly: 'Semanal (a cada 7 dias)',
  biweekly: 'Quinzenal (a cada 15 dias)',
  monthly: 'Mensal (1x por mês)',
};

function formatBytes(bytes: number | null) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function BackupSettingsTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [config, setConfig] = useState<BackupConfig>({
    enabled: false,
    frequency: 'weekly',
    send_time: '03:00',
    timezone: 'America/Manaus',
    retention_count: 14,
    google_client_id: '',
    has_client_secret: false,
    connected: false,
    google_email: null,
    last_backup_at: null,
    last_backup_status: null,
    last_backup_error: null,
  });
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [hasOAuthCreds, setHasOAuthCreds] = useState(false);
  const [logs, setLogs] = useState<BackupLog[]>([]);

  const loadStatus = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.backupStatus(user.id);
      if (res.success && res.config) {
        setConfig(res.config);
        setCallbackUrl(res.callbackUrl || '');
        setHasOAuthCreds(Boolean(res.hasOAuthCreds));
        setLogs(res.logs || []);
      }
    } catch (err) {
      console.error('Erro ao carregar status de backup:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSave = async (): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const res = await api.backupSaveSettings({
        userId: user.id,
        enabled: config.enabled,
        frequency: config.frequency,
        send_time: config.send_time,
        timezone: config.timezone,
        retention_count: config.retention_count,
        google_client_id: config.google_client_id || undefined,
        google_client_secret: clientSecretInput || undefined,
      });
      if (res.success) {
        toast.success('Configurações de backup salvas!');
        setClientSecretInput('');
        await loadStatus();
        return true;
      } else {
        toast.error(res.error || 'Erro ao salvar configurações.');
        return false;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleConnectGoogle = async () => {
    if (!user) return;
    if (config.google_client_id || clientSecretInput) {
      const ok = await handleSave();
      if (!ok) return;
    }
    setConnecting(true);
    try {
      const res = await api.backupGoogleAuthUrl(user.id);
      if (res.success && res.url) {
        window.location.href = res.url;
      } else {
        toast.error(res.error || 'Preencha o Client ID e Client Secret primeiro.');
        setConnecting(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao iniciar conexão com Google Drive.');
      setConnecting(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!user) return;
    try {
      const res = await api.backupGoogleDisconnect(user.id);
      if (res.success) {
        toast.success('Google Drive desconectado.');
        await loadStatus();
      }
    } catch {
      toast.error('Erro ao desconectar Google Drive.');
    }
  };

  const handleRunNow = async () => {
    if (!user) return;
    setRunningNow(true);
    toast.info('Gerando backup e enviando para o Google Drive...');
    try {
      const res = await api.backupRunNow(user.id);
      if (res.success) {
        toast.success(`Backup enviado com sucesso! (${res.fileName})`);
        await loadStatus();
      } else {
        toast.error(res.error || 'Falha ao enviar backup.');
        await loadStatus();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao executar backup.');
    } finally {
      setRunningNow(false);
    }
  };

  const handleDownload = async () => {
    if (!user) return;
    setDownloading(true);
    try {
      const blob = await api.backupDownload(user.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `omnicore-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup baixado no seu computador!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao baixar backup.');
    } finally {
      setDownloading(false);
    }
  };

  const copyCallback = () => {
    if (!callbackUrl) return;
    navigator.clipboard.writeText(callbackUrl);
    toast.success('URL de redirecionamento copiada!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Card 1: Conexão Google Drive */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cloud className="h-5 w-5 text-blue-600" />
                Google Drive
              </CardTitle>
              <CardDescription>
                Conecte sua conta do Google Drive para salvar os backups na pasta <strong>OmniCore-Backups</strong>.
              </CardDescription>
            </div>
            {config.connected ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20" variant="outline">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Conectado {config.google_email ? `(${config.google_email})` : ''}
              </Badge>
            ) : (
              <Badge variant="secondary">Desconectado</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Credenciais OAuth2 */}
          <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4 text-primary" />
              <span>Credenciais Google OAuth2</span>
            </div>
            <p className="text-xs text-muted-foreground">
              No Google Cloud Console, crie um ID do Cliente OAuth (Aplicativo da Web) e adicione a URI de redirecionamento abaixo:
            </p>
            {callbackUrl && (
              <div className="flex items-center gap-2">
                <Input value={callbackUrl} readOnly className="text-xs font-mono bg-background" />
                <Button type="button" variant="outline" size="icon" onClick={copyCallback} title="Copiar URI">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Google Client ID</Label>
                <Input
                  placeholder="xxxx.apps.googleusercontent.com"
                  value={config.google_client_id}
                  onChange={(e) => setConfig((c) => ({ ...c, google_client_id: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Google Client Secret {config.has_client_secret && '(já salvo)'}
                </Label>
                <Input
                  type="password"
                  placeholder={config.has_client_secret ? '•••••••• (deixe vazio para manter)' : 'GOCSPX-...'}
                  value={clientSecretInput}
                  onChange={(e) => setClientSecretInput(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleConnectGoogle}
              disabled={connecting || (!hasOAuthCreds && !config.google_client_id)}
            >
              <Cloud className="h-4 w-4 mr-2" />
              {connecting ? 'Redirecionando...' : config.connected ? 'Reconectar Google Drive' : 'Conectar Google Drive'}
            </Button>

            {config.connected && (
              <Button type="button" variant="outline" onClick={handleDisconnectGoogle}>
                <Unlink className="h-4 w-4 mr-2" />
                Desconectar
              </Button>
            )}

            <Button type="button" variant="outline" onClick={handleRunNow} disabled={runningNow || !config.connected}>
              <UploadCloud className="h-4 w-4 mr-2" />
              {runningNow ? 'Enviando...' : 'Fazer Backup Agora (Drive)'}
            </Button>

            <Button type="button" variant="outline" onClick={handleDownload} disabled={downloading}>
              <Download className="h-4 w-4 mr-2" />
              {downloading ? 'Gerando...' : 'Baixar Backup no PC'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Agendamento Automático */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-primary" />
                Agendamento Automático
              </CardTitle>
              <CardDescription>
                Defina a periodicidade para envio automático ao Google Drive
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="backup-enabled" className="text-sm font-medium cursor-pointer">
                {config.enabled ? 'Automático Ativo' : 'Desativado'}
              </Label>
              <Switch
                id="backup-enabled"
                checked={config.enabled}
                onCheckedChange={(checked) => setConfig((c) => ({ ...c, enabled: checked }))}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>Frequência</Label>
              <Select
                value={config.frequency}
                onValueChange={(v: BackupConfig['frequency']) => setConfig((c) => ({ ...c, frequency: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Horário</Label>
              <Input
                type="time"
                value={config.send_time}
                onChange={(e) => setConfig((c) => ({ ...c, send_time: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Manter últimos</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={config.retention_count}
                onChange={(e) => setConfig((c) => ({ ...c, retention_count: Number(e.target.value) || 14 }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2 w-full sm:w-72">
              <Label>Fuso Horário</Label>
              <Select
                value={config.timezone}
                onValueChange={(v) => setConfig((c) => ({ ...c, timezone: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRAZIL_TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="button" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Salvando...' : 'Salvar Backup'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Histórico de Backups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Backups</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell className="capitalize text-xs">
                    {log.type === 'auto' ? 'Automático' : 'Manual'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.file_name || '-'}</TableCell>
                  <TableCell className="text-xs">{formatBytes(log.file_size_bytes)}</TableCell>
                  <TableCell>
                    {log.status === 'success' ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600" variant="secondary">
                        Sucesso
                      </Badge>
                    ) : (
                      <Badge variant="destructive" title={log.error_message || ''}>
                        <XCircle className="h-3 w-3 mr-1" />
                        Falha
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Nenhum backup registrado ainda
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
