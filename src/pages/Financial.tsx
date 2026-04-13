import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type Transaction = Database['public']['Tables']['transactions']['Row'];

const typeLabels: Record<string, string> = { entrada: 'Entrada', saida: 'Saída', renovacao: 'Renovação' };
const statusColors: Record<string, string> = {
  pago: 'bg-green-500/10 text-green-500',
  pendente: 'bg-yellow-500/10 text-yellow-500',
  cancelado: 'bg-red-500/10 text-red-500',
};

export default function Financial() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setTransactions(data);
  };

  useEffect(() => { load(); }, [user]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from('transactions').insert({
      client_name: (fd.get('client_name') as string) || null,
      plan: (fd.get('plan') as string) || null,
      value: fd.get('value') ? parseFloat(fd.get('value') as string) : null,
      type: (fd.get('type') as string) || null,
      status: (fd.get('status') as string) || 'pendente',
      due_date: (fd.get('due_date') as string) || null,
      description: (fd.get('description') as string) || null,
      user_id: user.id,
    });
    if (error) toast.error(error.message); else { toast.success('Transação adicionada!'); setDialogOpen(false); load(); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Nova Transação</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Transação</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Cliente</Label><Input name="client_name" /></div>
                <div className="space-y-2"><Label>Plano</Label><Input name="plan" /></div>
                <div className="space-y-2"><Label>Valor</Label><Input name="value" type="number" step="0.01" /></div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select name="type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="entrada">Entrada</option>
                    <option value="saida">Saída</option>
                    <option value="renovacao">Renovação</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select name="status" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div className="space-y-2"><Label>Vencimento</Label><Input name="due_date" type="date" /></div>
              </div>
              <div className="space-y-2"><Label>Descrição</Label><Input name="description" /></div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.client_name || '-'}</TableCell>
                  <TableCell>{t.plan || '-'}</TableCell>
                  <TableCell>{t.value ? `R$ ${Number(t.value).toFixed(2)}` : '-'}</TableCell>
                  <TableCell>{t.type ? typeLabels[t.type] || t.type : '-'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[t.status || ''] || ''}>{t.status || '-'}</Badge>
                  </TableCell>
                  <TableCell>{t.due_date || '-'}</TableCell>
                  <TableCell>{new Date(t.created_at).toLocaleDateString('pt-BR')}</TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma transação</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
