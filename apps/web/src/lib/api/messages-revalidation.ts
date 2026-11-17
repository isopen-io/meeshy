import type { QueryClient } from '@tanstack/react-query';

import { timeOf, type MessagesInfiniteData, type MessagesPage } from './messages-pages';

/**
 * **REVALIDER UN FIL, C'EST RELIRE SA PAGE 1** (#18918, WEB-09 volet fil).
 *
 * Une requête infinie que TanStack relit (réveil, reconnexion, retour sur
 * l'écran) refait TOUTES ses pages, en séquence — environ une seconde chacune
 * (#9637) : un groupe remonté sur huit pages en coûtait huit à chaque retour.
 * La page 1 suffit, recollée à `pages[0]` : ce que le fil tenait déjà d'AVANT
 * elle reste, et les pages plus anciennes sont reprises du cache, sans réseau,
 * pendant la même relecture — motif du delta de la liste (`conversations.ts`).
 * Elles sont lues au moment où la relecture les demande : ce que le temps réel
 * y a écrit entre-temps est dedans, et le journal des écritures vives rejoue
 * le reste sur la réponse.
 *
 * Le recollage n'a lieu que s'il ne laisse AUCUN TROU : la page servie doit
 * recouvrir le présent tenu (son plus ancien message n'est pas plus récent que
 * le dernier message connu du serveur dans `pages[0]`, ni plus ancien que le
 * premier). Plus d'une page arrivée pendant l'absence, un fil d'une seule page
 * ou entièrement servi : la relecture redevient complète, comme avant. Et une
 * relecture qui DOIT tout relire — un historique vidé, des messages restaurés,
 * une suppression de masse incertaine — le demande (`requestFullThreadRead`).
 */
export type StitchedPresent = {
  readonly first: MessagesPage;
};

const isUnconfirmedLocal = (message: { readonly id: string }): boolean => (message as { readonly clientMessageId?: string }).clientMessageId === message.id;

export function stitchedPresent(cached: MessagesInfiniteData | undefined, served: MessagesPage): StitchedPresent | null {
  if (cached === undefined || !Array.isArray(cached.pages) || cached.pages.length < 2 || !served.hasOlder) return null;
  const present = cached.pages[0];
  const oldestServed = served.messages[0];
  const newestKnown = present === undefined ? undefined : [...present.messages].reverse().find((m) => !isUnconfirmedLocal(m));
  const oldestPresent = present?.messages[0];
  if (present === undefined || present.nextCursor === null || oldestServed === undefined || newestKnown === undefined || oldestPresent === undefined) return null;
  const from = timeOf(oldestServed.createdAt);
  if (from > timeOf(newestKnown.createdAt) || from < timeOf(oldestPresent.createdAt)) return null;

  const servedIds = new Set(served.messages.map((m) => m.id));
  const kept = present.messages.filter((m) => timeOf(m.createdAt) < from && !servedIds.has(m.id));
  return { first: { messages: [...kept, ...served.messages], hasOlder: present.hasOlder, nextCursor: present.nextCursor } };
}

type Revalidation = 'stitched' | 'full';

/** La relecture en cours de chaque fil, par client : recollée, ou complète. */
const revalidations = new WeakMap<QueryClient, Map<string, Revalidation>>();
/** Les fils dont la prochaine relecture doit tout relire. */
const fullReadsRequested = new WeakMap<QueryClient, Set<string>>();

const modesOf = (client: QueryClient): Map<string, Revalidation> => {
  const modes = revalidations.get(client) ?? new Map<string, Revalidation>();
  revalidations.set(client, modes);
  return modes;
};

/** La prochaine relecture de ce fil relira toutes ses pages. */
export function requestFullThreadRead(client: QueryClient, conversationId: string): void {
  const requested = fullReadsRequested.get(client) ?? new Set<string>();
  fullReadsRequested.set(client, requested);
  requested.add(conversationId);
}

/**
 * La page 1 d'une lecture du fil : recollée au présent tenu quand c'est sans
 * trou et qu'aucune relecture complète n'est demandée, servie telle quelle
 * sinon. Elle fixe le régime des pages suivantes de la même lecture.
 */
export function firstThreadPage(params: {
  readonly client: QueryClient | undefined;
  readonly conversationId: string;
  readonly cached: MessagesInfiniteData | undefined;
  readonly served: MessagesPage;
}): MessagesPage {
  const { client, conversationId, cached, served } = params;
  if (client === undefined) return served;
  const full = fullReadsRequested.get(client)?.delete(conversationId) === true;
  const stitched = full ? null : stitchedPresent(cached, served);
  modesOf(client).set(conversationId, stitched === null ? 'full' : 'stitched');
  return stitched?.first ?? served;
}

/**
 * Une page plus ancienne d'une relecture RECOLLÉE, reprise du cache : celle que
 * ce curseur avait demandée. Une page jamais chargée (une page suivante
 * demandée au défilement) n'y est pas, et part au réseau.
 */
export function cachedOlderThreadPage(params: {
  readonly client: QueryClient | undefined;
  readonly conversationId: string;
  readonly cached: MessagesInfiniteData | undefined;
  readonly cursor: string;
}): MessagesPage | undefined {
  const { client, conversationId, cached, cursor } = params;
  if (client === undefined || revalidations.get(client)?.get(conversationId) !== 'stitched') return undefined;
  if (cached === undefined || !Array.isArray(cached.pages)) return undefined;
  const after = cached.pages.findIndex((page) => page.nextCursor === cursor);
  return after === -1 ? undefined : cached.pages[after + 1];
}
