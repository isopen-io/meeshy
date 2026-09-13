/**
 * LE FORMATEUR DU LIBELLÉ — trois formes, JAMAIS une chaîne recomposée par
 * concaténation libre (revue-correction #6171, défaut 2) : `web-v2` ne porte
 * ENCORE aucun catalogue de traduction d'INTERFACE (`index.html` pose
 * `lang="fr"` en dur, aucun `src/locales`) — une dette PRÉEXISTANTE, à
 * l'échelle de l'application, que ce lot ne comble pas. Ce qu'il fait : ne
 * pas l'AGGRAVER en écrivant une quatrième chaîne française en dur qu'un
 * futur socle i18n devrait retrouver et démonter. `typingAnnouncement`
 * reste une fonction PURE prenant des noms ; le FRANÇAIS n'est plus câblé
 * dans son corps mais dans ce SEUL littéral, injectable par un futur
 * résolveur de langue d'INTERFACE — distincte du Prisme de CONTENU, qui est
 * celle du LECTEUR (`lib/api/prism.ts`). Miroir des clés de catalogue iOS
 * (`typing.named`/`typing.double`/`typing.several`,
 * `apps/ios/Meeshy/Localizable.xcstrings`).
 */
export type TypingAnnouncementFormatter = {
  readonly one: (name: string) => string;
  readonly two: (first: string, second: string) => string;
  readonly several: string;
};

const FRENCH_TYPING_ANNOUNCEMENT: TypingAnnouncementFormatter = {
  one: (name) => `${name} écrit`,
  two: (first, second) => `${first} et ${second} écrivent`,
  several: 'Plusieurs personnes écrivent',
};

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
 * `formatter` — défaut FRANÇAIS (`FRENCH_TYPING_ANNOUNCEMENT`), injectable
 * SANS toucher les appelants : c'est le point d'entrée qu'un socle i18n de
 * web-v2 (#6206, dette § doc-comment ci-dessus) branchera pour résoudre la
 * langue d'INTERFACE plutôt que d'ajouter une CINQUIÈME chaîne française en
 * dur.
 *
 * Vit dans `lib/view/` parce qu'elle est PARTAGÉE par trois surfaces : la
 * cellule de frappe du fil (`routes/thread-modes.tsx`), le bouton « revenir
 * en bas » et la pastille de synchronisation (issue compagnon, § 9.2 de la
 * spécification #6171), puis la Rivière (D-21) — une seule loi, jamais une
 * réécrite par surface.
 */
export function typingAnnouncement(
  names: readonly string[],
  formatter: TypingAnnouncementFormatter = FRENCH_TYPING_ANNOUNCEMENT,
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
