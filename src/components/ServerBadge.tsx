/**
 * ServerBadge — exibe o nome do servidor com uma cor distinta por servidor.
 * A cor é atribuída automaticamente com base na posição do servidor na paleta,
 * garantindo consistência visual em toda a aplicação.
 */

// Paleta de 10 cores distintas
export const SERVER_COLOR_PALETTE = [
  { bg: 'bg-emerald-500/15 dark:bg-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  { bg: 'bg-blue-500/15 dark:bg-blue-500/20',       text: 'text-blue-700 dark:text-blue-400',       dot: 'bg-blue-500' },
  { bg: 'bg-violet-500/15 dark:bg-violet-500/20',   text: 'text-violet-700 dark:text-violet-400',   dot: 'bg-violet-500' },
  { bg: 'bg-amber-500/15 dark:bg-amber-500/20',     text: 'text-amber-700 dark:text-amber-400',     dot: 'bg-amber-500' },
  { bg: 'bg-rose-500/15 dark:bg-rose-500/20',       text: 'text-rose-700 dark:text-rose-400',       dot: 'bg-rose-500' },
  { bg: 'bg-cyan-500/15 dark:bg-cyan-500/20',       text: 'text-cyan-700 dark:text-cyan-400',       dot: 'bg-cyan-500' },
  { bg: 'bg-orange-500/15 dark:bg-orange-500/20',   text: 'text-orange-700 dark:text-orange-400',   dot: 'bg-orange-500' },
  { bg: 'bg-pink-500/15 dark:bg-pink-500/20',       text: 'text-pink-700 dark:text-pink-400',       dot: 'bg-pink-500' },
  { bg: 'bg-teal-500/15 dark:bg-teal-500/20',       text: 'text-teal-700 dark:text-teal-400',       dot: 'bg-teal-500' },
  { bg: 'bg-indigo-500/15 dark:bg-indigo-500/20',   text: 'text-indigo-700 dark:text-indigo-400',   dot: 'bg-indigo-500' },
] as const;

export type ServerColor = typeof SERVER_COLOR_PALETTE[number];

/**
 * Builds a stable name → color map from a list of server name strings.
 * Names are sorted alphabetically so the same server always gets the same color
 * regardless of insertion order.
 */
export function buildServerColorMap(serverNames: (string | null | undefined)[]): Record<string, ServerColor> {
  const unique = Array.from(new Set(serverNames.filter(Boolean) as string[])).sort();
  const map: Record<string, ServerColor> = {};
  unique.forEach((name, i) => {
    map[name] = SERVER_COLOR_PALETTE[i % SERVER_COLOR_PALETTE.length];
  });
  return map;
}

interface ServerBadgeProps {
  name: string | null | undefined;
  colorMap: Record<string, ServerColor>;
}

export function ServerBadge({ name, colorMap }: ServerBadgeProps) {
  if (!name) return <span className="text-muted-foreground">-</span>;
  const color = colorMap[name] ?? SERVER_COLOR_PALETTE[0];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${color.bg} ${color.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot}`} />
      {name}
    </span>
  );
}
