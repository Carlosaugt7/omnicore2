import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Formatação ────────────────────────────────────────────────

/** Formata valor numérico em Real brasileiro (R$ X.XXX,XX) */
export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Retorna string de data YYYY-MM-DD no fuso local */
export function getLocalDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formata uma string de data YYYY-MM-DD para DD-MM-AAAA (pt-BR) ou DD/MM/AAAA */
export function formatDate(d: string | null | undefined, separator: '-' | '/' = '-'): string {
  if (!d) return '-';
  const clean = d.includes('T') ? d.split('T')[0] : d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [year, month, day] = clean.split('-');
    return `${day}${separator}${month}${separator}${year}`;
  }
  return clean;
}

/** Formata data para o padrão pt-BR DD-MM-AAAA */
export const formatDateBR = (d: string | null | undefined) => formatDate(d, '-');

/**
 * Calcula a próxima data de vencimento (+30 dias) de forma segura contra fuso horário.
 * Regra (Opção A):
 * - Se o vencimento atual for nulo ou estiver no passado (< hoje),
 *   adiciona 30 dias a partir de HOJE.
 * - Se o vencimento atual for no futuro (>= hoje),
 *   adiciona 30 dias a partir da data de vencimento atual.
 */
export function calculateNextDueDate(currentDueDateStr: string | null | undefined, days = 30): string {
  const todayStr = getLocalDateStr(new Date());
  const baseDateStr = (currentDueDateStr && currentDueDateStr >= todayStr) ? currentDueDateStr : todayStr;
  const [y, m, d] = baseDateStr.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  targetDate.setDate(targetDate.getDate() + days);
  return getLocalDateStr(targetDate);
}

// ── Status de clientes ────────────────────────────────────────

export const CLIENT_STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-green-500/10 text-green-500',
  vencido: 'bg-red-500/10 text-red-500',
  'à vencer': 'bg-yellow-500/10 text-yellow-500',
  suspenso: 'bg-red-500/10 text-red-500',
  cancelado: 'bg-muted text-muted-foreground',
};

/** Variante com bordas — usado pelo Broadcast para Badge variant="outline" */
export const CLIENT_STATUS_COLORS_BORDERED: Record<string, string> = {
  ativo: 'bg-green-500/10 text-green-500 border-green-500/20',
  vencido: 'bg-red-500/10 text-red-500 border-red-500/20',
  'à vencer': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  suspenso: 'bg-red-500/10 text-red-500 border-red-500/20',
  cancelado: 'bg-muted text-muted-foreground',
};

export const TRANSACTION_STATUS_COLORS: Record<string, string> = {
  pago: 'bg-green-500/10 text-green-500',
  pendente: 'bg-yellow-500/10 text-yellow-500',
  cancelado: 'bg-red-500/10 text-red-500',
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  renovacao: 'Renovação',
};

export const LOG_STATUS_COLORS: Record<string, string> = {
  success: 'bg-green-500/10 text-green-500',
  failed: 'bg-red-500/10 text-red-500',
  pending: 'bg-yellow-500/10 text-yellow-500',
};

// ── Cálculo de status dinâmico ────────────────────────────────

/** Interface mínima para calcular status de exibição do cliente */
export interface ClientDisplay {
  status: string;
  due_date: string | null;
}

/** Calcula o status de exibição baseado no status e data de vencimento */
export function getDisplayStatus(client: ClientDisplay): string {
  if (client.status === 'cancelado') return 'cancelado';
  if (client.status === 'suspenso') return 'suspenso';
  if (!client.due_date) return client.status;

  const now = new Date();
  const today = getLocalDateStr(now);

  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrow = getLocalDateStr(tomorrowDate);

  if (client.due_date < today) return 'vencido';
  if (client.due_date === today || client.due_date === tomorrow) return 'à vencer';
  return 'ativo';
}

// ── Templates de mensagem ─────────────────────────────────────

/** Substitui variáveis de template por dados do cliente */
export function replaceMessageVars(
  template: string,
  client: { name?: string | null; plan?: string | null; value?: number | string | null; due_date?: string | null; server?: string | null },
  pixKey?: string,
): string {
  const value =
    client.value != null
      ? Number(client.value).toFixed(2)
      : '0.00';

  const dueDate = client.due_date
    ? formatDate(client.due_date)
    : '-';

  return template
    .replace(/\{nome\}/gi, client.name || '')
    .replace(/\{plano\}/gi, client.plan || '')
    .replace(/\{valor\}/gi, value)
    .replace(/\{vencimento\}/gi, dueDate)
    .replace(/\{servidor\}/gi, client.server || '')
    .replace(/\{chavePix\}/gi, pixKey || '');
}
