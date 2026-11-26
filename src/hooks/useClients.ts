import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];

/**
 * Hook reutilizável para carregar todos os clientes do usuário.
 * Pagina automaticamente em lotes de 1.000 para superar o limite padrão do PostgREST.
 */
export function useClients(userId: string | undefined) {
  return useQuery({
    queryKey: ['clients', userId],
    queryFn: async (): Promise<Client[]> => {
      if (!userId) return [];
      const all: Client[] = [];
      const pageSize = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('clients')
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
    staleTime: 30_000, // 30 segundos antes de revalidar
  });
}
