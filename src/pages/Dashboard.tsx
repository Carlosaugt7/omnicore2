import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, DollarSign, AlertTriangle, TrendingUp, RefreshCw, CalendarClock, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ServerBadge, buildServerColorMap } from '@/components/ServerBadge';
import type { Database } from '@/integrations/supabase/types';
import DataTransfer from '@/components/DataTransfer';

type Client = Database['public']['Tables']['clients']['Row'];
type Transaction = Database['public']['Tables']['transactions']['Row'];

const statusColors: Record<string, string> = {
  ativo: 'bg-green-500/10 text-green-500',
  vencido: 'bg-red-500/10 text-red-500',
  suspenso: 'bg-yellow-500/10 text-yellow-500',
  cancelado: 'bg-muted text-muted-foreground',
};

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export default function Dashboard() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [cRes, tRes] = await Promise.all([
        supabase.from('clients').select('*').eq('user_id', user.id),
        supabase.from('transactions').select('*').eq('user_id', user.id),
      ]);
      if (cRes.data) setClients(cRes.data);
      if (tRes.data) setTransactions(tRes.data);
      setLoading(false);
    };
    load();
  }, [user?.id]); // use user.id (primitive) to avoid re-runs on object reference changes

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const metrics = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const prevMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // 1. Receita do Mês (paid transactions this month using paid_at)
    const revenueThisMonth = transactions
      .filter(t => t.status === 'pago' && t.paid_at && new Date(t.paid_at) >= monthStart)
      .reduce((sum, t) => sum + (t.value || 0), 0);

    const revenuePrevMonth = transactions
      .filter(t => t.status === 'pago' && t.paid_at && new Date(t.paid_at) >= prevMonthStart && new Date(t.paid_at) <= prevMonthEnd)
      .reduce((sum, t) => sum + (t.value || 0), 0);

    const revenueChange = revenuePrevMonth > 0
      ? ((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100
      : revenueThisMonth > 0 ? 100 : 0;

    // 2. A Renovar (7 dias)
    const in7days = new Date(now);
    in7days.setDate(in7days.getDate() + 7);
    const toRenew = clients.filter(c =>
      c.status === 'ativo' && c.due_date && c.due_date >= todayStr && c.due_date <= in7days.toISOString().split('T')[0]
    );
    const toRenewCount = toRenew.length;
    const toRenewValue = toRenew.reduce((sum, c) => sum + (c.value || 0), 0);

    // 3. Em Atraso
    const overdue = clients.filter(c =>
      c.status !== 'cancelado' && c.due_date && c.due_date < todayStr
    );
    const overdueCount = overdue.length;
    const overdueValue = overdue.reduce((sum, c) => sum + (c.value || 0), 0);

    // 4. Taxa de Renovação
    const activeClients = clients.filter(c => c.status === 'ativo');
    const last30days = new Date(now);
    last30days.setDate(last30days.getDate() - 30);
    const paidLast30 = new Set(
      transactions
        .filter(t => t.status === 'pago' && t.paid_at && new Date(t.paid_at) >= last30days && t.client_id)
        .map(t => t.client_id)
    );
    const renewalRate = activeClients.length > 0
      ? Math.round((paidLast30.size / activeClients.length) * 100)
      : 0;

    // 5. Clientes Ativos
    const activeCount = activeClients.length;

    // 6. Próxima Receita (30 dias)
    const in30days = new Date(now);
    in30days.setDate(in30days.getDate() + 30);
    const nextRevenue = clients
      .filter(c => c.status === 'ativo' && c.due_date && c.due_date <= in30days.toISOString().split('T')[0])
      .reduce((sum, c) => sum + (c.value || 0), 0);

    return { revenueThisMonth, revenueChange, toRenewCount, toRenewValue, overdueCount, overdueValue, renewalRate, activeCount, nextRevenue };
  }, [clients, transactions, todayStr]);

  // Vencimentos desta semana
  const weekDues = useMemo(() => {
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    const endStr = endOfWeek.toISOString().split('T')[0];
    return clients
      .filter(c => c.due_date && c.due_date >= todayStr && c.due_date <= endStr)
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  }, [clients, todayStr]);

  const serverColorMap = useMemo(
    () => buildServerColorMap(clients.map(c => c.server)),
    [clients]
  );

  // Chart data: últimos 6 meses
  const chartData = useMemo(() => {
    const months: { month: string; ganhos: number; despesas: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const mStart = startOfMonth(d);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

      const ganhos = transactions
        .filter(t => t.status === 'pago' && t.type !== 'saida' && t.paid_at && new Date(t.paid_at) >= mStart && new Date(t.paid_at) <= mEnd)
        .reduce((sum, t) => sum + (t.value || 0), 0);

      const despesas = transactions
        .filter(t => t.type === 'saida' && t.paid_at && new Date(t.paid_at) >= mStart && new Date(t.paid_at) <= mEnd)
        .reduce((sum, t) => sum + (t.value || 0), 0);

      months.push({ month: label, ganhos, despesas });
    }
    return months;
  }, [transactions]);

  const handleSendWhatsApp = async (client: Client) => {
    if (!user) return;
    setSendingId(client.id);
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
    setSendingId(null);
  };

  const cards = [
    {
      title: 'Receita do Mês',
      value: formatBRL(metrics.revenueThisMonth),
      icon: DollarSign,
      color: 'text-emerald-600',
      bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
      shadow: 'shadow-emerald-200/50 dark:shadow-emerald-900/30',
      border: 'border-emerald-200/60 dark:border-emerald-800/40',
      sub: (
        <span className={metrics.revenueChange >= 0 ? 'text-green-500' : 'text-destructive'}>
          {metrics.revenueChange >= 0 ? '+' : ''}{metrics.revenueChange.toFixed(1)}% vs mês anterior
        </span>
      ),
    },
    {
      title: 'A Renovar (7 dias)',
      value: `${metrics.toRenewCount} clientes`,
      icon: CalendarClock,
      color: 'text-amber-600',
      bg: 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20',
      iconBg: 'bg-amber-100 dark:bg-amber-900/40',
      shadow: 'shadow-amber-200/50 dark:shadow-amber-900/30',
      border: 'border-amber-200/60 dark:border-amber-800/40',
      sub: formatBRL(metrics.toRenewValue),
    },
    {
      title: 'Em Atraso',
      value: `${metrics.overdueCount} clientes`,
      icon: AlertTriangle,
      color: 'text-rose-600',
      bg: 'bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-rose-950/30 dark:to-rose-900/20',
      iconBg: 'bg-rose-100 dark:bg-rose-900/40',
      shadow: 'shadow-rose-200/50 dark:shadow-rose-900/30',
      border: 'border-rose-200/60 dark:border-rose-800/40',
      sub: formatBRL(metrics.overdueValue),
    },
    {
      title: 'Taxa de Renovação',
      value: `${metrics.renewalRate}%`,
      icon: RefreshCw,
      color: 'text-teal-600',
      bg: 'bg-gradient-to-br from-teal-50 to-teal-100/50 dark:from-teal-950/30 dark:to-teal-900/20',
      iconBg: 'bg-teal-100 dark:bg-teal-900/40',
      shadow: 'shadow-teal-200/50 dark:shadow-teal-900/30',
      border: 'border-teal-200/60 dark:border-teal-800/40',
      sub: 'Últimos 30 dias',
    },
    {
      title: 'Clientes Ativos',
      value: metrics.activeCount,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20',
      iconBg: 'bg-blue-100 dark:bg-blue-900/40',
      shadow: 'shadow-blue-200/50 dark:shadow-blue-900/30',
      border: 'border-blue-200/60 dark:border-blue-800/40',
      sub: 'Total atual',
    },
    {
      title: 'Próxima Receita (30d)',
      value: formatBRL(metrics.nextRevenue),
      icon: TrendingUp,
      color: 'text-violet-600',
      bg: 'bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/30 dark:to-violet-900/20',
      iconBg: 'bg-violet-100 dark:bg-violet-900/40',
      shadow: 'shadow-violet-200/50 dark:shadow-violet-900/30',
      border: 'border-violet-200/60 dark:border-violet-800/40',
      sub: 'Previsão de entrada',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <DataTransfer />
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title} className={`${card.bg} ${card.border} ${card.shadow} shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <div className={`p-2 rounded-lg ${card.iconBg}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Weekly Dues Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vencimentos desta semana</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Servidor</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weekDues.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><ServerBadge name={c.server} colorMap={serverColorMap} /></TableCell>
                  <TableCell>{c.plan || '-'}</TableCell>
                  <TableCell>{c.value ? formatBRL(c.value) : '-'}</TableCell>
                  <TableCell>{c.due_date}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[c.status] || ''}>{c.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sendingId === c.id}
                      onClick={() => handleSendWhatsApp(c)}
                    >
                      <Send className="h-3 w-3 mr-1" />
                      {sendingId === c.id ? '...' : 'WhatsApp'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {weekDues.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhum vencimento esta semana
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ganhos vs Despesas (6 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" tickFormatter={(v) => `R$${v}`} />
              <Tooltip
                formatter={(value: number) => formatBRL(value)}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))',
                }}
              />
              <Legend />
              <Bar dataKey="ganhos" name="Ganhos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
