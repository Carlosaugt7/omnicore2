import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Transaction = Database['public']['Tables']['transactions']['Row'];

/**
 * Hook reutilizável para carregar todas as transações do usuário.
 * Pagina automaticamente em lotes de 1.000 para superar o limite padrão do PostgREST.
 */
export function useTransactions(userId: string | undefined) {
  return useQuery({
    queryKey: ['transactions', userId],
    queryFn: async (): Promise<Transaction[]> => {
      if (!userId) return [];
      const all: Transaction[] = [];
      const pageSize = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      return all;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
