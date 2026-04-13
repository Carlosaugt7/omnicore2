import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Plus, MoreHorizontal, Pencil, Trash2, DollarSign, AlertTriangle, TrendingDown, CalendarClock, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type Transaction = Database['public']['Tables']['transactions']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];

const typeLabels: Record<string, string> = { entrada: 'Entrada', saida: 'Saída', renovacao: 'Renovação' };
const statusColors: Record<string, string> = {
  pago: 'bg-green-500/10 text-green-500',
  pendente: 'bg-yellow-500/10 text-yellow-500',
  cancelado: 'bg-red-500/10 text-red-500',
};

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface DuplicateGroup {
  client_id: string;
  due_date: string;
  type: string;
  total: number;
  ids: string[];
}

export default function Financial() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [dialogType, setDialogType] = useState<'entrada' | 'saida'>('entrada');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [checkingDupes, setCheckingDupes] = useState(false);
  const [deletingDupes, setDeletingDupes] = useState(false);

  const PAGE_SIZE = 20;

  const load = async () => {
    if (!user) return;
    const [tRes, cRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('clients').select('*').eq('user_id', user.id),
    ]);
    if (tRes.data) setTransactions(tRes.data);
    if (cRes.data) setClients(cRes.data);
  };

  useEffect(() => { load(); }, [user]);

  const today = new Date().toISOString().split('T')[0];
  const monthStart = monthFilter + '-01';
  const nextMonth = (() => {
    const [y, m] = monthFilter.split('-').map(Number);
    const d = new Date(y, m, 1);
    return d.toISOString().split('T')[0];
  })();

  const metrics = useMemo(() => {
    const in5days = new Date();
    in5days.setDate(in5days.getDate() + 5);
    const in5Str = in5days.toISOString().split('T')[0];

    const toReceive = clients
      .filter(c => c.status === 'ativo' && c.due_date && c.due_date >= today && c.due_date <= in5Str)
      .reduce((sum, c) => sum + (c.value || 0), 0);

    const paidThisMonth = transactions
      .filter(t => t.status === 'pago' && t.paid_at && t.paid_at >= monthStart && t.paid_at < nextMonth)
      .reduce((sum, t) => sum + (t.value || 0), 0);

    const overdueAmount = clients
      .filter(c => c.status === 'vencido' && c.due_date && c.due_date < today)
      .reduce((sum, c) => sum + (c.value || 0), 0);

    const expenses = transactions
      .filter(t => t.type === 'saida' && t.created_at >= monthStart && t.created_at < nextMonth)
      .reduce((sum, t) => sum + (t.value || 0), 0);

    return { toReceive, paidThisMonth, overdueAmount, expenses };
  }, [clients, transactions, today, monthStart, nextMonth]);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const matchType = typeFilter === 'all' || t.type === typeFilter;
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchMonth = t.created_at >= monthStart && t.created_at < nextMonth;
      return matchType && matchStatus && matchMonth;
    });
  }, [transactions, typeFilter, statusFilter, monthStart, nextMonth]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      client_name: (fd.get('client_name') as string) || null,
      plan: (fd.get('plan') as string) || null,
      value: fd.get('value') ? parseFloat(fd.get('value') as string) : null,
      type: editingTx ? (fd.get('type') as string) : dialogType,
      status: (fd.get('status') as string) || 'pendente',
      due_date: (fd.get('due_date') as string) || null,
      paid_at: (fd.get('status') as string) === 'pago' ? new Date().toISOString() : null,
      description: (fd.get('description') as string) || null,
      user_id: user.id,
    };

    if (editingTx) {
      const { error } = await supabase.from('transactions').update(payload).eq('id', editingTx.id);
      if (error) toast.error(error.message); else toast.success('Transação atualizada!');
    } else {
      const { error } = await supabase.from('transactions').insert(payload);
      if (error) toast.error(error.message); else toast.success('Transação adicionada!');
    }
    setLoading(false);
    setDialogOpen(false);
    setEditingTx(null);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Transação removida!'); load(); }
  };

  const checkDuplicates = async () => {
    if (!user) return;
    setCheckingDupes(true);
    // Fetch all transactions, group in JS
    const { data } = await supabase.from('transactions').select('id, client_id, due_date, type').eq('user_id', user.id);
    if (!data) { setCheckingDupes(false); return; }

    const groups: Record<string, string[]> = {};
    for (const t of data) {
      if (!t.client_id || !t.due_date) continue;
      const key = `${t.client_id}|${t.due_date}|${t.type}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t.id);
    }

    const dupes: DuplicateGroup[] = [];
    for (const [key, ids] of Object.entries(groups)) {
      if (ids.length > 1) {
        const [client_id, due_date, type] = key.split('|');
        dupes.push({ client_id, due_date, type, total: ids.length, ids });
      }
    }
    setDuplicates(dupes);
    setCheckingDupes(false);
    if (dupes.length === 0) toast.success('Nenhuma duplicata encontrada!');
  };

  const deleteDuplicates = async (group: DuplicateGroup) => {
    setDeletingDupes(true);
    // Keep the first (most recent), delete the rest
    const toDelete = group.ids.slice(1);
    const { error } = await supabase.from('transactions').delete().in('id', toDelete);
    if (error) toast.error(error.message);
    else {
      toast.success(`${toDelete.length} duplicata(s) removida(s)!`);
      setDuplicates(d => d.filter(dup => dup !== group));
      load();
    }
    setDeletingDupes(false);
  };

  const cards = [
    {
      title: 'A Receber (5 dias)', value: formatBRL(metrics.toReceive), icon: CalendarClock,
      color: 'text-blue-600', bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20',
      iconBg: 'bg-blue-100 dark:bg-blue-900/40', shadow: 'shadow-blue-200/50 dark:shadow-blue-900/30', border: 'border-blue-200/60 dark:border-blue-800/40',
    },
    {
      title: 'Pago (Este Mês)', value: formatBRL(metrics.paidThisMonth), icon: DollarSign,
      color: 'text-emerald-600', bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', shadow: 'shadow-emerald-200/50 dark:shadow-emerald-900/30', border: 'border-emerald-200/60 dark:border-emerald-800/40',
    },
    {
      title: 'Em Atraso', value: formatBRL(metrics.overdueAmount), icon: AlertTriangle,
      color: 'text-rose-600', bg: 'bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-rose-950/30 dark:to-rose-900/20',
      iconBg: 'bg-rose-100 dark:bg-rose-900/40', shadow: 'shadow-rose-200/50 dark:shadow-rose-900/30', border: 'border-rose-200/60 dark:border-rose-800/40',
    },
    {
      title: 'Despesas', value: formatBRL(metrics.expenses), icon: TrendingDown,
      color: 'text-amber-600', bg: 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20',
      iconBg: 'bg-amber-100 dark:bg-amber-900/40', shadow: 'shadow-amber-200/50 dark:shadow-amber-900/30', border: 'border-amber-200/60 dark:border-amber-800/40',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <div className="flex gap-2">
          <Button onClick={() => { setDialogType('entrada'); setEditingTx(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Adicionar Entrada
          </Button>
          <Button variant="outline" onClick={() => { setDialogType('saida'); setEditingTx(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Adicionar Saída
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map(card => (
          <Card key={card.title} className={`${card.bg} ${card.border} ${card.shadow} shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <div className={`p-2 rounded-lg ${card.iconBg}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Transaction Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingTx(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTx ? 'Editar Transação' : dialogType === 'entrada' ? 'Nova Entrada' : 'Nova Saída'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{dialogType === 'saida' ? 'Descrição' : 'Cliente'}</Label>
                <Input name="client_name" defaultValue={editingTx?.client_name || ''} />
              </div>
              {dialogType !== 'saida' && (
                <div className="space-y-2"><Label>Plano</Label><Input name="plan" defaultValue={editingTx?.plan || ''} /></div>
              )}
              <div className="space-y-2"><Label>Valor (R$)</Label><Input name="value" type="number" step="0.01" required defaultValue={editingTx?.value || ''} /></div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select name="status" defaultValue={editingTx?.status || 'pendente'} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="pendente">Pendente</option>
                  <option value="pago">Pago</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div className="space-y-2"><Label>Data</Label><Input name="due_date" type="date" defaultValue={editingTx?.due_date || ''} /></div>
            </div>
            <div className="space-y-2"><Label>Descrição</Label><Input name="description" defaultValue={editingTx?.description || ''} /></div>
            {editingTx && (
              <input type="hidden" name="type" value={editingTx.type || 'entrada'} />
            )}
            <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Transações</CardTitle>
          <div className="flex flex-wrap gap-4 mt-2">
            <Input type="month" className="w-44" value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setPage(0); }} />
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos tipos</SelectItem>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
                <SelectItem value="renovacao">Renovação</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente/Descrição</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.client_name || t.description || '-'}</TableCell>
                  <TableCell>{t.plan || '-'}</TableCell>
                  <TableCell>{t.value ? formatBRL(t.value) : '-'}</TableCell>
                  <TableCell>{t.due_date || new Date(t.created_at).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>{t.type ? typeLabels[t.type] || t.type : '-'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[t.status || ''] || ''}>{t.status || '-'}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditingTx(t); setDialogType((t.type as 'entrada' | 'saida') || 'entrada'); setDialogOpen(true); }}>
                          <Pencil className="h-4 w-4 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(t.id)}>
                          <Trash2 className="h-4 w-4 mr-2" />Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {paginated.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma transação</TableCell></TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {filtered.length} transações • Página {page + 1} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Duplicates Cleanup */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Limpeza de Duplicatas</CardTitle>
            <Button variant="outline" size="sm" onClick={checkDuplicates} disabled={checkingDupes}>
              <Search className="h-4 w-4 mr-2" />
              {checkingDupes ? 'Verificando...' : 'Verificar duplicatas'}
            </Button>
          </div>
        </CardHeader>
        {duplicates.length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente ID</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Duplicatas</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {duplicates.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{d.client_id.slice(0, 8)}...</TableCell>
                    <TableCell>{d.due_date}</TableCell>
                    <TableCell>{typeLabels[d.type] || d.type}</TableCell>
                    <TableCell><Badge variant="destructive">{d.total} registros</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteDuplicates(d)} disabled={deletingDupes}>
                        <Trash2 className="h-3 w-3 mr-1" />Remover extras
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
