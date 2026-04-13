import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, MoreHorizontal, Pencil, Trash2, CheckCircle, Send, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];

const statusColors: Record<string, string> = {
  ativo: 'bg-green-500/10 text-green-500',
  vencido: 'bg-red-500/10 text-red-500',
  suspenso: 'bg-yellow-500/10 text-yellow-500',
  cancelado: 'bg-muted text-muted-foreground',
};

type SortKey = 'name' | 'due_date' | 'value';
type SortDir = 'asc' | 'desc';

export default function Clients() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serverFilter, setServerFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(false);

  const loadClients = async () => {
    if (!user) return;
    const { data } = await supabase.from('clients').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setClients(data);
  };

  useEffect(() => { loadClients(); }, [user]);

  const servers = useMemo(() => {
    const set = new Set(clients.map(c => c.server).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [clients]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    let result = clients.filter(c => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchServer = serverFilter === 'all' || c.server === serverFilter;
      return matchSearch && matchStatus && matchServer;
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = (a.name || '').localeCompare(b.name || '');
      else if (sortKey === 'due_date') cmp = (a.due_date || '').localeCompare(b.due_date || '');
      else if (sortKey === 'value') cmp = (a.value || 0) - (b.value || 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [clients, search, statusFilter, serverFilter, sortKey, sortDir]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get('name') as string,
      phone: fd.get('phone') as string,
      email: (fd.get('email') as string) || null,
      server: (fd.get('server') as string) || null,
      plan: (fd.get('plan') as string) || null,
      value: fd.get('value') ? parseFloat(fd.get('value') as string) : null,
      due_date: (fd.get('due_date') as string) || null,
      status: (fd.get('status') as string) || 'ativo',
      notes: (fd.get('notes') as string) || null,
      user_id: user.id,
    };

    if (editingClient) {
      const { error } = await supabase.from('clients').update(payload).eq('id', editingClient.id);
      if (error) toast.error(error.message); else toast.success('Cliente atualizado!');
    } else {
      const { error } = await supabase.from('clients').insert(payload);
      if (error) toast.error(error.message); else toast.success('Cliente adicionado!');
    }
    setLoading(false);
    setDialogOpen(false);
    setEditingClient(null);
    loadClients();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Cliente removido!'); loadClients(); }
  };

  const handleMarkAsPaid = async (client: Client) => {
    if (!user) return;

    // Check for existing transaction with same client_id + due_date
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('client_id', client.id)
      .eq('due_date', client.due_date || '')
      .eq('user_id', user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      toast.error('Já existe um pagamento registrado para este vencimento.');
      return;
    }

    // Create transaction
    const { error: tError } = await supabase.from('transactions').insert({
      client_id: client.id,
      client_name: client.name,
      plan: client.plan,
      value: client.value,
      type: 'renovacao',
      status: 'pago',
      due_date: client.due_date,
      paid_at: new Date().toISOString(),
      description: `Renovação - ${client.name}`,
      user_id: user.id,
    });

    if (tError) {
      toast.error(tError.message);
      return;
    }

    // Update client: add 30 days to due_date and set status to ativo
    const currentDue = client.due_date ? new Date(client.due_date) : new Date();
    currentDue.setDate(currentDue.getDate() + 30);
    const newDueDate = currentDue.toISOString().split('T')[0];

    const { error: cError } = await supabase.from('clients').update({
      due_date: newDueDate,
      status: 'ativo',
    }).eq('id', client.id);

    if (cError) {
      toast.error(cError.message);
    } else {
      toast.success(`${client.name} marcado como pago! Novo vencimento: ${newDueDate}`);
      loadClients();
    }
  };

  const handleSendWhatsApp = async (client: Client) => {
    try {
      await api.post('/api/whatsapp/send-single', {
        clientId: client.id,
        phone: client.phone,
        name: client.name,
        dueDate: client.due_date,
        value: client.value,
        plan: client.plan,
      });
      toast.success(`WhatsApp enviado para ${client.name}`);
    } catch {
      toast.error('Erro ao enviar WhatsApp. Verifique o backend.');
    }
  };

  const SortButton = ({ label, sortField }: { label: string; sortField: SortKey }) => (
    <Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={() => toggleSort(sortField)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingClient(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nome *</Label><Input name="name" required defaultValue={editingClient?.name || ''} /></div>
                <div className="space-y-2"><Label>Telefone *</Label><Input name="phone" required defaultValue={editingClient?.phone || ''} placeholder="5511999999999" /></div>
                <div className="space-y-2"><Label>E-mail</Label><Input name="email" type="email" defaultValue={editingClient?.email || ''} /></div>
                <div className="space-y-2"><Label>Servidor</Label><Input name="server" defaultValue={editingClient?.server || ''} placeholder="ex: Warez, AzonixPlay" /></div>
                <div className="space-y-2"><Label>Plano</Label><Input name="plan" defaultValue={editingClient?.plan || ''} placeholder="ex: 01 Acesso" /></div>
                <div className="space-y-2"><Label>Valor (R$)</Label><Input name="value" type="number" step="0.01" defaultValue={editingClient?.value || ''} /></div>
                <div className="space-y-2"><Label>Vencimento</Label><Input name="due_date" type="date" defaultValue={editingClient?.due_date || ''} /></div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select name="status" defaultValue={editingClient?.status || 'ativo'} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="ativo">Ativo</option>
                    <option value="vencido">Vencido</option>
                    <option value="suspenso">Suspenso</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2"><Label>Observações</Label><Input name="notes" defaultValue={editingClient?.notes || ''} /></div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou telefone..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="suspenso">Suspenso</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={serverFilter} onValueChange={setServerFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Servidor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos servidores</SelectItem>
                {servers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortButton label="Nome" sortField="name" /></TableHead>
                <TableHead>Servidor</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead><SortButton label="Valor" sortField="value" /></TableHead>
                <TableHead><SortButton label="Vencimento" sortField="due_date" /></TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>{client.server || '-'}</TableCell>
                  <TableCell>{client.plan || '-'}</TableCell>
                  <TableCell>{client.value ? `R$ ${Number(client.value).toFixed(2)}` : '-'}</TableCell>
                  <TableCell>{client.due_date || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[client.status] || ''}>{client.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditingClient(client); setDialogOpen(true); }}>
                          <Pencil className="h-4 w-4 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMarkAsPaid(client)}>
                          <CheckCircle className="h-4 w-4 mr-2" />Marcar como pago
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSendWhatsApp(client)}>
                          <Send className="h-4 w-4 mr-2" />Enviar WhatsApp
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(client.id)}>
                          <Trash2 className="h-4 w-4 mr-2" />Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
