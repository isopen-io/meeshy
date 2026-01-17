import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface UseVirtualizedListParams<T> {
  items: T[];
  estimateSize?: number;
  overscan?: number;
  enabled?: boolean;
}

/**
 * Hook pour virtualiser une liste de conversations avec @tanstack/react-virtual
 * Améliore les performances pour les listes longues en ne rendant que les éléments visibles
 */
export function useVirtualizedList<T>({
  items,
  estimateSize = 80,
  overscan = 5,
  enabled = true
}: UseVirtualizedListParams<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    enabled
  });

  return {
    parentRef,
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize()
  };
}
