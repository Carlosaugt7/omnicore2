import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];

const statusColors: Record<string, string> = {
  ativo: 'bg-green-500/10 text-green-500',
  vencido: 'bg-red-500/10 text-red-500',
  suspenso: 'bg-yellow-500/10 text-yellow-500',
  cancelado: 'bg-muted text-muted-foreground',
};

export default function Clients() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(false);

  const loadClients = async () => {
    if (!user) return;
    const { data } = await supabase.from('clients').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setClients(data);
  };

  useEffect(() => { loadClients(); }, [user]);

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

  const filtered = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

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
                <div className="space-y-2"><Label>Telefone *</Label><Input name="phone" required defaultValue={editingClient?.phone || ''} /></div>
                <div className="space-y-2"><Label>E-mail</Label><Input name="email" type="email" defaultValue={editingClient?.email || ''} /></div>
                <div className="space-y-2"><Label>Servidor</Label><Input name="server" defaultValue={editingClient?.server || ''} /></div>
                <div className="space-y-2"><Label>Plano</Label><Input name="plan" defaultValue={editingClient?.plan || ''} /></div>
                <div className="space-y-2"><Label>Valor</Label><Input name="value" type="number" step="0.01" defaultValue={editingClient?.value || ''} /></div>
                <div className="space-y-2"><Label>Vencimento</Label><Input name="due_date" type="date" defaultValue={editingClient?.due_date || ''} /></div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select name="status" defaultValue={editingClient?.status || 'ativo'} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
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
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou telefone..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="suspenso">Suspenso</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Servidor</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>{client.phone}</TableCell>
                  <TableCell>{client.server || '-'}</TableCell>
                  <TableCell>{client.plan || '-'}</TableCell>
                  <TableCell>{client.value ? `R$ ${Number(client.value).toFixed(2)}` : '-'}</TableCell>
                  <TableCell>{client.due_date || '-'}</TableCell>
                  <TableCell><Badge variant="secondary" className={statusColors[client.status] || ''}>{client.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingClient(client); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(client.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clientes</h1>
        <p className="text-muted-foreground">Gestão de clientes (Plano Agency)</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">Recurso do Plano Agency</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Gerencie múltiplos clientes, atribua agentes e números dedicados para cada um.
            Faça upgrade para o plano Agency para desbloquear.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
