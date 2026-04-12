import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function Clients() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clientes</h1>
        <p className="text-muted-foreground">Gestão de clientes (Plano Agency)</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">Recurso do Plano Agency</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Gerencie múltiplos clientes, atribua agentes e números dedicados para cada um.
            Faça upgrade para o plano Agency para desbloquear.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
