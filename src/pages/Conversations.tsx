import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";

const mockConversations = [
  { id: 1, contact: "+55 11 9xxxx-1234", agent: "Suporte Vendas", lastMsg: "Obrigado pela informação!", time: "há 5 min", status: "resolved" },
  { id: 2, contact: "+55 21 9xxxx-5678", agent: "FAQ Bot", lastMsg: "Qual o prazo de entrega?", time: "há 12 min", status: "active" },
  { id: 3, contact: "+55 31 9xxxx-9012", agent: "Onboarding", lastMsg: "Vou verificar aqui", time: "há 1 hora", status: "active" },
];

export default function Conversations() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conversas</h1>
        <p className="text-muted-foreground">Histórico de atendimentos</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {mockConversations.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{c.contact}</p>
                    <p className="text-xs text-muted-foreground">{c.lastMsg}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={c.status === "active" ? "default" : "secondary"} className="mb-1">
                    {c.status === "active" ? "Ativo" : "Resolvido"}
                  </Badge>
                  <p className="text-xs text-muted-foreground">{c.time}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
