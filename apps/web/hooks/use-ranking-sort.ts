import { useMemo } from 'react';
import { RankingItem } from './use-ranking-data';

export type SortField = 'rank' | 'value' | 'name';
export type SortDirection = 'asc' | 'desc';

interface UseRankingSortParams {
  data: RankingItem[];
  sortField?: SortField;
  sortDirection?: SortDirection;
}

export function useRankingSort({
  data,
  sortField = 'rank',
  sortDirection = 'asc'
}: UseRankingSortParams) {
  const sortedData = useMemo(() => {
    if (!data.length) return data;

    return [...data].sort((a, b) => {
      let compareResult = 0;

      switch (sortField) {
        case 'rank':
          compareResult = (a.rank || 0) - (b.rank || 0);
          break;
        case 'value':
          compareResult = (a.value || 0) - (b.value || 0);
          break;
        case 'name':
          compareResult = (a.name || '').localeCompare(b.name || '');
          break;
      }

      return sortDirection === 'asc' ? compareResult : -compareResult;
    });
  }, [data, sortField, sortDirection]);

  return sortedData;
}
