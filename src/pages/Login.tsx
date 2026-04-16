import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react';

// ── Phone mask ────────────────────────────────────────────────
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// ── Retry with exponential backoff ───────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error('Max retries exceeded');
}

// ── Error message helper ──────────────────────────────────────
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Servidor indisponível. Verifique sua conexão e tente novamente.';
  }
  if (msg.includes('timeout') || msg.includes('Timeout')) {
    return 'Tempo limite excedido. Tente novamente em instantes.';
  }
  if (msg.includes('User already registered')) {
    return 'Este e-mail já está cadastrado. Faça login.';
  }
  if (msg.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (msg.includes('Email not confirmed')) {
    return 'E-mail não confirmado. Verifique sua caixa de entrada.';
  }
  return msg;
}

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register fields
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);

  // Validation
  const passwordsMatch = regPassword === regConfirm;
  const passwordStrong = regPassword.length >= 6;
  const nameValid = regName.trim().length >= 3;
  const phoneValid = regPhone.replace(/\D/g, '').length >= 10;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await withRetry(() =>
        supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
      );
      if (error) throw error;
      navigate('/dashboard');
    } catch (err) {
      toast.error(friendlyError(err));
    }
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nameValid) {
      toast.error('Nome deve ter pelo menos 3 caracteres.');
      return;
    }
    if (!phoneValid) {
      toast.error('Celular inválido. Use o formato (XX) XXXXX-XXXX.');
      return;
    }
    if (!passwordStrong) {
      toast.error('Senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (!passwordsMatch) {
      toast.error('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await withRetry(() =>
        supabase.auth.signUp({
          email: regEmail,
          password: regPassword,
          options: {
            data: {
              full_name: regName.trim(),
              phone: regPhone.replace(/\D/g, ''),
            },
            emailRedirectTo: window.location.origin,
          },
        })
      );

      if (error) throw error;

      if (data.session) {
        // Auto-confirm enabled — logged in immediately
        toast.success(`Bem-vindo, ${regName.split(' ')[0]}!`);
        navigate('/dashboard');
      } else {
        toast.success('Conta criada! Verifique seu e-mail para confirmar o cadastro.');
      }
    } catch (err) {
      toast.error(friendlyError(err));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center mb-2">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">OmniCore</CardTitle>
          <CardDescription>Gestão de clientes IPTV/Streaming</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Cadastro</TabsTrigger>
            </TabsList>

            {/* ── LOGIN ── */}
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">E-mail</Label>
                  <Input
                    id="login-email"
                    type="email"
                    required
                    placeholder="seu@email.com"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      className="pr-10"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowLoginPassword(v => !v)}
                      tabIndex={-1}
                    >
                      {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Entrando...</> : 'Entrar'}
                </Button>
              </form>
            </TabsContent>

            {/* ── CADASTRO ── */}
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4 mt-4">

                {/* Nome */}
                <div className="space-y-2">
                  <Label htmlFor="reg-name">Nome completo</Label>
                  <Input
                    id="reg-name"
                    type="text"
                    required
                    minLength={3}
                    placeholder="Seu nome completo"
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    className={regName && !nameValid ? 'border-destructive' : ''}
                  />
                  {regName && !nameValid && (
                    <p className="text-xs text-destructive">Mínimo 3 caracteres</p>
                  )}
                </div>

                {/* Celular */}
                <div className="space-y-2">
                  <Label htmlFor="reg-phone">Celular</Label>
                  <Input
                    id="reg-phone"
                    type="tel"
                    required
                    placeholder="(11) 99999-9999"
                    value={regPhone}
                    onChange={e => setRegPhone(maskPhone(e.target.value))}
                    className={regPhone && !phoneValid ? 'border-destructive' : ''}
                  />
                  {regPhone && !phoneValid && (
                    <p className="text-xs text-destructive">Número inválido</p>
                  )}
                </div>

                {/* E-mail */}
                <div className="space-y-2">
                  <Label htmlFor="reg-email">E-mail</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    required
                    placeholder="seu@email.com"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                  />
                </div>

                {/* Senha */}
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="reg-password"
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="Mínimo 6 caracteres"
                      className={`pr-10 ${regPassword && !passwordStrong ? 'border-destructive' : ''}`}
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowRegPassword(v => !v)}
                      tabIndex={-1}
                    >
                      {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {regPassword && !passwordStrong && (
                    <p className="text-xs text-destructive">Mínimo 6 caracteres</p>
                  )}
                </div>

                {/* Confirmar Senha */}
                <div className="space-y-2">
                  <Label htmlFor="reg-confirm">Confirmar senha</Label>
                  <div className="relative">
                    <Input
                      id="reg-confirm"
                      type={showRegConfirm ? 'text' : 'password'}
                      required
                      placeholder="Repita a senha"
                      className={`pr-10 ${regConfirm && !passwordsMatch ? 'border-destructive' : regConfirm && passwordsMatch ? 'border-green-500' : ''}`}
                      value={regConfirm}
                      onChange={e => setRegConfirm(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowRegConfirm(v => !v)}
                      tabIndex={-1}
                    >
                      {showRegConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {regConfirm && !passwordsMatch && (
                    <p className="text-xs text-destructive">As senhas não coincidem</p>
                  )}
                  {regConfirm && passwordsMatch && (
                    <p className="text-xs text-green-600">Senhas coincidem ✓</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !nameValid || !phoneValid || !passwordStrong || !passwordsMatch}
                >
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cadastrando...</> : 'Criar conta'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
