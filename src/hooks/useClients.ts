import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];

/**
 * Hook reutilizável para carregar todos os clientes do usuário.
 * Usa React Query para cache automático, retry e invalidação.
 */
export function useClients(userId: string | undefined) {
  return useQuery({
    queryKey: ['clients', userId],
    queryFn: async (): Promise<Client[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 30_000, // 30 segundos antes de revalidar
  });
}
