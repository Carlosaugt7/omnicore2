import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Upload, FileText } from "lucide-react";

export default function Knowledge() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Base de Conhecimento</h1>
          <p className="text-muted-foreground">Alimente seus agentes com informações</p>
        </div>
        <Button className="gap-2">
          <Upload className="h-4 w-4" /> Upload
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { name: "FAQ Geral", docs: 12, size: "45MB" },
          { name: "Manual de Produtos", docs: 5, size: "32MB" },
          { name: "Política de Troca", docs: 3, size: "8MB" },
        ].map((kb) => (
          <Card key={kb.name} className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">{kb.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{kb.docs} documentos • {kb.size}</p>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
