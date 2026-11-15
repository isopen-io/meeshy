import { getCacheStore, type CacheStore } from '../CacheStore';

/**
 * Le registre des OUVERTURES non refermées (#10483).
 *
 * Le web, iOS (visiteur) et Android envoient DEUX événements `view` par
 * ouverture : un sans durée à l'ouverture, un AVEC durée à la sortie. Compter
 * les deux montait `viewCount` de 2 pour une seule ouverture. Un émetteur
 * publié (les réels d'Android) n'envoie, lui, qu'UNE vue avec durée, à la
 * sortie : elle doit rester comptée.
 *
 * D'où la règle, posée côté passerelle pour tous les clients, anciens compris :
 *
 *  - une vue SANS durée est une ouverture : elle compte, et le registre la
 *    note pour ce lecteur sur ce post ;
 *  - une vue AVEC durée referme l'ouverture notée la plus récente du même
 *    lecteur sur le même post : elle ne porte que la durée ;
 *  - une vue avec durée sans ouverture notée est une ouverture complète
 *    (émetteur à événement unique) : elle compte.
 *
 * Le registre est un COMPTEUR par (post, lecteur) — deux ouvertures suivies de
 * deux sorties font deux vues — qui expire au bout d'une heure : une sortie
 * plus tardive compte comme une ouverture. Il vit dans Redis, et dans la
 * mémoire du processus (purgée par TTL) quand Redis manque (`CacheStore`).
 * Le lecteur y est désigné par son identifiant de compte ou sa clé de lecteur
 * HMAC — jamais par un jeton ni une adresse.
 */
export type ViewOpenLedger = {
  /** Note une ouverture du lecteur sur le post. */
  readonly noteOpen: (postId: string, readerId: string) => Promise<void>;
  /** Referme l'ouverture notée la plus récente. `true` quand il y en avait une. */
  readonly closeOpen: (postId: string, readerId: string) => Promise<boolean>;
};

export const VIEW_OPEN_TTL_SECONDS = 60 * 60;

const keyOf = (postId: string, readerId: string) => `reach:open:${postId}:${readerId}`;

const pendingOf = (value: string | null): number => {
  const parsed = Number.parseInt(value ?? '0', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export function cacheViewOpenLedger(store: () => CacheStore = getCacheStore): ViewOpenLedger {
  return {
    noteOpen: async (postId, readerId) => {
      const key = keyOf(postId, readerId);
      const pending = pendingOf(await store().get(key));
      await store().set(key, String(pending + 1), VIEW_OPEN_TTL_SECONDS);
    },
    closeOpen: async (postId, readerId) => {
      const key = keyOf(postId, readerId);
      const pending = pendingOf(await store().get(key));
      if (pending === 0) return false;
      if (pending === 1) await store().del(key);
      else await store().set(key, String(pending - 1), VIEW_OPEN_TTL_SECONDS);
      return true;
    },
  };
}

export const sharedViewOpenLedger: ViewOpenLedger = cacheViewOpenLedger();

type ViewOfReader = { readonly postId: string; readonly readerId: string; readonly durationMs?: number };

/**
 * `true` quand la vue est la SORTIE d'une ouverture déjà comptée : elle ne
 * porte que la durée. Un registre injoignable ne fait jamais perdre une vue :
 * dans le doute, elle compte.
 */
export async function isExitOfCountedOpen(ledger: ViewOpenLedger, view: ViewOfReader): Promise<boolean> {
  if (view.durationMs === undefined) return false;
  try {
    return await ledger.closeOpen(view.postId, view.readerId);
  } catch {
    return false;
  }
}

/**
 * Note l'ouverture d'une vue SANS durée, APRÈS qu'elle a été comptée — une
 * ouverture dont l'écriture a échoué ne doit pas avaler la sortie qui suit.
 */
export async function noteCountedOpen(ledger: ViewOpenLedger, view: ViewOfReader): Promise<void> {
  if (view.durationMs !== undefined) return;
  try {
    await ledger.noteOpen(view.postId, view.readerId);
  } catch {
    // Registre injoignable : la sortie comptera comme une ouverture.
  }
}
