# Story Reaction Scrub — sélection de réaction par longpress + glissement continu

Date : 2026-08-11
Plateformes : iOS + Android (parité complète)
Branche : `feat/story-reaction-scrub` (PR vers `dev`)

## Problème

Dans le viewer de stories, choisir une réaction demande aujourd'hui deux gestes séparés
(tap pour ouvrir la barre, tap pour choisir) sur iOS, et Android affiche une strip
d'emojis en permanence sans bouton cœur ni icône langue. Aucune plateforme n'offre le
geste continu attendu : maintenir, glisser, relâcher.

## Décisions produit (validées)

1. **Tap court sur le cœur = envoi immédiat de ❤️** avec l'animation de vol
   (pattern Instagram/WhatsApp). Sur iOS c'est un changement : le tap n'ouvre plus la barre.
2. **Longpress sur le cœur = barre de réactions immédiate + glissement continu** sans
   lever le doigt : la tuile sous le doigt grossit avec rebond, reprend sa taille en la
   quittant, y compris le bouton (+). Relâchement = sélection.
3. **L'icône langue a la même mécanique** (longpress → barre de drapeaux → survol →
   relâchement = sélection de langue). Son tap court garde le comportement actuel
   (toggle de la barre).
4. **Pendant le geste (réaction ou langue), le swipe left/right des stories est
   neutralisé** et l'auto-advance est en pause.
5. **Animation de sélection ≤ 1 s** : la barre disparaît vite, l'emoji vole de sa
   position agrandie vers l'icône cœur en rétrécissant, l'icône grossit à l'arrivée puis
   reprend sa taille. Tous les scale de ce système utilisent des springs à rebond.
6. **Android adopte le rail latéral en parité iOS** (cœur + compteur, icône langue +
   badge code langue) ; la strip permanente du bas est supprimée.

## Machine d'états gestuelle (identique sur les 2 plateformes)

```
idle
 ├─ tap cœur ────────────────→ envoi ❤️ + animation de vol → idle
 ├─ tap langue ──────────────→ toggle barre langue (sélection au tap, existant)
 ├─ longpress cœur (~250 ms) ─→ scrubbing(réactions)   [haptique]
 └─ longpress langue (~250 ms)→ scrubbing(langues)     [haptique]

scrubbing(x)
 ├─ drag : hit-test position du doigt → hoveredIndex (tuile ×1.35 rebond,
 │         retour ×1.0 en la quittant ; le (+) est une tuile comme les autres)
 │         [haptique légère à chaque changement de tuile survolée]
 ├─ relâche sur emoji ───────→ sélection → flying(emoji) → idle
 ├─ relâche sur drapeau ─────→ applique la langue, ferme la barre → idle
 ├─ relâche sur (+) ─────────→ ferme la barre, ouvre le picker complet → idle
 │                             (réactions sur les 2 plateformes ; langue : iOS
 │                              uniquement, la barre langue Android v1 n'a pas de (+))
 └─ relâche hors tuile ──────→ la barre RESTE ouverte en mode posé : sélection au
                               tap possible (accessibilité), fermeture par tap
                               ailleurs ou changement de slide (mécanisme
                               dismissActiveReaderFeature existant sur iOS,
                               équivalent à créer sur Android) → idle

flying(emoji)  — budget total ≤ 1 s
 1. barre : disparition rapide ~120 ms (fade + scale-down)
 2. vol   : overlay racine, position tuile→cœur, scale 1.35 → 0.5, spring, ~450 ms
 3. impact: icône cœur ×1.35 (spring rebond) puis retour 1.0, ~300 ms
```

Le hit-testing (cadres des tuiles + position du doigt → index survolé) est un objet pur
par plateforme, testé unitairement. Les tuiles publient leurs cadres dans l'espace de
coordonnées du viewer ; le doigt bénéficie d'une marge de tolérance verticale (±16 pt/dp
autour de la barre) pour ne pas perdre le survol sur un tremblement.

