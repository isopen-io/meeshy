import { isSameLanguage } from '@meeshy/shared/utils/language-normalize';

import { prismFor } from '@/lib/api/prism';

/**
 * **LE CHOIX DE LANGUE DU LECTEUR DE STORY** (#7114, § 5.1 de la
 * spécification) — miroir de `sessionLanguageOverride` /
 * `viewerLanguageChain(base:override:)` (`StoryViewerView.swift:248-252`,
 * `:1793-1797`). Un TYPE SOMME plutôt qu'une chaîne sentinelle ou un booléen
 * (directive porteur 2026-09-10, § 3b : « la sémantique porte les noms ») —
 * `'__meeshy.original__'` reste l'astuce iOS, jamais une valeur que ce module
 * laisserait fuiter.
 *
 * `storyPrism` **n'écrit aucune boucle de descente** : la descente reste
 * `served()` (`lib/api/prism.ts:74-99`, D-14) et le rang 0 reste `prismFor`
 * (`:62-67`, site UNIQUE). Ce module ne fait que composer LA CHAÎNE qu'un
 * choix produit, jamais le texte qu'elle sert.
 */
export type StoryLanguageChoice =
  | { readonly kind: 'auto' }
  | { readonly kind: 'original' }
  | { readonly kind: 'explore'; readonly language: string };

export const AUTO_CHOICE: StoryLanguageChoice = { kind: 'auto' };
const ORIGINAL_CHOICE: StoryLanguageChoice = { kind: 'original' };
export const originalStoryLanguageChoice = (): StoryLanguageChoice => ORIGINAL_CHOICE;

/** La sentinelle iOS « revenir à l'original » est une chaîne VIDE
 * (`StoryViewerView.swift:1775-1786`) — UNE constante de module, jamais
 * reconstruite, pour que `original` garde son IDENTITÉ d'un rendu à l'autre
 * (Zero Unnecessary Re-render). */
const EMPTY_CHAIN: readonly string[] = [];

/**
 * @param readerLanguages le prisme du LECTEUR, ordonné (`useReaderLanguages`)
 *   — jamais reconstruit ici : `auto` rend CETTE référence, telle quelle.
 * @param choice le choix ÉPHÉMÈRE du lecteur pour CETTE story (`auto` au
 *   repos, `original` ou `explore` après un geste sur la barre rapide).
 */
export function storyPrism(params: {
  readonly readerLanguages: readonly string[];
  readonly choice: StoryLanguageChoice;
}): readonly string[] {
  const { readerLanguages, choice } = params;
  if (choice.kind === 'auto') return readerLanguages;
  if (choice.kind === 'original') return EMPTY_CHAIN;
  // `explore` — la langue explorée prend la TÊTE, dédupliquée de la base
  // (`viewerLanguageChain:1797` : « [override] + base.filter { $0 != override } »)
  // — égalité STRICTE, comme iOS, jamais une base BCP-47 (le rang 0 reste un
  // choix EXPLICITE de l'utilisateur, pas une famille de codes).
  const base = readerLanguages.filter((language) => language !== choice.language);
  return prismFor({ readerLanguages: base, displayLanguage: choice.language });
}

/** La tête de la chaîne, en MAJUSCULES — le badge du rail dit la chaîne
 * EXPLORÉE (iOS : `displayedLanguageCode`, `+Canvas.swift:1713`), jamais la
 * langue effectivement SERVIE : cette vérité-là est celle de `PrismPastille`
 * (D-99) et de `lang=`. */
export function storyBadgeCode(prism: readonly string[]): string | null {
  const head = prism[0];
  return head === undefined ? null : head.toUpperCase();
}

/**
 * `isActive` d'iOS compare en base BCP-47, casse ignorée
 * (`QuickBar.swift:170-179` : `pt-BR` ↔ `pt`) — `isSameLanguage()`
 * (`@meeshy/shared`) porte déjà cette règle, jamais réécrite ici (D-14).
 */
export function isActiveLanguage(id: string, active: string | null): boolean {
  return active !== null && isSameLanguage(id, active);
}
