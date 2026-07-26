# Plan — Iteration 221i

**Date** : 2026-07-26
**Surface** : `apps/ios/MeeshyShareExtension/`
**Axes** : localisation + accessibilité
**Base** : `main` HEAD `16f819783` · Branche `claude/quirky-curie-2pvzn1`

## Pourquoi cette surface

Piste (a) du pointeur 220i, débloquée par le merge de #2319. Dette relevée en
214i et laissée ouverte comme « chantier à part entière ». Aucune PR ouverte ne
touche la cible.

## Objectifs

1. **Donner un catalogue de chaînes à l'extension.** Sans lui, `String(localized:)`
   résout contre le bundle de l'extension — qui n'a rien — et retombe sur le
   `defaultValue` **anglais** dans les 7 locales.
2. **Localiser les 3 littéraux crus** (`Cancel`, `Send`, `Share to Meeshy`) et le
   `CFBundleDisplayName` (chaîne affichée par iOS dans la feuille de partage).
3. **Aligner `CFBundleLocalizations`** sur les 7 locales de l'app (il en annonçait 5).
4. **Rendre la rangée de contact utilisable en VoiceOver** : `.onTapGesture` sans
   élément d'accessibilité → fragments de texte, pas de trait activable, état
   sélectionné porté par un checkmark + une teinte.

## Étapes

1. 3 littéraux → `String(localized: "share.*", defaultValue:)`.
2. `MeeshyShareExtension/Localizable.xcstrings` (8 clés × 7 locales), traductions
   **reprises verbatim du catalogue de l'app** pour les 5 clés homonymes et pour
   Annuler/Envoyer (`common.cancel`, `story.viewer.action.send`).
3. `MeeshyShareExtension/InfoPlist.xcstrings` (`CFBundleDisplayName`).
4. `Info.plist` : `CFBundleLocalizations` → 7.
5. `ContactRow` : `.accessibilityElement(children: .combine)` +
   `.accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])`,
   glyphes décoratifs masqués.
6. `ShareExtensionLocalizationTests` : contrat « toute clé demandée par le source
   existe dans le catalogue de l'extension » + couverture des locales + parité
   `CFBundleLocalizations`.

## Non-objectifs

- Ne pas renommer l'extension (« Share to Meeshy » → « Meeshy ») : plus conforme
  aux conventions Apple, mais c'est un choix produit, pas un correctif.
- Ne pas toucher `project.yml` / `project.pbxproj` : le globbing capte les
  catalogues (précédent prouvé `MeeshyNotificationExtension`).
- Ne pas attaquer l'arriéré de catalogue de l'app (1 724 clés) ici.
