import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { incrementPostCounters } from './postCounters';
import { NOT_DELETED } from './postIncludes';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { errorIdentity } from '../../utils/error-identity';
import { isExitOfCountedOpen, noteCountedOpen, sharedViewOpenLedger, type ViewOpenLedger } from './viewOpenLedger';
import { viewBreakdowns, viewProvenanceRow, type ViewContext } from './viewProvenance';

const log = enhancedLogger.child({ module: 'postViewCredit' });

type PostViewCreditPrisma = Pick<PrismaClient, 'postView' | '$runCommandRaw'>;

/**
 * La vue d'UN compte sur UN post (#10483, règle du porteur 2026-10-13) :
 *
 *  - `viewCount` compte CHAQUE vue — un même lecteur peut revoir autant qu'il
 *    le veut, chaque fois compte (`repeat`, vrai par défaut) ;
 *  - la PREMIÈRE vue crée le singleton `PostView` (postId,userId) — la liste
 *    « vu par » — et monte `uniqueViewCount` ;
 *  - une ré-ouverture promeut `duration` au maximum, jamais en dessous ;
 *  - la SORTIE d'une ouverture déjà comptée (vue avec durée qui suit une vue
 *    sans durée du même lecteur, `viewOpenLedger.ts`) ne porte que la durée :
 *    une ouverture est UNE vue, même quand le client en envoie deux.
 *
 * Appliquée IDENTIQUEMENT au post affiché et à la racine d'un repost.
 * `repeat: false` (l'engagement d'un lecteur, #10404) ne crédite que la
 * première vue : réagir n'est pas rouvrir.
 *
 * Retourne `true` UNIQUEMENT à la création du `PostView` (première vue).
 */
export async function creditPostView(
  prisma: PostViewCreditPrisma,
  { postId, userId, durationMs, surface, provenance, origin, repeat = true, ledger = sharedViewOpenLedger }: {
    readonly postId: string;
    readonly userId: string;
    readonly durationMs?: number;
    readonly repeat?: boolean;
    readonly ledger?: ViewOpenLedger;
  } & ViewContext,
): Promise<boolean> {
  const context: ViewContext = { surface, provenance, origin };
  const view = { postId, readerId: userId, durationMs, context };
  const existing = await prisma.postView.findUnique({
    where: { postId_userId: { postId, userId } },
  });

  if (existing) {
    await promoteDuration(prisma, existing, durationMs);
    if (repeat) await creditRepeatView(prisma, ledger, view);
    return false;
  }

  try {
    await prisma.postView.create({
      data: { postId, userId, duration: durationMs, ...(surface ? { surface } : {}), ...viewProvenanceRow(context) },
    });
  } catch (error) {
    if (!isUniqueRace(error)) throw error;
    if (repeat) await creditRepeatView(prisma, ledger, view);
    return false;
  }

  await incrementPostCounters(prisma, [postId], {
    viewCount: { increment: 1 },
    uniqueViewCount: { increment: 1 },
    breakdowns: viewBreakdowns(context),
  });
  if (repeat) await noteCountedOpen(ledger, view);

  return true;
}

/** Une vue d'un lecteur déjà venu : comptée, sauf la sortie d'une ouverture déjà comptée. */
async function creditRepeatView(
  prisma: PostViewCreditPrisma,
  ledger: ViewOpenLedger,
  view: { readonly postId: string; readonly readerId: string; readonly durationMs?: number; readonly context: ViewContext },
): Promise<void> {
  if (await isExitOfCountedOpen(ledger, view)) return;
  await incrementPostCounters(prisma, [view.postId], {
    viewCount: { increment: 1 },
    breakdowns: viewBreakdowns(view.context),
  });
  await noteCountedOpen(ledger, view);
}

/**
 * Le `PostView` est un singleton (postId,userId) : `duration` est le signal
 * watch-time du moteur reco/monétisation (cf. PostFeedService). Une
 * ré-ouverture plus courte ne rétrograde JAMAIS la plus longue durée observée.
 */
async function promoteDuration(
  prisma: PostViewCreditPrisma,
  existing: { readonly id: string; readonly duration: number | null },
  durationMs: number | undefined,
): Promise<void> {
  if (durationMs === undefined) return;
  const nextDuration = Math.max(existing.duration ?? 0, durationMs);
  if (nextDuration === existing.duration) return;
  await prisma.postView.update({ where: { id: existing.id }, data: { duration: nextDuration } });
}

const isUniqueRace = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

/**
 * #10404 — un lecteur qui RÉAGIT à un post ou le COMMENTE l'a vu : sa vue est
 * créditée, avec la dédup de `creditPostView` (une vue par lecteur et par
 * post). `viewCount` ne comptait que l'événement `view` explicite, que la carte
 * du fil n'émet pas en likant ni en commentant : « N likes, 0 vue ». Posé côté
 * passerelle, le crédit vaut pour tous les clients, anciens compris.
 *
 * L'auteur n'est jamais compté — la règle de `recordView`. `authorId` évite la
 * relecture quand l'appelant l'a déjà. Un crédit qui échoue ne fait jamais
 * échouer le geste qui l'a porté.
 */
export async function creditEngagedReaderView(
  prisma: PostViewCreditPrisma & Pick<PrismaClient, 'post'>,
  { postId, userId, authorId }: { readonly postId: string; readonly userId: string; readonly authorId?: string },
): Promise<void> {
  try {
    const author = authorId ?? (await prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      select: { authorId: true },
    }))?.authorId;
    if (!author || author === userId) return;
    await creditPostView(prisma, { postId, userId, repeat: false });
  } catch (error) {
    if (isUniqueRace(error)) return;
    log.warn('creditEngagedReaderView failed — gesture kept', {
      postId,
      error: errorIdentity(error),
    });
  }
}
