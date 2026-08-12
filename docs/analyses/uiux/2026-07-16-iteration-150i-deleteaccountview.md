# Itération 150i — Analyse UI/UX iOS : `DeleteAccountView`

**Date** : 2026-07-16
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/DeleteAccountView.swift`
**Base** : `main` HEAD (`60503a1`)
**Branche** : `claude/laughing-thompson-11e8cz`
**Gate** : CI `iOS Tests`

## Contexte

`DeleteAccountView` est le flux destructif de suppression de compte : carte d'avertissement +
champ de confirmation où l'utilisateur doit taper mot pour mot la phrase serveur
`SUPPRIMER MON COMPTE` (contrat `z.literal(...)`, `delete-account-schemas.ts`) + bouton
« Supprimer définitivement ». Le bouton n'est déverrouillé (`.disabled(confirmationText != requiredPhrase)`)
que lorsque la phrase matche exactement.

Surface déjà largement polie (Dynamic Type via `MeeshyFont.relative` partout ; hero ≥40pt figé 84i
ligne 268 ; `confirmationPrompt` en `AttributedString` word-order-safe ; hint dynamique du bouton).
Aucune PR ouverte ne touche `DeleteAccountView` → **0 contention**. Numéro **150i** (149i =
`ChangePasswordView` validation checklist, PR #1984).

## Constat (avant 150i)

**Trou VoiceOver — feedback de validation silencieux.** Quand l'utilisateur tape la phrase
exacte, un `checkmark.circle.fill` vert apparaît (ligne 172) **et** le bouton destructif passe
d'inactif à actif. Ces deux signaux de « phrase valide » sont **purement visuels** :

- le `TextField` de confirmation n'exposait qu'un `.accessibilityLabel` statique
  (« Phrase de confirmation ») — **aucun `.accessibilityValue`** reflétant l'état de correspondance ;
- le checkmark de validation est une `Image` **sans label ni `.accessibilityHidden`** — élément
  potentiellement focusable et muet pour VoiceOver.

Conséquence : un utilisateur VoiceOver qui tape la phrase n'a **aucun retour** lui indiquant qu'il
l'a saisie correctement et que l'action irréversible est désormais déverrouillée. Sur un flux
destructif, l'absence de confirmation d'état accessible est un défaut a11y net (parité avec le
pattern appliqué à `ChangePasswordView` en 149i).

## Corrections appliquées (1 fichier, 0 logique)

- **`TextField` de confirmation** → ajout d'un `.accessibilityValue(confirmationPhraseAccessibilityValue)`
  qui annonce l'état de correspondance : « Phrase correcte » quand `confirmationText == requiredPhrase`,
  « Phrase incomplete » sinon. VoiceOver relit la valeur au changement lorsque le champ est focus →
  l'utilisateur entend le passage à l'état valide.
- **Checkmark de validation** → `.accessibilityHidden(true)` : son sens est désormais porté par la
  valeur du champ, on évite un élément muet dupliqué.
- **Helper** : nouvelle computed property privée `confirmationPhraseAccessibilityValue` (2 clés i18n
  inline `String(localized:defaultValue:)`, extraites au build comme le reste du fichier).

Aucune logique de suppression (`performDeletion`, `AccountService.deleteAccount`), aucun état
(`@State`), aucun visuel (fonts, palette, layout) touché. Le hint dynamique du bouton
(`account.delete.button.hint.ready` / `.type_phrase`) préexistant reste inchangé et cohérent.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique métier, 0 mutation d'état, 0 test neuf. 2 clés i18n a11y neuves
  (`account.delete.confirmation.value.matched` / `.pending`) en inline `defaultValue` — cohérent avec
  le fichier qui n'alimente pas `Localizable.xcstrings` (défauts au runtime).
- Aucun test ne référence `DeleteAccountView` → aucune régression de test.

## Statut

**TERMINÉE** — `DeleteAccountView` : feedback VoiceOver de validation de la phrase de confirmation
(`.accessibilityValue` sur le champ + checkmark masqué). Ne plus re-flagger ce point.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `DeleteAccountView` — `.accessibilityValue` de correspondance de phrase sur le `TextField` de
  confirmation + checkmark de validation masqué (`.accessibilityHidden`). **SOLDÉ 150i.**
