import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Clock, ThumbsUp } from "lucide-react";

export default function Analytics() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Métricas e relatórios de desempenho</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Mensagens/Dia", value: "142", icon: BarChart3, trend: "+23%" },
          { title: "Resolução", value: "87%", icon: TrendingUp, trend: "+5%" },
          { title: "Tempo Resposta", value: "2.1s", icon: Clock, trend: "-0.3s" },
          { title: "Satisfação", value: "4.6/5", icon: ThumbsUp, trend: "+0.2" },
        ].map((m) => (
          <Card key={m.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{m.title}</CardTitle>
              <m.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{m.value}</div>
              <p className="text-xs text-primary mt-1">{m.trend}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Performance por Agente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { name: "Suporte Vendas", msgs: 1250, rate: 92 },
              { name: "FAQ Bot", msgs: 890, rate: 88 },
              { name: "Onboarding", msgs: 340, rate: 85 },
            ].map((a) => (
              <div key={a.name} className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.msgs} mensagens</p>
                </div>
                <div className="w-32">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Resolução</span>
                    <span>{a.rate}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${a.rate}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
