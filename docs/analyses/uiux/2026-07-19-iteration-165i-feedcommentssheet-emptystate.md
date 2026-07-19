# Itération 165i — Analyse UI/UX iOS : `CommentsSheetView` — empty state

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift` (`CommentsSheetView`)
**Base** : `main` HEAD (`efedb69e4`)
**Branche** : `claude/laughing-thompson-30zik1`
**Gate** : CI `iOS Tests`

## Contexte

`CommentsSheetView` est la feuille de commentaires d'une publication du feed (également ouverte depuis
le viewer de reels via `onCommentSent`). Elle liste les commentaires racine (`ThreadedCommentSection`),
gère l'auto-preview des 2 premières réponses, le like optimiste, la synchro socket temps réel
(`comment:added` / réactions / suppression / média enrichi), et un composeur riche (photo/vidéo/fichier/
voix/localisation) via `UniversalComposerBar`.

La surface est **déjà mûre pour le Dynamic Type et VoiceOver** : les 5 `.font(.system(size:))` restants
sont **tous figés à dessein** (doctrine 82i — chrome `xmark` dans cadres tap fixes 32×32/24×24 ; indicateurs
d'état de drapeau 12/10pt appariés à un soulignement géométrique fixe ; glyphe `translate` décoratif
`accessibilityHidden`). Les boutons like / répondre / voir / « … » portent déjà `accessibilityLabel` +
`accessibilityValue` + `accessibilityHint` + `meeshyTapTarget(44)`. **Aucune migration de police
cosmétique n'est donc pertinente ici** — suivant la note de fin de traîne (« passe state-of-the-art au
tarissement — envisager pivots »), 165i vise une **vraie lacune UX/HIG**.

## Constat (avant 165i)

**Lacune d'empty state (HIG).** Quand une publication n'a **aucun commentaire**, la feuille rend un
`ScrollView` → `LazyVStack` avec un `ForEach(topLevelComments)` **vide** : l'utilisateur voit une **zone
vide muette** surmontant le composeur, sans le moindre repère ni invitation à agir. Or « Every screen
should have one primary action » et « empty states » figurent explicitement dans la checklist de revue
visuelle — chaque écran doit gérer son état vide.

Un composant natif réutilisable existe déjà et est **déjà importé** dans le fichier
(`import MeeshyUI`) : `AdaptiveContentUnavailableView` (wrapper `ContentUnavailableView` iOS 17+ avec
fallback legacy iOS 16, `accessibilityElement(children: .combine)` intégré). Aucune raison de réinventer
un placeholder custom — c'est exactement le pattern déjà employé par `FeedView`, `GlobalSearchView`,
`SharePickerView`, `ConversationListView`, etc.

## Corrections appliquées (1 fichier prod + 1 fichier test, 0 logique métier)

- **Empty state natif réutilisé** : dans le `LazyVStack`, après le `ForEach`, un
  `AdaptiveContentUnavailableView` (icône `bubble.left.and.bubble.right`, titre « Aucun commentaire »,
  sous-titre « Soyez le premier à commenter cette publication. ») s'affiche quand le post n'a aucun
  commentaire. Padding top 48 pour respirer sous la toolbar sur les détentes `.medium`/`.large`.
- **Garde pur testable** : `static func shouldShowEmptyState(commentCount:topLevelCount:)` →
  `commentCount == 0 && topLevelCount == 0` (miroir du pattern `SkeletonVisibilityResolver.shouldShowSkeleton`
  / `StoryComposerView.shouldShowEmptyStateLargePicker`). Le garde sur **`commentCount == 0`** (compteur
  autoritatif serveur, `liveCommentCount ?? post.commentCount`) empêche un **flash « aucun commentaire »**
  pendant qu'un post au compteur positif mais dont `post.comments` n'est pas encore hydraté se charge.
- **Réactivité** : dès le premier commentaire posté (optimiste), `liveCommentCount` passe à 1 et la
  liste top-level se peuple → le placeholder disparaît instantanément (aucune re-render forcée ajoutée).
- **i18n** : 2 clés neuves code-only `feed.comments.empty.title` / `feed.comments.empty.subtitle`,
  extraction inline `String(localized:defaultValue:bundle:.main)` — **0 édition `.xcstrings`**, parité
  stricte avec les clés `feed.comments.*` existantes du fichier (toutes code-only).

## TDD

RED → GREEN sur le garde pur (`StoryViewerCommentReactionTests`, hôte des tests `CommentsSheetView.*`) :
- `test_shouldShowEmptyState_zeroCountAndZeroRows_returnsTrue`
- `test_shouldShowEmptyState_hasRows_returnsFalse`
- `test_shouldShowEmptyState_countPositiveButRowsUnhydrated_returnsFalse` (le garde anti-flash)

## Périmètre / non-régression

- **1 fichier prod** (`FeedCommentsSheet.swift`), **1 fichier test**. **0 logique métier** touchée
  (send/like/thread/socket/upload inchangés), **0 changement visuel** pour un post AVEC commentaires
  (le placeholder est strictement additif, gaté sur liste vide).
- **0 nouveau composant** : réutilise `AdaptiveContentUnavailableView` (SDK MeeshyUI, déjà importé).
- Dynamic Type / VoiceOver du fichier **déjà soldés** — les 5 `.system(size:)` figés restent inchangés.

## Suivi

- **NE PLUS re-flagger** `FeedCommentsSheet` pour Dynamic Type (5 `.system` figés doctrine 82i) ni pour
  l'empty state (soldé 165i).
- **Pivot confirmé** : la traîne Dynamic Type est tarie ; les gains restants sont des **lacunes UX/HIG**
  (empty/loading/error states manquants) et de la **dédup design-system** (empty states custom → migration
  vers `AdaptiveContentUnavailableView`). Candidats empty-state à auditer : autres sheets/listes sans
  `ContentUnavailableView` (p.ex. threads de réponses vides, résultats de recherche filtrés).
