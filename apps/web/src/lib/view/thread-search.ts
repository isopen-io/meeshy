import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { Message } from '@/lib/api/types';

/**
 * LA RECHERCHE DANS LA CONVERSATION — SES LOIS PURES (sans hook, sans DOM),
 * miroir de `ConversationSearchHandler.swift` et de la barre de recherche iOS
 * (`ConversationView+MessageRow.swift`, `debounceSearch`).
 *
 * Elles vivent ici, à part du hook (`use-thread-search.ts`) et du panneau
 * (`components/thread-search-panel.tsx`), pour qu'un témoin les prouve sans
 * monter d'écran : le seuil, l'extrait qui montre POURQUOI un message a été
 * trouvé, et le libellé d'état.
 */

/** Sous deux caractères, rien ne part : la route rend 400 (`minLength: 2`) et
 * iOS sort de la recherche au lieu d'interroger (`trimmed.count >= 2`). */
export const THREAD_SEARCH_MIN_CHARS = 2;

/** L'anti-rebond de la frappe — la valeur iOS (`Task.sleep(400 ms)`) : assez
 * court pour paraître immédiat, assez long pour qu'un mot tapé d'un trait ne
 * coûte qu'UNE requête. */
export const THREAD_SEARCH_DEBOUNCE_MS = 400;

/** La requête ROGNÉE si elle mérite d'être envoyée, `null` sinon. */
export function searchNeedle(query: string): string | null {
  const trimmed = query.trim();
  return trimmed.length >= THREAD_SEARCH_MIN_CHARS ? trimmed : null;
}

/** Un extrait coupé autour de l'occurrence : ce qui précède, l'occurrence
 * elle-même (peinte en `<mark>`), ce qui suit. */
export type SearchSnippet = {
  readonly before: string;
  readonly match: string;
  readonly after: string;
};

export type ThreadSearchHit = {
  readonly messageId: string;
  readonly senderName: string;
  readonly createdAt: Date;
  /** `translation` : le mot n'est pas dans l'original mais dans une de ses
   * traductions — le lecteur doit voir POURQUOI ce message est sorti, même
   * s'il ne lit pas la langue d'origine (même choix qu'iOS). */
  readonly matchedIn: 'content' | 'translation';
  readonly snippet: SearchSnippet;
};

/** Le contexte gardé de part et d'autre de l'occurrence : assez pour la
 * reconnaître sur deux lignes d'un téléphone, jamais le message entier. */
const CONTEXT_BEFORE = 32;
const CONTEXT_AFTER = 80;

/**
 * Coupe `text` autour de la PREMIÈRE occurrence de `needle` (insensible à la
 * casse). L'occurrence est rendue avec la casse du TEXTE, pas celle de la
 * requête : le lecteur voit le mot tel qu'il a été écrit. Sans occurrence
 * (une passerelle qui aurait trouvé sur un champ que le client ne voit pas),
 * le début du texte, sans marque.
 */
export function snippetOf(text: string, needle: string): SearchSnippet {
  const flat = text.replace(/\s+/g, ' ').trim();
  const index = needle === '' ? -1 : flat.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index === -1) {
    const head = flat.slice(0, CONTEXT_BEFORE + CONTEXT_AFTER);
    return { before: '', match: '', after: head.length < flat.length ? `${head}…` : head };
  }
  const end = index + needle.length;
  const start = Math.max(0, index - CONTEXT_BEFORE);
  const stop = Math.min(flat.length, end + CONTEXT_AFTER);
  return {
    before: `${start > 0 ? '…' : ''}${flat.slice(start, index)}`,
    match: flat.slice(index, end),
    after: `${flat.slice(end, stop)}${stop < flat.length ? '…' : ''}`,
  };
}

/**
 * Le résultat PEINT d'un message servi par la passerelle — miroir de
 * `buildSearchResult` iOS : l'original prime (c'est lui que la bulle
 * affiche) ; sinon la première traduction qui contient le mot.
 */
export function searchHitOf(message: Message, query: string): ThreadSearchHit {
  const needle = query.trim();
  const lowered = needle.toLocaleLowerCase();
  const sender = message.sender;
  const senderName = sender?.displayName || sender?.user?.displayName || sender?.user?.username || '';
  const base = { messageId: message.id, senderName, createdAt: new Date(message.createdAt) };
  const content = message.content ?? '';
  if (content.toLocaleLowerCase().includes(lowered)) {
    return { ...base, matchedIn: 'content', snippet: snippetOf(content, needle) };
  }
  const translated = (message.translations ?? []).find((t) => t.translatedContent.toLocaleLowerCase().includes(lowered));
  if (translated !== undefined) {
    return { ...base, matchedIn: 'translation', snippet: snippetOf(translated.translatedContent, needle) };
  }
  return { ...base, matchedIn: 'content', snippet: snippetOf(content, needle) };
}

/** Les états de la recherche, dans l'ordre où le lecteur les traverse. */
export type ThreadSearchPhase = 'idle' | 'loading' | 'done' | 'failed';

/** La clé du libellé d'état — `null` quand rien n'est à dire (résultats
 * comptés : c'est `count` qui parle). */
export type ThreadSearchStatusKey =
  | 'thread.search.hint'
  | 'thread.search.searching'
  | 'thread.search.empty'
  | 'thread.search.failed'
  | 'thread.search.count.one'
  | 'thread.search.count.other';

/**
 * Ce que la ligne d'état annonce (et ce que le lecteur d'écran entend) —
 * miroir de `searchBannerLabel` iOS : « Recherche… » tant qu'aucun résultat
 * n'est arrivé, « Aucun résultat », puis le compte. Avant le seuil, l'aide
 * dit ce qu'il manque au lieu de laisser un panneau muet.
 */
export function searchStatusKey(params: {
  readonly ready: boolean;
  readonly phase: ThreadSearchPhase;
  readonly count: number;
}): ThreadSearchStatusKey {
  if (!params.ready) return 'thread.search.hint';
  if (params.phase === 'failed' && params.count === 0) return 'thread.search.failed';
  if (params.count === 0) return params.phase === 'done' ? 'thread.search.empty' : 'thread.search.searching';
  return params.count === 1 ? 'thread.search.count.one' : 'thread.search.count.other';
}

/**
 * LE MODE OÙ ATTERRIR — en Résumé Vivant, le fil (`<ol>`) n'est pas monté et
 * le saut différé (`requestJump`) attendrait un rebasculement que personne ne
 * demande : le résultat touché resterait sans effet, puis sauterait plus tard
 * par surprise. Comme les trois sorties du Résumé (`summary-exits.ts`, miroir
 * `ConversationView.swift:1527-1547`), toucher un résultat repasse alors en
 * `script` ; dans tout autre mode, on ne touche pas au choix du lecteur.
 */
export function searchLandingMode(currentMode: ConversationReadingMode | undefined): ConversationReadingMode | null {
  return currentMode === 'summary' ? 'script' : null;
}
