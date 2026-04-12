import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function AgentEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: "Salvo", description: "Agente atualizado com sucesso." });
    navigate(`/dashboard/agents/${id}`);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Editar Agente</h1>
        <p className="text-muted-foreground">Atualize as configurações do agente</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Informações</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" defaultValue="Suporte Vendas" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt do sistema</Label>
              <Textarea id="prompt" defaultValue="Você é um agente de suporte especializado em vendas..." rows={5} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="welcome">Mensagem de boas-vindas</Label>
              <Input id="welcome" defaultValue="Olá! Como posso ajudar?" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit">Salvar</Button>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
