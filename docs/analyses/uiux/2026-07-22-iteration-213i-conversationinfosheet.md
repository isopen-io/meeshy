# iOS UI/UX — Iteration 213i

**Date** : 2026-07-22
**Surface** : `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`
**Axe** : Accessibilité — labels VoiceOver pour deux boutons icône-seule
**Base** : `main` HEAD `eea15779b`

## Contexte

Un audit (fleet) des boutons icône-seule sans `.accessibilityLabel` a signalé
plusieurs candidats. Re-vérifiés un par un contre `main` courant (dépôt très
mouvant) : la plupart avaient déjà été soldés (bouton d'envoi `ThreadView`,
dismiss de la bannière d'erreur `ConversationView` — tous deux déjà labellisés).
**Deux écarts réels subsistaient**, tous deux dans `ConversationInfoSheet.swift` :

### A. Bouton « effacer » de la recherche de membres (l.497)
`Button { memberSearchQuery = "" }` avec un `Image(systemName: "xmark.circle.fill")`
et seulement `.buttonStyle(.plain)`. Aucun nom accessible → VoiceOver annonçait
un « bouton » anonyme.

### B. Bouton de fermeture de la feuille « messages épinglés » (l.810)
`ToolbarItem(.topBarTrailing)` → `Button { showAllPinnedMessages = false }` avec
un `Image(systemName: "xmark")`. Aucun label a11y.

Les deux violent la règle HIG « tout élément interactif doit porter un
`.accessibilityLabel` » — la couleur / le glyphe seuls ne transmettent pas
l'action à VoiceOver.

## Correctifs (213i)

1. **Bouton clear** → `.accessibilityLabel(String(localized: "common.clear-search", defaultValue: "Effacer la recherche", bundle: .main))`.
   Miroir exact de tous les autres boutons « clear » de champ de recherche de
   l'app (même clé `common.clear-search`).
2. **Bouton close épinglés** → `.accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))`.
   Réutilise la clé `common.close` **déjà employée par le bouton close principal
   du même fichier** (l.204) — parité sémantique et visuelle.

Les deux clés existent déjà dans `apps/ios/Meeshy/Localizable.xcstrings` et sont
utilisées à l'identique dans toute l'app → **0 clé i18n neuve**, traductions déjà
en place.

## Test (source-introspection, pattern établi)

`apps/ios/MeeshyTests/Unit/Views/ConversationInfoSheetAccessibilityTests.swift`
— même idiome que `CallViewAccessibilityTests` (lecture du source `.swift`,
assertions `source.contains(...)` scopées à une fenêtre autour d'un ancre unique).
`common.close` apparaissant deux fois dans le fichier, l'assertion du bouton
épinglés est ancrée sur `conversation.info.pinned.title` (unique) et cherche vers
l'avant. Assertions vérifiées déterministiquement hors Xcode (correspondance de
chaînes) — parade au piège test/prod qui avait fait échouer #2263.

## Portée

- **1 fichier de prod**, +2 lignes (2 modifiers). **1 fichier de test neuf**.
- **0 logique** / 0 réseau / **0 clé i18n neuve** / **0 changement visuel**.

## Vérification

- `common.clear-search` présent dans la fenêtre après `memberSearchQuery = ""` : ✔
- `common.close` présent dans la fenêtre après `conversation.info.pinned.title` : ✔
- Build iOS non exécutable sous Linux (pas de toolchain Xcode) → gate = CI
  `iOS Tests`. Le test étant source-only, sa réussite ne dépend que des chaînes
  ajoutées, vérifiées ci-dessus.

## NE PLUS re-flagger

`ConversationInfoSheet.swift` : bouton clear recherche-membres + bouton close
épinglés — labels VoiceOver soldés 213i.

## Restant (piste 214i+)

Audit fleet — candidats icône-seule restants à re-vérifier contre `main` (les
composants réutilisables sans call-site aujourd'hui) : `ThemedComposerButton`
(`ConversationHelperViews.swift`), `toolbarButton` helper
(`UniversalComposerBar.swift`). Tous deux sans call-site actuel → priorité basse.
