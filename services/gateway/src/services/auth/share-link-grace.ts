/**
 * **UNE ADRESSE NON PROUVÉE TIENT AU PLUS CINQ LIENS DE PARTAGE ACTIFS, ET
 * SEULEMENT PENDANT SON DÉLAI DE GRÂCE** (#9713, décision porteur 2026-10-08).
 *
 * La loi UNIQUE que lisent les deux portes par lesquelles un lien ENTRE dans
 * le compte des liens actifs :
 * - la CRÉATION (`POST /links`, `POST /conversations/:id/new-link`) — la garde
 *   `requireShareLinkGrace` (`middleware/verification-gates.ts`) ;
 * - la RÉOUVERTURE d'un lien de l'utilisateur (`PATCH /links/:linkId`,
 *   `/toggle`, `/extend`, toutes par `applyShareLinkUpdate`) : `isActive`
 *   rendu à `true`, ou une échéance passée repoussée. Sans elle, désactiver
 *   cinq liens, en créer cinq autres puis rouvrir les premiers contournait le
 *   plafond sans limite.
 *
 * Le délai est celui de #8238 tel que publier le lit (#8476) : `mayPublish`.
 *
 * @module services/auth/share-link-grace
 */

import type { AccountActivation } from '@meeshy/shared/types/account-activation';
import { ACTIVATION_SELECT, mayPublish, resolveAccountActivation } from './account-activation';
import { guardedTimeout } from '../../utils/guarded-timer';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'ShareLinkGrace' });

export const UNVERIFIED_ACTIVE_SHARE_LINK_CAP = 5;

/**
 * Un lien ACTIF : posé par `userId`, `isActive`, et sans échéance passée.
 * L'échéance se lit sous ses TROIS formes Mongo — `null`, ABSENTE (une ligne
 * écrite hors Prisma n'a pas la clé, et `{ expiresAt: null }` ne la matche
 * pas), ou future. Désactiver un lien libère sa place ; le rouvrir la reprend.
 * Un lien créé avec sa conversation compte comme les autres.
 */
export function activeShareLinksWhere(userId: string, now: Date) {
  return {
    createdBy: userId,
    isActive: true,
    OR: [{ expiresAt: null }, { expiresAt: { isSet: false } }, { expiresAt: { gt: now } }],
  };
}

type ShareLinkCounter = {
  readonly conversationShareLink: {
    count(args: { where: ReturnType<typeof activeShareLinksWhere> }): Promise<number>;
  };
};

export type ShareLinkGraceVerdict = 'unlimited' | 'within-cap' | 'cap-reached' | 'grace-over';

export const shareLinkGraceAllows = (verdict: ShareLinkGraceVerdict): boolean =>
  verdict === 'unlimited' || verdict === 'within-cap';

/**
 * Le verdict, et lui seul — l'appelant le lit SOUS le tour du compte
 * (`withShareLinkTurn`) pour que personne ne s'intercale entre le comptage et
 * l'écriture qu'il autorise.
 */
export async function shareLinkGraceVerdict(params: {
  readonly prisma: ShareLinkCounter;
  readonly userId: string;
  readonly emailVerifiedAt: Date | string | null | undefined;
  readonly activation: AccountActivation | undefined;
  readonly now: Date;
}): Promise<ShareLinkGraceVerdict> {
  if (params.emailVerifiedAt) return 'unlimited';
  if (!mayPublish(params.activation)) return 'grace-over';
  const active = await params.prisma.conversationShareLink.count({
    where: activeShareLinksWhere(params.userId, params.now),
  });
  return active < UNVERIFIED_ACTIVE_SHARE_LINK_CAP ? 'within-cap' : 'cap-reached';
}

/** Un tour qui n'est jamais rendu (réponse jamais close) s'éteint seul. */
export const SHARE_LINK_TURN_TTL_MS = 30_000;

/**
 * LES CRÉATIONS ET RÉOUVERTURES D'UN COMPTE PASSENT UNE PAR UNE, sur cette
 * instance. Le comptage précède l'insertion de toute la durée du
 * gestionnaire : sans tour, N créations simultanées au 4e lien liraient
 * toutes 4 et passeraient toutes. Le tour couvre le comptage ET l'écriture —
 * le suivant compte une fois le précédent écrit, donc ni dépassement ni refus
 * à tort par double compte. Il ne sert qu'aux adresses non prouvées en grâce :
 * une adresse prouvée ne compte rien et n'attend personne.
 *
 * Une chaîne de promesses par compte, effacée quand elle se vide. Un tour
 * jamais rendu s'éteint après `SHARE_LINK_TURN_TTL_MS` — le suivant n'attend
 * jamais plus que cela.
 */
const shareLinkTurns = new Map<string, Promise<void>>();

