import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  hasPerReaderEphemeralDeadline,
  inheritedEphemeralExpiresAt,
  isInheritedEphemeralServable,
  servedEphemeralExpiresAt,
} from '@meeshy/shared/utils/ephemeral-countdown';
import {
  isEphemeralServableToReader,
  loadEphemeralReaderDeadlines,
  type EphemeralReaderResolution,
} from '../../routes/conversations/ephemeralReaderDeadlines';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';

const logger = enhancedLogger.child({ module: 'quoteCascade' });

/**
 * #8630 — LA DESTRUCTION D'UN MESSAGE CITÉ ENTRAÎNE SES RÉPONSES.
 *
 * Décision porteur 2026-09-29 : « une flamme-œil pas encore lue est lisible
 * dans une citation si elle existe, mais lorsqu'elle se détruit, elle entraîne
 * la destruction du message qui l'a cité ». La contagion #8557 rend déjà une
 * réponse NEUVE éphémère du même mode ; ce module couvre les réponses qui
 * existaient avant elle et celles dont la propre échéance est plus tardive.
 *
 * ─── UNE LOI, TROIS USAGES ──────────────────────────────────────────────────
 *
 * | usage | fonction | qui l'appelle |
 * |---|---|---|
 * | servir une page à UN lecteur | {@link loadInheritedEphemeralDeadlines} | liste, fil, lien, recherche, aperçu de liste |
 * | annoncer une mort à UN lecteur | {@link loadQuoteDescendants} | `EphemeralRecipientExpiryService` (`message:expired`) |
 * | détruire pour TOUS | {@link loadQuoteDescendants} | `ExpiredMessagesCleanupService` |
 * | diffuser une réponse neuve | {@link loadQuoteCascadeAudience} | `message:new`, `message:edited` |
 *
 * L'échéance servie d'une réponse à `u` est la plus PROCHE de la sienne et de
 * celle de chaque ancêtre cité (`inheritedEphemeralExpiresAt`) : chaque maillon
 * garde sa loi (`servedEphemeralExpiresAt`), donc l'expéditeur d'une
 * flamme-œil, à qui rien n'est servi, garde la réponse jusqu'à la destruction
 * globale — où le balayage l'emporte avec l'original.
 *
 * ─── BORNES ─────────────────────────────────────────────────────────────────
 *
 * La remontée suit `replyToId` sur {@link MAX_QUOTE_DEPTH} maillons au plus,
 * une requête par maillon, par `_id` ; une page sans citation ne coûte rien.
 * La descente est bornée à {@link MAX_CASCADE_DESCENDANTS} lignes (#4165).
 * Une lecture qui échoue sert comme avant ce lot — la loi du lecteur dont le
 * décompte n'a pas démarré — et le dit au journal.
 */

export const MAX_QUOTE_DEPTH = 8;
export const MAX_CASCADE_DESCENDANTS = 500;

export type QuoteCascadePrisma = Pick<PrismaClient, 'message' | 'messageStatusEntry'>;

export type QuotingRow = { readonly id: string; readonly replyToId?: string | null };

type AncestorRow = {
  readonly id: string;
  readonly replyToId: string | null;
  readonly senderId: string | null;
  readonly ephemeralDuration: number | null;
  readonly effectFlags: number | null;
  readonly expiresAt: Date | null;
};

const ANCESTOR_SELECT = {
  id: true,
  replyToId: true,
  senderId: true,
  ephemeralDuration: true,
  effectFlags: true,
  expiresAt: true,
} as const;

const distinct = (ids: ReadonlyArray<string | null | undefined>): string[] =>
  [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];

/** Les messages cités à partir de `startIds` (eux compris), maillon par maillon. */
async function loadAncestry(
  prisma: Pick<PrismaClient, 'message'>,
  startIds: readonly string[],
): Promise<ReadonlyMap<string, AncestorRow>> {
  const nodes = new Map<string, AncestorRow>();
  let frontier = distinct(startIds);
  for (let depth = 0; depth < MAX_QUOTE_DEPTH && frontier.length > 0; depth++) {
    const found = (await prisma.message.findMany({
      where: { id: { in: frontier } },
      select: ANCESTOR_SELECT,
      take: frontier.length,
    })) as AncestorRow[];
    for (const row of found) nodes.set(row.id, row);
    frontier = distinct(found.map((row) => row.replyToId)).filter((id) => !nodes.has(id));
  }
  return nodes;
}

