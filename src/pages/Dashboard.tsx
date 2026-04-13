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