export async function takeShareLinkTurn(userId: string): Promise<() => void> {
  const previous = shareLinkTurns.get(userId) ?? Promise.resolve();
  let open: () => void = () => undefined;
  const mine = new Promise<void>((resolve) => {
    open = resolve;
  });
  const tail = previous.then(() => mine);
  shareLinkTurns.set(userId, tail);

  let waitTimer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    previous,
    new Promise<void>((resolve) => {
      waitTimer = setTimeout(resolve, SHARE_LINK_TURN_TTL_MS);
      waitTimer.unref?.();
    }),
  ]);
  clearTimeout(waitTimer);

  let released = false;
  const holdTimer = guardedTimeout({ name: 'share-link-turn-hold', afterMs: SHARE_LINK_TURN_TTL_MS, logger, run: () => release() });
  holdTimer.unref?.();
  function release(): void {
    if (released) return;
    released = true;
    clearTimeout(holdTimer);
    open();
    if (shareLinkTurns.get(userId) === tail) shareLinkTurns.delete(userId);
  }
  return release;
}

export async function withShareLinkTurn<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const release = await takeShareLinkTurn(userId);
  try {
    return await work();
  } finally {
    release();
  }
}

/**
 * Refus d'une RÉOUVERTURE — levé par `applyShareLinkUpdate`, rendu en 403
 * `SHARE_LINK_CREATOR_EMAIL_NOT_VERIFIED` par les trois routes qui
 * l'appellent (`sendShareLinkGraceRefusal(…, 'reopen')`).
 */
export class ShareLinkGraceRefusedError extends Error {
  constructor(readonly verdict: Exclude<ShareLinkGraceVerdict, 'unlimited' | 'within-cap'>) {
    super('Share link grace refused');
    this.name = 'ShareLinkGraceRefusedError';
  }
}

type ShareLinkRow = {
  readonly isActive: boolean;
  readonly expiresAt: Date | null;
  readonly createdBy: string;
};

type ShareLinkReopenPrisma = ShareLinkCounter & {
  readonly conversationShareLink: {
    findUnique(args: {
      where: { id: string };
      select: { isActive: true; expiresAt: true; createdBy: true };
    }): Promise<ShareLinkRow | null>;
  };
  readonly user: {
    findUnique(args: {
      where: { id: string };
      select: typeof ACTIVATION_SELECT;
    }): Promise<{ createdAt: Date; emailVerifiedAt: Date | null; phoneNumber: string | null; emailReleasedAt?: Date | null } | null>;
  };
};

const isLive = (row: { isActive: boolean; expiresAt: Date | null | undefined }, now: Date): boolean =>
  row.isActive && (row.expiresAt === null || row.expiresAt === undefined || row.expiresAt.getTime() > now.getTime());

/** Les écritures qui peuvent faire ENTRER un lien dans le compte. */
export const mayReopenShareLink = (data: Record<string, unknown>): boolean =>
  data.isActive === true || 'expiresAt' in data;

/**
 * Le lien entre-t-il dans le compte par cette écriture ? Seul cas qui consulte
 * la loi : il n'était pas actif, il le devient. Le plafond est celui du
 * CRÉATEUR du lien (`createdBy`), quel que soit celui qui le rouvre — ses
 * liens actifs sont ce que la loi borne.
 *
 * À appeler SOUS le tour du créateur (`withShareLinkTurn(createdBy, …)`).
 * Rend la main quand l'écriture peut avoir lieu ; lève
 * `ShareLinkGraceRefusedError` sinon. Fail-closed : un créateur introuvable
 * n'a pas d'adresse prouvée.
 */
export async function assertShareLinkMayReopen(params: {
  readonly prisma: ShareLinkReopenPrisma;
  readonly row: ShareLinkRow;
  readonly data: Record<string, unknown>;
  readonly now: Date;
}): Promise<void> {
  const { prisma, row, data, now } = params;
  const after = {
    isActive: typeof data.isActive === 'boolean' ? data.isActive : row.isActive,
    expiresAt: 'expiresAt' in data ? (data.expiresAt as Date | null) : row.expiresAt,
  };
  if (isLive(row, now) || !isLive(after, now)) return;

  const creator = await prisma.user.findUnique({ where: { id: row.createdBy }, select: ACTIVATION_SELECT });
  const verdict = await shareLinkGraceVerdict({
    prisma,
    userId: row.createdBy,
    emailVerifiedAt: creator?.emailVerifiedAt ?? null,
    activation: creator ? resolveAccountActivation(creator, now) : undefined,
    now,
  });
  if (verdict === 'cap-reached' || verdict === 'grace-over') throw new ShareLinkGraceRefusedError(verdict);
}

export type { ShareLinkRow, ShareLinkReopenPrisma };
