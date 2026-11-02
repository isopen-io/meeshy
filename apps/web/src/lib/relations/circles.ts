import { relationLevelIfAtLeast, relationRungAfter, type RelationLevel, type RelationRequestLevel } from '@meeshy/shared/types/relation';
import { evaluateRelationRequest } from '@meeshy/shared/utils/relation-request';

import type { FriendRequestRecord } from '@/lib/api/friend-requests';
import type { RelationLink } from '@/lib/api/relations';

/**
 * **« MES CERCLES », LES RÈGLES PURES** (#13938) — miroir de `CirclesViewModel`
 * (sections, demandes de montée, cran en attente) et de `CircleProgressSummary`
 * (`apps/ios/Meeshy/Features/Contacts/CirclesPresentation.swift`). Sans état,
 * sans I/O, jouables sans écran.
 *
 * **Le client ne décide d'aucun niveau.** Il lit ce que le serveur sert
 * (`progress`, `eligibleFor`) et ce que la loi de demande lui laisse PROPOSER —
 * `evaluateRelationRequest`, la fonction même que la passerelle rend, importée
 * de `@meeshy/shared` : le web la CONSOMME, il n'en écrit aucun miroir. Le
 * cool-down n'est pas servi (un refus ne fuit pas) : le serveur le dit une fois,
 * à la demande.
 */

/** Les niveaux qu'on liste, du plus proche au plus lointain. Public et Communauté ne sont pas des liens. */
export const CIRCLE_LEVELS = ['BLOOD', 'CLOSE', 'FRIEND', 'ACQUAINTANCE'] as const satisfies readonly RelationLevel[];

export type CircleLevel = (typeof CIRCLE_LEVELS)[number];

export type CircleSection = { readonly level: CircleLevel; readonly links: readonly RelationLink[] };

export const listedLinks = (links: readonly RelationLink[]): readonly RelationLink[] =>
  links.filter((link) => relationLevelIfAtLeast(link.effectiveLevel, 'ACQUAINTANCE') !== null);

const LAST = '\u{FFFF}';

export function circleSections(links: readonly RelationLink[], nameOf: (userId: string) => string | null): readonly CircleSection[] {
  const sortKey = (link: RelationLink): string => `${(nameOf(link.userId) ?? LAST).toLocaleLowerCase()}${link.userId}`;
  return CIRCLE_LEVELS.flatMap((level) => {
    const rows = listedLinks(links)
      .filter((link) => link.effectiveLevel === level)
      .map((link) => [sortKey(link), link] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, link]) => link);
    return rows.length === 0 ? [] : [{ level, links: rows }];
  });
}

export type RaiseOffer =
  | { readonly kind: 'available'; readonly target: RelationRequestLevel }
  | { readonly kind: 'locked'; readonly target: RelationRequestLevel }
  | { readonly kind: 'none' };

/** Le cran suivant, ouvert ou verrouillé selon la loi de demande ; plus rien au sommet. */
export function raiseOffer(link: RelationLink, now: Date): RaiseOffer {
  const target = relationRungAfter(link.effectiveLevel);
  if (target === null) return { kind: 'none' };
  const verdict = evaluateRelationRequest({ targetLevel: target, currentLevel: link.effectiveLevel, eligibleFor: link.eligibleFor, cooldownUntil: null, now });
  return verdict.allowed ? { kind: 'available', target } : { kind: 'locked', target };
}

export const MISSING_PIECES = ['message', 'reaction', 'postView', 'audio', 'other'] as const;
export type MissingPiece = (typeof MISSING_PIECES)[number];

const pieceOf = (wire: string): MissingPiece => MISSING_PIECES.find((piece) => piece === wire && piece !== 'other') ?? 'other';

export type ProgressSummary =
  | { readonly kind: 'missing'; readonly pieces: readonly MissingPiece[] }
  | { readonly kind: 'eligible'; readonly target: RelationRequestLevel }
  | { readonly kind: 'weeks'; readonly done: number; readonly needed: number }
  | { readonly kind: 'none' };

/**
 * Ce que la ligne DIT : ce qui MANQUE d'abord (« il manque un message audio »),
 * puis ce qu'on PEUT demander, puis où l'on en est (« semaines d'affilée : 3 sur
 * 4 »), puis rien.
 */
export function progressSummary(link: RelationLink, now: Date): ProgressSummary {
  if (link.progress.missing.length > 0) {
    const pieces = link.progress.missing.map(pieceOf).filter((piece, index, all) => all.indexOf(piece) === index);
    return { kind: 'missing', pieces };
  }
  const offer = raiseOffer(link, now);
  if (offer.kind === 'available') return { kind: 'eligible', target: offer.target };
  const { needed, activeWeeks } = link.progress;
  if (offer.kind === 'none' || needed === null || needed <= 0) return { kind: 'none' };
  return { kind: 'weeks', done: Math.min(activeWeeks, needed), needed };
}

/** Le cran qu'une demande vise ; sans cran servi, Ami — le sens historique. */
export const requestedLevelOf = (request: FriendRequestRecord): RelationRequestLevel => request.targetLevel ?? 'FRIEND';

const isPending = (request: FriendRequestRecord): boolean => request.status === 'pending';

/**
 * Les demandes de MONTÉE : celles, en attente, d'une personne déjà dans mes
 * cercles. Une PROJECTION des paniers `received` / `sent` — la même source que
 * l'onglet « Demandes » et la pastille, jamais un second cache.
 */
export function raiseRequests(params: {
  readonly links: readonly RelationLink[];
  readonly received: readonly FriendRequestRecord[];
  readonly sent: readonly FriendRequestRecord[];
}): { readonly incoming: readonly FriendRequestRecord[]; readonly outgoing: readonly FriendRequestRecord[] } {
  const linked = new Set(listedLinks(params.links).map((link) => link.userId));
  return {
    incoming: params.received.filter((request) => isPending(request) && linked.has(request.senderId)),
    outgoing: params.sent.filter((request) => isPending(request) && linked.has(request.receiverId)),
  };
}

/** Le cran que j'ai demandé à cette personne et qui attend sa réponse — la ligne provisoire comprise. */
export function pendingRaiseOf(sent: readonly FriendRequestRecord[], userId: string): RelationRequestLevel | null {
  const request = sent.find((row) => isPending(row) && row.receiverId === userId);
  return request === undefined ? null : requestedLevelOf(request);
}
