import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Edit, MessageSquare, Clock } from "lucide-react";

export default function AgentDetail() {
  const { id } = useParams();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Suporte Vendas</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge>Ativo</Badge>
              <span className="text-sm text-muted-foreground">GPT-4o</span>
            </div>
          </div>
        </div>
        <Link to={`/dashboard/agents/${id}/edit`}>
          <Button variant="outline" className="gap-2">
            <Edit className="h-4 w-4" /> Editar
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Total de Mensagens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1.250</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" /> Tempo Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2.3s</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Satisfação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">92%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prompt do Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Você é um agente de suporte especializado em vendas. Responda de forma educada e objetiva,
            ajudando os clientes a encontrar o melhor produto para suas necessidades.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
