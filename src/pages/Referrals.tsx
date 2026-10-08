import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Gift, Trash2, Pencil, Users, CheckCircle2, Clock, Award, Check, Sparkles,
  Coins, DollarSign, RefreshCw, Wallet, CheckCheck, Save, Calendar
} from 'lucide-react';
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

export interface CashbackRecord {
  id: string;
  user_id: string;
  referral_id?: string | null;
  referrer_id: string;
  referred_id: string;
  amount: number;
  month_reference: string;
  payment_number: number;
  transaction_id?: string | null;
  status: 'pendente' | 'pago' | 'cancelado';
  paid_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
}

type Client = Database['public']['Tables']['clients']['Row'];
type Transaction = Database['public']['Tables']['transactions']['Row'];

const STORAGE_KEY_CASHBACK_RECORDS = 'omnicore_cashback_records_v1';
const STORAGE_KEY_CASHBACK_SETTING = 'omnicore_cashback_default_amount_v1';

export default function Referrals() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'referrals' | 'cashback'>('referrals');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cashbackRecords, setCashbackRecords] = useState<CashbackRecord[]>([]);

  // Configuração do valor do cashback
  const [defaultCashbackAmount, setDefaultCashbackAmount] = useState<number>(10);
  const [cashbackInputVal, setCashbackInputVal] = useState<string>('10.00');
  const [savingSetting, setSavingSetting] = useState(false);
  const [syncingCashbacks, setSyncingCashbacks] = useState(false);

  // Dialogs de Indicações
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingReferral, setEditingReferral] = useState<Referral | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states — nova indicação
  const [formReferrerId, setFormReferrerId] = useState('');
  const [formReferredId, setFormReferredId] = useState('');

  // Form states — edição indicação
  const [editReferrerId, setEditReferrerId] = useState('');
  const [editReferredId, setEditReferredId] = useState('');
  const [editRenovado, setEditRenovado] = useState(false);

  // Dialogs de Cashback
  const [editCashbackOpen, setEditCashbackOpen] = useState(false);
  const [editingCashback, setEditingCashback] = useState<CashbackRecord | null>(null);
  const [editCbAmount, setEditCbAmount] = useState('');
  const [editCbStatus, setEditCbStatus] = useState<'pendente' | 'pago'>('pendente');
  const [editCbMonthRef, setEditCbMonthRef] = useState('');
  const [editCbNotes, setEditCbNotes] = useState('');

  const [newCashbackOpen, setNewCashbackOpen] = useState(false);
  const [newCbReferrerId, setNewCbReferrerId] = useState('');
  const [newCbReferredId, setNewCbReferredId] = useState('');
  const [newCbAmount, setNewCbAmount] = useState('10.00');
  const [newCbMonthRef, setNewCbMonthRef] = useState('');
  const [newCbNotes, setNewCbNotes] = useState('');

  // ── CARREGAMENTO DE DADOS ─────────────────────────────────────────

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

      let loadedRefs: Referral[] = [];
      let loadedClients: Client[] = [];
      let loadedTxs: Transaction[] = [];

      // Filtra referrals do usuário e do shared access
      if (refRes.data) {
        const allRefs = refRes.data as Referral[];
        loadedRefs = allRefs.filter(r => 
          r.user_id === user.id || 
          r.user_id === 'd9919cb5-c4a4-43c3-8614-878495d18c37' ||
          r.user_id === 'd267b748-8f3b-4684-85e9-589dc9a79a93'
        );
        setReferrals(loadedRefs);
      }
      if (cliRes.data) {
        const allClients = cliRes.data;
        loadedClients = allClients.filter(c => 
          c.user_id === user.id || 
          c.user_id === 'd9919cb5-c4a4-43c3-8614-878495d18c37' ||
          c.user_id === 'd267b748-8f3b-4684-85e9-589dc9a79a93'
        );
        setClients(loadedClients);
      }
      if (txRes.data) {
        const allTxs = txRes.data as Transaction[];
        loadedTxs = allTxs.filter(t =>
          t.user_id === user.id || 
          t.user_id === 'd9919cb5-c4a4-43c3-8614-878495d18c37' ||
          t.user_id === 'd267b748-8f3b-4684-85e9-589dc9a79a93'
        );
        setTransactions(loadedTxs);
      }

      // Carrega Cashback Settings
      await loadCashbackSettings();

      // Carrega Cashback Records
      await loadCashbackRecords(loadedRefs, loadedTxs);

    } catch (err: any) {
      toast.error(`Erro ao carregar dados: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadCashbackSettings = async () => {
    if (!user) return;
    try {
      // 1. Tenta carregar do Supabase
      const { data, error } = await supabase
        .from('cashback_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (!error && data && data.default_amount != null) {
        const amt = Number(data.default_amount);
        setDefaultCashbackAmount(amt);
        setCashbackInputVal(amt.toFixed(2));
        localStorage.setItem(STORAGE_KEY_CASHBACK_SETTING, String(amt));
        return;
      }
    } catch {
      // Tabela pode ainda estar sendo criada, fallback para localStorage
    }

    // 2. Fallback para localStorage
    const saved = localStorage.getItem(STORAGE_KEY_CASHBACK_SETTING);
    if (saved) {
      const amt = parseFloat(saved) || 10;
      setDefaultCashbackAmount(amt);
      setCashbackInputVal(amt.toFixed(2));
    }
  };

  const loadCashbackRecords = async (currentRefs?: Referral[], currentTxs?: Transaction[]) => {
    if (!user) return;
    let records: CashbackRecord[] = [];

    try {
      const { data, error } = await supabase
        .from('cashback_records')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        records = data.map((r: any) => ({
          ...r,
          amount: Number(r.amount) || 0,
        }));
      }
    } catch {
      // Falha silenciosa de tabela
    }

    // Se o banco não retornou nada ou falhou, tenta localStorage
    if (records.length === 0) {
      const local = localStorage.getItem(STORAGE_KEY_CASHBACK_RECORDS);
      if (local) {
        try {
          records = JSON.parse(local);
        } catch {
          records = [];
        }
      }
    }

    // Sincroniza automaticamente com renovações existentes a partir do 2º mês
    const refsToUse = currentRefs || referrals;
    const txsToUse = currentTxs || transactions;
    const autoSynced = autoComputeCashbacks(refsToUse, txsToUse, records, defaultCashbackAmount);

    setCashbackRecords(autoSynced);
    persistCashbackRecordsLocally(autoSynced);
  };

  useEffect(() => {
    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Salva no localStorage como backup de resiliência
  const persistCashbackRecordsLocally = (records: CashbackRecord[]) => {
    try {
      localStorage.setItem(STORAGE_KEY_CASHBACK_RECORDS, JSON.stringify(records));
    } catch (e) {
      console.warn('Erro ao salvar cashback no localStorage:', e);
    }
  };

  // ── MOTOR DE CÁLCULO DE CASHBACK RECORRENTE ─────────────────────────
  /**
   * REGRA DE NEGÓCIO DO CASHBACK:
   * 1. O cliente indicado paga o primeiro mês (registrado como pago).
   * 2. A partir do SEGUNDO MÊS que ele renova, a pessoa que indicou ganha cashback.
   * 3. Válido de forma RECORRENTE por todos os meses subsequentes que o indicado renovar (2º, 3º, 4º mês...).
   */
  const autoComputeCashbacks = (
    currentRefs: Referral[],
    currentTxs: Transaction[],
    existingRecords: CashbackRecord[],
    unitAmount: number
  ): CashbackRecord[] => {
    if (!user) return existingRecords;

    const recordMap = new Map<string, CashbackRecord>();
    existingRecords.forEach(r => {
      // Chave única: referred_id + payment_number
      const key = `${r.referred_id}_${r.payment_number}`;
      recordMap.set(key, r);
    });

    const newRecordsList = [...existingRecords];

    currentRefs.forEach(ref => {
      // Localiza todos os pagamentos pagos do cliente indicado
      const paidTxs = currentTxs
        .filter(t => t.client_id === ref.referred_id && t.status === 'pago')
        .sort((a, b) => new Date(a.paid_at || a.created_at || '').getTime() - new Date(b.paid_at || b.created_at || '').getTime());

      // Se houver 2 ou mais pagamentos, cada pagamento a partir do índice 1 (2º mês) gera cashback!
      if (paidTxs.length >= 2) {
        for (let i = 1; i < paidTxs.length; i++) {
          const paymentNumber = i + 1; // 2º mês, 3º mês...
          const tx = paidTxs[i];
          const key = `${ref.referred_id}_${paymentNumber}`;

          if (!recordMap.has(key)) {
            // Mês de referência
            let monthLabel = `${paymentNumber}º Mês (Renovação)`;
            if (tx.due_date) {
              const [y, m] = tx.due_date.split('-');
              monthLabel = `${m}/${y} (${paymentNumber}º Mês)`;
            }

            const newRecord: CashbackRecord = {
              id: crypto.randomUUID(),
              user_id: user.id,
              referral_id: ref.id,
              referrer_id: ref.referrer_id,
              referred_id: ref.referred_id,
              amount: unitAmount,
              month_reference: monthLabel,
              payment_number: paymentNumber,
              transaction_id: tx.id,
              status: 'pendente',
              paid_at: null,
              notes: `Gerado automaticamente da renovação ${paymentNumber}º mês`,
              created_at: tx.paid_at || new Date().toISOString(),
            };

            recordMap.set(key, newRecord);
            newRecordsList.unshift(newRecord);

            // Tenta salvar silenciosamente no Supabase
            supabase.from('cashback_records').insert({
              id: newRecord.id,
              user_id: user.id,
              referral_id: ref.id,
              referrer_id: ref.referrer_id,
              referred_id: ref.referred_id,
              amount: newRecord.amount,
              month_reference: newRecord.month_reference,
              payment_number: newRecord.payment_number,
              transaction_id: tx.id,
              status: 'pendente',
              notes: newRecord.notes,
            }).then(() => {}).catch(() => {});
          }
        }
      }
    });

    return newRecordsList;
  };

  // Conta pagamentos do indicado (todos os tipos: entrada + renovacao)
  const getPaymentsCount = (referredId: string) => {
    return transactions.filter(t => t.client_id === referredId).length;
  };

  // Metrics calculation — Indicações normais
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

  // Metrics calculation — Cashback
  const cashbackMetrics = useMemo(() => {
    let totalGenerated = 0;
    let pendingTotal = 0;
    let paidTotal = 0;
    const activeReferrerIds = new Set<string>();

    cashbackRecords.forEach(c => {
      const val = Number(c.amount) || 0;
      totalGenerated += val;
      if (c.status === 'pago') {
        paidTotal += val;
      } else {
        pendingTotal += val;
      }
      activeReferrerIds.add(c.referrer_id);
    });

    return {
      totalGenerated,
      pendingTotal,
      paidTotal,
      totalCount: cashbackRecords.length,
      activeReferrers: activeReferrerIds.size,
    };
  }, [cashbackRecords]);

  // Form validation: Filter lists dynamically
  const availableReferrers = clients;
  
  const availableReferreds = useMemo(() => {
    return clients.filter(c => {
      if (c.id === formReferrerId) return false;
      const isAlreadyReferred = referrals.some(r => r.referred_id === c.id);
      return !isAlreadyReferred;
    });
  }, [clients, formReferrerId, referrals]);

  // ── AÇÕES DE CASHBACK: CONFIGURAR VALOR ────────────────────────────

  const handleSaveCashbackSetting = async () => {
    if (!user) return;
    const num = parseFloat(cashbackInputVal);
    if (isNaN(num) || num <= 0) {
      toast.error('Informe um valor de cashback válido.');
      return;
    }

    setSavingSetting(true);
    try {
      setDefaultCashbackAmount(num);
      localStorage.setItem(STORAGE_KEY_CASHBACK_SETTING, String(num));

      const { error } = await supabase
        .from('cashback_settings')
        .upsert(
          {
            user_id: user.id,
            default_amount: num,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.warn('Erro ao salvar settings no Supabase, mantido em localStorage:', error.message);
      }

      toast.success(`Valor padrão do cashback definido para R$ ${num.toFixed(2)}!`);
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setSavingSetting(false);
    }
  };

  // ── AÇÕES DE CASHBACK: SINCRONIZAR ────────────────────────────────

  const handleManualSync = async () => {
    setSyncingCashbacks(true);
    try {
      const previousCount = cashbackRecords.length;
      const updated = autoComputeCashbacks(referrals, transactions, cashbackRecords, defaultCashbackAmount);
      setCashbackRecords(updated);
      persistCashbackRecordsLocally(updated);

      const added = updated.length - previousCount;
      if (added > 0) {
        toast.success(`${added} novo(s) cashback(s) gerado(s) com sucesso!`);
      } else {
        toast.info('Todos os cashbacks já estão atualizados de acordo com as renovações.');
      }
    } finally {
      setSyncingCashbacks(false);
    }
  };

  // ── AÇÕES DE CASHBACK: MARCAR COMO PAGO / ALTERNAR STATUS ───────────

  const handleToggleCashbackStatus = async (record: CashbackRecord) => {
    const isPaying = record.status !== 'pago';
    const nextStatus = isPaying ? 'pago' : 'pendente';
    const nextPaidAt = isPaying ? new Date().toISOString() : null;

    const nextRecords = cashbackRecords.map(r => 
      r.id === record.id ? { ...r, status: nextStatus, paid_at: nextPaidAt } : r
    );

    setCashbackRecords(nextRecords);
    persistCashbackRecordsLocally(nextRecords);

    try {
      await supabase
        .from('cashback_records')
        .update({ status: nextStatus, paid_at: nextPaidAt })
        .eq('id', record.id);
    } catch (e) {
      console.warn('Erro ao atualizar status no banco:', e);
    }

    const referrer = clients.find(c => c.id === record.referrer_id);
    if (isPaying) {
      toast.success(`Cashback de R$ ${Number(record.amount).toFixed(2)} marcado como PAGO para ${referrer?.name || 'o cliente'}!`);
    } else {
      toast.info(`Cashback revertido para pendente.`);
    }
  };

  // ── AÇÕES DE CASHBACK: EDITAR ─────────────────────────────────────

  const handleOpenEditCashback = (record: CashbackRecord) => {
    setEditingCashback(record);
    setEditCbAmount(String(record.amount || defaultCashbackAmount));
    setEditCbStatus(record.status === 'pago' ? 'pago' : 'pendente');
    setEditCbMonthRef(record.month_reference || '');
    setEditCbNotes(record.notes || '');
    setEditCashbackOpen(true);
  };

  const handleSaveEditCashback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCashback) return;

    const amt = parseFloat(editCbAmount);
    if (isNaN(amt) || amt < 0) {
      toast.error('Valor de cashback inválido.');
      return;
    }

    const updatedRecord: CashbackRecord = {
      ...editingCashback,
      amount: amt,
      status: editCbStatus,
      month_reference: editCbMonthRef || editingCashback.month_reference,
      notes: editCbNotes || null,
      paid_at: editCbStatus === 'pago' ? (editingCashback.paid_at || new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    };

    const nextList = cashbackRecords.map(r => r.id === editingCashback.id ? updatedRecord : r);
    setCashbackRecords(nextList);
    persistCashbackRecordsLocally(nextList);

    try {
      await supabase
        .from('cashback_records')
        .update({
          amount: amt,
          status: editCbStatus,
          month_reference: updatedRecord.month_reference,
          notes: updatedRecord.notes,
          paid_at: updatedRecord.paid_at,
          updated_at: updatedRecord.updated_at,
        })
        .eq('id', editingCashback.id);
    } catch (e) {
      console.warn('Erro ao atualizar no banco:', e);
    }

    toast.success('Cashback atualizado com sucesso!');
    setEditCashbackOpen(false);
    setEditingCashback(null);
  };

  // ── AÇÕES DE CASHBACK: EXCLUIR ────────────────────────────────────

  const handleDeleteCashback = async (id: string) => {
    if (!confirm('Deseja realmente excluir este registro de cashback?')) return;

    const nextList = cashbackRecords.filter(r => r.id !== id);
    setCashbackRecords(nextList);
    persistCashbackRecordsLocally(nextList);

    try {
      await supabase.from('cashback_records').delete().eq('id', id);
    } catch (e) {
      console.warn('Erro ao deletar no banco:', e);
    }

    toast.success('Registro de cashback excluído com sucesso.');
  };

  // ── AÇÕES DE CASHBACK: NOVO MANUAL ────────────────────────────────

  const handleCreateManualCashback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newCbReferrerId || !newCbReferredId) {
      toast.error('Selecione ambos os clientes.');
      return;
    }

    const amt = parseFloat(newCbAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Informe um valor válido.');
      return;
    }

    const newRecord: CashbackRecord = {
      id: crypto.randomUUID(),
      user_id: user.id,
      referrer_id: newCbReferrerId,
      referred_id: newCbReferredId,
      amount: amt,
      month_reference: newCbMonthRef || 'Lançamento Manual',
      payment_number: 2,
      status: 'pendente',
      paid_at: null,
      notes: newCbNotes || 'Lançado manualmente',
      created_at: new Date().toISOString(),
    };

    const nextList = [newRecord, ...cashbackRecords];
    setCashbackRecords(nextList);
    persistCashbackRecordsLocally(nextList);

    try {
      await supabase.from('cashback_records').insert({
        id: newRecord.id,
        user_id: user.id,
        referrer_id: newRecord.referrer_id,
        referred_id: newRecord.referred_id,
        amount: newRecord.amount,
        month_reference: newRecord.month_reference,
        payment_number: newRecord.payment_number,
        status: newRecord.status,
        notes: newRecord.notes,
      });
    } catch (e) {
      console.warn('Erro ao inserir no banco:', e);
    }

    toast.success('Novo cashback registrado!');
    setNewCashbackOpen(false);
    setNewCbReferrerId('');
    setNewCbReferredId('');
    setNewCbMonthRef('');
    setNewCbNotes('');
  };

  // ── NOVA INDICAÇÃO (ORIGINAL) ─────────────────────────────────────

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

  // ── EDITAR INDICAÇÃO (ORIGINAL) ───────────────────────────────────

  const openEditDialog = (referral: Referral) => {
    setEditingReferral(referral);
    setEditReferrerId(referral.referrer_id);
    setEditReferredId(referral.referred_id);
    const count = getPaymentsCount(referral.referred_id);
    setEditRenovado(count >= 2);
    setEditDialogOpen(true);
  };

  const availableEditReferreds = useMemo(() => {
    return clients.filter(c => {
      if (c.id === editReferrerId) return false;
      if (editingReferral && c.id === editingReferral.referred_id) return true;
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
      const { error } = await supabase
        .from('referrals')
        .update({
          referrer_id: editReferrerId,
          referred_id: editReferredId,
        })
        .eq('id', editingReferral.id);

      if (error) throw error;

      const referredClient = clients.find(c => c.id === editReferredId);
      const currentCount = getPaymentsCount(editReferredId);
      const targetCount = editRenovado ? 2 : 1;

      if (targetCount > currentCount && referredClient) {
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

  // ── RESGATAR BÔNUS (ORIGINAL) ─────────────────────────────────────

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

  // ── EXCLUIR INDICAÇÃO (ORIGINAL) ──────────────────────────────────

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
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="h-6 w-6 text-primary" />
            Indicações & Cashback
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie o programa de indicações e os cashbacks recorrentes por renovação mensal.
          </p>
        </div>

        {/* Botão de Ação contextual de acordo com a aba */}
        {activeTab === 'referrals' ? (
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
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSync}
              disabled={syncingCashbacks}
              title="Verifica pagamentos e gera cashbacks para clientes que renovaram"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${syncingCashbacks ? 'animate-spin' : ''}`} />
              Sincronizar Renovações
            </Button>
            <Dialog open={newCashbackOpen} onOpenChange={setNewCashbackOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Novo Cashback
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Lançar Cashback Manual</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateManualCashback} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label>Cliente Indicador (Quem recebe o cashback) *</Label>
                    <Select value={newCbReferrerId} onValueChange={setNewCbReferrerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione quem indicou..." />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Cliente Indicado (Quem renovou) *</Label>
                    <Select value={newCbReferredId} onValueChange={setNewCbReferredId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o indicado..." />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.filter(c => c.id !== newCbReferrerId).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Valor do Cashback (R$) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newCbAmount}
                        onChange={e => setNewCbAmount(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Referência do Mês</Label>
                      <Input
                        placeholder="Ex: 2º Mês / 10/2026"
                        value={newCbMonthRef}
                        onChange={e => setNewCbMonthRef(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Observações (Opcional)</Label>
                    <Input
                      placeholder="Ex: Pagamento confirmado via PIX"
                      value={newCbNotes}
                      onChange={e => setNewCbNotes(e.target.value)}
                    />
                  </div>

                  <DialogFooter className="pt-2">
                    <Button type="button" variant="outline" onClick={() => setNewCashbackOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">
                      Salvar Cashback
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="space-y-6">
        <TabsList className="grid w-full sm:w-[380px] grid-cols-2">
          <TabsTrigger value="referrals" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            <span>Indicações ({referrals.length})</span>
          </TabsTrigger>
          <TabsTrigger value="cashback" className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            <span>Cashback ({cashbackRecords.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ABA 1: INDICAÇÕES (FLUXO ORIGINAL PRESERVADO 100%)         */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="referrals" className="space-y-6 focus-visible:outline-none">
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

          {/* Referrals Table */}
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
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ABA 2: CASHBACK RECORRENTE (NOVA FUNCIONALIDADE)           */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="cashback" className="space-y-6 focus-visible:outline-none">
          {/* Card de Configuração do Valor do Cashback */}
          <Card className="border-primary/20 bg-primary/5 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Coins className="h-5 w-5 text-primary" />
                    Regra e Configuração do Cashback
                  </CardTitle>
                  <CardDescription className="text-xs pt-1">
                    O cliente indicado paga o primeiro mês. A partir do <strong>2º mês</strong> em diante, cada renovação gera um cashback recorrente para o cliente que o indicou.
                  </CardDescription>
                </div>

                {/* Input para definir o valor do cashback */}
                <div className="flex items-center gap-2 self-start md:self-auto bg-background p-2 rounded-lg border shadow-xs">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="cashback-val" className="text-xs font-semibold whitespace-nowrap">
                      Valor do Cashback:
                    </Label>
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-2 text-xs text-muted-foreground">R$</span>
                      <Input
                        id="cashback-val"
                        type="number"
                        step="0.50"
                        min="0"
                        value={cashbackInputVal}
                        onChange={e => setCashbackInputVal(e.target.value)}
                        className="pl-8 h-8 text-xs font-semibold"
                        placeholder="10.00"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 text-xs px-3"
                    onClick={handleSaveCashbackSetting}
                    disabled={savingSetting}
                  >
                    <Save className="h-3.5 w-3.5 mr-1" />
                    {savingSetting ? 'Salvando...' : 'Definir'}
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Cards de Métricas do Cashback */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-violet-200/60 dark:border-violet-800/40 bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/30 dark:to-violet-900/20 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Total Gerado
                </CardTitle>
                <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/40">
                  <DollarSign className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-violet-900 dark:text-violet-100">
                  R$ {cashbackMetrics.totalGenerated.toFixed(2)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {cashbackMetrics.totalCount} lançamentos gerados
                </p>
              </CardContent>
            </Card>

            <Card className="border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Disponível / Pendente
                </CardTitle>
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40">
                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                  R$ {cashbackMetrics.pendingTotal.toFixed(2)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Aguardando repasse / crédito
                </p>
              </CardContent>
            </Card>

            <Card className="border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Pago / Creditado
                </CardTitle>
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                  R$ {cashbackMetrics.paidTotal.toFixed(2)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Já repassado aos indicadores
                </p>
              </CardContent>
            </Card>

            <Card className="border-blue-200/60 dark:border-blue-800/40 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Clientes Beneficiados
                </CardTitle>
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40">
                  <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {cashbackMetrics.activeReferrers}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Indicadores com cashback
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabela de Cashbacks */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  Registros de Cashback Recorrente
                </CardTitle>
                <CardDescription className="text-xs">
                  Lista de cashbacks gerados a cada renovação mensal dos clientes indicados.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                {cashbackRecords.length} Registros
              </Badge>
            </CardHeader>
            <CardContent className="p-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente Indicador (Recebe)</TableHead>
                    <TableHead>Cliente Indicado (Renovou)</TableHead>
                    <TableHead>Mês / Parcela</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-44 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashbackRecords.map((item) => {
                    const referrer = clients.find(c => c.id === item.referrer_id);
                    const referred = clients.find(c => c.id === item.referred_id);
                    const isPaid = item.status === 'pago';

                    return (
                      <TableRow key={item.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell>
                          <p className="font-semibold text-xs text-foreground">
                            {referrer?.name || 'Cliente indicador'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {referrer?.phone || '-'}
                          </p>
                        </TableCell>

                        <TableCell>
                          <p className="font-medium text-xs text-foreground">
                            {referred?.name || 'Cliente indicado'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {referred?.plan || 'Plano'}
                          </p>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium">{item.month_reference}</span>
                          </div>
                          {item.notes && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={item.notes}>
                              {item.notes}
                            </p>
                          )}
                        </TableCell>

                        <TableCell>
                          <span className="font-bold text-xs text-primary">
                            R$ {Number(item.amount).toFixed(2)}
                          </span>
                        </TableCell>

                        <TableCell>
                          {isPaid ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] flex items-center gap-1 w-fit">
                              <CheckCircle2 className="h-3 w-3" />
                              Pago
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] flex items-center gap-1 w-fit">
                              <Clock className="h-3 w-3" />
                              Pendente
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex justify-end items-center gap-1.5">
                            {/* Botão de Pagar / Alternar Pago */}
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-7 px-2 text-xs ${
                                isPaid
                                  ? 'text-muted-foreground hover:text-foreground'
                                  : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-300'
                              }`}
                              onClick={() => handleToggleCashbackStatus(item)}
                              title={isPaid ? 'Reverter para pendente' : 'Marcar como pago'}
                            >
                              {isPaid ? (
                                <>
                                  <CheckCheck className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                                  Pago
                                </>
                              ) : (
                                <>
                                  <Wallet className="h-3.5 w-3.5 mr-1" />
                                  Pagar
                                </>
                              )}
                            </Button>

                            {/* Botão de Editar */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleOpenEditCashback(item)}
                              title="Editar cashback"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>

                            {/* Botão de Excluir */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteCashback(item.id)}
                              title="Excluir cashback"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {cashbackRecords.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-xs">
                        <Coins className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Nenhum registro de cashback gerado ainda.
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Clique em <strong>"Sincronizar Renovações"</strong> para gerar automaticamente a partir dos clientes que renovaram o 2º mês.
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── DIALOG DE EDIÇÃO DE INDICAÇÃO (ORIGINAL) ──────────────── */}
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

      {/* ── DIALOG DE EDIÇÃO DE CASHBACK ───────────────────────────── */}
      <Dialog open={editCashbackOpen} onOpenChange={setEditCashbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Editar Registro de Cashback
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEditCashback} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Valor do Cashback (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editCbAmount}
                onChange={e => setEditCbAmount(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status do Repasse *</Label>
              <Select value={editCbStatus} onValueChange={(v: 'pendente' | 'pago') => setEditCbStatus(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente (Aguardando)</SelectItem>
                  <SelectItem value="pago">Pago (Repassado / Creditado)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Mês / Parcela de Referência</Label>
              <Input
                value={editCbMonthRef}
                onChange={e => setEditCbMonthRef(e.target.value)}
                placeholder="Ex: 2º Mês (Renovação)"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Observações / Notas</Label>
              <Input
                value={editCbNotes}
                onChange={e => setEditCbNotes(e.target.value)}
                placeholder="Ex: Pago via PIX em 10/10"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditCashbackOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                Salvar Alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
