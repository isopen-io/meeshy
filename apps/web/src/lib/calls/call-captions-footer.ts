import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { captionText, isAwaitingTranslation, type CallCaption, type CaptionsMode } from './call-captions';

/**
 * **LE PIED DES SOUS-TITRES** (#17343, planche P3-P5, miroir d'iOS `CallCaptionsFooter`) —
 * ce que les phrases disent de leur traduction, à côté du bouton « Journal ». Un seul pied
 * pour le duo et le groupe : une paire de langues dit « EN → FR · toucher = original »,
 * plusieurs paires « Traduit · N langues », et une traduction attendue « EN · traduction en
 * cours ». Son module à lui : seul le chunk des sous-titres l'importe
 * (`budgets.json` › `call_overlay.dynamic_only`).
 */

/** Une ligne vue par le pied : sa langue d'origine, celle qu'elle sert (traduite seulement), l'attente d'une traduction. */
export type FooterLine = { readonly event: boolean; readonly origin: string | null; readonly served: string | null; readonly awaiting: boolean };

export type CaptionsFooter =
  | { readonly kind: 'translating'; readonly language: string }
  | { readonly kind: 'touchForOriginal'; readonly pair: string }
  | { readonly kind: 'translatedLanguages'; readonly count: number };

const code = (tag: string): string => (tag.split('-')[0] ?? tag).toUpperCase();

export const EVENT_FOOTER_LINE: FooterLine = { event: true, origin: null, served: null, awaiting: false };

/** Ce qu'une phrase, lue dans ce mode à cet instant, apporte au pied. */
export function captionFooterLine(caption: CallCaption, mode: CaptionsMode, now: number): FooterLine {
  const translatedShown = caption.pair !== null && captionText(caption, mode) !== caption.original;
  const origin = caption.origin?.language ?? caption.pair?.from ?? null;
  return {
    event: false,
    origin: caption.mine || origin === null ? null : code(origin),
    served: translatedShown && caption.pair !== null ? code(caption.pair.to) : null,
    awaiting: isAwaitingTranslation(caption, now),
  };
}

/**
 * `lines` : les lignes du bandeau. Une traduction attendue parle d'abord (« EN · traduction en
 * cours ») ; sinon une seule paire se dit, plusieurs se comptent. Une capture n'est pas une parole.
 */
export function callCaptionsFooter(lines: readonly FooterLine[]): CaptionsFooter | null {
  const speech = lines.filter((line) => !line.event);
  const waiting = speech.findLast((line) => line.awaiting && line.origin !== null)?.origin ?? null;
  if (waiting !== null) return { kind: 'translating', language: waiting };
  const pairs = speech.flatMap((line) => (line.origin !== null && line.served !== null ? [[line.origin, line.served] as const] : []));
  const newest = pairs.at(-1);
  if (newest === undefined) return null;
  if (new Set(pairs.map(([from, to]) => `${from}>${to}`)).size <= 1) return { kind: 'touchForOriginal', pair: `${newest[0]} → ${newest[1]}` };
  return { kind: 'translatedLanguages', count: new Set(pairs.flat()).size };
}

/**
 * « Traduit · N langues », accordé par la catégorie ICU du nombre dans la langue de
 * l'interface (`Intl.PluralRules`, miroir de la variation plurielle d'iOS) : le
 * catalogue porte la même forme dans les sept langues, et seule celle que la langue
 * élit se lit (le duel « لغتان » de l'arabe ; « zero » n'y a pas de forme à lui).
 */
const TRANSLATED_LANGUAGES = {
  zero: 'callCaptions.footer.translatedLanguages.other',
  one: 'callCaptions.footer.translatedLanguages.one',
  two: 'callCaptions.footer.translatedLanguages.two',
  few: 'callCaptions.footer.translatedLanguages.few',
  many: 'callCaptions.footer.translatedLanguages.many',
  other: 'callCaptions.footer.translatedLanguages.other',
} as const satisfies Readonly<Record<Intl.LDMLPluralRule, string>>;

const pluralRules = new Map<InterfaceLanguage, Intl.PluralRules>();

function pluralOf(language: InterfaceLanguage, count: number): Intl.LDMLPluralRule {
  const rules = pluralRules.get(language) ?? new Intl.PluralRules(language);
  pluralRules.set(language, rules);
  return rules.select(count);
}

/** Ce que dit le pied : la paire et le geste, les langues comptées, ou la traduction attendue. */
export function callCaptionsFooterLabel(language: InterfaceLanguage, footer: CaptionsFooter): string {
  switch (footer.kind) {
    case 'translating':
      return translate(language, 'callCaptions.footer.translating', { language: footer.language });
    case 'touchForOriginal':
      return translate(language, 'callCaptions.footer.touchForOriginal', { pair: footer.pair });
    case 'translatedLanguages':
      return translate(language, TRANSLATED_LANGUAGES[pluralOf(language, footer.count)], { count: String(footer.count) });
  }
}
