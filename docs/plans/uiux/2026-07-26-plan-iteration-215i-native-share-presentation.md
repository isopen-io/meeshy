# Plan — iOS UI/UX Iteration 215i

**Objet** : converger les flux de partage de lien sur la présentation native
SwiftUI (`.sheet(item:)` + `ShareSheet`) au lieu du parcours manuel de la
hiérarchie de fenêtres.

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-215i-native-share-presentation.md`
**Base** : `main` HEAD `208daa5` · **Branche** : `claude/quirky-curie-vjj2u6`
**Numérotation** : 215i, strictement > 214i (PR #2319, en vol)

## Étapes

- [x] Resync : branche repartie de `origin/main` (le commit précédent de la
      branche était déjà mergé dans `main` via #2321 → « PR mergée = travail neuf »)
- [x] Audit : classes de défauts habituelles balayées et **épuisées**
      (icône-seule : 1 reste sans call-site ; i18n : 11 faux positifs ;
      `NavigationView` : revendiqué par #2319 ; Dynamic Type : doctrine gelée)
- [x] Collision essaim : `list_pull_requests` (open) → 2 PR iOS, aucun fichier commun
- [x] Identifier le patron cible **déjà présent** dans le dépôt
      (`PostDetailView` → `ShareableLink` + `.sheet(item:)` + `ShareSheet`)
      plutôt qu'inventer un helper UIKit maison
- [x] `ConversationInfoSheet` : état `shareableLink`, `.sheet(item:)`, suppression
      des 2 `@State` morts (`createdShareLinkId`, `showShareSheet`)
- [x] `InviteFriendsSheet` : état `shareableLink`, `.sheet(item:)`, suppression
      du helper `presentShareSheet(url:)`
- [x] `ConversationListView` : suppression de `shareConversationLink(for:)`
      (0 appelant, vérifié sur `apps/ios` + `packages/MeeshySDK`)
- [x] Test neuf `NativeSharePresentationTests` (5 tests / 19 assertions)
- [x] RED prouvé contre `main` (18/19), GREEN après correctif (19/19)
- [x] Équilibre des accolades des 3 fichiers vérifié au tokenizer
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**Ne pas créer de helper UIKit partagé.** Le premier réflexe était d'extraire les
7 copies du parcours de fenêtres dans un `ActivitySheetPresenter` unique. Rejeté :
cela aurait consolidé — donc pérennisé — l'anti-patron que le dépôt **rejette
explicitement** (`CommunityLinkDetailView.swift:67`). Le patron `.sheet(item:)`
supprime les deux défauts *par construction*, sans code à maintenir.

**Ne pas utiliser `ShareLink` ici.** `ShareLink` exige son item à la construction
de la vue ; ces 2 sites forgent le lien **de façon asynchrone** (appel gateway
`createShareLink`). `PostDetailView` a déjà résolu ce cas précis avec
`.sheet(item:)` — on s'aligne dessus. `ShareLink` reste la cible des sites dont
l'item est synchrone (216i+).

**Supprimer plutôt que corriger le chemin mort.** `shareConversationLink(for:)`
n'avait aucun appelant : le « corriger » aurait maquillé du code mort en
amélioration. La suppression emporte aussi 2 chaînes non localisées.

**Périmètre resserré à 3 fichiers.** `StoryViewerView+Content` porte le même
défaut mais son état vit dans un autre fichier et la surface story est chaude
(essaim actif) → 216i, conformément à la leçon « ne pas ré-attaquer une surface
chaude ».

## Suites (216i+)

1. `StoryViewerView+Content.shareStory()` — même correctif, quand la surface story
   refroidit (état à porter dans `StoryViewerView.swift`).
2. `ShareLinkDetailView` / `AffiliateView` / `TrackingLinkDetailView` — ancre
   correcte mais parcours de fenêtres dupliqué ; item synchrone → migration
   `ShareLink` (patron `CommunityLinkDetailView`).
3. `UniversalComposerBar.toolbarButton` / `ThemedComposerButton` — label a11y de
   composants réutilisables sans call-site (priorité basse, hérité du pointeur 214i).
4. `MeeshyShareExtension` n'a pas de `Localizable.xcstrings` propre → 3 chaînes
   brutes (`"Cancel"`, `"Send"`, `"Share to Meeshy"`), noté par #2319.
