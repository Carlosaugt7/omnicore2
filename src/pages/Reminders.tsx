import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Send, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];
type ReminderLog = Database['public']['Tables']['reminder_logs']['Row'];

interface SettingsData {
  pix_key: string;
  template_before: string;
  template_today: string;
  template_overdue: string;
}

const DEFAULT_TEMPLATES: SettingsData = {
  pix_key: '',
  template_before: 'Olá {nome}! Seu plano {plano} vence amanhã.',
  template_today: '⚠️ {nome}, seu plano {plano} vence HOJE!',
  template_overdue: '❌ {nome}, seu acesso {plano} foi suspenso.',
};

const statusColors: Record<string, string> = {
  success: 'bg-green-500/10 text-green-500',
  failed: 'bg-red-500/10 text-red-500',
  pending: 'bg-yellow-500/10 text-yellow-500',
  ativo: 'bg-green-500/10 text-green-500',
  'à vencer': 'bg-yellow-500/10 text-yellow-500',
  vencido: 'bg-red-500/10 text-red-500',
  suspenso: 'bg-red-500/10 text-red-500',
  cancelado: 'bg-muted text-muted-foreground',
};

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

function replaceVars(template: string, client: Client, pixKey: string) {
  return template
    .replace(/\{nome\}/g, client.name)
    .replace(/\{plano\}/g, client.plan || '-')
    .replace(/\{valor\}/g, client.value ? Number(client.value).toFixed(2) : '0.00')
    .replace(/\{vencimento\}/g, client.due_date || '-')
    .replace(/\{servidor\}/g, client.server || '-')
    .replace(/\{chavePix\}/g, pixKey || '-');
}

