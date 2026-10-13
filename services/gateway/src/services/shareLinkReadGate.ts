/**
 * LA PORTE de lecture d'une participation entrée par LIEN DE PARTAGE — un lien
 * ÉCHU la ferme.
 *
 * Le lien répond à DEUX questions sur la même ligne, et elles restent séparées
 * (doc-comment de `messages-list.ts`) : la PORTE, ici, et le PLANCHER de
 * lecture, rendu par `historyFloor.ts` — qui dit de lui-même qu'il ne refuse
 * pas un lien expiré. La porte vivait INLINE dans `GET /conversations/:id/messages`,
 * seule surface à la tenir : la liste des favoris de message (#7377) servait
 * donc encore le message vivant d'une conversation dont le fil refusait la
 * lecture (403 `SHARE_LINK_EXPIRED`). Une porte qu'une seule surface tient est
 * une porte qu'on contourne par la surface voisine — elle vit donc ici, et le
 * fil l'appelle comme les autres.
 *
 * La règle est celle du fil, à l'identique : seule la date d'expiration ferme ;
 * un lien INTROUVABLE (supprimé depuis la jointure) ne ferme rien — c'est un
 * autre chemin qui retire l'accès des invités d'un lien retiré (#3734).
 * `maxUses` n'y entre pas (#4827) : il compte des ADMISSIONS, pas un droit de
 * lire.
 */
