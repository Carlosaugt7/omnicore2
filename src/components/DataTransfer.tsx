import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, Upload, FileJson, AlertTriangle, Loader2, ChevronDown, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type ClientRow    = Database['public']['Tables']['clients']['Row'];
type ServiceRow   = Database['public']['Tables']['services']['Row'];
type MacRow       = Database['public']['Tables']['mac_addresses']['Row'];

type TableName = 'clients' | 'services' | 'mac_addresses';

interface ExportBundle {
  version: 1;
  exportedAt: string;
  userId: string;
  tables: {
    clients?: Omit<ClientRow, 'user_id'>[];
    services?: Omit<ServiceRow, 'user_id'>[];
    mac_addresses?: Omit<MacRow, 'user_id'>[];
  };
}

interface ImportPreview {
  clients: number;
  services: number;
  mac_addresses: number;
}

const TABLE_LABELS: Record<TableName, string> = {
  clients: 'Clientes',
  services: 'Serviços',
  mac_addresses: 'MACs',
};

// ─── helpers ────────────────────────────────────────────────

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function todaySlug() {
  return new Date().toISOString().split('T')[0];
}

// ─── component ──────────────────────────────────────────────

export default function DataTransfer() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  // Import confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingBundle, setPendingBundle] = useState<ExportBundle | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  // ── EXPORT ────────────────────────────────────────────────

  async function handleExport(tables: TableName[]) {
    if (!user) return;
    setExporting(true);

    try {
      const bundle: ExportBundle = {
        version: 1,
        exportedAt: new Date().toISOString(),
        userId: user.id,
        tables: {},
      };

      await Promise.all(
        tables.map(async (table) => {
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('user_id', user.id);

          if (error) throw new Error(`Erro ao exportar ${TABLE_LABELS[table]}: ${error.message}`);

          // Strip user_id from each row before export (re-added on import)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          bundle.tables[table] = (data || []).map(({ user_id: _uid, ...rest }: any) => rest);
        })
      );

      const label = tables.length === 3 ? 'completo' : tables.map(t => TABLE_LABELS[t]).join('-');
      downloadJson(bundle, `omnicore-backup-${label}-${todaySlug()}.json`);

      const total = Object.values(bundle.tables).reduce((s, arr) => s + (arr?.length ?? 0), 0);
      toast.success(`Exportados ${total} registros com sucesso!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar.');
    }

    setExporting(false);
  }

  // ── IMPORT — file pick ────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string) as ExportBundle;

        if (raw.version !== 1 || !raw.tables) {
          toast.error('Arquivo inválido. Use um backup gerado pelo OmniCore.');
          return;
        }

        const prev: ImportPreview = {
          clients:      raw.tables.clients?.length      ?? 0,
          services:     raw.tables.services?.length     ?? 0,
          mac_addresses: raw.tables.mac_addresses?.length ?? 0,
        };

        setPendingBundle(raw);
        setPreview(prev);
        setConfirmOpen(true);
      } catch {
        toast.error('Arquivo JSON inválido ou corrompido.');
      }
    };
    reader.readAsText(file);
  }

  // ── IMPORT — confirm & execute ────────────────────────────

  async function handleImportConfirm() {
    if (!user || !pendingBundle) return;
    setImporting(true);
    setConfirmOpen(false);

    let inserted = 0;
    let errors = 0;

    try {
      const { tables } = pendingBundle;

      // Helper: upsert a batch, re-attaching user_id
      async function upsertBatch<T extends object>(
        table: TableName,
        rows: T[],
        conflictCol: string,
      ) {
        if (!rows.length) return;

        const payload = rows.map((r) => ({ ...r, user_id: user.id }));

        // Upsert in chunks of 100 to avoid request size limits
        for (let i = 0; i < payload.length; i += 100) {
          const chunk = payload.slice(i, i + 100);
          const { error } = await supabase
            .from(table)
            .upsert(chunk, { onConflict: conflictCol });

          if (error) {
            console.error(`[import] ${table} chunk error:`, error.message);
            errors += chunk.length;
          } else {
            inserted += chunk.length;
          }
        }
      }

      if (tables.clients?.length)
        await upsertBatch('clients', tables.clients, 'id');

      if (tables.services?.length)
        await upsertBatch('services', tables.services, 'id');

      if (tables.mac_addresses?.length)
        await upsertBatch('mac_addresses', tables.mac_addresses, 'id');

      if (errors === 0) {
        toast.success(`Importação concluída! ${inserted} registros inseridos/atualizados.`);
      } else {
        toast.warning(`Importação parcial: ${inserted} ok, ${errors} com erro.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro durante a importação.');
    }

    setPendingBundle(null);
    setPreview(null);
    setImporting(false);
  }

  // ── render ────────────────────────────────────────────────

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center gap-2">
        {/* EXPORT dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting}>
              {exporting
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Download className="h-4 w-4 mr-2" />}
              Exportar
              <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Exportar como JSON
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleExport(['clients', 'services', 'mac_addresses'])}>
              <FileJson className="h-4 w-4 mr-2 text-primary" />
              Tudo (Backup completo)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleExport(['clients'])}>
              <Download className="h-4 w-4 mr-2" />
              Apenas Clientes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport(['services'])}>
              <Download className="h-4 w-4 mr-2" />
              Apenas Serviços
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport(['mac_addresses'])}>
              <Download className="h-4 w-4 mr-2" />
              Apenas MACs
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* IMPORT button */}
        <Button
          variant="outline"
          size="sm"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
        >
          {importing
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            : <Upload className="h-4 w-4 mr-2" />}
          Importar
        </Button>
      </div>

      {/* Import confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!importing) setConfirmOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirmar importação
            </DialogTitle>
            <DialogDescription>
              Os registros existentes com o mesmo ID serão <strong>atualizados</strong>.
              Novos registros serão inseridos. Nenhum dado será apagado.
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
              <p className="text-sm font-medium mb-3">Registros no arquivo:</p>
              {(
                [
                  ['clients',      'Clientes'],
                  ['services',     'Serviços'],
                  ['mac_addresses','MACs'],
                ] as [keyof ImportPreview, string][]
              ).map(([key, label]) => (
                preview[key] > 0 && (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      {label}
                    </span>
                    <Badge variant="secondary">{preview[key]} registros</Badge>
                  </div>
                )
              ))}
              {pendingBundle?.exportedAt && (
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  Backup de: {new Date(pendingBundle.exportedAt).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setConfirmOpen(false); setPendingBundle(null); setPreview(null); }}
            >
              Cancelar
            </Button>
            <Button onClick={handleImportConfirm}>
              <Upload className="h-4 w-4 mr-2" />
              Importar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
