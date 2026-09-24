import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LE FORMATEUR DU LIBELLÉ — trois formes, JAMAIS une chaîne recomposée par
 * concaténation libre (revue-correction #6171, défaut 2). Elles viennent du
 * catalogue d'INTERFACE (#6206), sous les clés d'iOS
 * `typing.named`/`typing.double`/`typing.several`
 * (`apps/ios/Meeshy/Localizable.xcstrings`) : la langue d'INTERFACE, distincte
 * du Prisme de CONTENU, qui est celle du LECTEUR (`lib/api/prism.ts`).
 */
export type TypingAnnouncementFormatter = {
  readonly one: (name: string) => string;
  readonly two: (first: string, second: string) => string;
  readonly several: string;
};

/** Les trois formes dans une langue d'interface — son catalogue doit être chargé. */
export function interfaceTypingFormatter(language: InterfaceLanguage): TypingAnnouncementFormatter {
  return {
    one: (name) => translate(language, 'typing.named', { name }),
    two: (first, second) => translate(language, 'typing.double', { first, second }),
    several: translate(language, 'typing.several'),
  };
}

/**
 * LA LOI DE LIBELLÉ DU ROSTER DE FRAPPE (#6171) — fonction PURE, sans
 * horloge, sans React (motif `pin-to-bottom.ts`/`scrollToBottomLabel`) :
 * miroir de `TypingIndicatorBubble.label`
 * (`MessageListViewController.swift:3146-3153`) — 0 nom → `''` ; 1 → « <nom>
 * écrit » ; 2 → « <A> et <B> écrivent » ; 3 et plus → « Plusieurs personnes
 * écrivent » (JAMAIS une énumération de trois noms ou plus).
 *
 * L'ORDRE d'entrée est conservé — jamais trié : c'est le roster (ordre de
 * PREMIÈRE APPARITION, `typing-store.ts`) qui décide, cette loi ne fait que
 * le mettre en mots.
 *
 * `formatter` — OBLIGATOIRE, sans défaut : un défaut français aurait servi
 * le français à tout appelant qui oublie la langue d'interface, et un témoin
 * écrit en français n'aurait pas pu le voir (#6206). Les appelants passent
 * `interfaceTypingFormatter(currentInterfaceLanguage())`.
 *
 * Vit dans `lib/view/` parce qu'elle est PARTAGÉE par trois surfaces : la
 * cellule de frappe du fil (`routes/thread-modes.tsx`), le bouton « revenir
 * en bas » et la pastille de synchronisation (issue compagnon, § 9.2 de la
 * spécification #6171), puis la Rivière (D-21) — une seule loi, jamais une
 * réécrite par surface.
 */
export function typingAnnouncement(
  names: readonly string[],
  formatter: TypingAnnouncementFormatter,
): string {
  if (names.length === 0) return '';
  /* `?? ''` INATTEIGNABLE — `noUncheckedIndexedAccess` ignore le garde
   * `names.length === 1|2` juste au-dessus ; les index 0/1 existent
   * TOUJOURS à ce point, jamais une valeur par défaut réelle. */
  if (names.length === 1) return formatter.one(names[0] ?? '');
  if (names.length === 2) return formatter.two(names[0] ?? '', names[1] ?? '');
  return formatter.several;
}

/**
 * LE MENEUR — la PREMIÈRE entrée du roster (celle apparue en premier,
 * `typing-store.ts` § `start`), jamais un tri par nom : miroir `lead =
 * participants.first` (`TypingIndicatorBubble.swift:3157`). `undefined` sur
 * un roster vide.
 */
export function typingLead<T>(entries: readonly T[]): T | undefined {
  return entries[0];
}
