import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type MacAddress = Database['public']['Tables']['mac_addresses']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];
type Service = Database['public']['Tables']['services']['Row'];

export default function MacAddresses() {
  const { user } = useAuth();
  const [items, setItems] = useState<MacAddress[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MacAddress | null>(null);
  const [loading, setLoading] = useState(false);

  const [formClientName, setFormClientName] = useState('');
  const [formServer, setFormServer] = useState('');

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('mac_addresses').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setItems(data);

    const { data: cData } = await supabase.from('clients').select('*').eq('user_id', user.id).order('name', { ascending: true });
    if (cData) setClients(cData);

    const { data: sData } = await supabase.from('services').select('*').eq('user_id', user.id).order('server_name', { ascending: true });
    if (sData) setServices(sData);
  };

  const servers = Array.from(new Set(services.map(s => s.server_name))).sort();

  useEffect(() => { load(); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      client_name: formClientName || null,
      mac: (fd.get('mac') as string).toUpperCase(),
      key: (fd.get('key') as string) || null,
      activation_url: (fd.get('activation_url') as string) || null,
      server: formServer || null,
      user_id: user.id,
    };

    if (editing) {
      const { error } = await supabase.from('mac_addresses').update(payload).eq('id', editing.id);
      if (error) toast.error(error.message); else toast.success('MAC atualizado!');
    } else {
      const { error } = await supabase.from('mac_addresses').insert(payload);
      if (error) toast.error(error.message); else toast.success('MAC adicionado!');
    }
    setLoading(false);
    setDialogOpen(false);
    setEditing(null);
    setFormClientName('');
    setFormServer('');
    load();
  };

  const handleDialogOpen = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditing(null);
      setFormClientName('');
      setFormServer('');
    }
  };

  const openEdit = (item: MacAddress) => {
    setEditing(item);
    setFormClientName(item.client_name || '');
    setFormServer(item.server || '');
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('mac_addresses').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('MAC removido!'); load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">MAC Address</h1>
        <Dialog open={dialogOpen} onOpenChange={handleDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo MAC</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Editar MAC' : 'Novo MAC'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={formClientName} onValueChange={setFormClientName}>
                  <SelectTrigger><SelectValue placeholder="Selecione um cliente..." /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>MAC *</Label><Input name="mac" required defaultValue={editing?.mac || ''} placeholder="00:1A:2B:3C:4D:5E" className="uppercase font-mono" /></div>
              <div className="space-y-2"><Label>Chave</Label><Input name="key" defaultValue={editing?.key || ''} /></div>
              <div className="space-y-2"><Label>URL Ativação</Label><Input name="activation_url" defaultValue={editing?.activation_url || ''} /></div>
              <div className="space-y-2">
                <Label>Servidor</Label>
                <Select value={formServer} onValueChange={setFormServer}>
                  <SelectTrigger><SelectValue placeholder="Selecione um servidor..." /></SelectTrigger>
                  <SelectContent>
                    {servers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
                <TableHead>MAC</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead>Servidor</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.client_name || '-'}</TableCell>
                  <TableCell className="font-mono text-xs">{item.mac}</TableCell>
                  <TableCell className="text-xs">{item.key || '-'}</TableCell>
                  <TableCell>{item.server || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum MAC cadastrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
