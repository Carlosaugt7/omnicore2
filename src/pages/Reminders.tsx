import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Database } from '@/integrations/supabase/types';

type ReminderLog = Database['public']['Tables']['reminder_logs']['Row'];

const statusColors: Record<string, string> = {
  success: 'bg-green-500/10 text-green-500',
  failed: 'bg-red-500/10 text-red-500',
  pending: 'bg-yellow-500/10 text-yellow-500',
};

export default function Reminders() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ReminderLog[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from('reminder_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setLogs(data); });
  }, [user]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Lembretes</h1>
      <p className="text-muted-foreground">Histórico de lembretes enviados via WhatsApp. Os envios são realizados pelo backend externo.</p>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enviado em</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.client_name || '-'}</TableCell>
                  <TableCell>{log.phone || '-'}</TableCell>
                  <TableCell>{log.template_type || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[log.status || ''] || ''}>{log.status || '-'}</Badge>
                  </TableCell>
                  <TableCell>{log.sent_at ? new Date(log.sent_at).toLocaleString('pt-BR') : '-'}</TableCell>
                  <TableCell className="text-xs text-destructive">{log.error_message || '-'}</TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum lembrete enviado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
