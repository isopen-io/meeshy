/**
 * Un jeton n'ouvre une requête que si la session qu'il NOMME vit encore (#10328).
 *
 * Avant #10328, le REST (`middleware/auth.ts`) n'admettait pas une session
 * PROUVÉE révoquée, mais admettait une session INTROUVABLE — au motif qu'un
 * secondaire en retard de réplication rendrait `null` juste après un login.
 * Le motif ne tient pas dans ce déploiement : `DATABASE_URL` ne pose aucune
 * `readPreference` (le pilote lit le PRIMAIRE), le jeu de réplicas `rs0` n'a
 * qu'un membre, et chaque site d'émission crée la session AVANT de signer le
 * jeton qui la nomme (`routes/auth/login.ts`, `routes/auth/open-session.ts`,
 * `MagicLinkService`, `POST /refresh` qui garde le `sid`). Une ligne absente
 * est donc une session purgée par la rétention (`jobs/retention-sweep.ts`)
 * ou jamais émise — un jeton qui survit à sa session, ce que l'issue refuse.
 *
 * Une session ÉCHUE (`expiresAt` passé) est refusée elle aussi : le balayage
 * (`cleanupExpiredSessions`) l'invalide de toute façon à son passage suivant,
 * et la connexion socket la refusait déjà (#5712) — le REST cesse seulement
 * d'admettre dans l'intervalle.
 *
 * Une lecture qui LÈVE ne prouve rien dans aucun sens : ni admise (ce serait
 * ouvrir à n'importe quel jeton pendant une panne), ni refusée en 401 (les
 * clients se déconnecteraient en masse sur un accroc de la base). Elle lève
 * {@link SessionLookupUnavailableError}, que la porte REST rend en 503.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SESSION_CLAIM, legacyTokenRefusal, type LegacyTokenRefusal } from './session-jwt';
import { adoptProvenSession } from './session-adoption';

export type SessionAdmissionRefusal =
  | 'session-unknown'
  | 'session-revoked'
  | 'session-expired'
  | 'not-a-session-token'
  | LegacyTokenRefusal;

export class SessionLookupUnavailableError extends Error {
  constructor(readonly cause: unknown) {
    super('Session lookup unavailable');
    this.name = 'SessionLookupUnavailableError';
  }
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

type SessionClaims = {
  readonly [SESSION_CLAIM]?: unknown;
  readonly iat?: unknown;
  readonly action?: unknown;
  readonly aud?: unknown;
};

/**
 * Le motif du refus, ou `null` quand le jeton peut ouvrir la requête.
 *
 * Charge qui porte `action` ou une audience : un jeton d'USAGE (le lien
 * « ce n'était pas moi », #10493), jamais un jeton de session — refusé avant
 * toute lecture, quel que soit son `sid`. Jeton SANS `sid` : le butoir daté de
 * #4264 (`legacyTokenRefusal`), fermé depuis le 2026-09-30 — aucune lecture.
 * Jeton AVEC `sid` : la ligne nommée, lue par identité ET par propriétaire,
 * doit être valide et non échue.
 *
 * Admise, une session prouvée par un lien et encore en attente est ADOPTÉE
 * (#10477, `session-adoption.ts`) — sauf `adopt: false`, que pose la seule
 * déconnexion : refuser une session prouvée ne doit pas la prolonger.
 */
export async function sessionAdmissionRefusal(
  prisma: Pick<PrismaClient, 'userSession'>,
  params: {
    readonly claims: SessionClaims;
    readonly userId: string;
    readonly now: Date;
    readonly adopt?: boolean;
  }
): Promise<SessionAdmissionRefusal | null> {
  if (params.claims.action !== undefined || params.claims.aud !== undefined) {
    return 'not-a-session-token';
  }

  const sid = params.claims[SESSION_CLAIM];

  if (sid === undefined) {
    const iat = params.claims.iat;
    return legacyTokenRefusal({ iat: typeof iat === 'number' ? iat : undefined }, params.now);
  }

  if (typeof sid !== 'string' || !OBJECT_ID.test(sid) || !OBJECT_ID.test(params.userId ?? '')) {
    return 'session-unknown';
  }

  const session = await prisma.userSession
    .findFirst({
      where: { id: sid, userId: params.userId },
      select: { isValid: true, expiresAt: true, adoptedExpiresAt: true },
    })
    .catch((error: unknown) => {
      throw new SessionLookupUnavailableError(error);
    });

  if (!session) return 'session-unknown';
  if (!session.isValid) return 'session-revoked';
  if (session.expiresAt.getTime() <= params.now.getTime()) return 'session-expired';
  if (session.adoptedExpiresAt && params.adopt !== false) {
    await adoptProvenSession(prisma, { sessionId: sid, adoptedExpiresAt: session.adoptedExpiresAt, now: params.now });
  }
  return null;
}
