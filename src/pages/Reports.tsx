import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { useClients } from '@/hooks/useClients';
import { useTransactions } from '@/hooks/useTransactions';
import { useMetrics } from '@/hooks/useMetrics';
import { formatBRL, getLocalDateStr } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileBarChart, Send, Save, Clock, Phone, LayoutDashboard, DollarSign, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

interface ReportConfig {
  enabled: boolean;
  phone_1: string;
  phone_2: string;
  day_of_week: number;
  send_time: string;
  timezone: string;
  include_revenue_month: boolean;
  include_to_renew: boolean;
  include_clients_overdue: boolean;
  include_renewal_rate: boolean;
  include_active_clients: boolean;
  include_next_revenue: boolean;
  include_fin_to_receive: boolean;
  include_fin_overdue: boolean;
  include_fin_expenses: boolean;
  last_sent_date: string | null;
}

const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

const BRAZIL_TIMEZONES = [
  { value: 'America/Manaus',       label: 'Manaus / Cuiabá (UTC-4)' },
  { value: 'America/Sao_Paulo',    label: 'Brasília / São Paulo (UTC-3)' },
  { value: 'America/Rio_Branco',   label: 'Rio Branco / Acre (UTC-5)' },
  { value: 'America/Noronha',      label: 'Fernando de Noronha (UTC-2)' },
  { value: 'America/Belem',        label: 'Belém / Fortaleza (UTC-3)' },
  { value: 'America/Fortaleza',    label: 'Fortaleza (UTC-3)' },
  { value: 'America/Recife',       label: 'Recife (UTC-3)' },
  { value: 'America/Maceio',       label: 'Maceió / Salvador (UTC-3)' },
  { value: 'America/Porto_Velho',  label: 'Porto Velho (UTC-4)' },
  { value: 'America/Boa_Vista',    label: 'Boa Vista (UTC-4)' },
  { value: 'America/Campo_Grande', label: 'Campo Grande (UTC-4/-3)' },
  { value: 'America/Cuiaba',       label: 'Cuiabá (UTC-4/-3)' },
  { value: 'Europe/Lisbon',        label: 'Lisboa / Portugal (UTC+0/+1)' },
];

const INITIAL_CONFIG: ReportConfig = {
  enabled: false,
  phone_1: '',
  phone_2: '',
  day_of_week: 1,
  send_time: '09:00',
  timezone: 'America/Manaus',
  include_revenue_month: true,
  include_to_renew: true,
  include_clients_overdue: true,
  include_renewal_rate: true,
  include_active_clients: true,
  include_next_revenue: true,
  include_fin_to_receive: true,
  include_fin_overdue: true,
  include_fin_expenses: true,
  last_sent_date: null,
};

