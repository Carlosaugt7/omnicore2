import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Zap, Bot, BarChart3, Shield, ArrowRight, MessageSquare, Users } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">ZapMind</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link to="/register">
              <Button>Começar grátis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 px-4">
        <div className="container mx-auto text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm text-muted-foreground mb-6">
            <Zap className="h-3.5 w-3.5 text-primary" />
            Plataforma de IA para WhatsApp
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Automatize seu atendimento com{" "}
            <span className="text-primary">agentes de IA</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Crie agentes inteligentes que atendem seus clientes via WhatsApp 24/7.
            Base de conhecimento, analytics e multi-tenant para agências.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/register">
              <Button size="lg" className="gap-2">
                Começar agora <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline">
                Já tenho conta
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-muted/50 px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Tudo que você precisa para escalar seu atendimento
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { icon: Bot, title: "Agentes de IA", desc: "Crie agentes personalizados com personalidade e base de conhecimento própria." },
              { icon: MessageSquare, title: "WhatsApp Integrado", desc: "Conecte seu número e comece a atender automaticamente em minutos." },
              { icon: BarChart3, title: "Analytics Completo", desc: "Acompanhe métricas de atendimento, satisfação e performance em tempo real." },
              { icon: Shield, title: "Multi-tenant Seguro", desc: "Isolamento total de dados entre organizações com Row Level Security." },
              { icon: Users, title: "Gestão de Clientes", desc: "Gerencie múltiplos clientes e números no plano Agency." },
              { icon: Zap, title: "Base de Conhecimento", desc: "Alimente seus agentes com documentos, FAQs e informações do seu negócio." },
            ].map((f, i) => (
              <div key={i} className="bg-card rounded-xl p-6 border">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold text-center mb-4">Planos</h2>
          <p className="text-center text-muted-foreground mb-12">Escolha o plano ideal para o seu negócio</p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: "Starter", price: "R$ 97", agents: 3, numbers: 1, messages: "5.000", kb: "500MB" },
              { name: "Growth", price: "R$ 197", agents: 10, numbers: 3, messages: "20.000", kb: "2GB", popular: true },
              { name: "Agency", price: "R$ 497", agents: 50, numbers: 10, messages: "100.000", kb: "10GB" },
            ].map((plan) => (
              <div key={plan.name} className={`rounded-xl border p-6 ${plan.popular ? "border-primary ring-2 ring-primary/20 relative" : ""}`}>
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                    Popular
                  </span>
                )}
                <h3 className="font-semibold text-lg">{plan.name}</h3>
                <div className="mt-4 mb-6">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground text-sm">/mês</span>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                  <li>✓ {plan.agents} agentes</li>
                  <li>✓ {plan.numbers} número(s)</li>
                  <li>✓ {plan.messages} msgs/mês</li>
                  <li>✓ {plan.kb} base de conhecimento</li>
                </ul>
                <Link to="/register">
                  <Button className="w-full" variant={plan.popular ? "default" : "outline"}>
                    Começar
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span>ZapMind © 2026</span>
          </div>
          <div className="flex gap-4">
            <span>Termos</span>
            <span>Privacidade</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