export default function Reminders() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [logs, setLogs] = useState<ReminderLog[]>([]);
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_TEMPLATES);
  const [sendStatus, setSendStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; type: string; clients: Client[] }>({ open: false, type: '', clients: [] });
  const [sendingAll, setSendingAll] = useState(false);
  const [logStatusFilter, setLogStatusFilter] = useState('all');
  const [logDateFilter, setLogDateFilter] = useState('');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('clients').select('*').eq('user_id', user.id),
      supabase.from('reminder_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('settings').select('pix_key, template_before, template_today, template_overdue').eq('user_id', user.id).maybeSingle(),
    ]).then(([cRes, lRes, sRes]) => {
      if (cRes.data) setClients(cRes.data);
      if (lRes.data) setLogs(lRes.data);
      if (sRes.data) {
        setSettings({
          pix_key: sRes.data.pix_key || '',
          template_before: sRes.data.template_before || DEFAULT_TEMPLATES.template_before,
          template_today: sRes.data.template_today || DEFAULT_TEMPLATES.template_today,
          template_overdue: sRes.data.template_overdue || DEFAULT_TEMPLATES.template_overdue,
        });
      }
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const getLocalDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const now = new Date();
  const today = getLocalDateStr(now);
  
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrow = getLocalDateStr(tomorrowDate);
  
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = getLocalDateStr(yesterdayDate);

  const getDisplayStatus = (client: Client) => {
    if (client.status === 'cancelado') return 'cancelado';
    if (client.status === 'suspenso') return 'suspenso';
    if (!client.due_date) return client.status;
    
    if (client.due_date < today) return 'vencido';
    if (client.due_date === today || client.due_date === tomorrow) return 'à vencer';
    return 'ativo';
  };

  const tabs = useMemo(() => [
    {
      id: 'antes',
      label: 'Vence Amanhã',
      templateType: 'antes' as const,
      template: settings.template_before,
      clients: clients.filter(c => c.due_date === tomorrow && c.status !== 'cancelado' && c.status !== 'suspenso'),
    },
    {
      id: 'hoje',
      label: 'Vence Hoje',
      templateType: 'hoje' as const,
      template: settings.template_today,
      clients: clients.filter(c => c.due_date === today && c.status !== 'cancelado' && c.status !== 'suspenso'),
    },
    {
      id: 'vencido',
      label: 'Vencidos',
      templateType: 'vencido' as const,
      template: settings.template_overdue,
      clients: clients.filter(c => c.due_date !== null && c.due_date <= yesterday && c.status !== 'cancelado'),
    },
  ], [clients, settings, today, tomorrow, yesterday]);

  const handleSendSingle = async (client: Client, templateType: string) => {
    if (!user) return;
    setSendStatus(s => ({ ...s, [client.id]: 'sending' }));
    try {
      // Map local tab type to backend template key
      const backendTemplateType =
        templateType === 'antes' ? 'template_before' :
        templateType === 'hoje' ? 'template_today' :
        'template_overdue';

      const result = await api.whatsappSendSingle({
        userId: user.id,
        clientId: client.id,
        phone: client.phone,
        templateType: backendTemplateType,
      });
      setSendStatus(s => ({ ...s, [client.id]: result.success ? 'sent' : 'error' }));
      if (!result.success) toast.error(result.error || 'Erro ao enviar.');
    } catch {
      setSendStatus(s => ({ ...s, [client.id]: 'error' }));
    }
  };

  const handleSendAll = async () => {
    if (!user) return;
    setSendingAll(true);
    const { type, clients: targetClients } = confirmModal;
    let successCount = 0;
    let errorCount = 0;

    // Map local tab type to backend template key
    const backendTemplateType =
      type === 'antes' ? 'template_before' :
      type === 'hoje' ? 'template_today' :
      'template_overdue';

    for (let i = 0; i < targetClients.length; i++) {
      const client = targetClients[i];

      // Add 8-10 seconds delay between clients (skip delay for the first client)
      if (i > 0) {
        const delayMs = 8000 + Math.random() * 2000;
        await new Promise(r => setTimeout(r, delayMs));
      }

      try {
        const result = await api.whatsappSendSingle({
          userId: user.id,
          clientId: client.id,
          phone: client.phone,
          templateType: backendTemplateType,
        });
        setSendStatus(s => ({ ...s, [client.id]: result.success ? 'sent' : 'error' }));
        if (result.success) successCount++; else errorCount++;
      } catch {
        setSendStatus(s => ({ ...s, [client.id]: 'error' }));
        errorCount++;
      }
    }

    toast.success(`Enviados: ${successCount} | Erros: ${errorCount}`);
    setSendingAll(false);
    setConfirmModal({ open: false, type: '', clients: [] });

    // Reload logs
    if (user) {
      const { data } = await supabase.from('reminder_logs').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(50);
      if (data) setLogs(data);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      const matchStatus = logStatusFilter === 'all' || l.status === logStatusFilter;
      const matchDate = !logDateFilter || (l.sent_at && l.sent_at.startsWith(logDateFilter));
      return matchStatus && matchDate;
    });
  }, [logs, logStatusFilter, logDateFilter]);

  const SendButton = ({ client, templateType }: { client: Client; templateType: string }) => {
    const status = sendStatus[client.id] || 'idle';
    if (status === 'sending') return <Button size="sm" disabled><Send className="h-3 w-3 mr-1 animate-spin" />Enviando...</Button>;
    if (status === 'sent') return <Button size="sm" variant="outline" className="text-green-500 border-green-500" disabled><CheckCircle className="h-3 w-3 mr-1" />Enviado ✓</Button>;
    if (status === 'error') return <Button size="sm" variant="outline" className="text-destructive border-destructive" disabled><XCircle className="h-3 w-3 mr-1" />Erro ✗</Button>;
    return <Button size="sm" onClick={() => handleSendSingle(client, templateType)}><Send className="h-3 w-3 mr-1" />Enviar WhatsApp</Button>;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Lembretes</h1>

      <Tabs defaultValue="antes">
        <TabsList className="grid w-full grid-cols-3">
          {tabs.map(tab => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label} ({tab.clients.length})
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map(tab => (
          <TabsContent key={tab.id} value={tab.id}>
            <div className="flex justify-end mb-4">
              <Button
                variant="outline"
                disabled={tab.clients.length === 0}
                onClick={() => setConfirmModal({ open: true, type: tab.templateType, clients: tab.clients })}
              >
                <Send className="h-4 w-4 mr-2" />
                Enviar para todos ({tab.clients.length})
              </Button>
            </div>

            {tab.clients.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhum cliente nesta categoria
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {tab.clients.map(client => (
                  <Card key={client.id} className={
                    tab.templateType === 'antes' ? 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200/60 dark:border-amber-800/40 shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30 hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5' :
                    tab.templateType === 'hoje' ? 'bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200/60 dark:border-blue-800/40 shadow-lg shadow-blue-200/50 dark:shadow-blue-900/30 hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5' :
                    'bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-rose-950/30 dark:to-rose-900/20 border-rose-200/60 dark:border-rose-800/40 shadow-lg shadow-rose-200/50 dark:shadow-rose-900/30 hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5'
                  }>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{client.name}</CardTitle>
                        <Badge variant="secondary" className={statusColors[getDisplayStatus(client)] || ''}>
                          {getDisplayStatus(client)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Plano:</span> {client.plan || '-'}</div>
                        <div><span className="text-muted-foreground">Servidor:</span> {client.server || '-'}</div>
                        <div><span className="text-muted-foreground">Valor:</span> R$ {client.value ? Number(client.value).toFixed(2) : '0.00'}</div>
                        <div><span className="text-muted-foreground">Vencimento:</span> {client.due_date ? formatDate(client.due_date) : '-'}</div>
                      </div>

                      <div className="rounded-lg bg-muted p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Preview da mensagem:</p>
                        <p className="text-xs whitespace-pre-wrap">{replaceVars(tab.template, client, settings.pix_key)}</p>
                      </div>

                      <SendButton client={client} templateType={tab.templateType} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Confirm Send All Modal */}
      <Dialog open={confirmModal.open} onOpenChange={(o) => { if (!sendingAll) setConfirmModal(s => ({ ...s, open: o })); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Confirmar envio em massa
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Você está prestes a enviar WhatsApp para <strong>{confirmModal.clients.length}</strong> clientes.
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmModal({ open: false, type: '', clients: [] })} disabled={sendingAll}>
              Cancelar
            </Button>
            <Button onClick={handleSendAll} disabled={sendingAll}>
              {sendingAll ? 'Enviando...' : `Enviar para ${confirmModal.clients.length} clientes`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Envios</CardTitle>
          <div className="flex gap-4 mt-2">
            <Select value={logStatusFilter} onValueChange={setLogStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="failed">Falha</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" className="w-44" value={logDateFilter} onChange={(e) => setLogDateFilter(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs">{log.sent_at ? new Date(log.sent_at).toLocaleString('pt-BR') : '-'}</TableCell>
                  <TableCell className="font-medium">{log.client_name || '-'}</TableCell>
                  <TableCell>{log.template_type || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[log.status || ''] || ''}>{log.status || '-'}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-destructive max-w-[200px] truncate">{log.error_message || '-'}</TableCell>
                </TableRow>
              ))}
              {filteredLogs.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum registro</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