/** La chaîne citée à partir de `startId`, dans l'ordre, sans boucle. */
const chainFrom = (startId: string | null | undefined, nodes: ReadonlyMap<string, AncestorRow>): AncestorRow[] => {
  const chain: AncestorRow[] = [];
  const seen = new Set<string>();
  let cursor = startId ?? null;
  while (cursor && !seen.has(cursor) && chain.length < MAX_QUOTE_DEPTH) {
    seen.add(cursor);
    const node = nodes.get(cursor);
    if (!node) break;
    chain.push(node);
    cursor = node.replyToId;
  }
  return chain;
};

/**
 * L'échéance HÉRITÉE par chaque réponse de la page, pour CE lecteur : la plus
 * proche des échéances servies à ce lecteur sur sa chaîne de citations. Une
 * réponse absente de la carte n'hérite de rien.
 */
export async function loadInheritedEphemeralDeadlines(
  prisma: QuoteCascadePrisma,
  rows: readonly QuotingRow[],
  readerParticipantId: string | undefined,
): Promise<ReadonlyMap<string, Date>> {
  const quoting = rows.filter((row) => Boolean(row.replyToId));
  if (quoting.length === 0) return new Map();

  try {
    const nodes = await loadAncestry(prisma, quoting.map((row) => row.replyToId as string));
    const ephemeral = [...nodes.values()].filter((node) => hasPerReaderEphemeralDeadline(node));
    if (ephemeral.length === 0) return new Map();

    const resolutions = await loadEphemeralReaderDeadlines(prisma, ephemeral, readerParticipantId);
    const servedTo = new Map(
      ephemeral.map((node) => {
        const resolution = resolutions.get(node.id);
        return [
          node.id,
          servedEphemeralExpiresAt({
            ephemeralDuration: node.ephemeralDuration,
            effectFlags: node.effectFlags,
            rawExpiresAt: node.expiresAt,
            isSender: resolution?.isSender ?? false,
            readerDeadline: resolution?.readerDeadline ?? null,
            latestRecipientDeadline: resolution?.latestRecipientDeadline ?? null,
          }),
        ] as const;
      }),
    );

    const inherited = new Map<string, Date>();
    for (const row of quoting) {
      const deadline = inheritedEphemeralExpiresAt(chainFrom(row.replyToId, nodes).map((node) => servedTo.get(node.id)));
      if (deadline) inherited.set(row.id, deadline);
    }
    return inherited;
  } catch (err) {
    logger.warn('quote cascade ancestry failed — replies served without inherited deadline', { err });
    return new Map();
  }
}

/** La réponse est-elle encore servable à ce lecteur, au regard de ce qu'elle cite ? */
export function isServableThroughQuotes(inherited: ReadonlyMap<string, Date>, messageId: string, now: Date): boolean {
  return isInheritedEphemeralServable({ inheritedExpiresAt: inherited.get(messageId) ?? null, now });
}

const asDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * L'`expiresAt` servi à la réponse devient la plus proche de la sienne et de
 * celle qu'elle hérite : les clients la retirent à cette échéance, comme ils
 * retirent déjà un éphémère échu. N'allonge jamais une vie.
 */
export function withInheritedExpiry<T extends { readonly id: string; readonly expiresAt?: unknown }>(
  served: T,
  inherited: ReadonlyMap<string, Date>,
): T {
  const heir = inherited.get(served.id);
  if (!heir) return served;
  return { ...served, expiresAt: inheritedEphemeralExpiresAt([asDate(served.expiresAt), heir]) };
}

type ReaderPageRow = QuotingRow & {
  readonly senderId?: string | null;
  readonly ephemeralDuration?: number | null;
  readonly effectFlags?: number | null;
  readonly expiresAt?: Date | null;
};

export type ReaderPage<T> = {
  /** Ce qui vit encore pour ce lecteur — l'éphémère lui-même, puis ce qu'il cite. */
  readonly alive: T[];
  /** Les échéances propres des éphémères de la page, pour la projection servie. */
  readonly deadlines: ReadonlyMap<string, EphemeralReaderResolution>;
  /** Les échéances héritées de ce que chaque réponse cite ({@link withInheritedExpiry}). */
  readonly inherited: ReadonlyMap<string, Date>;
};

/**
 * Les deux coupures de service d'une page lue par UN lecteur, pour une porte
 * qui n'avait ni l'une ni l'autre (recherche, fil, lien de partage) : l'éphémère
 * échu pour lui (#7451), puis la réponse à ce qui est mort pour lui (#8630).
 */
