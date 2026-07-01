import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Gift, Trash2, Users, CheckCircle2, Clock, Award, Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  status: string; // 'pendente' | 'resgatado'
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
  const [loading, setLoading] = useState(false);

  // Form states
  const [formReferrerId, setFormReferrerId] = useState('');
  const [formReferredId, setFormReferredId] = useState('');

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [refRes, cliRes, txRes] = await Promise.all([
        supabase.from('referrals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('clients').select('*').eq('user_id', user.id).order('name', { ascending: true }),
        supabase.from('transactions').select('*').eq('user_id', user.id).eq('status', 'pago').eq('type', 'renovacao')
      ]);

      if (refRes.data) setReferrals(refRes.data as Referral[]);
      if (cliRes.data) setClients(cliRes.data);
      if (txRes.data) setTransactions(txRes.data);
    } catch (err: any) {
      toast.error(`Erro ao carregar dados: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper to count payments for a referred client
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
      // Cannot refer oneself
      if (c.id === formReferrerId) return false;
      // Cannot be referred more than once
      const isAlreadyReferred = referrals.some(r => r.referred_id === c.id);
      return !isAlreadyReferred;
    });
  }, [clients, formReferrerId, referrals]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formReferrerId || !formReferredId) {
      toast.error('Selecione ambos os clientes.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('referrals').insert({
        referrer_id: formReferrerId,
        referred_id: formReferredId,
        status: 'pendente',
        user_id: user.id
      });

      if (error) throw error;

      toast.success('Indicação cadastrada com sucesso!');
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

  const handleRedeemBonus = async (referral: Referral) => {
    if (!user) return;
    
    const referrer = clients.find(c => c.id === referral.referrer_id);
    if (!referrer) {
      toast.error('Cliente indicador não encontrado.');
      return;
    }

    setLoading(true);
    try {
      // 1. Calculate new due date (due_date + 30 days)
      const currentDue = referrer.due_date ? new Date(referrer.due_date) : new Date();
      currentDue.setDate(currentDue.getDate() + 30);
      const newDueDate = currentDue.toISOString().split('T')[0];

      // 2. Update referrer client
      const { error: clientError } = await supabase
        .from('clients')
        .update({ due_date: newDueDate, status: 'ativo' })
        .eq('id', referrer.id);

      if (clientError) throw clientError;

      // 3. Update referral status
      const { error: referralError } = await supabase
        .from('referrals')
        .update({ status: 'resgatado' })
        .eq('id', referral.id);

      if (referralError) throw referralError;

      // 4. Insert transaction entry for tracking
      await supabase.from('transactions').insert({
        client_id: referrer.id,
        client_name: referrer.name,
        value: 0,
        type: 'renovacao',
        status: 'pago',
        due_date: referrer.due_date,
        paid_at: new Date().toISOString(),
        description: `Bônus Indicação - Ref. indicado ID: ${referral.referred_id}`,
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

              <Button type="submit" className="w-full mt-4" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar Indicação'}
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
                <TableHead className="text-center">1º Mês</TableHead>
                <TableHead className="text-center">2º Mês</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map((item) => {
                const referrer = clients.find(c => c.id === item.referrer_id);
                const referred = clients.find(c => c.id === item.referred_id);
                const paymentsCount = getPaymentsCount(item.referred_id);
                const month1Paid = paymentsCount >= 1;
                const month2Paid = paymentsCount >= 2;

                let statusBadge = <Badge variant="secondary">Pendente</Badge>;
                let canRedeem = false;

                if (item.status === 'resgatado') {
                  statusBadge = <Badge className="bg-muted text-muted-foreground hover:bg-muted">Resgatado</Badge>;
                } else if (month2Paid) {
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
                      {month1Paid ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {month2Paid ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground mx-auto" />
                      )}
                    </TableCell>
                    <TableCell>{statusBadge}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
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
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