import type { FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { logger } from '../utils/logger';
import { sendForbidden } from '../utils/response';
import type { HistoryReader } from './historyFloor';

/** Ce qu'il faut d'une ligne `ConversationShareLink` pour trancher. `null` = introuvable. */
export type ShareLinkExpiry = { readonly expiresAt?: Date | string | null } | null | undefined;

export function shareLinkHasExpired(link: ShareLinkExpiry, now: Date = new Date()): boolean {
  if (!link?.expiresAt) return false;
  return new Date(link.expiresAt).getTime() < now.getTime();
}

/**
 * La RÉPONSE d'une porte fermée — site unique, pour que le fil, la recherche,
 * les épinglés et le fil de réponses refusent avec les mêmes mots et le même
 * code machine (`SHARE_LINK_EXPIRED`), que les clients branchent.
 */
export const SHARE_LINK_EXPIRED_CODE = 'SHARE_LINK_EXPIRED';

export function refuseExpiredShareLink(reply: FastifyReply): void {
  return sendForbidden(reply, 'This share link has expired', { code: SHARE_LINK_EXPIRED_CODE });
}

/**
 * Forme PAR LECTEUR, pour les routes qui lisent UNE conversation sans avoir
 * d'autre raison de charger la ligne du lecteur (#7388) : la recherche, les
 * épinglés, le fil de réponses. Le fil (`messages-list.ts`) tient déjà la ligne
 * et le lien ; il n'appelle que `shareLinkHasExpired`.
 *
 * Le lecteur se lit par la même règle que le plancher
 * (`historyReaderFromAuthContext` : `participantId` d'abord), pour que les deux
 * réponses ne divergent pas sur qui est l'appelant.
 *
 * Propage ses erreurs — fail-CLOSED : le `try/catch` de la route en fait un 500,
 * jamais une lecture servie sur la foi d'une porte illisible.
 */
export async function readerShareLinkHasExpired(
  prisma: Pick<PrismaClient, 'participant' | 'conversationShareLink'>,
  params: { readonly conversationId: string; readonly reader: HistoryReader | null },
  now: Date = new Date(),
): Promise<boolean> {
  const { conversationId, reader } = params;
  if (!reader) return false;

  const row = await prisma.participant.findFirst({
    where: reader.kind === 'anonymous'
      ? { id: reader.participantId, conversationId, isActive: true }
      : { userId: reader.userId, conversationId, isActive: true },
    select: { shareLinkId: true },
  });
  if (!row?.shareLinkId) return false;

  const link = await prisma.conversationShareLink.findUnique({
    where: { id: row.shareLinkId },
    select: { expiresAt: true },
  });
  return shareLinkHasExpired(link, now);
}

/** Une participation telle que les lecteurs multi-conversations la chargent. */
export type LinkedParticipation = {
  readonly conversationId: string;
  readonly shareLinkId?: string | null;
};

/**
 * Forme ENSEMBLISTE pour les lectures qui traversent PLUSIEURS conversations
 * (la liste des favoris) : les conversations dont la porte est fermée, en UNE
 * lecture des seuls liens concernés.
 *
 * Fail-CLOSED : une lecture de liens qui échoue ferme toutes les conversations
 * dont un lien décidait — une porte illisible est une porte fermée, comme un
 * plancher illisible (`loadHistoryFloorsOrFail`). Les participations sans lien
 * ne dépendent de rien ici, et restent ouvertes quoi qu'il arrive.
 */
export async function loadExpiredShareLinkConversationIds(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  participations: readonly LinkedParticipation[],
  now: Date = new Date(),
): Promise<ReadonlySet<string>> {
  const linked = participations.filter(
    (participation): participation is LinkedParticipation & { readonly shareLinkId: string } =>
      typeof participation.shareLinkId === 'string' && participation.shareLinkId.length > 0,
  );
  if (linked.length === 0) return new Set();

  try {
    const links = await prisma.conversationShareLink.findMany({
      where: { id: { in: [...new Set(linked.map((participation) => participation.shareLinkId))] } },
      select: { id: true, expiresAt: true },
    });
    const expired = new Set(links.filter((link) => shareLinkHasExpired(link, now)).map((link) => link.id));
    return new Set(linked.filter((participation) => expired.has(participation.shareLinkId)).map((p) => p.conversationId));
  } catch (error) {
    logger.warn('[share-link-gate] lookup failed, closing every conversation a link decides', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Set(linked.map((participation) => participation.conversationId));
  }
}

/**
 * Le lien par lequel un INVITÉ est entré : la colonne de la participation
 * d'abord (`readerShareLinkHasExpired` lit la même), la session embarquée en
 * repli — les deux sont posées à l'entrée par lien (`link-admission.ts`).
 */
export type GuestShareLinkRow = {
  readonly shareLinkId?: string | null;
  readonly anonymousSession?: { readonly shareLinkId?: string | null } | null;
};

export function guestShareLinkId(guest: GuestShareLinkRow): string | null {
  return guest.shareLinkId || guest.anonymousSession?.shareLinkId || null;
}

/**
 * L'échéance du lien d'un invité — `null` sans lien, sans échéance, ou lien
 * introuvable (la règle du fil : un lien retiré révoque ses invités par
 * `revokeShareLinkGuests`, pas par cette porte).
 *
 * Propage ses erreurs — fail-CLOSED : la résolution de session qui l'appelle
 * refuse la session plutôt que de la servir sur la foi d'un lien illisible.
 */
export async function loadGuestShareLinkExpiry(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  guest: GuestShareLinkRow,
): Promise<Date | null> {
  return (await loadGuestShareLinkGate(prisma, guest)).expiresAt;
}

/**
 * Ce que la garde commune d'un invité lit de son lien, en UNE lecture :
 * l'échéance, et la révocation DIFFÉRÉE en attente (#10470) — un gros lien
 * fermé sans attendre l'éviction de ses invités. Erreurs propagées
 * (fail-CLOSED). Un lien INTROUVABLE n'a pas d'échéance, mais il est déclaré
 * (`missing`, #10492) : la garde commune refuse l'invité qui lui survit.
 */
export type GuestShareLinkGate = {
  readonly expiresAt: Date | null;
  readonly revocationPendingAt: Date | null;
  /** `null` : lien introuvable (ou sans lien) — `missing` dit lequel des deux. */
  readonly isActive: boolean | null;
  /** #10492 — l'invité porte un lien dont la ligne n'existe plus : la garde commune le refuse. */
  readonly missing: boolean;
};

export async function loadGuestShareLinkGate(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  guest: GuestShareLinkRow,
): Promise<GuestShareLinkGate> {
  const shareLinkId = guestShareLinkId(guest);
  if (!shareLinkId) return { expiresAt: null, revocationPendingAt: null, isActive: null, missing: false };
  const link = await prisma.conversationShareLink.findUnique({
    where: { id: shareLinkId },
    select: { expiresAt: true, guestRevocationPendingAt: true, isActive: true },
  });
  return {
    expiresAt: link?.expiresAt ? new Date(link.expiresAt) : null,
    revocationPendingAt: link?.guestRevocationPendingAt ? new Date(link.guestRevocationPendingAt) : null,
    isActive: typeof link?.isActive === 'boolean' ? link.isActive : null,
    missing: link === null || link === undefined,
  };
}

/**
 * LA GARDE COMMUNE d'un invité (#10437) : son lien a-t-il expiré ? Appelée par
 * les deux résolutions de session anonyme — `middleware/auth.ts` (toute
 * requête REST, lecture ou écriture) et `AuthHandler` (connexion socket, et
 * minuteur d'échéance d'une session déjà connectée). Les quatre portes de
 * lecture par route (#7388) restent : elles couvrent aussi l'inscrit entré par
 * lien, que cette garde ne voit pas.
 */
export async function guestShareLinkHasExpired(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  guest: GuestShareLinkRow,
  now: Date = new Date(),
): Promise<boolean> {
  return shareLinkHasExpired({ expiresAt: await loadGuestShareLinkExpiry(prisma, guest) }, now);
}

/** La cause TYPÉE d'un refus de session invitée pour lien échu — traduite en 403 `SHARE_LINK_EXPIRED`. */
export class ShareLinkExpiredError extends Error {
  constructor() {
    super('This share link has expired');
    this.name = 'ShareLinkExpiredError';
  }
}
