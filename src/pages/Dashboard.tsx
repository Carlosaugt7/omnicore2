import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, DollarSign, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ total: 0, active: 0, overdue: 0, revenue: 0 });

  useEffect(() => {
    if (!user) return;
    const loadStats = async () => {
      const { data: clients } = await supabase
        .from('clients')
        .select('status, value')
        .eq('user_id', user.id);

      if (clients) {
        setStats({
          total: clients.length,
          active: clients.filter(c => c.status === 'ativo').length,
          overdue: clients.filter(c => c.status === 'vencido').length,
          revenue: clients.filter(c => c.status === 'ativo').reduce((sum, c) => sum + (c.value || 0), 0),
        });
      }
    };
    loadStats();
  }, [user]);

  const cards = [
    { title: 'Total de Clientes', value: stats.total, icon: Users, color: 'text-primary' },
    { title: 'Clientes Ativos', value: stats.active, icon: CheckCircle, color: 'text-green-500' },
    { title: 'Vencidos', value: stats.overdue, icon: AlertTriangle, color: 'text-destructive' },
    { title: 'Receita Mensal', value: `R$ ${stats.revenue.toFixed(2)}`, icon: DollarSign, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

const stats = [
  { title: "Agentes Ativos", value: "3", icon: Bot, change: "+1 este mês" },
  { title: "Mensagens Hoje", value: "142", icon: MessageSquare, change: "+23% vs ontem" },
  { title: "Clientes Atendidos", value: "58", icon: Users, change: "+12 esta semana" },
  { title: "Taxa de Resolução", value: "87%", icon: TrendingUp, change: "+5% vs mês anterior" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do seu atendimento</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.title}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{s.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atividade Recente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { text: "Agente 'Suporte Vendas' respondeu 23 mensagens", time: "há 5 min" },
                { text: "Novo cliente conectado: João Silva", time: "há 15 min" },
                { text: "Base de conhecimento atualizada", time: "há 1 hora" },
                { text: "Agente 'FAQ Bot' criado com sucesso", time: "há 3 horas" },
              ].map((a, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{a.text}</span>
                  <span className="text-muted-foreground text-xs shrink-0 ml-2">{a.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uso do Plano</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: "Mensagens", used: 142, total: 5000 },
                { label: "Agentes", used: 3, total: 3 },
                { label: "Base de Conhecimento", used: 120, total: 500, unit: "MB" },
              ].map((u) => (
                <div key={u.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{u.label}</span>
                    <span className="text-muted-foreground">
                      {u.used}{u.unit ? u.unit : ""} / {u.total}{u.unit ? u.unit : ""}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${Math.min((u.used / u.total) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