Quand la barre est ouverte en mode posé (longpress relâché hors tuile, ou tap sur
l'icône langue), le tap direct sur une tuile reste fonctionnel (accessibilité,
comportement actuel conservé) et déclenche les mêmes animations de sélection.

## Specs d'animation

| Étape | iOS | Android |
|---|---|---|
| Grossissement survol ×1.35 / retour ×1.0 | `.spring(response: 0.25, dampingFraction: 0.5)` | `MeeshyMotion.bouncySpring()` |
| Disparition barre (~120 ms) | fade + `scale(0.8)` easeOut | `fadeOut + scaleOut(0.8)` tween 120 ms |
| Vol position (≈450 ms) | spring `response 0.45, damping 0.8` sur la position, scale 1.35→0.5 | `Animatable` Offset spring + scale 1.35→0.5 |
| Impact cœur ×1.35 → 1.0 | mécanisme `heartScale` existant (`response 0.22/0.34`) | `animateFloatAsState` + `bouncySpring()` |

Haptique — iOS : `.light()` à l'ouverture longpress et à chaque changement de survol,
`.medium()` à la sélection, `.error()` au rollback (existant). Android :
`LongPress` à l'ouverture et à la sélection, `TextHandleMove` au changement de survol.

L'animation « big reaction » iOS actuelle (emoji 100 pt qui monte à l'écran,
`bigReactionPhase`) est **remplacée** par l'animation de vol sur tous les chemins.
Le vol part du cadre de la tuile pour la barre scrubbable ; pour le tap ❤️ direct et
la sélection depuis le picker complet (chemins sans tuile ancrée), il dégénère en pop
sur le cœur — même chemin de code, départ = cadre du cœur.

## Architecture iOS

