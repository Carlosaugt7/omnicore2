import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

export default function AgentNew() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: "Agente criado", description: "Seu novo agente está pronto." });
    navigate("/dashboard/agents");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Novo Agente</h1>
        <p className="text-muted-foreground">Configure um novo agente de IA</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações do Agente</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do agente</Label>
              <Input id="name" placeholder="Ex: Suporte Vendas" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Modelo de IA</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                  <SelectItem value="claude-3">Claude 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt do sistema</Label>
              <Textarea id="prompt" placeholder="Descreva o comportamento do agente..." rows={5} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="welcome">Mensagem de boas-vindas</Label>
              <Input id="welcome" placeholder="Olá! Como posso ajudar?" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit">Criar Agente</Button>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
