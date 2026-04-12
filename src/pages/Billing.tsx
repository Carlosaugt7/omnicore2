import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Check } from "lucide-react";

export default function Billing() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Assinatura</h1>
        <p className="text-muted-foreground">Gerencie seu plano e pagamentos</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Plano Atual</CardTitle>
            <Badge>Starter</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold">R$ 97<span className="text-sm text-muted-foreground font-normal">/mês</span></span>
            <Button variant="outline">Upgrade</Button>
          </div>
          <div className="space-y-2 text-sm">
            {["3 agentes", "1 número", "5.000 msgs/mês", "500MB conhecimento"].map((f) => (
              <div key={f} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Método de Pagamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nenhum método de pagamento cadastrado. Configure ao fazer upgrade.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
