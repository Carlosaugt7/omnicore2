import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Service = Database['public']['Tables']['services']['Row'];

/**
 * Hook reutilizável para carregar os serviços (catálogo) do usuário.
 */
export function useServices(userId: string | undefined) {
  return useQuery({
    queryKey: ['services', userId],
    queryFn: async (): Promise<Service[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('user_id', userId)
        .order('server_name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 60_000, // Catálogo de serviços muda pouco
  });
}