export async function keepAliveForReader<T extends ReaderPageRow>(
  prisma: QuoteCascadePrisma,
  rows: readonly T[],
  readerParticipantId: string | undefined,
  now: Date = new Date(),
): Promise<ReaderPage<T>> {
  const deadlines = await loadEphemeralReaderDeadlines(prisma, rows, readerParticipantId);
  const rootAlive = rows.filter((row) => isEphemeralServableToReader(row, deadlines.get(row.id), now));
  const inherited = await loadInheritedEphemeralDeadlines(prisma, rootAlive, readerParticipantId);
  return {
    alive: rootAlive.filter((row) => isServableThroughQuotes(inherited, row.id, now)),
    deadlines,
    inherited,
  };
}

export type QuoteDescendant = { readonly id: string; readonly conversationId: string };

/**
 * Les réponses VIVANTES qui citent `rootIds`, transitivement — ce qu'une mort
 * entraîne. Bornée : au-delà, le reste attend la lecture, qui le retient déjà
 * (`loadInheritedEphemeralDeadlines`).
 */
export async function loadQuoteDescendants(
  prisma: Pick<PrismaClient, 'message'>,
  rootIds: readonly string[],
  cap: number = MAX_CASCADE_DESCENDANTS,
): Promise<QuoteDescendant[]> {
  const collected = new Map<string, QuoteDescendant>();
  const visited = new Set(rootIds);
  let frontier = distinct(rootIds);
  try {
    for (let depth = 0; depth < MAX_QUOTE_DEPTH && frontier.length > 0 && collected.size < cap; depth++) {
      const found = (await prisma.message.findMany({
        where: { replyToId: { in: frontier }, ...unsetOrNull('deletedAt') },
        select: { id: true, conversationId: true },
        take: cap - collected.size,
      })) as QuoteDescendant[];
      const fresh = found.filter((row) => !visited.has(row.id));
      for (const row of fresh) {
        visited.add(row.id);
        collected.set(row.id, row);
      }
      frontier = fresh.map((row) => row.id);
    }
  } catch (err) {
    logger.warn('quote cascade descendants failed', { rootIds, err });
  }
  if (collected.size >= cap) logger.info('quote cascade saturated', { rootIds, cap });
  return [...collected.values()];
}

/** Même plafond que la lecture des échéances d'une page (#4165). */
const AUDIENCE_SCAN_CAP = 2000;

/**
 * Pour une réponse diffusée à la room (`message:new`, `message:edited`) : les
 * lecteurs, par clé de room personnelle (`userId ?? participantId`), pour qui
 * un message de la chaîne citée depuis `quotedId` (lui compris) est déjà mort,
 * avec la plus proche de ces morts. L'auteur de chaque maillon n'y figure
 * jamais pour son propre maillon : sa règle reste la sienne.
 */
export async function loadQuoteCascadeAudience(
  prisma: QuoteCascadePrisma,
  quotedId: string | null | undefined,
  now: Date = new Date(),
): Promise<ReadonlyMap<string, Date>> {
  if (!quotedId) return new Map();
  try {
    const nodes = await loadAncestry(prisma, [quotedId]);
    const ephemeral = chainFrom(quotedId, nodes).filter((node) => hasPerReaderEphemeralDeadline(node));
    if (ephemeral.length === 0) return new Map();

    const entries = (await prisma.messageStatusEntry.findMany({
      where: { messageId: { in: ephemeral.map((node) => node.id) }, ephemeralExpiresAt: { lte: now } },
      select: {
        messageId: true,
        participantId: true,
        ephemeralExpiresAt: true,
        participant: { select: { userId: true } },
      },
      take: AUDIENCE_SCAN_CAP,
    })) as Array<{
      messageId: string;
      participantId: string;
      ephemeralExpiresAt: Date | null;
      participant: { userId: string | null } | null;
    }>;

    const senderOf = new Map(ephemeral.map((node) => [node.id, node.senderId] as const));
    const audience = new Map<string, Date>();
    for (const entry of entries) {
      const at = entry.ephemeralExpiresAt;
      if (!(at instanceof Date) || at.getTime() > now.getTime()) continue;
      if (entry.participantId === senderOf.get(entry.messageId)) continue;
      const key = entry.participant?.userId ?? entry.participantId;
      const known = audience.get(key);
      if (!known || at.getTime() < known.getTime()) audience.set(key, at);
    }
    return audience;
  } catch (err) {
    logger.warn('quote cascade audience failed', { quotedId, err });
    return new Map();
  }
}
