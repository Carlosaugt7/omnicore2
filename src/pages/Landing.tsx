import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Zap, Bot, BarChart3, Shield, ArrowRight, MessageSquare, Users,
  BookOpen, Brain, Image, Headphones, Workflow, Database,
  Check, Play, ChevronRight, Globe, Mail, Twitter, Linkedin, Github,
} from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function Landing() {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* ─── HEADER ─── */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">ZapMind</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</a>
            <a href="#funcionalidades" className="hover:text-foreground transition-colors">Funcionalidades</a>
            <a href="#planos" className="hover:text-foreground transition-colors">Planos</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Começar grátis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── HERO ─── */}
      <section className="relative py-20 lg:py-28 px-4">
        {/* gradient bg */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[100px]" />
        </div>

        <div className="container mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="space-y-6"
          >
            <motion.div variants={fadeUp} custom={0}>
              <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-xs">
                <Zap className="h-3 w-3 text-primary" />
                Powered by Evolution API + N8N + IA
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              custom={1}
              className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-tight tracking-tight"
            >
              Gerencie agentes WhatsApp com IA em um{" "}
              <span className="text-primary">único painel</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              custom={2}
              className="text-lg text-muted-foreground max-w-xl leading-relaxed"
            >
              Crie, configure e controle agentes de atendimento personalizados para
              múltiplos clientes — com sua própria LLM favorita, base de conhecimento e
              deploy automático via N8N.
            </motion.p>

            <motion.div variants={fadeUp} custom={3} className="flex flex-wrap gap-3 pt-2">
              <Link to="/register">
                <Button size="lg" className="gap-2 shadow-lg shadow-primary/25">
                  Começar grátis <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>

              <Dialog>
                <DialogTrigger asChild>
                  <Button size="lg" variant="outline" className="gap-2">
                    <Play className="h-4 w-4" /> Ver demonstração
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl p-0 overflow-hidden">
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <Play className="h-16 w-16 text-muted-foreground mx-auto" />
                      <p className="text-muted-foreground">Vídeo de demonstração em breve</p>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </motion.div>
          </motion.div>

          {/* Dashboard mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="relative hidden lg:block"
          >
            <div className="rounded-2xl border bg-card shadow-2xl shadow-primary/10 overflow-hidden">
              {/* title bar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b">
                <div className="h-3 w-3 rounded-full bg-destructive/60" />
                <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
                <div className="h-3 w-3 rounded-full bg-green-400/60" />
                <span className="ml-2 text-xs text-muted-foreground">ZapMind — Dashboard</span>
              </div>
              {/* mock content */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {["3 Agentes", "142 Msgs", "87% Resolução"].map((s) => (
                    <div key={s} className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-sm font-semibold">{s.split(" ")[0]}</p>
                      <p className="text-xs text-muted-foreground">{s.split(" ").slice(1).join(" ")}</p>
                    </div>
                  ))}
                </div>
                <div className="h-32 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 flex items-end p-4 gap-1">
                  {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t bg-primary/30" style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div className="space-y-2">
                  {["Suporte Vendas — 23 msgs", "FAQ Bot — 15 msgs", "Onboarding — 8 msgs"].map((l) => (
                    <div key={l} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                      <span>{l.split("—")[0]}</span>
                      <span className="text-muted-foreground">{l.split("—")[1]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* decorative dots */}
            <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-primary/5 rounded-full blur-2xl" />
          </motion.div>
        </div>
      </section>

      {/* ─── COMO FUNCIONA ─── */}
      <section id="como-funciona" className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.p variants={fadeUp} className="text-primary font-medium text-sm mb-2">
              Simples e rápido
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl font-bold">
              Como funciona
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid md:grid-cols-3 gap-8"
          >
            {[
              {
                step: "01",
                icon: Bot,
                title: "Configure o agente",
                desc: "Defina personalidade, escolha a LLM e vincule um número WhatsApp ao agente.",
              },
              {
                step: "02",
                icon: BookOpen,
                title: "Alimente o conhecimento",
                desc: "Faça upload de PDFs, sites e documentos para a base de conhecimento RAG.",
              },
              {
                step: "03",
                icon: Workflow,
                title: "Ative e pronto",
                desc: "O ZapMind cria o fluxo N8N automaticamente e seu agente começa a atender.",
              },
            ].map((s, i) => (
              <motion.div key={i} variants={fadeUp} custom={i}>
                <Card className="relative overflow-hidden border-none bg-card shadow-sm hover:shadow-md transition-shadow">
                  <div className="absolute top-4 right-4 text-5xl font-bold text-muted/40 select-none">
                    {s.step}
                  </div>
                  <CardHeader>
                    <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
                      <s.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{s.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── LLMs SUPORTADAS ─── */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-12"
          >
            <motion.p variants={fadeUp} className="text-primary font-medium text-sm mb-2">
              Flexibilidade total
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl font-bold">
              LLMs suportadas
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-muted-foreground mt-3">
              Use a inteligência artificial que melhor se encaixa no seu caso de uso
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="flex flex-wrap justify-center gap-3"
          >
            {[
              { name: "Claude", color: "bg-orange-500/10 text-orange-600" },
              { name: "Gemini", color: "bg-blue-500/10 text-blue-600" },
              { name: "GPT-4o", color: "bg-green-500/10 text-green-600" },
              { name: "GLM", color: "bg-cyan-500/10 text-cyan-600" },
              { name: "Llama", color: "bg-purple-500/10 text-purple-600" },
              { name: "Mistral", color: "bg-indigo-500/10 text-indigo-600" },
              { name: "Groq", color: "bg-red-500/10 text-red-600" },
              { name: "Ollama", color: "bg-gray-500/10 text-gray-600" },
            ].map((llm, i) => (
              <motion.div key={llm.name} variants={fadeUp} custom={i}>
                <div
                  className={`${llm.color} flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-transform hover:scale-105`}
                >
                  <Brain className="h-4 w-4" />
                  {llm.name}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── FUNCIONALIDADES ─── */}
      <section id="funcionalidades" className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.p variants={fadeUp} className="text-primary font-medium text-sm mb-2">
              Tudo incluso
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl font-bold">
              Funcionalidades
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {[
              { icon: Workflow, title: "Deploy automático N8N", desc: "Fluxos de automação criados e publicados automaticamente ao ativar um agente." },
              { icon: Database, title: "Base de conhecimento RAG", desc: "Indexação vetorial de documentos para respostas contextuais e precisas." },
              { icon: Shield, title: "Multi-tenant isolado", desc: "Dados totalmente isolados entre organizações com Row Level Security." },
              { icon: MessageSquare, title: "Memória de conversas", desc: "Histórico completo de interações para contexto contínuo no atendimento." },
              { icon: BarChart3, title: "Analytics em tempo real", desc: "Métricas de desempenho, satisfação e volume atualizadas ao vivo." },
              { icon: Image, title: "Suporte a áudio e imagens", desc: "Processe mensagens de voz e imagens enviadas pelo WhatsApp." },
            ].map((f, i) => (
              <motion.div key={i} variants={fadeUp} custom={i}>
                <Card className="h-full border hover:border-primary/30 transition-colors group">
                  <CardHeader>
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-1 group-hover:bg-primary/20 transition-colors">
                      <f.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── PLANOS ─── */}
      <section id="planos" className="py-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.p variants={fadeUp} className="text-primary font-medium text-sm mb-2">
              Preços transparentes
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl font-bold">
              Planos e preços
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-muted-foreground mt-3">
              Escolha o plano ideal para o tamanho do seu negócio
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid md:grid-cols-3 gap-6"
          >
            {[
              {
                name: "Starter",
                price: "197",
                features: [
                  "3 agentes",
                  "1 número WhatsApp",
                  "500 MB de conhecimento",
                  "5.000 msgs/mês",
                  "Suporte por e-mail",
                ],
              },
              {
                name: "Growth",
                price: "497",
                popular: true,
                features: [
                  "15 agentes",
                  "5 números WhatsApp",
                  "5 GB de conhecimento",
                  "30.000 msgs/mês",
                  "Suporte prioritário",
                  "Analytics avançado",
                ],
              },
              {
                name: "Agency",
                price: "997",
                features: [
                  "Agentes ilimitados",
                  "Números ilimitados",
                  "10 GB de conhecimento",
                  "100.000 msgs/mês",
                  "Whitelabel completo",
                  "Revenda para clientes",
                  "Suporte dedicado",
                ],
              },
            ].map((plan, i) => (
              <motion.div key={plan.name} variants={fadeUp} custom={i}>
                <Card
                  className={`relative h-full flex flex-col ${
                    plan.popular
                      ? "border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/10"
                      : ""
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-full">
                      Mais popular
                    </span>
                  )}
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <div className="mt-3">
                      <span className="text-4xl font-bold">R$ {plan.price}</span>
                      <span className="text-muted-foreground text-sm">/mês</span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-2.5 flex-1 mb-6">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link to="/register" className="block">
                      <Button
                        className="w-full"
                        variant={plan.popular ? "default" : "outline"}
                        size="lg"
                      >
                        Começar agora
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-2xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-12"
          >
            <motion.p variants={fadeUp} className="text-primary font-medium text-sm mb-2">
              Dúvidas?
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl font-bold">
              Perguntas frequentes
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            <Accordion type="single" collapsible className="space-y-2">
              {[
                {
                  q: "O que é o ZapMind?",
                  a: "O ZapMind é uma plataforma SaaS que permite criar e gerenciar agentes de atendimento inteligentes para WhatsApp, integrando IAs como GPT-4o, Claude, Gemini e outras com automação via N8N e Evolution API.",
                },
                {
                  q: "Preciso saber programar?",
                  a: "Não! O ZapMind foi feito para ser 100% no-code. Você configura tudo pelo painel — desde o agente até a base de conhecimento — sem escrever uma linha de código.",
                },
                {
                  q: "Quais LLMs são suportadas?",
                  a: "Suportamos Claude, Gemini, GPT-4o, GLM, Llama, Mistral, Groq e Ollama. Você pode escolher a melhor LLM para cada agente individualmente.",
                },
                {
                  q: "Como funciona a base de conhecimento?",
                  a: "Você faz upload de PDFs, sites ou documentos de texto. O ZapMind indexa automaticamente usando RAG (Retrieval-Augmented Generation) para que o agente responda com base nas suas informações.",
                },
                {
                  q: "Posso revender para meus clientes?",
                  a: "Sim! No plano Agency você tem acesso ao modo whitelabel completo, podendo criar sub-contas para seus clientes com sua própria marca.",
                },
                {
                  q: "Como funciona o suporte?",
                  a: "Plano Starter: suporte por e-mail. Growth: suporte prioritário com SLA de 4h. Agency: suporte dedicado com canal direto e onboarding assistido.",
                },
              ].map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="bg-card border rounded-lg px-4"
                >
                  <AccordionTrigger className="text-sm font-medium hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* ─── CTA FINAL ─── */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} className="text-3xl font-bold mb-4">
              Pronto para automatizar seu atendimento?
            </motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-muted-foreground mb-8 text-lg">
              Crie sua conta gratuita e comece a configurar agentes de IA em minutos.
            </motion.p>
            <motion.div variants={fadeUp} custom={2}>
              <Link to="/register">
                <Button size="lg" className="gap-2 shadow-lg shadow-primary/25">
                  Começar grátis <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t bg-muted/20 py-12 px-4">
        <div className="container mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            {/* brand */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                  <Zap className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
                <span className="font-bold">ZapMind</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Plataforma de gestão de agentes de atendimento via WhatsApp com inteligência artificial.
              </p>
            </div>

            {/* produto */}
            <div>
              <h4 className="font-semibold text-sm mb-3">Produto</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</a></li>
                <li><a href="#funcionalidades" className="hover:text-foreground transition-colors">Funcionalidades</a></li>
                <li><a href="#planos" className="hover:text-foreground transition-colors">Planos</a></li>
                <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
              </ul>
            </div>

            {/* legal */}
            <div>
              <h4 className="font-semibold text-sm mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><span className="hover:text-foreground transition-colors cursor-pointer">Termos de uso</span></li>
                <li><span className="hover:text-foreground transition-colors cursor-pointer">Política de privacidade</span></li>
                <li><span className="hover:text-foreground transition-colors cursor-pointer">LGPD</span></li>
              </ul>
            </div>

            {/* social */}
            <div>
              <h4 className="font-semibold text-sm mb-3">Redes sociais</h4>
              <div className="flex gap-3">
                {[
                  { icon: Twitter, label: "Twitter" },
                  { icon: Linkedin, label: "LinkedIn" },
                  { icon: Github, label: "GitHub" },
                  { icon: Mail, label: "E-mail" },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                    title={s.label}
                  >
                    <s.icon className="h-4 w-4" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-2">
            <span>© 2026 ZapMind. Todos os direitos reservados.</span>
            <span>Feito com 💜 para automação inteligente</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
