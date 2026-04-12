import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Bot, MoreHorizontal } from "lucide-react";

const mockAgents = [
  { id: "1", name: "Suporte Vendas", status: "active", messages: 1250, model: "GPT-4o" },
  { id: "2", name: "FAQ Bot", status: "active", messages: 890, model: "GPT-4o-mini" },
  { id: "3", name: "Onboarding", status: "inactive", messages: 340, model: "GPT-4o" },
];

export default function Agents() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agentes</h1>
          <p className="text-muted-foreground">Gerencie seus agentes de IA</p>
        </div>
        <Link to="/dashboard/agents/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Novo Agente
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockAgents.map((agent) => (
          <Link to={`/dashboard/agents/${agent.id}`} key={agent.id}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{agent.model}</p>
                  </div>
                </div>
                <Badge variant={agent.status === "active" ? "default" : "secondary"}>
                  {agent.status === "active" ? "Ativo" : "Inativo"}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {agent.messages.toLocaleString()} mensagens processadas
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
