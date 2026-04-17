import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ServerBadge, buildServerColorMap } from '@/components/ServerBadge';
import type { Database } from '@/integrations/supabase/types';

type Service = Database['public']['Tables']['services']['Row'];

export default function Services() {
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [loading, setLoading] = useState(false);

  const colorMap = useMemo(
    () => buildServerColorMap(services.map(s => s.server_name)),
    [services]
  );

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('services').select('*').eq('user_id', user.id).order('server_name');
    if (data) setServices(data);
  };

  useEffect(() => { load(); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      server_name: fd.get('server_name') as string,
      plan_name: fd.get('plan_name') as string,
      value: fd.get('value') ? parseFloat(fd.get('value') as string) : null,
      user_id: user.id,
    };

    if (editing) {
      const { error } = await supabase.from('services').update(payload).eq('id', editing.id);
      if (error) toast.error(error.message); else toast.success('Serviço atualizado!');
    } else {
      const { error } = await supabase.from('services').insert(payload);
      if (error) toast.error(error.message); else toast.success('Serviço adicionado!');
    }
    setLoading(false);
    setDialogOpen(false);
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Serviço removido!'); load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Serviços</h1>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Serviço</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label>Servidor *</Label><Input name="server_name" required defaultValue={editing?.server_name || ''} /></div>
              <div className="space-y-2"><Label>Plano *</Label><Input name="plan_name" required defaultValue={editing?.plan_name || ''} /></div>
              <div className="space-y-2"><Label>Valor</Label><Input name="value" type="number" step="0.01" defaultValue={editing?.value || ''} /></div>
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
                <TableHead>Servidor</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <ServerBadge name={s.server_name} colorMap={colorMap} />
                  </TableCell>
                  <TableCell>{s.plan_name}</TableCell>
                  <TableCell>{s.value ? `R$ ${Number(s.value).toFixed(2)}` : '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {services.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum serviço cadastrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
