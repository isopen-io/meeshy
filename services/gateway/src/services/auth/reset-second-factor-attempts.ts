/**
 * Les essais de code 2FA d'un JETON de réinitialisation (#10866).
 *
 * Avec un jeton volé (boîte mail compromise — exactement ce que la 2FA doit
 * couvrir), `POST /auth/reset-password` laissait deviner le code TOTP sans
 * borne : un code faux ne consommait rien. Chaque essai RÉSERVE désormais un
 * rang, ATOMIQUEMENT, AVANT la vérification : cent requêtes parallèles
 * obtiennent cent rangs distincts, et seuls les cinq premiers sont vérifiés.
 * Un code JUSTE rend son rang (`release`) — un compte 2FA qui se trompe ensuite
 * de mot de passe ne brûle pas son lien sur des codes qui étaient bons.
 *
 * La clé est l'`id` de la ligne `PasswordResetToken` : jamais le jeton, jamais
 * le `tokenHash` que la base indexe.
 *
 * Le contrat admet `reserve` → `null` (« aucun compteur ») : l'appelant REFUSE
 * alors (fail-closed). Le magasin Redis ne le rend jamais — il se replie sur
 * la mémoire de l'instance.
 */

import type { Redis } from 'ioredis';

export const RESET_SECOND_FACTOR_MAX_ATTEMPTS = 5;

const WINDOW_SECONDS = 60 * 60;
const KEY_PREFIX = 'auth:reset-2fa:token';

export type ResetSecondFactorAttempts = {
  readonly reserve: (tokenId: string) => Promise<number | null>;
  readonly release: (tokenId: string) => Promise<void>;
};

const keyOf = (tokenId: string): string => `${KEY_PREFIX}:${tokenId}`;

/**
 * `INCR` et `EXPIRE … NX` dans UNE transaction : un rang ne peut pas exister
 * sans sa durée de vie. Sur une erreur Redis (client fermé après une panne,
 * `retryStrategy` épuisée), le compteur se REPLIE sur la mémoire de l'instance
 * au lieu de refuser : il borne encore les essais, et une panne Redis ne ferme
 * pas la réinitialisation à tous les comptes 2FA.
 */
function redisAttempts(redis: Redis, fallback: ResetSecondFactorAttempts): ResetSecondFactorAttempts {
  return {
    async reserve(tokenId) {
      try {
        const replies = await redis.multi().incr(keyOf(tokenId)).expire(keyOf(tokenId), WINDOW_SECONDS, 'NX').exec();
        const [incrError, rank] = replies?.[0] ?? [new Error('empty transaction'), null];
        if (incrError || typeof rank !== 'number') throw incrError ?? new Error('non-numeric rank');
        return rank;
      } catch {
        return fallback.reserve(tokenId);
      }
    },
    async release(tokenId) {
      await fallback.release(tokenId);
      try {
        const left = await redis.decr(keyOf(tokenId));
        if (left < 0) await redis.del(keyOf(tokenId));
      } catch {
        return;
      }
    },
  };
}

function memoryAttempts(now: () => number): ResetSecondFactorAttempts {
  const ranks = new Map<string, { readonly count: number; readonly expiresAt: number }>();
  const sweep = () => {
    const at = now();
    [...ranks.entries()].filter(([, entry]) => entry.expiresAt <= at).forEach(([key]) => ranks.delete(key));
  };
  return {
    async reserve(tokenId) {
      sweep();
      const current = ranks.get(tokenId);
      const next = { count: (current?.count ?? 0) + 1, expiresAt: current?.expiresAt ?? now() + WINDOW_SECONDS * 1000 };
      ranks.set(tokenId, next);
      return next.count;
    },
    async release(tokenId) {
      const current = ranks.get(tokenId);
      if (current === undefined) return;
      ranks.set(tokenId, { ...current, count: Math.max(0, current.count - 1) });
    },
  };
}

export function createResetSecondFactorAttempts(options: {
  readonly redis?: Redis | null;
  readonly now?: () => number;
} = {}): ResetSecondFactorAttempts {
  const memory = memoryAttempts(options.now ?? Date.now);
  return options.redis ? redisAttempts(options.redis, memory) : memory;
}
