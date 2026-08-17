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
import { Badge } from '@/components/ui/badge';
import { Plus, Gift, Trash2, Pencil, Users, CheckCircle2, Clock, Award, Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  status: string;
  user_id: string;
  created_at: string;
}

type Client = Database['public']['Tables']['clients']['Row'];
type Transaction = Database['public']['Tables']['transactions']['Row'];

export default function Referrals() {
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingReferral, setEditingReferral] = useState<Referral | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states — novo
  const [formReferrerId, setFormReferrerId] = useState('');
  const [formReferredId, setFormReferredId] = useState('');

  // Form states — edição
  const [editReferrerId, setEditReferrerId] = useState('');
  const [editReferredId, setEditReferredId] = useState('');
  const [editRenovado, setEditRenovado] = useState(false);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [refRes, cliRes, txRes] = await Promise.all([
        supabase.from('referrals').select('*').order('created_at', { ascending: false }),
        supabase.from('clients').select('*').order('name', { ascending: true }),
        // Conta TODOS os pagamentos (entrada + renovacao), não só renovacao
        supabase.from('transactions').select('*').eq('status', 'pago')
      ]);

      // Filtra referrals do usuário e do shared access
      if (refRes.data) {
        const allRefs = refRes.data as Referral[];
        setReferrals(allRefs.filter(r => 
          r.user_id === user.id || 
          r.user_id === 'd9919cb5-c4a4-43c3-8614-878495d18c37' ||
          r.user_id === 'd267b748-8f3b-4684-85e9-589dc9a79a93'
        ));
      }
      if (cliRes.data) {
        const allClients = cliRes.data;
        setClients(allClients.filter(c => 
          c.user_id === user.id ||
          c.user_id === 'd9919cb5-c4a4-43c3-8614-878495d18c37' ||
          c.user_id === 'd267b748-8f3b-4684-85e9-589dc9a79a93'
        ));
      }
      if (txRes.data) {
        const allTxs = txRes.data as Transaction[];
        setTransactions(allTxs.filter(t =>
          t.user_id === user.id ||
          t.user_id === 'd9919cb5-c4a4-43c3-8614-878495d18c37' ||
          t.user_id === 'd267b748-8f3b-4684-85e9-589dc9a79a93'
        ));
      }
    } catch (err: any) {
      toast.error(`Erro ao carregar dados: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Conta pagamentos do indicado (todos os tipos: entrada + renovacao)
  const getPaymentsCount = (referredId: string) => {
    return transactions.filter(t => t.client_id === referredId).length;
  };

  // Metrics calculation
  const metrics = useMemo(() => {
    let total = referrals.length;
    let availableBonus = 0;
    let redeemed = 0;

    referrals.forEach(ref => {
      if (ref.status === 'resgatado') {
        redeemed++;
      } else {
        const count = getPaymentsCount(ref.referred_id);
        if (count >= 2) {
          availableBonus++;
        }
      }
    });

    return { total, availableBonus, redeemed };
  }, [referrals, transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Form validation: Filter lists dynamically
  const availableReferrers = clients;
  
  const availableReferreds = useMemo(() => {
    return clients.filter(c => {
      if (c.id === formReferrerId) return false;
      const isAlreadyReferred = referrals.some(r => r.referred_id === c.id);
      return !isAlreadyReferred;
    });
  }, [clients, formReferrerId, referrals]);

  // ── NOVA INDICAÇÃO ────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formReferrerId || !formReferredId) {
      toast.error('Selecione ambos os clientes.');
      return;
    }

    const referred = clients.find(c => c.id === formReferredId);
    if (!referred) {
      toast.error('Cliente indicado não encontrado.');
      return;
    }

    setLoading(true);
    try {
      // 1. Cria a indicação
      const { error: refError } = await supabase.from('referrals').insert({
        referrer_id: formReferrerId,
        referred_id: formReferredId,
        status: 'pendente',
        user_id: user.id
      });
      if (refError) throw refError;

      // 2. Cria automaticamente o 1º mês como PAGO
      const { error: txError } = await supabase.from('transactions').insert({
        client_id: referred.id,
        client_name: referred.name,
        value: referred.value || 0,
        type: 'entrada',
        status: 'pago',
        due_date: referred.due_date || new Date().toISOString().split('T')[0],
        paid_at: new Date().toISOString(),
        description: '1º Mês (Indicação)',
        user_id: user.id,
      });
      if (txError) {
        console.warn('Erro ao criar transação do 1º mês:', txError.message);
        // Não bloqueia — a indicação já foi criada
      }

      toast.success('Indicação cadastrada! 1º mês marcado como pago.');
      setDialogOpen(false);
      setFormReferrerId('');
      setFormReferredId('');
      loadData();
    } catch (err: any) {
      toast.error(`Erro ao cadastrar indicação: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── EDITAR INDICAÇÃO ──────────────────────────────────────────

  const openEditDialog = (referral: Referral) => {
    setEditingReferral(referral);
    setEditReferrerId(referral.referrer_id);
    setEditReferredId(referral.referred_id);
    // Carrega estado da renovação
    const count = getPaymentsCount(referral.referred_id);
    setEditRenovado(count >= 2);
    setEditDialogOpen(true);
  };

  const availableEditReferreds = useMemo(() => {
    return clients.filter(c => {
      if (c.id === editReferrerId) return false;
      if (editingReferral && c.id === editingReferral.referred_id) return true; // mantém o atual
      const isAlreadyReferred = referrals.some(
        r => r.referred_id === c.id && r.id !== editingReferral?.id
      );
      return !isAlreadyReferred;
    });
  }, [clients, editReferrerId, referrals, editingReferral]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReferral || !user) return;
    if (!editReferrerId || !editReferredId) {
      toast.error('Selecione ambos os clientes.');
      return;
    }

    setLoading(true);
    try {
      // 1. Atualiza a indicação
      const { error } = await supabase
        .from('referrals')
        .update({
          referrer_id: editReferrerId,
          referred_id: editReferredId,
        })
        .eq('id', editingReferral.id);

      if (error) throw error;

      // 2. Sincroniza renovação do cliente indicado
      const referredClient = clients.find(c => c.id === editReferredId);
      const currentCount = getPaymentsCount(editReferredId);
      const targetCount = editRenovado ? 2 : 1;

      if (targetCount > currentCount && referredClient) {
        // Precisa criar transações adicionais
        const toCreate = targetCount - currentCount;
        const insertRows = [];
        for (let i = 0; i < toCreate; i++) {
          insertRows.push({
            client_id: referredClient.id,
            client_name: referredClient.name,
            value: referredClient.value || 0,
            type: 'renovacao',
            status: 'pago',
            due_date: referredClient.due_date || new Date().toISOString().split('T')[0],
            paid_at: new Date().toISOString(),
            description: `${currentCount + i + 1}º Mês (Confirmação manual)`,
            user_id: user.id,
          });
        }
        if (insertRows.length > 0) {
          const { error: txCreateErr } = await supabase.from('transactions').insert(insertRows);
          if (txCreateErr) console.warn('Erro ao criar transações:', txCreateErr.message);
        }
      } else if (targetCount < currentCount) {
        // Precisa remover transações excedentes
        const toRemove = currentCount - targetCount;
        const { data: excessTxs } = await supabase
          .from('transactions')
          .select('id')
          .eq('client_id', editReferredId)
          .eq('status', 'pago')
          .order('paid_at', { ascending: false })
          .limit(toRemove);

        if (excessTxs && excessTxs.length > 0) {
          const idsToDelete = excessTxs.map(t => t.id);
          const { error: txDelErr } = await supabase
            .from('transactions')
            .delete()
            .in('id', idsToDelete);
          if (txDelErr) console.warn('Erro ao remover transações:', txDelErr.message);
        }
      }

      toast.success('Indicação atualizada!');
      setEditDialogOpen(false);
      setEditingReferral(null);
      loadData();
    } catch (err: any) {
      toast.error(`Erro ao editar indicação: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── RESGATAR BÔNUS ────────────────────────────────────────────

  const handleRedeemBonus = async (referral: Referral) => {
    if (!user) return;
    
    const referrer = clients.find(c => c.id === referral.referrer_id);
    if (!referrer) {
      toast.error('Cliente indicador não encontrado.');
      return;
    }

    setLoading(true);
    try {
      const currentDue = referrer.due_date ? new Date(referrer.due_date + 'T12:00:00') : new Date();
      currentDue.setDate(currentDue.getDate() + 30);
      const newDueDate = currentDue.toISOString().split('T')[0];

      const { error: clientError } = await supabase
        .from('clients')
        .update({ due_date: newDueDate, status: 'ativo' })
        .eq('id', referrer.id);
      if (clientError) throw clientError;

      const { error: referralError } = await supabase
        .from('referrals')
        .update({ status: 'resgatado' })
        .eq('id', referral.id);
      if (referralError) throw referralError;

      await supabase.from('transactions').insert({
        client_id: referrer.id,
        client_name: referrer.name,
        value: 0,
        type: 'renovacao',
        status: 'pago',
        due_date: referrer.due_date,
        paid_at: new Date().toISOString(),
        description: `Bônus Indicação — Ref. indicado ID: ${referral.referred_id}`,
        user_id: user.id,
      });

      toast.success(`Bônus aplicado! Vencimento de ${referrer.name} adiado para ${newDueDate}`);
      loadData();
    } catch (err: any) {
      toast.error(`Erro ao resgatar bônus: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── EXCLUIR ───────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover esta indicação?')) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.from('referrals').delete().eq('id', id);
      if (error) throw error;
      toast.success('Indicação removida.');
      loadData();
    } catch (err: any) {
      toast.error(`Erro ao remover indicação: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Indicações</h1>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setFormReferrerId('');
            setFormReferredId('');
          }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nova Indicação</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Indicação</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Quem indicou? (Cliente Indicador)</Label>
                <Select value={formReferrerId} onValueChange={setFormReferrerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableReferrers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quem foi indicado? (Novo Cliente)</Label>
                <Select 
                  value={formReferredId} 
                  onValueChange={setFormReferredId}
                  disabled={!formReferrerId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={formReferrerId ? "Selecione o indicado..." : "Selecione primeiro quem indicou"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableReferreds.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                O 1º mês é marcado como <strong>pago</strong> ao cadastrar.
                O bônus estará disponível quando o cliente estiver <strong>Renovado</strong>.
              </p>

              <Button type="submit" className="w-full mt-4" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar Indicação'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Dialog de Edição ─────────────────────────────────── */}
        <Dialog open={editDialogOpen} onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingReferral(null);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Indicação</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Quem indicou? (Cliente Indicador)</Label>
                <Select value={editReferrerId} onValueChange={setEditReferrerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableReferrers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quem foi indicado? (Novo Cliente)</Label>
                <Select 
                  value={editReferredId} 
                  onValueChange={setEditReferredId}
                  disabled={!editReferrerId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o indicado..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEditReferreds.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status da Renovação do cliente indicado */}
              {editingReferral && (
                <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
                  <Label className="text-sm font-medium">Status da Indicação</Label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editRenovado}
                        onChange={(e) => setEditRenovado(e.target.checked)}
                        className="rounded border-gray-300 h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium">Renovado</span>
                      {editRenovado && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ao marcar como <strong>Renovado</strong>, a renovação é confirmada e o bônus fica disponível para resgate.
                  </p>
                </div>
              )}

              <Button type="submit" className="w-full mt-4" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-blue-200/60 dark:border-blue-800/40 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Indicações</CardTitle>
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40">
              <Users className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{metrics.total}</div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bônus Disponíveis</CardTitle>
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Gift className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">{metrics.availableBonus}</div>
          </CardContent>
        </Card>

        <Card className="border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bônus Resgatados</CardTitle>
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <Award className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">{metrics.redeemed}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente Indicador</TableHead>
                <TableHead>Cliente Indicado</TableHead>
                <TableHead className="text-center">Renovado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-48 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map((item) => {
                const referrer = clients.find(c => c.id === item.referrer_id);
                const referred = clients.find(c => c.id === item.referred_id);
                const paymentsCount = getPaymentsCount(item.referred_id);
                const isRenewed = paymentsCount >= 2;

                let statusBadge = <Badge variant="secondary">Pendente</Badge>;
                let canRedeem = false;

                if (item.status === 'resgatado') {
                  statusBadge = <Badge className="bg-muted text-muted-foreground hover:bg-muted">Resgatado</Badge>;
                } else if (isRenewed) {
                  statusBadge = <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">Bônus</Badge>;
                  canRedeem = true;
                } else {
                  statusBadge = <Badge className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20">Pendente</Badge>;
                }

                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{referrer?.name || 'Cliente removido'}</TableCell>
                    <TableCell>{referred?.name || 'Cliente removido'}</TableCell>
                    <TableCell className="text-center">
                      {isRenewed ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground mx-auto" />
                      )}
                    </TableCell>
                    <TableCell>{statusBadge}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => openEditDialog(item)}
                          disabled={loading}
                          title="Editar indicação"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {canRedeem && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-200"
                            onClick={() => handleRedeemBonus(item)}
                            disabled={loading}
                          >
                            <Gift className="h-3.5 w-3.5 mr-1" />
                            Resgatar
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDelete(item.id)}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {referrals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma indicação cadastrada
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
