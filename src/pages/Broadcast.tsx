import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Megaphone, Send, Image as ImageIcon, Trash2, CheckCircle2, XCircle,
  AlertTriangle, Pause, Play, ShieldAlert, Sparkles, Search, UserCheck
} from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];

interface SendResultLog {
  clientId: string;
  clientName: string;
  phone: string;
  status: 'pending' | 'sending' | 'success' | 'failed';
  error?: string;
}

const statusColors: Record<string, string> = {
  ativo: 'bg-green-500/10 text-green-500 border-green-500/20',
  vencido: 'bg-red-500/10 text-red-500 border-red-500/20',
  'à vencer': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  suspenso: 'bg-red-500/10 text-red-500 border-red-500/20',
  cancelado: 'bg-muted text-muted-foreground',
};

export default function Broadcast() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  // Form State
  const [messageText, setMessageText] = useState('Olá {nome}! Temos um aviso importante sobre o seu plano {plano}.\n\nCaso tenha dúvidas, entre em contato conosco.');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [delaySeconds, setDelaySeconds] = useState<number>(8);

  // Selection & Search State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Broadcast Progress Modal State
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [logs, setLogs] = useState<SendResultLog[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const isCancelledRef = useRef(false);

  // Fetch Clients
  useEffect(() => {
    if (!user) return;
    setLoadingClients(true);
    supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        setLoadingClients(false);
        if (error) {
          toast.error('Erro ao carregar clientes: ' + error.message);
          return;
        }
        if (data) {
          setClients(data);
          // By default, select all valid clients (excluding cancelado)
          const validIds = new Set(data.filter(c => c.status !== 'cancelado').map(c => c.id));
          setSelectedIds(validIds);
        }
      });
  }, [user?.id]);

  // Filtered Clients list
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery) ||
        (c.plan && c.plan.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [clients, searchQuery, statusFilter]);

  // Toggle selection for all visible clients
  const allFilteredSelected = useMemo(() => {
    if (filteredClients.length === 0) return false;
    return filteredClients.every(c => selectedIds.has(c.id));
  }, [filteredClients, selectedIds]);

  const handleToggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allFilteredSelected) {
      filteredClients.forEach(c => next.delete(c.id));
    } else {
      filteredClients.forEach(c => next.add(c.id));
    }
    setSelectedIds(next);
  };

  const handleToggleSelectClient = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Image Upload handler (Base64 conversion)
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImageUrl(result);
      setImagePreview(result);
      toast.success('Imagem carregada com sucesso!');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageUrl('');
    setImagePreview(null);
  };

  // Helper to insert tags into text
  const insertTag = (tag: string) => {
    setMessageText(prev => prev + ' ' + tag);
  };

  // Selected Clients list
  const selectedClientsList = useMemo(() => {
    return clients.filter(c => selectedIds.has(c.id));
  }, [clients, selectedIds]);

  // Replace tags for preview
  const sampleClient = selectedClientsList[0] || clients[0] || { name: 'João Silva', plan: 'Básico', value: 50, due_date: '2026-08-01', server: 'Servidor 1' };
  const previewText = useMemo(() => {
    return messageText
      .replace(/\{nome\}/g, sampleClient.name || 'Cliente')
      .replace(/\{plano\}/g, sampleClient.plan || 'Plano')
      .replace(/\{valor\}/g, sampleClient.value ? Number(sampleClient.value).toFixed(2) : '0.00')
      .replace(/\{vencimento\}/g, sampleClient.due_date || '-')
      .replace(/\{servidor\}/g, sampleClient.server || '-');
  }, [messageText, sampleClient]);

  // Start Broadcast Process
  const handleStartBroadcast = () => {
    if (selectedClientsList.length === 0) {
      toast.error('Selecione pelo menos um cliente para enviar o aviso.');
      return;
    }
    if (!messageText.trim()) {
      toast.error('Digite a mensagem do aviso.');
      return;
    }

    const initialLogs: SendResultLog[] = selectedClientsList.map(c => ({
      clientId: c.id,
      clientName: c.name,
      phone: c.phone,
      status: 'pending',
    }));

    setLogs(initialLogs);
    setCurrentIndex(0);
    setIsPaused(false);
    isCancelledRef.current = false;
    setBroadcastModalOpen(true);
    runBroadcastLoop(initialLogs);
  };

  // Broadcast Loop execution
  const runBroadcastLoop = async (initialLogs: SendResultLog[]) => {
    setIsBroadcasting(true);

    for (let i = 0; i < initialLogs.length; i++) {
      if (isCancelledRef.current) break;

      // Check pause
      while (isPausedRef.current) {
        if (isCancelledRef.current) break;
        await new Promise(r => setTimeout(r, 500));
      }

      if (isCancelledRef.current) break;

      setCurrentIndex(i);

      // Update log to sending
      setLogs(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'sending' } : item));

      const target = initialLogs[i];

      try {
        const res = await api.whatsappSendBroadcast({
          clientId: target.clientId,
          phone: target.phone,
          messageText,
          imageUrl: imageUrl || undefined,
        });

        if (res.success) {
          setLogs(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'success' } : item));
        } else {
          setLogs(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'failed', error: res.error || 'Erro desconhecido' } : item));
        }
      } catch (err: any) {
        setLogs(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'failed', error: err.message || 'Falha na requisição' } : item));
      }

      // Apply anti-spam safety delay between sends (unless it's the last item or cancelled)
      if (i < initialLogs.length - 1 && !isCancelledRef.current) {
        const randomVariation = (Math.random() * 2 - 1); // -1 to +1 sec
        const actualDelayMs = Math.max(2, delaySeconds + randomVariation) * 1000;
        await new Promise(r => setTimeout(r, actualDelayMs));
      }
    }

    setIsBroadcasting(false);
    if (!isCancelledRef.current) {
      toast.success('Disparo concluído com sucesso!');
    } else {
      toast.info('Disparo cancelado pelo usuário.');
    }
  };

  const handleCancelBroadcast = () => {
    isCancelledRef.current = true;
    setIsBroadcasting(false);
    setBroadcastModalOpen(false);
  };

  const completedCount = logs.filter(l => l.status === 'success' || l.status === 'failed').length;
  const successCount = logs.filter(l => l.status === 'success').length;
  const failedCount = logs.filter(l => l.status === 'failed').length;
  const progressPercent = logs.length > 0 ? Math.round((completedCount / logs.length) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Aviso Geral (Broadcast)
          </h1>
          <p className="text-sm text-muted-foreground">
            Envie comunicados, novidades ou avisos para a sua lista de clientes no WhatsApp com imagem e controle de segurança anti-bloqueio.
          </p>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <Card className="bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-sm">Dicas Importantes para Evitar Bloqueio do WhatsApp:</p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-800 dark:text-amber-300">
              <li>Use a tag <code className="bg-amber-200/50 dark:bg-amber-900/50 px-1 rounded">{'{nome}'}</code> para garantir que o texto enviado seja único para cada cliente.</li>
              <li>Recomendamos manter o intervalo de envio em no mínimo <strong>8 segundos</strong> por cliente.</li>
              <li>Evite mensagens com termos agressivos ou links desconhecidos para não gerar denúncias de SPAM.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Message Compositor & Image Upload (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Compor Aviso
              </CardTitle>
              <CardDescription>
                Escreva o texto e anexe uma imagem para o disparo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Variable Buttons */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Inserir variáveis dinâmicas:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertTag('{nome}')}>
                    {'{nome}'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertTag('{plano}')}>
                    {'{plano}'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertTag('{vencimento}')}>
                    {'{vencimento}'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertTag('{valor}')}>
                    {'{valor}'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertTag('{servidor}')}>
                    {'{servidor}'}
                  </Button>
                </div>
              </div>

              {/* Message Textarea */}
              <div>
                <label className="text-sm font-medium block mb-1">Mensagem do Aviso *</label>
                <Textarea
                  rows={5}
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  placeholder="Digite a mensagem do aviso..."
                  className="text-sm resize-none"
                />
              </div>

              {/* Image Upload / Attachment */}
              <div className="space-y-2">
                <label className="text-sm font-medium block">Imagem Anexa (Opcional)</label>
                
                {imagePreview ? (
                  <div className="relative rounded-lg border p-2 bg-muted/40 flex items-center gap-3">
                    <img src={imagePreview} alt="Preview" className="h-16 w-16 object-cover rounded border" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">Imagem Selecionada</p>
                      <p className="text-[11px] text-muted-foreground">Pronta para envio no WhatsApp</p>
                    </div>
                    <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={handleRemoveImage}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        id="image-upload-input"
                        className="hidden"
                        onChange={handleImageFileChange}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full text-xs"
                        onClick={() => document.getElementById('image-upload-input')?.click()}
                      >
                        <ImageIcon className="h-4 w-4 mr-2" />
                        Escolher imagem do computador
                      </Button>
                    </div>
                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-muted"></div>
                      <span className="flex-shrink mx-2 text-[10px] text-muted-foreground uppercase">ou informe uma URL</span>
                      <div className="flex-grow border-t border-muted"></div>
                    </div>
                    <Input
                      type="url"
                      placeholder="https://exemplo.com/imagem.png"
                      value={imageUrl}
                      onChange={e => {
                        setImageUrl(e.target.value);
                        setImagePreview(e.target.value || null);
                      }}
                      className="text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Safety Delay Configuration */}
              <div>
                <label className="text-sm font-medium block mb-1">Intervalo entre disparos (Anti-Bloqueio)</label>
                <Select value={String(delaySeconds)} onValueChange={val => setDelaySeconds(Number(val))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder="Selecione o intervalo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 segundos (Mais rápido - Baixa segurança)</SelectItem>
                    <SelectItem value="8">8 segundos (Recomendado - Boa segurança)</SelectItem>
                    <SelectItem value="12">12 segundos (Alta segurança)</SelectItem>
                    <SelectItem value="15">15 segundos (Ultra segurança)</SelectItem>
                    <SelectItem value="20">20 segundos (Conservador)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Message Live Preview Card */}
              <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <span>💬</span> Pré-visualização para o cliente:
                </p>
                <div className="bg-background rounded p-2.5 text-xs whitespace-pre-wrap border shadow-sm text-foreground">
                  {imagePreview && (
                    <img src={imagePreview} alt="Preview inline" className="max-h-32 w-full object-cover rounded mb-2" />
                  )}
                  {previewText}
                </div>
              </div>

              {/* Main Submit Action */}
              <Button
                className="w-full font-medium"
                size="lg"
                onClick={handleStartBroadcast}
                disabled={selectedClientsList.length === 0 || !messageText.trim()}
              >
                <Send className="h-4 w-4 mr-2" />
                Iniciar Disparo ({selectedClientsList.length} clientes)
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Recipient Selection Table (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    Destinatários ({selectedClientsList.length} de {clients.length})
                  </CardTitle>
                  <CardDescription>
                    Selecione quais clientes receberão o aviso.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="w-fit text-xs">
                  {selectedClientsList.length} Selecionados
                </Badge>
              </div>

              {/* Filters & Search */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou telefone..."
                    className="pl-8 text-xs"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Status do cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="ativo">Ativos</SelectItem>
                    <SelectItem value="vencido">Vencidos</SelectItem>
                    <SelectItem value="à vencer">À vencer</SelectItem>
                    <SelectItem value="suspenso">Suspensos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-auto p-0">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0">
                  <TableRow>
                    <TableHead className="w-12 text-center">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={handleToggleSelectAll}
                        aria-label="Selecionar todos"
                      />
                    </TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingClients ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-xs">
                        Carregando clientes...
                      </TableCell>
                    </TableRow>
                  ) : filteredClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-xs">
                        Nenhum cliente encontrado com os filtros aplicados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredClients.map(client => {
                      const isSelected = selectedIds.has(client.id);
                      return (
                        <TableRow
                          key={client.id}
                          className={`cursor-pointer hover:bg-muted/60 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                          onClick={() => handleToggleSelectClient(client.id)}
                        >
                          <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleSelectClient(client.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-xs text-foreground">{client.name}</p>
                            <p className="text-[11px] text-muted-foreground">{client.plan || 'Sem plano'}</p>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {client.phone}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${statusColors[client.status || ''] || ''}`}>
                              {client.status || 'ativo'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Broadcast Progress Modal */}
      <Dialog open={broadcastModalOpen} onOpenChange={o => { if (!isBroadcasting) setBroadcastModalOpen(o); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-5 w-5 text-primary" />
              Progresso do Disparo em Massa
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enviando avisos via WhatsApp com intervalo de segurança anti-bloqueio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Overall Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span>Progresso Total ({completedCount} / {logs.length})</span>
                <span>{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>

            {/* Counters */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded border bg-muted/30 p-2">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Total</p>
                <p className="text-base font-bold">{logs.length}</p>
              </div>
              <div className="rounded border bg-green-500/10 border-green-500/20 text-green-600 p-2">
                <p className="text-[10px] uppercase font-medium">Sucesso</p>
                <p className="text-base font-bold">{successCount}</p>
              </div>
              <div className="rounded border bg-red-500/10 border-red-500/20 text-red-600 p-2">
                <p className="text-[10px] uppercase font-medium">Falhas</p>
                <p className="text-base font-bold">{failedCount}</p>
              </div>
            </div>

            {/* Live Logs List */}
            <div className="border rounded-md max-h-48 overflow-auto divide-y text-xs">
              {logs.map((log, idx) => (
                <div key={log.clientId} className={`p-2 flex items-center justify-between ${idx === currentIndex && isBroadcasting ? 'bg-primary/5 font-medium' : ''}`}>
                  <div className="min-w-0 pr-2">
                    <p className="truncate font-medium">{log.clientName}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{log.phone}</p>
                  </div>
                  <div className="shrink-0">
                    {log.status === 'pending' && <Badge variant="outline" className="text-[10px] text-muted-foreground">Pendente</Badge>}
                    {log.status === 'sending' && <Badge variant="secondary" className="text-[10px] animate-pulse bg-blue-500/10 text-blue-500">Enviando...</Badge>}
                    {log.status === 'success' && <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-500 border-green-500/30 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Enviado</Badge>}
                    {log.status === 'failed' && <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-500 border-red-500/30 flex items-center gap-1"><XCircle className="h-3 w-3" /> Falha</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Modal Footer Controls */}
          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 border-t pt-3">
            {isBroadcasting ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPaused(!isPaused)}
                >
                  {isPaused ? <Play className="h-3.5 w-3.5 mr-1" /> : <Pause className="h-3.5 w-3.5 mr-1" />}
                  {isPaused ? 'Retomar' : 'Pausar'}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleCancelBroadcast}
                >
                  Cancelar Disparo
                </Button>
              </>
            ) : (
              <Button
                type="button"
                className="w-full sm:w-auto ml-auto"
                onClick={() => setBroadcastModalOpen(false)}
              >
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
