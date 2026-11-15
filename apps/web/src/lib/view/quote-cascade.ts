import { inheritedEphemeralExpiresAt } from '@meeshy/shared/utils/ephemeral-countdown';
import type { EphemeralDeadline } from '@meeshy/shared/utils/ephemeral-deadline';

import type { Message } from '@/lib/api/types';

import { peekEphemeralDeadline } from './ephemeral-reception';

/**
 * **UNE RÉPONSE MEURT, POUR SON LECTEUR, AVEC CE QU'ELLE CITE** (#10433, la
 * moitié CLIENT de #8630) — décision porteur 2026-09-29 : « lorsqu'elle se
 * détruit, elle entraîne la destruction du message qui l'a cité ».
 *
 * La loi est celle de la passerelle, et elle n'est pas réécrite ici :
 * `inheritedEphemeralExpiresAt` (`@meeshy/shared/utils/ephemeral-countdown`)
 * fait mourir une réponse à la plus PROCHE des échéances de sa chaîne de
 * citations, et la grâce d'une heure de `isInheritedEphemeralServable` dit
 * « la réponse ne survit pas à ce qu'elle cite, et ne disparaît pas non plus
 * avant lui ». Côté client, cela se lit : la réponse quitte le fil au MÊME
 * instant que ce qu'elle cite (`destructionPhaseOf`), jamais avant.
 *
 * Ce que ce module ajoute est ce que la passerelle ne peut pas savoir hors
 * ligne : l'échéance de chaque maillon POUR CET APPAREIL — la réception locale
 * d'un éphémère (`peekEphemeralDeadline`), la consommation locale d'une
 * flamme-œil (sa citation scellée « expirée », `tombstoneQuotesOf`). Sans lui,
 * la mort d'un éphémère n'entraînait ses réponses qu'au `message:expired` de
 * la passerelle, ou au rechargement.
 *
 * Chaque maillon garde sa loi : une flamme-œil non consommée, ou dont le
 * lecteur est l'expéditeur, n'a pas d'échéance, donc n'emporte rien ; une
 * citation SUPPRIMÉE (sans `expiresAt`) n'est pas une mort éphémère.
 */

/** La même borne que la remontée de la passerelle (`MAX_QUOTE_DEPTH`, `quoteCascade.ts`). */
export const MAX_QUOTE_DEPTH = 8;

const timeOf = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : typeof value === 'string' || typeof value === 'number' ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
};

/**
 * L'instant de mort d'une citation SCELLÉE par une expiration — la forme que
 * sert la passerelle (`sealedQuotedMessage`) et que pose le client
 * (`tombstone(…, expired)`) : `deletedAt` ET `expiresAt`. Une suppression n'a
 * que `deletedAt`, et ne tue rien.
 */
export function expiredSealAtMs(message: Pick<Message, 'deletedAt' | 'expiresAt'>): number | null {
  if (message.deletedAt === null || message.deletedAt === undefined) return null;
  return timeOf(message.expiresAt);
}

export type QuoteReader = {
  readonly isMine: (message: Message) => boolean;
  readonly now: number;
};

const ownDeathAt = (message: Message, reader: QuoteReader): number | null => {
  const sealed = expiredSealAtMs(message);
  if (sealed !== null) return sealed;
  const deadline = peekEphemeralDeadline({ message, isMine: reader.isMine(message), now: reader.now });
  return deadline.state === 'scheduled' ? deadline.expiresAtMs : null;
};

const quotedIdOf = (message: Message): string | null => message.replyTo?.id ?? message.replyToId ?? null;

/**
 * L'échéance HÉRITÉE de la chaîne citée depuis `message` (lui exclu), pour ce
 * lecteur : chaque maillon se lit dans le fil chargé (`lookup`) ET dans la
 * citation que porte celui qui le cite — un message sorti du cache se lit
 * encore par elle. `null` : rien de ce qu'il cite ne meurt.
 */
export function inheritedQuoteDeathMs(
  message: Message,
  input: QuoteReader & { readonly lookup: ReadonlyMap<string, Message> },
): number | null {
  const deaths: Date[] = [];
  const seen = new Set([message.id]);
  let holder: Message | undefined = message;
  for (let depth = 0; holder !== undefined && depth < MAX_QUOTE_DEPTH; depth++) {
    const quotedId = quotedIdOf(holder);
    if (quotedId === null || seen.has(quotedId)) break;
    seen.add(quotedId);
    const row = input.lookup.get(quotedId);
    for (const link of [row, holder.replyTo ?? undefined]) {
      const at = link === undefined ? null : ownDeathAt(link, input);
      if (at !== null) deaths.push(new Date(at));
    }
    holder = row;
  }
  return inheritedEphemeralExpiresAt(deaths)?.getTime() ?? null;
}

const quotesSomething = (message: Message): boolean => quotedIdOf(message) !== null;

/**
 * L'ÉCHÉANCE D'UNE RANGÉE POUR CE LECTEUR, citations comprises — la sienne
 * (`peekEphemeralDeadline`) rapprochée de celle qu'elle hérite. N'allonge
 * jamais une vie : c'est `withInheritedExpiry` côté passerelle.
 */
export function deadlineThroughQuotes(
  message: Message,
  input: QuoteReader & { readonly lookup: ReadonlyMap<string, Message> },
): EphemeralDeadline {
  const own = peekEphemeralDeadline({ message, isMine: input.isMine(message), now: input.now });
  if (!quotesSomething(message)) return own;
  const inherited = inheritedQuoteDeathMs(message, input);
  if (inherited === null) return own;
  return { state: 'scheduled', expiresAtMs: own.state === 'scheduled' ? Math.min(own.expiresAtMs, inherited) : inherited };
}

export const lookupOf = (messages: readonly Message[]): ReadonlyMap<string, Message> =>
  new Map(messages.map((message) => [message.id, message] as const));
