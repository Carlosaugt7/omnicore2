import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBRL } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type Plan = Database['public']['Tables']['plans']['Row'];

export default function Plans() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    if (error) {
      toast.error(`Erro ao carregar planos: ${error.message}`);
      return;
    }
    if (data) setPlans(data);
  };

  useEffect(() => {
    load();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: (fd.get('name') as string).trim(),
      value: fd.get('value') ? parseFloat(fd.get('value') as string) : 0,
      duration_days: fd.get('duration_days') ? parseInt(fd.get('duration_days') as string, 10) : 30,
      user_id: user.id,
    };

    if (editing) {
      const { error } = await supabase.from('plans').update(payload).eq('id', editing.id);
      if (error) toast.error(error.message);
      else toast.success('Plano atualizado!');
    } else {
      const { error } = await supabase.from('plans').insert(payload);
      if (error) toast.error(error.message);
      else toast.success('Plano adicionado!');
    }

    setLoading(false);
    setDialogOpen(false);
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('plans').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Plano removido!');
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Planos</h1>
            <p className="text-sm text-muted-foreground">
              Cadastre seus planos e valores padrão para selecionar rapidamente ao cadastrar clientes.
            </p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Plano</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Plano *</Label>
                <Input
                  name="name"
                  placeholder="Ex: 01 Acesso, 02 Acessos, Trimestral..."
                  required
                  defaultValue={editing?.name || ''}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <Input
                    name="value"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="35.00"
                    required
                    defaultValue={editing?.value ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Duração (dias)</Label>
                  <Input
                    name="duration_days"
                    type="number"
                    min="1"
                    placeholder="30"
                    defaultValue={editing?.duration_days ?? 30}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-semibold text-emerald-600">{formatBRL(Number(p.value || 0))}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.duration_days} dias</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(p); setDialogOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {plans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhum plano cadastrado ainda. Clique em "Novo Plano" para começar.
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
