import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    evolution_api_url: '',
    evolution_api_key: '',
    evolution_instance: '',
    pix_key: '',
    pix_key_type: 'cpf',
    reminder_time: '09:00',
    template_before: 'Olá {nome}, sua assinatura vence em {dias} dias. Valor: R$ {valor}. Chave PIX: {pix}',
    template_today: 'Olá {nome}, sua assinatura vence hoje! Valor: R$ {valor}. Chave PIX: {pix}',
    template_overdue: 'Olá {nome}, sua assinatura está vencida há {dias} dias. Valor: R$ {valor}. Chave PIX: {pix}',
  });

  useEffect(() => {
    if (!user) return;
    supabase.from('settings').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings({
            evolution_api_url: data.evolution_api_url || '',
            evolution_api_key: data.evolution_api_key || '',
            evolution_instance: data.evolution_instance || '',
            pix_key: data.pix_key || '',
            pix_key_type: data.pix_key_type || 'cpf',
            reminder_time: data.reminder_time || '09:00',
            template_before: data.template_before || settings.template_before,
            template_today: data.template_today || settings.template_today,
            template_overdue: data.template_overdue || settings.template_overdue,
          });
        }
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('settings').upsert({
      user_id: user.id,
      ...settings,
    }, { onConflict: 'user_id' });
    if (error) toast.error(error.message); else toast.success('Configurações salvas!');
    setLoading(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle>Evolution API</CardTitle>
          <CardDescription>Configurações de integração com WhatsApp</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>URL da API</Label><Input value={settings.evolution_api_url} onChange={(e) => setSettings(s => ({ ...s, evolution_api_url: e.target.value }))} placeholder="https://api.evolution.com" /></div>
          <div className="space-y-2"><Label>API Key</Label><Input type="password" value={settings.evolution_api_key} onChange={(e) => setSettings(s => ({ ...s, evolution_api_key: e.target.value }))} /></div>
          <div className="space-y-2"><Label>Instância</Label><Input value={settings.evolution_instance} onChange={(e) => setSettings(s => ({ ...s, evolution_instance: e.target.value }))} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PIX</CardTitle>
          <CardDescription>Chave PIX para cobranças</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <select value={settings.pix_key_type} onChange={(e) => setSettings(s => ({ ...s, pix_key_type: e.target.value }))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="cpf">CPF</option>
              <option value="email">E-mail</option>
              <option value="telefone">Telefone</option>
              <option value="aleatoria">Aleatória</option>
            </select>
          </div>
          <div className="space-y-2"><Label>Chave PIX</Label><Input value={settings.pix_key} onChange={(e) => setSettings(s => ({ ...s, pix_key: e.target.value }))} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Templates de Lembrete</CardTitle>
          <CardDescription>Variáveis: {'{nome}'}, {'{dias}'}, {'{valor}'}, {'{pix}'}, {'{vencimento}'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Horário de envio</Label><Input type="time" value={settings.reminder_time} onChange={(e) => setSettings(s => ({ ...s, reminder_time: e.target.value }))} /></div>
          <div className="space-y-2"><Label>Antes do vencimento</Label><Textarea rows={3} value={settings.template_before} onChange={(e) => setSettings(s => ({ ...s, template_before: e.target.value }))} /></div>
          <div className="space-y-2"><Label>No dia do vencimento</Label><Textarea rows={3} value={settings.template_today} onChange={(e) => setSettings(s => ({ ...s, template_today: e.target.value }))} /></div>
          <div className="space-y-2"><Label>Após o vencimento</Label><Textarea rows={3} value={settings.template_overdue} onChange={(e) => setSettings(s => ({ ...s, template_overdue: e.target.value }))} /></div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={loading} className="w-full">
        {loading ? 'Salvando...' : 'Salvar Configurações'}
      </Button>
    </div>
  );
}
