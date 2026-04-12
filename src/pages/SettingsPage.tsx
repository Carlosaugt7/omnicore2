import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { toast } = useToast();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conta e organização</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome completo</Label>
            <Input defaultValue="Usuário Teste" />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input defaultValue="usuario@email.com" disabled />
          </div>
          <Button onClick={() => toast({ title: "Salvo" })}>Salvar perfil</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organização</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da organização</Label>
            <Input defaultValue="Minha Empresa" />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input defaultValue="minha-empresa" />
          </div>
          <Button onClick={() => toast({ title: "Salvo" })}>Salvar organização</Button>
        </CardContent>
      </Card>
    </div>
  );
}
