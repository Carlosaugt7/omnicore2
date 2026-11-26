import { useEffect, useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, MoreHorizontal, Pencil, Trash2, CheckCircle, Send, ArrowUpDown, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ServerBadge, buildServerColorMap } from '@/components/ServerBadge';
import type { Database } from '@/integrations/supabase/types';
import { getDisplayStatus, CLIENT_STATUS_COLORS, formatDateBR, calculateNextDueDate } from '@/lib/utils';

type Client = Database['public']['Tables']['clients']['Row'];
type Service = Database['public']['Tables']['services']['Row'];
type Plan = Database['public']['Tables']['plans']['Row'];

type SortKey = 'name' | 'due_date' | 'value';
type SortDir = 'asc' | 'desc';

export default function Clients() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serverFilter, setServerFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Controlled form fields
  const [formServer, setFormServer] = useState('');
  const [formPlan, setFormPlan] = useState('');
  const [formValue, setFormValue] = useState('');

  const loadClients = async () => {
    if (!user) return;
    const all: Client[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    setClients(all);
  };

  const loadServices = async () => {
    if (!user) return;
    const { data } = await supabase.from('services').select('*').eq('user_id', user.id).order('server_name');
    if (data) setServices(data);
  };

  const loadPlans = async () => {
    if (!user) return;
    const { data } = await supabase.from('plans').select('*').eq('user_id', user.id).order('name');
    if (data) setPlans(data);
  };

  useEffect(() => {
    loadClients();
    loadServices();
    loadPlans();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unique server names from services catalog
  const serviceServers = useMemo(() => {
    return Array.from(new Set(services.map(s => s.server_name))).sort();
  }, [services]);

  // Planos independentes (tabela plans + fallback para legados em services)
  const availablePlans = useMemo(() => {
    if (plans.length > 0) {
      const hasLegacyEditing =
        editingClient?.plan && !plans.some(p => p.name === editingClient.plan);
      if (hasLegacyEditing && editingClient?.plan) {
        return [
          ...plans,
          { id: 'legacy', name: editingClient.plan, value: editingClient.value || 0, duration_days: 30 } as Plan,
        ];
      }
      return plans;
    }
    // Fallback caso a tabela plans ainda não tenha sido populada
    const seen = new Set<string>();
    const legacy: Plan[] = [];
    for (const s of services) {
      if (s.plan_name && !seen.has(s.plan_name)) {
        seen.add(s.plan_name);
        legacy.push({ id: s.id, name: s.plan_name, value: s.value || 0, duration_days: 30 } as Plan);
      }
    }
    return legacy;
  }, [plans, services, editingClient]);

  // Ao trocar servidor, mantém o plano e valor selecionados
  const handleServerChange = (value: string) => {
    setFormServer(value);
  };

  // Ao trocar plano, preenche o valor automaticamente
  const handlePlanChange = (value: string) => {
    setFormPlan(value);
    const plan = availablePlans.find(p => p.name === value);
    if (plan) {
      setFormValue(String(plan.value));
    }
  };

  // Reset form fields when dialog opens/closes
  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingClient(null);
      setFormServer('');
      setFormPlan('');
      setFormValue('');
    }
  };

  // Pre-fill form when editing
  const openEdit = (client: Client) => {
    setEditingClient(client);
    setFormServer(client.server || '');
    setFormPlan(client.plan || '');
    setFormValue(client.value != null ? String(client.value) : '');
    setDialogOpen(true);
  };

  const servers = useMemo(() => {
    const set = new Set(clients.map(c => c.server).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [clients]);

  const serverColorMap = useMemo(
    () => buildServerColorMap(clients.map(c => c.server)),
    [clients]
  );

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
      const displayStatus = getDisplayStatus(c);
      const matchStatus = statusFilter === 'all' || displayStatus === statusFilter;
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
      server: formServer || null,
      plan: formPlan || null,
      value: formValue ? parseFloat(formValue) : null,
      due_date: (fd.get('due_date') as string) || null,
      status: (fd.get('status') as string) || 'ativo',
      notes: (fd.get('notes') as string) || null,
      user_id: user.id,
    };

    if (editingClient) {
      const { error } = await supabase.from('clients').update(payload).eq('id', editingClient.id);
      if (error) toast.error(error.message); else toast.success('Cliente atualizado!');
    } else {
      // Verificar limite de clientes do plano (apenas para revendedores)
      const { data: rawLimitCheck } = await supabase.rpc('check_reseller_client_limit', { p_user_id: user.id });
      const limitCheck = Array.isArray(rawLimitCheck) ? rawLimitCheck[0] : rawLimitCheck;
      if (limitCheck && limitCheck.allowed === false) {
        toast.error(`Limite de clientes atingido! Seu plano ${limitCheck.plan} permite até ${limitCheck.plan_limit} clientes. Você já possui ${limitCheck.current_count}.`);
        setLoading(false);
        return;
      }

      const { error } = await supabase.from('clients').insert(payload);
      if (error) toast.error(error.message); else toast.success('Cliente adicionado!');
    }
    setLoading(false);
    handleDialogChange(false);
    loadClients();
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Cliente removido!'); loadClients(); }
    setDeleteTarget(null);
    setDeleting(false);
  };

  const handleAutomatedPanelRenew = async (client: Client, service?: Service) => {
    if (!user) return;
    const sName = service?.server_name || client.server;
    if (!sName) {
      toast.error('Cliente não possui servidor vinculado.');
      return;
    }
    toast.info(`Iniciando renovação no painel ${sName}...`);
    try {
      const res = await api.panelRenew({
        userId: user.id,
        clientId: client.id,
        serverName: sName,
      });
      if (res.success) {
        toast.success(res.message || `Renovação automática concluída no painel ${sName}!`);
        loadClients();
        queryClient.invalidateQueries({ queryKey: ['clients'] });
      } else {
        toast.warning(res.error || `Não foi possível concluir no painel ${sName}. Verifique os dados de acesso.`);
      }
    } catch {
      toast.error(`Falha ao conectar com serviço de automação de painéis.`);
    }
  };

  const handleMarkAsPaid = async (client: Client) => {
    if (!user) return;

    // Regra (Opção A):
    // Se vencido (< hoje), soma a duração do plano (padrão 30 dias) a partir de hoje.
    // Se não vencido (>= hoje), soma a duração do plano ao vencimento atual.
    const matchedPlan = plans.find(p => p.name === client.plan);
    const durationDays = matchedPlan?.duration_days || 30;
    const newDueDate = calculateNextDueDate(client.due_date, durationDays);
    const currentDue = client.due_date || newDueDate;

    // Regra (Opção A) para transações:
    // Verifica se já existe transação para este cliente e vencimento
    const { data: existingList } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('client_id', client.id)
      .eq('due_date', client.due_date || '')
      .eq('user_id', user.id)
      .limit(1);

    const existing = existingList?.[0];

    if (existing) {
      if (existing.status !== 'pago') {
        // Atualiza transação pendente existente para paga
        await supabase.from('transactions').update({
          status: 'pago',
          paid_at: new Date().toISOString(),
          value: client.value,
          plan: client.plan,
          client_name: client.name,
        }).eq('id', existing.id);
      }
      // Se já estava pago, não duplica a transação e não trava a renovação
    } else {
      // Cria a transação de renovação
      const { error: tError } = await supabase.from('transactions').insert({
        client_id: client.id,
        client_name: client.name,
        plan: client.plan,
        value: client.value,
        type: 'renovacao',
        status: 'pago',
        due_date: client.due_date || currentDue,
        paid_at: new Date().toISOString(),
        description: `Renovação - ${client.name}`,
        user_id: user.id,
      });

      if (tError) {
        toast.error(`Erro ao criar transação: ${tError.message}`);
        return;
      }
    }

    // Atualiza cliente: novo vencimento e status 'ativo'
    const { error: cError } = await supabase.from('clients').update({
      due_date: newDueDate,
      status: 'ativo',
    }).eq('id', client.id);

    if (cError) {
      toast.error(cError.message);
      return;
    }

    toast.success(`${client.name} renovado com sucesso! Novo vencimento: ${formatDateBR(newDueDate)}`);
    
    // Invalida cache do React Query e recarrega lista local
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['omnicore_metrics'] });
    loadClients();

    // Se houver servidor vinculado com painel configurado, dispara automação do painel
    if (client.server) {
      const service = services.find(s => s.server_name === client.server);
      if ((service as Record<string, unknown>)?.panel_url) {
        handleAutomatedPanelRenew(client, service);
      }
    }
  };

  const handleSendWhatsApp = async (client: Client) => {
    if (!user) return;
    try {
      const result = await api.whatsappSendSingle({
        userId: user.id,
        clientId: client.id,
        phone: client.phone,
        templateType: 'template_today',
      });
      if (result.success) {
        toast.success(`WhatsApp enviado para ${client.name}`);
      } else {
        toast.error(result.error || 'Erro ao enviar WhatsApp.');
      }
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
        <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
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

                {/* Servidor — select com lista do catálogo */}
                <div className="space-y-2">
                  <Label>Servidor</Label>
                  <Select value={formServer} onValueChange={handleServerChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceServers.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Plano — lista independente de planos */}
                <div className="space-y-2">
                  <Label>Plano</Label>
                  <Select value={formPlan} onValueChange={handlePlanChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o plano..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePlans.map(p => (
                        <SelectItem key={p.id} value={p.name}>
                          {p.name} — R$ {Number(p.value || 0).toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Valor — preenchido automaticamente, editável */}
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formValue}
                    onChange={e => setFormValue(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

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
                <SelectItem value="à vencer">À Vencer</SelectItem>
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
                  <TableCell><ServerBadge name={client.server} colorMap={serverColorMap} /></TableCell>
                  <TableCell>{client.plan || '-'}</TableCell>
                  <TableCell>{client.value ? `R$ ${Number(client.value).toFixed(2)}` : '-'}</TableCell>
                  <TableCell>{formatDateBR(client.due_date)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={CLIENT_STATUS_COLORS[getDisplayStatus(client)] || ''}>{getDisplayStatus(client)}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(client)}>
                          <Pencil className="h-4 w-4 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMarkAsPaid(client)}>
                          <CheckCircle className="h-4 w-4 mr-2 text-emerald-600" />Marcar como pago (Renovar)
                        </DropdownMenuItem>
                        {(() => {
                          const srv = services.find(s => s.server_name === client.server);
                          const pUrl = (srv as Record<string, unknown>)?.panel_url as string | undefined;
                          return (
                            <>
                              {pUrl && (
                                <DropdownMenuItem onClick={() => window.open(pUrl, '_blank', 'noopener,noreferrer')}>
                                  <ExternalLink className="h-4 w-4 mr-2 text-blue-600" />Acessar Painel
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleAutomatedPanelRenew(client, srv)}>
                                <RefreshCw className="h-4 w-4 mr-2 text-amber-600" />Renovar no Painel Online
                              </DropdownMenuItem>
                            </>
                          );
                        })()}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleSendWhatsApp(client)}>
                          <Send className="h-4 w-4 mr-2" />Enviar WhatsApp
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(client)}>
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

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente <strong>{deleteTarget?.name}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Excluindo...' : 'Sim, excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
