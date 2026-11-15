import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';

import { prefetchArrival } from './prefetch';

/** L'INSTANCE, chargée en `import()` par la page d'arrivée (#8088) — hors de la première peinture. */
export function warmArrival(): Promise<void> {
  return prefetchArrival(appQueryClient, apiDeps);
}
