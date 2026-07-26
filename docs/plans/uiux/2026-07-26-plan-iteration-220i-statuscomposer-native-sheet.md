# Plan — Iteration 220i

**Date** : 2026-07-26
**Base** : `main` HEAD `ffef133`
**Branche** : `claude/quirky-curie-pfpkyf`
**Axe** : le composeur d'humeur devient une feuille native correcte
**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-220i-statuscomposer-native-sheet.md`

## Pourquoi cette cible

Piste n° 4 de 219i, débloquée : #2275 (qui détenait `StatusComposerView`) est
mergée, et `list_pull_requests` (open) = **0 PR** → 0 collision.
`StatusComposerView` était le **dernier** `NavigationView` de production de tout
l'arbre iOS ; `NavigationContainerMigrationTests:81` prescrivait explicitement
cette itération comme suite.

## Étapes

| # | Fichier | Changement |
|---|---|---|
| 1 | `StatusComposerView.swift` | `NavigationView {` → `NavigationStack {` |
| 2 | `StatusComposerView.swift` | `VStack` du corps enveloppé dans un `ScrollView` ; `Spacer()` final retiré (résout à zéro dans un conteneur défilant) |
| 3 | `StatusComposerView.swift` | `.scrollDismissesKeyboard(.interactively)` sur le `ScrollView` |
| 4 | `RootViewComponents.swift:743` | `[.medium]` → `[.medium, .large]` |
| 5 | `ConversationListView.swift:756` | `[.medium]` → `[.medium, .large]` + `.presentationDragIndicator(.visible)` |
| 6 | `ConversationListView.swift:772` | idem |
| 7 | `NavigationContainerMigrationTests.swift` | + `test_statusComposer_usesNavigationStack` ; attendu du cliquet réduit à `[]` |
| 8 | `StatusComposerSheetPresentationTests.swift` | **neuf** — 6 tests (contrat composeur + contrat de présentation aux 3 sites) |

## Contraintes respectées

- **Plancher iOS 16.0** (`project.yml`) : `NavigationStack` et
  `.scrollDismissesKeyboard` sont tous deux disponibles inconditionnellement —
  aucun `@available`, aucun shim de compatibilité.
- **0 clé i18n neuve** — aucune chaîne user-visible ajoutée ou modifiée.
- **0 logique métier / 0 réseau** — `setStatus`, la récupération de brouillon
  hors-ligne, `supersedeRecoveredStatus` et la résolution d'audience sont
  intouchés.
- **0 changement visuel aux tailles par défaut** : le `Spacer()` retiré était le
  seul absorbeur de mou, et un `ScrollView` vertical aligne déjà en haut un
  contenu plus court que la feuille.
- **Convention de dépôt** : `[.medium, .large]` est le jeu dominant (24 vs 6) ;
  `.scrollDismissesKeyboard(.interactively)` est déjà utilisé 7 fois.
- **Pas d'édition de `project.pbxproj`** : le target `MeeshyTests` globbe
  `MeeshyTests` récursivement, `xcodegen generate` enregistre le fichier neuf.

## Vérification (pas de toolchain Swift sous Linux)

1. Réimplémentation indépendante des **15 assertions** (strip de commentaires,
   balayage d'arbre, look-ahead borné) → **15/15 conformes**.
2. Premier passage rouge sur `containsNoDeadSpacer` (le commentaire de
   production nommait `Spacer()`) → helper `code(_:)` introduit ; preuve que la
   simulation discrimine.
3. Équilibre `{}` / `()` / `[]` des 5 fichiers au tokenizer → **0 / 0 / 0**.
4. Ombrage Swift évité (`let code = try code(…)` → `let swift = try code(…)`).

Gate réel = CI `iOS Tests`.

## Statut

| Étape | État |
|---|---|
| Développement | ✅ |
| Analyse + plan | ✅ |
| Tracking synchronisation | ✅ |
| Push branche | ⏳ |
| CI verte | ⏳ |
| Merge + suppression de branche | ⏳ |
