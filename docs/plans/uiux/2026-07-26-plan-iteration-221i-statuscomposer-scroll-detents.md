# Plan — Iteration 221i

**Date** : 2026-07-26
**Base** : `main` HEAD `033ce7d`
**Branche** : `claude/quirky-curie-pfpkyf`
**Axe** : le composeur d'humeur reste utilisable à toute taille de texte, et se présente pareil partout
**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-221i-statuscomposer-scroll-detents.md`

## Renumérotation 220i → 221i

Ouverte en 220i sur `ffef133` (0 PR ouverte, 219i plus haut mergé). Pendant
l'attente d'un runner macOS (~48 min), l'essaim a livré `fdc6b42` (« le dernier
NavigationView passe à NavigationStack (220i) ») et `478e298` (également 220i).
Le défaut A de cette itération est donc **déjà dans `main`** ; il est abandonné
ici et le merge prend la version de `main`. Restent B et C, absents de `main`
(vérifié : `Spacer()` toujours présent, les 3 sites toujours `[.medium]`).

## Étapes

| # | Fichier | Changement |
|---|---|---|
| 1 | `StatusComposerView.swift` | `VStack` du corps enveloppé dans un `ScrollView` ; `Spacer()` final retiré (résout à zéro dans un conteneur défilant) |
| 2 | `StatusComposerView.swift` | `.scrollDismissesKeyboard(.interactively)` sur le `ScrollView` |
| 3 | `RootViewComponents.swift` | `[.medium]` → `[.medium, .large]` |
| 4 | `ConversationListView.swift` (×2) | `[.medium]` → `[.medium, .large]` + `.presentationDragIndicator(.visible)` |
| 5 | `StatusComposerSheetPresentationTests.swift` | **neuf** — 6 tests (contrat composeur + contrat de présentation aux 3 sites) |
| 6 | `NavigationContainerMigrationTests.swift` | conflit de merge résolu **en faveur de `main`** (0 test jumeau) |

## Réparations de branche de base (hors périmètre, mais bloquantes)

| # | Fichier | Cause amont |
|---|---|---|
| 7 | `StoryRepostFlowTests.swift` + `MockPostService.swift` | `d94500a` a ajouté `visibility` au repost sans mettre à jour le bundle de tests de l'app → 3 erreurs de compilation, **tout** `MeeshyTests` mort |
| 8 | `StoryVideoExportServiceTests.swift` | `16f8197` a fait passer la carte de fin auteur à 2 temps (queue 0,5 s → 2,0 s) sans mettre à jour le test app |

## Contraintes respectées

- **Plancher iOS 16.0** : `.scrollDismissesKeyboard` disponible inconditionnellement.
- **0 clé i18n neuve**, **0 logique métier**, **0 réseau**.
- **0 changement visuel aux tailles par défaut** : le `Spacer()` retiré était le
  seul absorbeur de mou, et un `ScrollView` vertical aligne déjà en haut un
  contenu plus court que la feuille.
- **Convention de dépôt** : `[.medium, .large]` domine (24 vs 6) ;
  `.scrollDismissesKeyboard(.interactively)` déjà utilisé 7 fois.
- **Pas d'édition de `project.pbxproj`** : `MeeshyTests` globbe récursivement.
- **Réparations amont minimales** : les tests reproduisent la production, ils ne
  la contournent pas ; aucune production tierce touchée.

## Vérification (pas de toolchain Swift sous Linux)

1. Assertions de la suite neuve réimplémentées hors Xcode → conformes.
2. Premier passage rouge sur `containsNoDeadSpacer` (le commentaire de
   production nommait `Spacer()`) → helper `code(_:)` introduit.
3. Équilibre `{}` / `()` / `[]` au tokenizer → **0 / 0 / 0**.
4. Arithmétique de la carte de fin recoupée avec les deux nombres de la CI
   (5,2 observés / 3,7 attendus, écart = `logoPhase` = 1,5 s).
5. CI a confirmé la réparation n° 7 : le bundle compile, **4550 tests passent**,
   1 seul échec restant (la carte de fin, traitée en n° 8).

Gate réel = CI `iOS Tests`.

## Statut

| Étape | État |
|---|---|
| Développement | ✅ |
| Analyse + plan | ✅ |
| Merge de `main` + résolution de conflit | ✅ |
| Tracking synchronisation | ✅ |
| Push branche | ⏳ |
| CI verte | ⏳ |
| Merge + suppression de branche | ⏳ |