Fichiers touchés :

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift` —
  nouveaux paramètres opaques optionnels : `highlightedIndex: Int?` (tuile agrandie
  ×1.35, le (+) porte l'index `quickEmojis.count`) et publication des cadres des tuiles
  (anchor preferences résolues dans un `coordinateSpace` nommé fourni par l'appelant,
  remontées via callback `onTileFrames: ([Int: CGRect]) -> Void`). Aucun geste ni règle
  produit dans le SDK (SDK purity : paramètres opaques uniquement).
- `apps/ios/Meeshy/Features/Main/Views/StoryLanguageQuickBar.swift` — mêmes deux
  paramètres (survol + cadres).
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift` — bouton cœur :
  tap → `triggerStoryReaction("❤️")` ; `LongPressGesture(minimumDuration: 0.25)`
  `.sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named(…)))` →
  ouvre la barre + pilote le scrub. Bouton langue : tap conservé, même geste séquencé
  pour le scrub des drapeaux.
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` + `+Canvas.swift` —
  état `flyingReaction` (emoji, cadre départ, cadre arrivée) rendu en overlay du canvas ;
  suppression de `bigReactionPhase` et de son rendu ; `shouldPauseTimer` intègre
  `isScrubbing`.
- Nouveau `apps/ios/Meeshy/Features/Main/Support/ScrubSelectionResolver.swift` —
  struct pure : `resolve(tileFrames: [Int: CGRect], point: CGPoint, tolerance: CGFloat)
  -> Int?` + `action(onRelease:)` (emoji / expand / dismiss). Testée en XCTest
  (pattern `StoryGestureDecisions`).

Le blocage du swipe est structurel sur iOS : le geste séquencé appartient au bouton du
rail, le canvas (tap/double-tap/hold/drag de navigation) ne reçoit rien pendant le
scrub. Le flag `isScrubbing` sert uniquement à la pause du timer.

## Architecture Android

Fichiers touchés (module `feature/stories` sauf mention) :

- Nouveau `StoryRailPlan.kt` — objet pur :
  `resolve(isOwnStory: Boolean, hasTranslatableContent: Boolean): StoryRailPlan`
  (`showsReact`, `showsLanguage`), parité `StoryActionRailPlan` iOS. Test JVM.
- Nouveau `ScrubHitResolver.kt` — objet pur : `resolve(tileBounds: Map<Int, Rect>,
  position: Offset, toleranceDp: Float): Int?` + résolution de l'action au relâchement.
  Test JVM (pattern `StorySwipeResolver`).
- Nouveau composable `StoryActionRail` (dans `StoryViewerScreen.kt` ou fichier dédié) —
  cœur + compteur de réactions, icône langue + badge code langue, aligné bord droit.
  Gestes par bouton : `detectTapGestures` + `detectDragGesturesAfterLongPress`
  (longpress → barre + scrub, positions converties en coordonnées racine).
- `StoryViewerScreen.kt` — suppression de la `ReactionStrip` du bas ; overlays barre
  réactions / barre langues ancrés au rail ; overlay de vol à la racine (`Animatable`
  position + scale) ; flag `railOverlayActive` : early-return dans les deux
  `pointerInput` racine (tap et drag) + ajout aux clés, et ajout aux clés/garde du
  `LaunchedEffect` d'auto-advance (même mécanisme que `showViewers`/`showComments`).
- `sdk-ui/…/component/EmojiPicker.kt` — `EmojiQuickStrip` : paramètres opaques
  optionnels `highlightedIndex: Int? = null` et `onTileBounds: ((Int, Rect) -> Unit)?`
  (via `onGloballyPositioned`) ; tuile survolée ×1.35 `graphicsLayer` +
  `animateFloatAsState(bouncySpring)`. Le (+) porte l'index `emojis.size`.
- Nouveau `sdk-ui/…/component/LanguageQuickStrip.kt` — pilule de drapeaux, mêmes
  paramètres survol/cadres, scrollable au-delà de 5, sans bouton (+) en v1.
- `StoryViewerViewModel.kt` — expose `availableLanguages` du slide courant (original +
  traductions) et `languageOverride: String?` éphémère (reset au changement de story,
  parité `sessionLanguageOverride` iOS) ; `StoryContentResolver.resolve` accepte
  l'override en priorité au-dessus des préférences. Tests VM.
- Relâchement sur (+) réactions → `ModalBottomSheet` + `EmojiFullPicker` (existant),
  sélection → même chemin `react()` + vol depuis le bas de l'écran.

L'envoi réutilise `viewModel.react(emoji)` existant (optimisme + rollback,
REST `POST posts/{id}/like`). **Aucun changement backend.**

## Résolution de langue (rappel Prisme)

L'override choisi via la barre de langues est une exploration explicite de
l'utilisateur : il prime sur la résolution automatique pour la session de visionnage,
est éphémère et ne modifie pas les préférences persistées. S'il n'existe pas de
traduction pour l'override choisi, le contenu original est affiché (jamais de fallback
`translations.first`).

## Tests

Android (JVM, module stories + sdk-ui) :
- `StoryRailPlanTest` — membership du rail (own story, contenu traduisible).
- `ScrubHitResolverTest` — survol par position, tolérance verticale, hors-barre,
  index du (+), action au relâchement (emoji / expand / dismiss).
- `StoryViewerViewModelTest` — override de langue appliqué/priorisé/reset au
  changement de story ; `availableLanguages`.

iOS (XCTest, bundle app) :
- `ScrubSelectionResolverTests` — mêmes cas que côté Android.
- Tests existants du viewer inchangés ; `./apps/ios/meeshy.sh test` doit passer.

Gates avant commit final : `./apps/ios/meeshy.sh build` + tests iOS ; tests Gradle
des modules `feature:stories` et `sdk-ui`.

## Hors périmètre

- Alignement des jeux d'emojis rapides entre plateformes (Android garde ses 8, iOS ses 6).
- Retraduction à la demande côté Android (bouton (+) de la barre langue, sheet détail
  langues, `POST /posts/{id}/translate`) — la barre v1 liste les langues déjà
  disponibles sur le slide.
- Toute modification gateway/translator.
- Réactions des messages de chat (la mécanique scrub pourra y être portée plus tard via
  les mêmes composants).
