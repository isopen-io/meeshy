/**
 * Une session PROUVÉE par un lien n'a sa durée normale qu'une fois ADOPTÉE (#10477).
 *
 * Un lien magique ou une vérification d'adresse ouvre une session avant que
 * l'appareil ait décidé d'en vouloir : quand le lien prouve un AUTRE compte que
 * celui qui y est connecté (#10445, #10474), l'appareil garde la session en
 * mémoire et pose la question. Le refus la referme (`POST /auth/logout`), mais
 * tuer l'appli pendant la question ne garantit aucun `pagehide` : la session
 * prouvée restait ouverte côté passerelle pour toute sa durée.
 *
 * Elle naît donc avec une échéance de quelques minutes (`expiresAt`), et garde
 * dans `adoptedExpiresAt` celle qu'elle prendra si elle est adoptée. Elle est
 * adoptée au premier passage d'une porte d'authentification (REST, socket,
 * TUS) et au renouvellement : un client qui se SERT de la session l'adopte —
 * y compris un ancien client, qui ne sait rien de cette règle. La déconnexion,
 * qui est le refus, ne l'adopte pas (`adoptsSession: false` sur la route).
 *
 * `adoptedExpiresAt` nul (ou absent, pour toute session antérieure) : rien
 * n'est en attente. L'adoption est une écriture CONDITIONNELLE, unique : elle
 * ne touche qu'une ligne encore valide, encore vivante à l'instant de l'écrire
 * (jamais une session échue entre sa lecture et l'adoption) et encore en
 * attente, et une fois
 * l'attente levée, aucun passage suivant n'écrit plus rien.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { SessionLoginMethod } from '@meeshy/shared/utils/client-session';
import type { ProvenSessionAdoption } from '@meeshy/shared/utils/proven-session-adoption';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'SessionAdoption' });

declare module 'fastify' {
  interface FastifyContextConfig {
    /** `false` ⇒ franchir l'authentification de cette route n'adopte pas une session prouvée (#10477). */
    adoptsSession?: boolean;
  }
}

/** Ce que dure une session prouvée tant que l'appareil ne s'en est pas servi. */
export const PROVEN_SESSION_ADOPTION_WINDOW_MS = 10 * 60 * 1000;

const OPENED_BY_A_LINK: ReadonlySet<SessionLoginMethod> = new Set<SessionLoginMethod>([
  'magic_link',
  'email_verification',
]);

export type OpeningExpiry = {
  readonly expiresAt: Date;
  readonly adoptedExpiresAt: Date | null;
};

/**
 * L'échéance d'une session à sa naissance. Ouverte par un lien : la fenêtre
 * d'adoption, et l'échéance normale mise de côté. Autrement : l'échéance
 * normale, rien en attente.
 */
export function openingExpiry(params: {
  readonly loginMethod?: SessionLoginMethod;
  readonly expiresAt: Date;
  readonly now: Date;
}): OpeningExpiry {
  if (!params.loginMethod || !OPENED_BY_A_LINK.has(params.loginMethod)) {
    return { expiresAt: params.expiresAt, adoptedExpiresAt: null };
  }
  return {
    expiresAt: new Date(params.now.getTime() + PROVEN_SESSION_ADOPTION_WINDOW_MS),
    adoptedExpiresAt: params.expiresAt,
  };
}

/**
 * L'échéance d'adoption d'une ligne de session : son `expiresAt` tant qu'une
 * échéance normale attend dans `adoptedExpiresAt`, rien sinon. Lue sur la
 * LIGNE écrite, pour que ce que la passerelle sert soit ce qu'elle applique.
 */
export function adoptionDeadlineOf(row: { readonly expiresAt?: unknown; readonly adoptedExpiresAt?: unknown }): {
  readonly adoptBy?: Date;
} {
  if (!(row.adoptedExpiresAt instanceof Date) || !(row.expiresAt instanceof Date)) return {};
  return { adoptBy: row.expiresAt };
}

/**
 * La session telle qu'elle part vers le client : sans son échéance
 * d'adoption, qui ne voyage que par `adoptWithinSeconds`. Écartée ICI, pour
 * qu'aucune route ne compte sur son schéma de réponse pour la retirer.
 */
export function servedSession<S extends { readonly adoptBy?: Date }>(session: S): Omit<S, 'adoptBy'> {
  const { adoptBy: _adoptBy, ...served } = session;
  return served;
}

/**
 * Ce que la réponse d'une preuve par lien SERT au client (#10518) : les
 * secondes qui restent, sur l'horloge de la passerelle, avant l'échéance
 * d'adoption de la session. Jamais négatif, jamais plus que la fenêtre. Une
 * échéance absente ou illisible ne sert rien : le client garde son repli,
 * plus court. Ce délai INFORME ; l'adoption reste décidée par
 * `sessionAdmissionRefusal` et `adoptProvenSession`, sur la ligne.
 */
export function provenSessionAdoption(session: { readonly adoptBy?: Date }, now: Date): ProvenSessionAdoption {
  const deadline = session.adoptBy instanceof Date ? session.adoptBy.getTime() : Number.NaN;
  if (!Number.isFinite(deadline)) return {};
  const left = Math.min(Math.max(deadline - now.getTime(), 0), PROVEN_SESSION_ADOPTION_WINDOW_MS);
  return { adoptWithinSeconds: Math.floor(left / 1000) };
}

/**
 * Adopte la session nommée : elle prend l'échéance qu'elle attendait. Ne lève
 * jamais — une adoption manquée laisse la session courte et se retente au
 * passage suivant, elle ne refuse pas la requête en cours.
 */
export async function adoptProvenSession(
  prisma: Pick<PrismaClient, 'userSession'>,
  params: { readonly sessionId: string; readonly adoptedExpiresAt: Date; readonly now: Date }
): Promise<void> {
  try {
    await prisma.userSession.updateMany({
      where: {
        id: params.sessionId,
        isValid: true,
        expiresAt: { gt: params.now },
        adoptedExpiresAt: params.adoptedExpiresAt,
      },
      data: { expiresAt: params.adoptedExpiresAt, adoptedExpiresAt: null },
    });
  } catch (error: unknown) {
    logger.warn('Adoption de session prouvée en échec — retentée au prochain passage', {
      sessionId: params.sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
