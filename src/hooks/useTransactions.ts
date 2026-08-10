import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Transaction = Database['public']['Tables']['transactions']['Row'];

/**
 * Hook reutilizável para carregar todas as transações do usuário.
 * Usa React Query para cache automático, retry e invalidação.
 */
export function useTransactions(userId: string | undefined) {
  return useQuery({
    queryKey: ['transactions', userId],
    queryFn: async (): Promise<Transaction[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