export default function Reports() {
  const { user } = useAuth();
  const [config, setConfig] = useState<ReportConfig>(INITIAL_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);

  const { data: clients = [] } = useClients(user?.id);
  const { data: transactions = [] } = useTransactions(user?.id);
  const { data: rpcMetrics } = useMetrics(user?.id);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase
      .from('report_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Erro ao carregar configurações de relatório:', error.message);
        }
        if (data) {
          setConfig({
            enabled: data.enabled ?? false,
            phone_1: data.phone_1 || '',
            phone_2: data.phone_2 || '',
            day_of_week: data.day_of_week ?? 1,
            send_time: data.send_time || '09:00',
            timezone: data.timezone || 'America/Manaus',
            include_revenue_month: data.include_revenue_month ?? true,
            include_to_renew: data.include_to_renew ?? true,
            include_clients_overdue: data.include_clients_overdue ?? true,
            include_renewal_rate: data.include_renewal_rate ?? true,
            include_active_clients: data.include_active_clients ?? true,
            include_next_revenue: data.include_next_revenue ?? true,
            include_fin_to_receive: data.include_fin_to_receive ?? true,
            include_fin_overdue: data.include_fin_overdue ?? true,
            include_fin_expenses: data.include_fin_expenses ?? true,
            last_sent_date: data.last_sent_date || null,
          });
        }
        setLoading(false);
      });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewText = useMemo(() => {
    const now = new Date();
    const todayStr = getLocalDateStr(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonth = nextMonthDate.toISOString().split('T')[0];

    const in5 = new Date(now);
    in5.setDate(in5.getDate() + 5);
    const in5Str = getLocalDateStr(in5);

    const in7 = new Date(now);
    in7.setDate(in7.getDate() + 7);
    const in7Str = getLocalDateStr(in7);

    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);
    const in30Str = getLocalDateStr(in30);

    const last30 = new Date(now);
    last30.setDate(last30.getDate() - 30);

    const grossThisMonth = transactions
      .filter((t) => t.status === 'pago' && t.type !== 'saida' && t.paid_at && t.paid_at >= monthStart && t.paid_at < nextMonth)
      .reduce((sum, t) => sum + (t.value || 0), 0);

    const paidExpensesThisMonth = transactions
      .filter((t) => t.status === 'pago' && t.type === 'saida' && t.paid_at && t.paid_at >= monthStart && t.paid_at < nextMonth)
      .reduce((sum, t) => sum + (t.value || 0), 0);

    const revenueThisMonth = grossThisMonth - paidExpensesThisMonth;

    const toRenewClients = clients.filter(
      (c) => c.status === 'ativo' && c.due_date && c.due_date >= todayStr && c.due_date <= in7Str
    );
    const toRenewValue = toRenewClients.reduce((sum, c) => sum + (c.value || 0), 0);

    const overdueClients = clients.filter(
      (c) => c.status !== 'cancelado' && c.due_date && c.due_date < todayStr
    );
    const overdueValue = overdueClients.reduce((sum, c) => sum + (c.value || 0), 0);

    const activeClients = clients.filter((c) => c.status === 'ativo');
    const paidLast30 = new Set(
      transactions
        .filter((t) => t.status === 'pago' && t.type !== 'saida' && t.paid_at && new Date(t.paid_at) >= last30 && t.client_id)
        .map((t) => t.client_id)
    );
    const renewalRate = activeClients.length > 0 ? Math.round((paidLast30.size / activeClients.length) * 100) : 0;

    const nextRevenue = clients
      .filter((c) => c.status === 'ativo' && c.due_date && c.due_date <= in30Str)
      .reduce((sum, c) => sum + (c.value || 0), 0);

    const finToReceive = clients
      .filter((c) => c.status === 'ativo' && c.due_date && c.due_date >= todayStr && c.due_date <= in5Str)
      .reduce((sum, c) => sum + (c.value || 0), 0);

    const finExpenses = transactions
      .filter((t) => t.type === 'saida' && t.created_at >= monthStart && t.created_at < nextMonth)
      .reduce((sum, t) => sum + (t.value || 0), 0);

    const dayLabel = WEEKDAYS.find((d) => d.value === config.day_of_week)?.label || 'Segunda-feira';
    const [y, m, d] = todayStr.split('-');

    const lines = [
      `📊 *RELATÓRIO SEMANAL - OMNICORE*`,
      `📅 ${dayLabel}, ${d}-${m}-${y} às ${config.send_time}`,
      '',
    ];

    const dashLines: string[] = [];
    if (rpcMetrics) {
      if (config.include_revenue_month) dashLines.push(`• *Receita do Mês:* ${formatBRL(rpcMetrics.revenueThisMonth)}`);
      if (config.include_to_renew) dashLines.push(`• *A Renovar (7 dias):* ${rpcMetrics.toRenewCount} clientes (${formatBRL(rpcMetrics.toRenewValue)})`);
      if (config.include_clients_overdue) dashLines.push(`• *Em Atraso:* ${rpcMetrics.overdueCount} clientes (${formatBRL(rpcMetrics.overdueValue)})`);
      if (config.include_renewal_rate) dashLines.push(`• *Taxa de Renovação:* ${rpcMetrics.renewalRate}%`);
      if (config.include_active_clients) dashLines.push(`• *Clientes Ativos:* ${rpcMetrics.activeCount}`);
      if (config.include_next_revenue) dashLines.push(`• *Próxima Receita (30d):* ${formatBRL(rpcMetrics.nextRevenue)}`);
    } else {
      if (config.include_revenue_month) dashLines.push(`• *Receita do Mês:* ${formatBRL(revenueThisMonth)}`);
      if (config.include_to_renew) dashLines.push(`• *A Renovar (7 dias):* ${toRenewClients.length} clientes (${formatBRL(toRenewValue)})`);
      if (config.include_clients_overdue) dashLines.push(`• *Em Atraso:* ${overdueClients.length} clientes (${formatBRL(overdueValue)})`);
      if (config.include_renewal_rate) dashLines.push(`• *Taxa de Renovação:* ${renewalRate}%`);
      if (config.include_active_clients) dashLines.push(`• *Clientes Ativos:* ${activeClients.length}`);
      if (config.include_next_revenue) dashLines.push(`• *Próxima Receita (30d):* ${formatBRL(nextRevenue)}`);
    }

    if (dashLines.length > 0) {
      lines.push('📌 *DASHBOARD*');
      lines.push(...dashLines);
      lines.push('');
    }

    const finLines: string[] = [];
    if (rpcMetrics) {
      if (config.include_fin_to_receive) finLines.push(`• *A Receber (5 dias):* ${formatBRL(rpcMetrics.finToReceive)}`);
      if (config.include_fin_overdue) finLines.push(`• *Em Atraso (Valor):* ${formatBRL(rpcMetrics.finOverdue)}`);
      if (config.include_fin_expenses) finLines.push(`• *Despesas (Mês):* ${formatBRL(rpcMetrics.finExpenses)}`);
    } else {
      if (config.include_fin_to_receive) finLines.push(`• *A Receber (5 dias):* ${formatBRL(finToReceive)}`);
      if (config.include_fin_overdue) finLines.push(`• *Em Atraso (Valor):* ${formatBRL(overdueValue)}`);
      if (config.include_fin_expenses) finLines.push(`• *Despesas (Mês):* ${formatBRL(finExpenses)}`);
    }

    if (finLines.length > 0) {
      lines.push('💰 *FINANCEIRO*');
      lines.push(...finLines);
      lines.push('');
    }

    if (dashLines.length === 0 && finLines.length === 0) {
      lines.push('⚠️ Nenhuma métrica selecionada para este relatório.');
    }

    return lines.join('\n').trim();
  }, [clients, transactions, config, rpcMetrics]);

  const handleSave = async (): Promise<boolean> => {
    if (!user) return false;
    if (config.enabled && !config.phone_1.trim() && !config.phone_2.trim()) {
      toast.error('Informe pelo menos 1 número de WhatsApp para ativar o envio automático.');
      return false;
    }

    setSaving(true);
    const { error } = await supabase.from('report_settings').upsert(
      {
        user_id: user.id,
        enabled: config.enabled,
        phone_1: config.phone_1.trim() || null,
        phone_2: config.phone_2.trim() || null,
        day_of_week: config.day_of_week,
        send_time: config.send_time,
        timezone: config.timezone,
        include_revenue_month: config.include_revenue_month,
        include_to_renew: config.include_to_renew,
        include_clients_overdue: config.include_clients_overdue,
        include_renewal_rate: config.include_renewal_rate,
        include_active_clients: config.include_active_clients,
        include_next_revenue: config.include_next_revenue,
        include_fin_to_receive: config.include_fin_to_receive,
        include_fin_overdue: config.include_fin_overdue,
        include_fin_expenses: config.include_fin_expenses,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    setSaving(false);

    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
      return false;
    }

    toast.success('Configurações de relatório salvas!');
    return true;
  };

  const handleSendNow = async () => {
    if (!user) return;
    if (!config.phone_1.trim() && !config.phone_2.trim()) {
      toast.error('Informe pelo menos 1 número de WhatsApp.');
      return;
    }

    const saved = await handleSave();
    if (!saved) return;

    setSendingNow(true);
    try {
      const res = await api.reportsSendNow(user.id);
      if (res.success) {
        const sentCount = (res.results || []).filter((r: { success: boolean }) => r.success).length;
        toast.success(`Relatório enviado com sucesso para ${sentCount} número(s)!`);
      } else {
        toast.error(res.error || 'Erro ao enviar relatório.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao conectar com o backend.');
    }
    setSendingNow(false);
  };

  const toggleField = (key: keyof ReportConfig) => {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
            <FileBarChart className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Relatório Semanal</h1>
            <p className="text-sm text-muted-foreground">
              Configure o resumo automático semanal de métricas para até 2 números de WhatsApp.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSendNow} disabled={sendingNow || saving}>
            <Send className="h-4 w-4 mr-2" />
            {sendingNow ? 'Enviando...' : 'Enviar Agora'}
          </Button>
          <Button onClick={handleSave} disabled={saving || sendingNow}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna Esquerda + Meio: Configurações */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card: Agendamento e Destinatários */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Agendamento e Destinatários
                  </CardTitle>
                  <CardDescription>
                    Defina o dia, horário local e os números que receberão o relatório automático.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="report-enabled" className="text-sm font-medium cursor-pointer">
                    {config.enabled ? 'Envio Automático Ativo' : 'Desativado'}
                  </Label>
                  <Switch
                    id="report-enabled"
                    checked={config.enabled}
                    onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, enabled: checked }))}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    WhatsApp 1 (Principal)
                  </Label>
                  <Input
                    placeholder="Ex: 5592999999999"
                    value={config.phone_1}
                    onChange={(e) => setConfig((prev) => ({ ...prev, phone_1: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    WhatsApp 2 (Opcional)
                  </Label>
                  <Input
                    placeholder="Ex: 5592988888888"
                    value={config.phone_2}
                    onChange={(e) => setConfig((prev) => ({ ...prev, phone_2: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Dia da Semana</Label>
                  <Select
                    value={String(config.day_of_week)}
                    onValueChange={(v) => setConfig((prev) => ({ ...prev, day_of_week: Number(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Horário Local</Label>
                  <Input
                    type="time"
                    value={config.send_time}
                    onChange={(e) => setConfig((prev) => ({ ...prev, send_time: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Fuso Horário</Label>
                  <Select
                    value={config.timezone}
                    onValueChange={(v) => setConfig((prev) => ({ ...prev, timezone: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BRAZIL_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cards de Seleção de Métricas */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Métricas do Dashboard */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4 text-blue-600" />
                  Dados do Dashboard
                </CardTitle>
                <CardDescription>Selecione o que incluir no resumo semanal</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: 'include_revenue_month' as const, label: 'Receita do Mês' },
                  { key: 'include_to_renew' as const, label: 'Clientes a Renovar (7 dias)' },
                  { key: 'include_clients_overdue' as const, label: 'Clientes em Atraso' },
                  { key: 'include_renewal_rate' as const, label: 'Taxa de Renovação (%)' },
                  { key: 'include_active_clients' as const, label: 'Clientes Ativos' },
                  { key: 'include_next_revenue' as const, label: 'Próxima Receita (30 dias)' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center space-x-2.5">
                    <Checkbox
                      id={item.key}
                      checked={config[item.key]}
                      onCheckedChange={() => toggleField(item.key)}
                    />
                    <Label htmlFor={item.key} className="text-sm font-normal cursor-pointer">
                      {item.label}
                    </Label>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Métricas do Financeiro */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  Dados do Financeiro
                </CardTitle>
                <CardDescription>Indicadores financeiros da semana/mês</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: 'include_fin_to_receive' as const, label: 'A Receber (5 dias)' },
                  { key: 'include_fin_overdue' as const, label: 'Em Atraso (Valor)' },
                  { key: 'include_fin_expenses' as const, label: 'Despesas (Mês)' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center space-x-2.5">
                    <Checkbox
                      id={item.key}
                      checked={config[item.key]}
                      onCheckedChange={() => toggleField(item.key)}
                    />
                    <Label htmlFor={item.key} className="text-sm font-normal cursor-pointer">
                      {item.label}
                    </Label>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Coluna Direita: Pré-visualização */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              Preview da Mensagem
            </CardTitle>
            <CardDescription>
              Prévia com os valores reais atuais do sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted p-4 text-xs whitespace-pre-wrap leading-relaxed font-sans border">
              {previewText}
            </div>
            {config.last_sent_date && (
              <p className="text-xs text-muted-foreground mt-3">
                Último envio automático: <strong>{config.last_sent_date.split('-').reverse().join('-')}</strong>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
