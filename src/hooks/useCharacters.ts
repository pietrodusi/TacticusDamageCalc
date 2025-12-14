import { useQuery } from '@tanstack/react-query';
import { getCharacterList, getCharacter, getCharacterByName } from '../services/dataService';

export function useCharacterList() {
  return useQuery({
    queryKey: ['characters'],
    queryFn: () => getCharacterList(),
    staleTime: Infinity, // Static data never goes stale
  });
}

export function useCharacter(idOrName: string) {
  return useQuery({
    queryKey: ['character', idOrName],
    queryFn: () => {
      // Try by ID first, then by name
      const byId = getCharacter(idOrName);
      if (byId) return byId;
      return getCharacterByName(idOrName);
    },
    enabled: !!idOrName,
    staleTime: Infinity, // Static data never goes stale
  });
}
