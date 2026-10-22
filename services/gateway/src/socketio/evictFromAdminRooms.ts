import { ROOMS } from '@meeshy/shared/types/socketio-events';
import type { ServerRoomSocket } from './serverEmit';

/**
 * Les rangs qui ENTRENT dans les rooms d'administration — les mêmes que
 * `requireAdminRank()` (`middleware/authorize.ts`) et que l'abonnement
 * `admin-metrics:subscribe` / `admin-agent:subscribe`. Une seule liste : le jour où
 * un rang s'ajoute, l'éviction et l'admission bougent ensemble.
 */
const ADMIN_RANKS: readonly string[] = ['BIGBOSS', 'ADMIN'];

export const isAdminRank = (role: string | null | undefined): boolean =>
  typeof role === 'string' && ADMIN_RANKS.includes(role);

/** Les rooms qu'un socket ne tient que par son rang, et perd avec lui. */
export const ADMIN_ROOMS: readonly string[] = [ROOMS.adminHostMetrics(), ROOMS.adminAgent()];

export interface AdminRoomIO {
  in(room: string): { fetchSockets(): Promise<readonly ServerRoomSocket[]> };
}

export interface EvictFromAdminRoomsParams {
  readonly io: AdminRoomIO | null | undefined;
  /** `User.id` — les sockets d'un inscrit rejoignent `ROOMS.user(id)` à l'authentification. */
  readonly userId: string;
  readonly onError?: (error: unknown) => void;
}

/**
 * Un administrateur RÉTROGRADÉ sort des rooms d'administration dans le geste qui le
 * rétrograde (#10459 point 1).
 *
 * Un socket ne vérifie son rang qu'à l'ABONNEMENT ; sans cette éviction, un ADMIN
 * passé USER continuait de recevoir `admin-metrics:sample` et les événements de
 * l'agent jusqu'à sa déconnexion. La room personnelle est la seule adresse qui
 * nomme tous les sockets d'un compte (multi-appareil compris) ; chacun quitte les
 * rooms d'administration, et quitter une room qu'on ne tient pas est un no-op.
 *
 * Rend le nombre de sockets traités. Ne rejette jamais : la rétrogradation est déjà
 * écrite et tracée, et `AdminMetricsHandler` revérifie le rang de la room chaque
 * minute — l'éviction immédiate est le premier verrou, pas le seul.
 */
export async function evictFromAdminRooms({ io, userId, onError }: EvictFromAdminRoomsParams): Promise<number> {
  if (!io) return 0;
  try {
    const sockets = await io.in(ROOMS.user(userId)).fetchSockets();
    await Promise.all(
      sockets.flatMap((socket) => ADMIN_ROOMS.map((room) => Promise.resolve(socket.leave(room)).catch(() => undefined))),
    );
    return sockets.length;
  } catch (error) {
    onError?.(error);
    return 0;
  }
}
