import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLocalDateStr } from '@/lib/utils';

export interface OmniCoreMetrics {
  revenueThisMonth: number;
  revenuePrevMonth: number;
  toRenewCount: number;
  toRenewValue: number;
  overdueCount: number;
  overdueValue: number;
  renewalRate: number;
  activeCount: number;
  nextRevenue: number;
  finToReceive: number;
  finOverdue: number;
  finExpenses: number;
}

/**
 * Busca as métricas agregadas diretamente do PostgreSQL via RPC `get_omnicore_metrics`.
 * Elimina o limite de 1.000 linhas do PostgREST e garante precisão em qualquer escala.
 */
export function useMetrics(
  userId: string | undefined,
  todayStr?: string,
  monthStartStr?: string
) {
  const now = new Date();
  const resolvedToday = todayStr || getLocalDateStr(now);
  const resolvedMonthStart =
    monthStartStr || `${resolvedToday.slice(0, 7)}-01`;

  return useQuery({
    queryKey: ['omnicore_metrics', userId, resolvedToday, resolvedMonthStart],
    queryFn: async (): Promise<OmniCoreMetrics | null> => {
      if (!userId) return null;
      const { data, error } = await supabase.rpc('get_omnicore_metrics', {
        p_user_id: userId,
        p_today: resolvedToday,
        p_month_start: resolvedMonthStart,
      });

      if (error) {
        // Fallback gracioso se a migration da RPC ainda não tiver sido aplicada no banco
        console.warn('useMetrics RPC fallback:', error.message);
        return null;
      }

      return data as unknown as OmniCoreMetrics;
    },
    enabled: !!userId,
    staleTime: 30_000,
    retry: false,
  });
}
