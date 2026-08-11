import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Users, Search, Plus, Pencil, Trash2, ShieldBan, ShieldCheck,
  Building2, Store, Phone, Mail, Calendar, UserCheck, RefreshCw,
} from 'lucide-react';

interface Reseller {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  plan: 'basic' | 'start' | 'advanced';
  status: 'active' | 'blocked';
  notes: string | null;
  created_at: string;
  updated_at: string;
  client_count: number;
}

const PLAN_LIMITS: Record<string, number> = { basic: 40, start: 100, advanced: 500 };
const PLAN_LABELS: Record<string, string> = { basic: 'Basic (40)', start: 'Start (100)', advanced: 'Advanced (500)' };

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const MASTER_EMAILS = ['carlosaugt7@gmail.com', 'andressanramos@hotmail.com'];

export default function Resellers() {
  const { user, loading: authLoading } = useAuth();

  // ── Access guard ──────────────────────────────────────────
  const isMaster = user?.email ? MASTER_EMAILS.includes(user.email) : false;

  if (authLoading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  if (!isMaster) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <ShieldBan className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold">Acesso Restrito</h2>
        <p className="text-muted-foreground mt-2">Apenas administradores master podem acessar este menu.</p>
      </div>
    );
  }

  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Reseller | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPlan, setFormPlan] = useState<'basic' | 'start' | 'advanced'>('basic');
  const [formStatus, setFormStatus] = useState<'active' | 'blocked'>('active');
  const [formNotes, setFormNotes] = useState('');

  // ── Auth helper ───────────────────────────────────────────
  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  };

  const backendFetch = async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    if (res.status === 401 || res.status === 403) throw new Error('Sem permissão.');
    return res.json();
  };

  // ── Load ──────────────────────────────────────────────────
  const loadResellers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await backendFetch('/api/resellers');
      if (result.success) setResellers(result.data || []);
      else toast.error(result.error || 'Erro ao carregar.');
    } catch (err: any) {
      toast.error(err.message || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResellers();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter ────────────────────────────────────────────────
  const filteredResellers = useMemo(() => {
    if (!searchQuery) return resellers;
    const q = searchQuery.toLowerCase();
    return resellers.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      (r.phone && r.phone.includes(q))
    );
  }, [resellers, searchQuery]);

  // ── Metrics ───────────────────────────────────────────────
  const metrics = useMemo(() => ({
    total: resellers.length,
    active: resellers.filter(r => r.status === 'active').length,
    blocked: resellers.filter(r => r.status === 'blocked').length,
  }), [resellers]);

  // ── Actions ───────────────────────────────────────────────
  const openCreateDialog = () => {
    setEditingId(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormPlan('basic');
    setFormStatus('active');
    setFormNotes('');
    setDialogOpen(true);
  };

  const openEditDialog = (r: Reseller) => {
    setEditingId(r.id);
    setFormName(r.name);
    setFormEmail(r.email);
    setFormPhone(r.phone || '');
    setFormPlan(r.plan);
    setFormStatus(r.status);
    setFormNotes(r.notes || '');
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formEmail) {
      toast.error('Nome e email são obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      const body: any = {
        name: formName, email: formEmail, phone: formPhone || null,
        plan: formPlan, status: formStatus, notes: formNotes || null,
      };

      const res = editingId
        ? await backendFetch(`/api/resellers/${editingId}`, { method: 'PUT', body: JSON.stringify(body) })
        : await backendFetch('/api/resellers', { method: 'POST', body: JSON.stringify({ ...body, user_id: crypto.randomUUID() }) });

      if (res.success) {
        toast.success(editingId ? 'Revendedor atualizado!' : 'Revendedor criado!');
        setDialogOpen(false);
        loadResellers();
      } else {
        toast.error(res.error || 'Erro ao salvar.');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await backendFetch(`/api/resellers/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.success) {
        toast.success('Revendedor excluído!');
        setDeleteTarget(null);
        loadResellers();
      } else {
        toast.error(res.error || 'Erro ao excluir.');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleBlock = async (r: Reseller) => {
    const newStatus = r.status === 'active' ? 'blocked' : 'active';
    try {
      const res = await backendFetch(`/api/resellers/${r.id}`, {
        method: 'PUT', body: JSON.stringify({ status: newStatus }),
      });
      if (res.success) {
        toast.success(newStatus === 'blocked' ? 'Revendedor bloqueado.' : 'Revendedor desbloqueado.');
        loadResellers();
      } else {
        toast.error(res.error || 'Erro.');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSyncAll = async () => {
    setLoading(true);
    try {
      const res = await backendFetch('/api/resellers/sync', { method: 'POST', body: JSON.stringify({}) });
      if (res.success) {
        toast.success(`${res.created} revendedor(es) sincronizado(s)!`);
        loadResellers();
      } else {
        toast.error(res.error || 'Erro ao sincronizar.');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Revenda</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSyncAll} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />Sincronizar Todos
          </Button>
          <Button onClick={openCreateDialog}><Plus className="h-4 w-4 mr-2" />Novo Revendedor</Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-blue-200/60 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revendedores</CardTitle>
            <Building2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{metrics.total}</div></CardContent>
        </Card>
        <Card className="border-emerald-200/60 bg-gradient-to-br from-emerald-50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ativos</CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-600">{metrics.active}</div></CardContent>
        </Card>
        <Card className="border-red-200/60 bg-gradient-to-br from-red-50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bloqueados</CardTitle>
            <ShieldBan className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{metrics.blocked}</div></CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, email ou telefone..."
          className="pl-9"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Revendedor</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead className="text-center">Clientes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredResellers.map(r => {
                const limit = PLAN_LIMITS[r.plan] || 40;
                const usagePercent = Math.min(100, Math.round((r.client_count / limit) * 100));
                const isNearLimit = usagePercent >= 80;
                const isFull = r.client_count >= limit;

                return (
                  <TableRow key={r.id} className={r.status === 'blocked' ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(r.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {r.email}
                      </div>
                      {r.phone && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" />{r.phone}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {r.plan === 'basic' ? 'Basic' : r.plan === 'start' ? 'Start' : 'Advanced'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`text-sm font-medium ${isFull ? 'text-red-500' : isNearLimit ? 'text-yellow-500' : ''}`}>
                          {r.client_count}/{limit}
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 mt-1 max-w-[100px] mx-auto">
                        <div
                          className={`h-1.5 rounded-full transition-all ${isFull ? 'bg-red-500' : isNearLimit ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                          style={{ width: `${usagePercent}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={r.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}>
                        {r.status === 'active' ? 'Ativo' : 'Bloqueado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(r)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleBlock(r)}
                          title={r.status === 'active' ? 'Bloquear' : 'Desbloquear'}
                        >
                          {r.status === 'active'
                            ? <ShieldBan className="h-4 w-4 text-yellow-500" />
                            : <ShieldCheck className="h-4 w-4 text-emerald-500" />
                          }
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)} title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredResellers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {loading ? 'Carregando...' : 'Nenhum revendedor encontrado.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Create/Edit Dialog ──────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Revendedor' : 'Novo Revendedor'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nome completo" />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@exemplo.com" disabled={!!editingId} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="5511999999999" />
              </div>
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select value={formPlan} onValueChange={v => setFormPlan(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic (40 clientes)</SelectItem>
                    <SelectItem value="start">Start (100 clientes)</SelectItem>
                    <SelectItem value="advanced">Advanced (500 clientes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editingId && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={v => setFormStatus(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="blocked">Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Notas internas..." />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Revendedor'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ─────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o revendedor <strong>{deleteTarget?.name}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? 'Excluindo...' : 'Sim, excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
