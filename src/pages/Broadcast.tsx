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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Megaphone, Send, Image as ImageIcon, Trash2, CheckCircle2, XCircle,
  AlertTriangle, Pause, Play, ShieldAlert, Sparkles, Search, UserCheck,
  Server, Globe, ExternalLink, CheckCheck
} from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';
import { CLIENT_STATUS_COLORS_BORDERED } from '@/lib/utils';
import { ServerBadge, buildServerColorMap } from '@/components/ServerBadge';

type Client = Database['public']['Tables']['clients']['Row'];
type MacAddress = Database['public']['Tables']['mac_addresses']['Row'];

interface SendResultLog {
  clientId: string;
  clientName: string;
  phone: string;
  status: 'pending' | 'sending' | 'success' | 'failed';
  error?: string;
}

interface ClientSiteItem {
  siteName: string;
  rawUrl: string;
  mac: string;
}

const getSiteName = (url: string | null): string => {
  if (!url) return '';
  try {
    const formattedUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
    const parsed = new URL(formattedUrl);
    let host = parsed.hostname.replace(/^www\./, '');
    const name = host.split('.')[0];
    return name || host;
  } catch {
    return url;
  }
};

export default function Broadcast() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [macAddresses, setMacAddresses] = useState<MacAddress[]>([]);
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
  const [serverFilter, setServerFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState('all');

  // Aba ativa nos destinatários: 'servers' (Geral / Servidores) ou 'sites' (Pesquisa por Site)
  const [recipientTab, setRecipientTab] = useState<'servers' | 'sites'>('servers');

  // Broadcast Progress Modal State
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [logs, setLogs] = useState<SendResultLog[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const isCancelledRef = useRef(false);

  // Fetch Clients & MAC Addresses
  useEffect(() => {
    if (!user) return;
    setLoadingClients(true);

    Promise.all([
      supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true }),
      supabase
        .from('mac_addresses')
        .select('*')
        .eq('user_id', user.id)
    ]).then(([clientsRes, macsRes]) => {
      setLoadingClients(false);

      if (clientsRes.error) {
        toast.error('Erro ao carregar clientes: ' + clientsRes.error.message);
        return;
      }

      if (clientsRes.data) {
        setClients(clientsRes.data);
        // Por padrão, seleciona todos os clientes ativos/válidos
        const validIds = new Set(clientsRes.data.filter(c => c.status !== 'cancelado').map(c => c.id));
        setSelectedIds(validIds);
      }

      if (macsRes.data) {
        setMacAddresses(macsRes.data);
      }
    });
  }, [user?.id]);

  // Mapa de Clientes -> Sites cadastrados via MAC Address
  const clientSitesMap = useMemo(() => {
    const map = new Map<string, ClientSiteItem[]>();

    clients.forEach(c => {
      const matchedMacs = macAddresses.filter(m =>
        (m.client_id && m.client_id === c.id) ||
        (m.client_name && m.client_name.trim().toLowerCase() === c.name.trim().toLowerCase())
      );

      const items: ClientSiteItem[] = [];
      matchedMacs.forEach(m => {
        if (m.activation_url) {
          items.push({
            siteName: getSiteName(m.activation_url),
            rawUrl: m.activation_url,
            mac: m.mac,
          });
        }
      });

      if (items.length > 0) {
        map.set(c.id, items);
      }
    });

    return map;
  }, [clients, macAddresses]);

  // Lista de clientes que possuem aplicativo cadastrado em site
  const clientsWithSites = useMemo(() => {
    return clients.filter(c => clientSitesMap.has(c.id));
  }, [clients, clientSitesMap]);

  // Sites únicos cadastrados
  const uniqueSites = useMemo(() => {
    const set = new Set<string>();
    macAddresses.forEach(m => {
      if (m.activation_url) {
        const name = getSiteName(m.activation_url).trim();
        if (name) set.add(name);
      }
    });
    return Array.from(set).sort();
  }, [macAddresses]);

  // Servidores únicos para o filtro
  const servers = useMemo(() => {
    return [...new Set(clients.map(c => c.server).filter(Boolean).sort())] as string[];
  }, [clients]);

  // Color map para servidores
  const serverColorMap = useMemo(() => {
    return buildServerColorMap(clients.map(c => c.server));
  }, [clients]);

  // Estatísticas de Servidores
  const serverStats = useMemo(() => {
    const map = new Map<string, { total: number; selected: number; clientIds: string[] }>();
    clients.forEach(c => {
      const serverName = c.server?.trim() || 'Sem servidor';
      if (!map.has(serverName)) {
        map.set(serverName, { total: 0, selected: 0, clientIds: [] });
      }
      const item = map.get(serverName)!;
      item.total++;
      item.clientIds.push(c.id);
      if (selectedIds.has(c.id)) {
        item.selected++;
      }
    });

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        ...data,
        isAllSelected: data.clientIds.length > 0 && data.clientIds.every(id => selectedIds.has(id)),
        isPartialSelected: data.selected > 0 && data.selected < data.total,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, selectedIds]);

  // Estatísticas de Sites
  const siteStats = useMemo(() => {
    const map = new Map<string, { total: number; selected: number; clientIds: string[] }>();

    clientsWithSites.forEach(c => {
      const sites = clientSitesMap.get(c.id) || [];
      const distinctSitesForClient = new Set(sites.map(s => s.siteName));

      distinctSitesForClient.forEach(siteName => {
        if (!map.has(siteName)) {
          map.set(siteName, { total: 0, selected: 0, clientIds: [] });
        }
        const item = map.get(siteName)!;
        item.total++;
        item.clientIds.push(c.id);
        if (selectedIds.has(c.id)) {
          item.selected++;
        }
      });
    });

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        ...data,
        isAllSelected: data.clientIds.length > 0 && data.clientIds.every(id => selectedIds.has(id)),
        isPartialSelected: data.selected > 0 && data.selected < data.total,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clientsWithSites, clientSitesMap, selectedIds]);

  // Lista de clientes filtrada de acordo com a aba ativa
  const filteredClients = useMemo(() => {
    const baseList = recipientTab === 'sites' ? clientsWithSites : clients;

    return baseList.filter(c => {
      const matchSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery) ||
        (c.plan && c.plan.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchStatus = statusFilter === 'all' || c.status === statusFilter;

      if (recipientTab === 'servers') {
        const matchServer = serverFilter === 'all' || c.server === serverFilter;
        return matchSearch && matchStatus && matchServer;
      } else {
        // Aba 'sites': filtra por site
        const sites = clientSitesMap.get(c.id) || [];
        const matchSite = siteFilter === 'all' || sites.some(s => s.siteName.toLowerCase() === siteFilter.toLowerCase());
        return matchSearch && matchStatus && matchSite;
      }
    });
  }, [recipientTab, clients, clientsWithSites, searchQuery, statusFilter, serverFilter, siteFilter, clientSitesMap]);

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

  // Seleção rápida por Servidor
  const handleToggleSelectByServer = (serverName: string) => {
    const targetClients = clients.filter(c => (c.server?.trim() || 'Sem servidor') === serverName);
    const targetIds = targetClients.map(c => c.id);
    const allSelected = targetIds.length > 0 && targetIds.every(id => selectedIds.has(id));

    const next = new Set(selectedIds);
    if (allSelected) {
      targetIds.forEach(id => next.delete(id));
      toast.info(`Desmarcados clientes do servidor "${serverName}"`);
    } else {
      targetIds.forEach(id => next.add(id));
      toast.success(`Selecionados todos do servidor "${serverName}" (${targetIds.length})`);
    }
    setSelectedIds(next);
  };

  // Seleção rápida por Site
  const handleToggleSelectBySite = (siteName: string) => {
    const targetIds: string[] = [];
    clientsWithSites.forEach(c => {
      const sites = clientSitesMap.get(c.id) || [];
      if (sites.some(s => s.siteName.toLowerCase() === siteName.toLowerCase())) {
        targetIds.push(c.id);
      }
    });

    const allSelected = targetIds.length > 0 && targetIds.every(id => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      targetIds.forEach(id => next.delete(id));
      toast.info(`Desmarcados clientes do site "${siteName}"`);
    } else {
      targetIds.forEach(id => next.add(id));
      toast.success(`Selecionados clientes do site "${siteName}" (${targetIds.length})`);
    }
    setSelectedIds(next);
  };

  const handleSelectAllVisible = () => {
    const next = new Set(selectedIds);
    filteredClients.forEach(c => next.add(c.id));
    setSelectedIds(next);
    toast.success(`${filteredClients.length} clientes selecionados`);
  };

  const handleClearAllSelected = () => {
    setSelectedIds(new Set());
    toast.info('Seleção limpa');
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

      while (isPausedRef.current) {
        if (isCancelledRef.current) break;
        await new Promise(r => setTimeout(r, 500));
      }

      if (isCancelledRef.current) break;

      setCurrentIndex(i);
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

      if (i < initialLogs.length - 1 && !isCancelledRef.current) {
        const randomVariation = (Math.random() * 2 - 1);
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
            Envie comunicados para seus clientes no WhatsApp filtrando por servidores ou por sites dos aplicativos cadastrados.
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
              <li>Use a tag <code className="bg-amber-200/50 dark:bg-amber-900/50 px-1 rounded">{'{nome}'}</code> para garantir que o texto seja único para cada cliente.</li>
              <li>Recomendamos manter o intervalo de envio em no mínimo <strong>8 segundos</strong> por cliente.</li>
              <li>Evite mensagens com termos agressivos ou links desconhecidos para não gerar denúncias de SPAM.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Message Compositor (5 cols) */}
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
            <CardHeader className="pb-3 space-y-3">
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

              {/* ABAS DE PESQUISA: Por Servidores vs Pesquisa por Site */}
              <Tabs
                value={recipientTab}
                onValueChange={(val: any) => setRecipientTab(val)}
                className="w-full"
              >
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="servers" className="text-xs flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5" />
                    <span>Todos Servidores ({clients.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="sites" className="text-xs flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    <span>Pesquisa por Site ({clientsWithSites.length})</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Filters & Search */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
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

                {/* Dropdown contextual conforme a aba selecionada */}
                {recipientTab === 'servers' ? (
                  <Select value={serverFilter} onValueChange={setServerFilter}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Servidor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Servidores</SelectItem>
                      {servers.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={siteFilter} onValueChange={setSiteFilter}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Site do aplicativo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os sites</SelectItem>
                      {uniqueSites.map(site => (
                        <SelectItem key={site} value={site}>{site}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* BARRA DE SELEÇÃO RÁPIDA: CONTEXTUAL (Servidor vs Site) */}
              {recipientTab === 'servers' ? (
                /* Seleção por Servidor */
                serverStats.length > 0 && (
                  <div className="pt-2 space-y-1.5 border-t">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                      <span className="font-semibold text-muted-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                        <Server className="h-3.5 w-3.5 text-primary" />
                        Selecionar por Servidor:
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAllVisible}
                          className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                        >
                          Marcar todos visíveis
                        </button>
                        <span className="text-muted-foreground text-[10px]">•</span>
                        <button
                          type="button"
                          onClick={handleClearAllSelected}
                          className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Limpar seleção
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {serverStats.map(srv => {
                        const isFull = srv.isAllSelected;
                        const isPartial = srv.isPartialSelected;
                        return (
                          <button
                            key={srv.name}
                            type="button"
                            onClick={() => handleToggleSelectByServer(srv.name)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                              isFull
                                ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                : isPartial
                                ? 'bg-primary/10 text-primary border-primary/40'
                                : 'bg-background hover:bg-muted text-muted-foreground border-border'
                            }`}
                            title={`Clique para ${isFull ? 'desmarcar' : 'selecionar'} clientes de ${srv.name}`}
                          >
                            <span className="truncate max-w-[120px]">{srv.name}</span>
                            <span
                              className={`text-[10px] px-1 rounded-sm font-semibold ${
                                isFull
                                  ? 'bg-primary-foreground/20 text-primary-foreground'
                                  : isPartial
                                  ? 'bg-primary/20 text-primary'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {srv.selected}/{srv.total}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )
              ) : (
                /* Seleção por Site */
                <div className="pt-2 space-y-1.5 border-t">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                    <span className="font-semibold text-muted-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                      <Globe className="h-3.5 w-3.5 text-primary" />
                      Selecionar por Site (Aplicativo):
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllVisible}
                        className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                      >
                        Marcar todos visíveis
                      </button>
                      <span className="text-muted-foreground text-[10px]">•</span>
                      <button
                        type="button"
                        onClick={handleClearAllSelected}
                        className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Limpar seleção
                      </button>
                    </div>
                  </div>

                  {siteStats.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {siteStats.map(st => {
                        const isFull = st.isAllSelected;
                        const isPartial = st.isPartialSelected;
                        return (
                          <button
                            key={st.name}
                            type="button"
                            onClick={() => handleToggleSelectBySite(st.name)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                              isFull
                                ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                : isPartial
                                ? 'bg-primary/10 text-primary border-primary/40'
                                : 'bg-background hover:bg-muted text-muted-foreground border-border'
                            }`}
                            title={`Clique para ${isFull ? 'desmarcar' : 'selecionar'} clientes que usam ${st.name}`}
                          >
                            <span className="truncate max-w-[120px] font-medium">{st.name}</span>
                            <span
                              className={`text-[10px] px-1 rounded-sm font-semibold ${
                                isFull
                                  ? 'bg-primary-foreground/20 text-primary-foreground'
                                  : isPartial
                                  ? 'bg-primary/20 text-primary'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {st.selected}/{st.total}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Nenhum site encontrado com URL nos MACs cadastrados.
                    </p>
                  )}
                </div>
              )}
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
                    {recipientTab === 'servers' ? (
                      <TableHead>Servidor</TableHead>
                    ) : (
                      <>
                        <TableHead>Site</TableHead>
                        <TableHead>MAC Address</TableHead>
                      </>
                    )}
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingClients ? (
                    <TableRow>
                      <TableCell colSpan={recipientTab === 'sites' ? 6 : 5} className="text-center py-8 text-muted-foreground text-xs">
                        Carregando clientes...
                      </TableCell>
                    </TableRow>
                  ) : filteredClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={recipientTab === 'sites' ? 6 : 5} className="text-center py-8 text-muted-foreground text-xs">
                        {recipientTab === 'sites'
                          ? 'Nenhum cliente encontrado com aplicativo cadastrado em site.'
                          : 'Nenhum cliente encontrado com os filtros aplicados.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredClients.map(client => {
                      const isSelected = selectedIds.has(client.id);
                      const sites = clientSitesMap.get(client.id) || [];

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

                          {recipientTab === 'servers' ? (
                            <TableCell>
                              <ServerBadge name={client.server || 'Sem servidor'} colorMap={serverColorMap} />
                            </TableCell>
                          ) : (
                            <>
                              {/* Coluna Site com link e ícone idêntico ao anexo do usuário */}
                              <TableCell onClick={e => e.stopPropagation()}>
                                <div className="space-y-1">
                                  {sites.map((st, i) => (
                                    <a
                                      key={i}
                                      href={st.rawUrl.startsWith('http') ? st.rawUrl : `https://${st.rawUrl}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center text-primary hover:underline font-medium text-xs mr-2"
                                    >
                                      {st.siteName}
                                      <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
                                    </a>
                                  ))}
                                  {sites.length === 0 && (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {sites.map(s => s.mac).join(', ') || '-'}
                              </TableCell>
                            </>
                          )}

                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {client.phone}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${CLIENT_STATUS_COLORS_BORDERED[client.status || ''] || ''}`}>
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
