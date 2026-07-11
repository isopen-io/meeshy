# Menu long-press message unifié liquid glass + swipe-up → menu custom complet

Date : 2026-07-11
Statut : validé (design approuvé en session)

## Contexte

Parité avec la mise à jour du long-press des items de conversations : le long-press
d'un message doit afficher un menu liquid glass compatible, et un swipe trop fort
vers le haut sur ce menu doit ouvrir le menu custom complet — exactement comme un
tap sur son bouton « Plus… ».

Vocabulaire :
- **Menu 1** = la surface affichée au long-press d'une bulle.
- **Menu 2** = `MessageMoreSheet`, le menu custom complet (Répondre / Transférer /
  Discussion organisés en tête + vues détail en bas : Qui a vu, Réactions,
  Transcription, Sentiment, Historique, Signaler).

## État actuel (audité 2026-07-11 sur main)

- Le long-press (LongPressGesture 0.35 s dans `BubbleSwipeContainer`,
  `MessageListView.swift:111-134`) remonte à `ConversationView.swift:1104` qui ouvre
  **déjà directement** `MessageOverlayMenu` — la surface unifiée « native-lean » :
  barre emoji (`EmojiReactionPicker`) + vraie `ThemedMessageBubble` élevée + liste
  verticale `MessageActionsMenu` en `adaptiveGlass` (vrai `.glassEffect` iOS 26,
  `.ultraThinMaterial` teinté avant). Le menu 1 est donc déjà liquid glass et déjà
  à une seule étape.
- L'action `.more` de la liste verticale ouvre le menu 2 via `onShowMore` →
  `overlayState.detailSheetMessage` (`ConversationView.swift:1671-1674`).
- **Aucun geste vertical n'existe sur le menu 1** : seul le tap sur le fond ferme.
- L'ancienne surface intermédiaire (capsule horizontale) est **du code mort sans
  aucun call site** : `MessageContextOverlay.swift`, `ContextActionMenu.swift`,
  `MessageOverlayLayoutEngine.swift`, et dans `ConversationView+ContextOverlay.swift`
  `openContextOverlay` / `messageContextOverlayContent` / `actionsForOverlay` /
  `handleContextOverlayAction` ne sont plus appelés nulle part. Les champs
  `contextOverlay*` de `ConversationOverlayState` (`ConversationView.swift:46-63`)
  ne servent qu'à ce code mort.
- `MessageOverlayMenu.swift` traîne du code résiduel jamais rendu : `quickActions` /
  `handleQuickAction` (la capsule n'est plus instanciée), la géométrie du panneau
  legacy (`gridVisibleHeight`, `naturalPanel*`, `maxExpandUp`, `clampedDrag`,
  `clusterFade*`), `detailPanel` / `panelDragHandle` / `panelDragGesture` /
  `panelBackground` / `overlayActions` (plus appelés depuis le passage native-lean).

## Objectifs

1. **Swipe-up fort sur le menu 1 → menu 2.** Même chemin de code que le tap sur
   « Plus… » (`handlePrimaryAction(.more)`) : ouverture de `MessageMoreSheet` et
   fermeture de l'overlay.
2. **Swipe-down sur le menu 1 → fermeture** (parité gestuelle iMessage ; l'ancienne
   surface morte avait un swipe-down-to-dismiss, on ne perd aucun geste).
3. **Feedback continu** : le cluster suit le doigt avec résistance, haptic unique à
   l'armement du seuil.
4. **Purge du code mort** listé ci-dessus.

## Design

### Loi pure : `MessageOverlayDragLaw`

Nouveau fichier `apps/ios/Meeshy/Features/Main/Components/MessageOverlayDragLaw.swift`.
Logique 100 % pure (aucune dépendance UI), testable, source unique de vérité pour
« que fait ce geste » :

```swift
enum MessageOverlayDragOutcome: Equatable {
    case openMore   // swipe-up fort → menu 2
    case dismiss    // swipe-down fort → fermeture
    case snapBack   // retour spring à la position de repos
}

enum MessageOverlayDragLaw {
    static let openMoreThreshold: CGFloat = -80   // translation vers le haut
    static let dismissThreshold: CGFloat = 80     // translation vers le bas
    // vélocité : la translation prédite compte double du seuil
    static func outcome(translation: CGFloat, predicted: CGFloat) -> MessageOverlayDragOutcome
    // suivi du doigt : 1:1 jusqu'au seuil, puis amorti ×0.3 au-delà (butée élastique)
    static func displayOffset(for translation: CGFloat) -> CGFloat
    // armement (haptic) : franchissement du seuil up pendant le geste
    static func isArmed(translation: CGFloat) -> Bool
}
```

Règles d'outcome (cohérence de signe — la vélocité seule ne compte que dans la
direction du drag, ce qui rend les plages disjointes par construction) :
- `translation ≤ -80` **ou** (`predicted ≤ -160` **et** `translation < 0`) → `.openMore`
- `translation ≥ 80` **ou** (`predicted ≥ 160` **et** `translation > 0`) → `.dismiss`
- sinon → `.snapBack`

Preuve de disjonction : chaque branche exige un signe strict de `translation`
incompatible avec l'autre. Le cas croisé « drag up au-delà du seuil puis fling
down au relâchement » retombe sur la règle position (`translation ≤ -80` →
`.openMore`) ; pour annuler, l'utilisateur ramène le doigt sous le seuil avant
de relâcher (slide-off-to-cancel standard).

Les seuils sont cohérents avec l'existant du fichier (fade threshold 80 pt) et
l'ancien `swipeDownGesture` (predicted > 60) durci à 80 pour symétrie.

### Câblage dans `MessageOverlayMenu`

- `DragGesture(minimumDistance: 12)` attaché à `MessageActionsMenu` (le menu
  vertical) dans le chemin native-lean (`useSourceFrame == true`).
  **Pas** sur la barre emoji (elle scrolle horizontalement — conflit de gestes) ni
  sur la bulle (elle est `allowsHitTesting(false)` pour laisser le tap-fond fermer).
- Pendant le drag : le **cluster entier** (barre emoji + bulle + menu) suit
  `displayOffset` en `.offset(y:)` — cohésion visuelle ; état local
  `@State clusterDragOffset: CGFloat`. Les trois éléments sont des enfants
  séparés du ZStack positionnés par `.position(...)` : appliquer l'offset aux
  trois (ou les regrouper dans un `Group`).
- Si le `DragGesture` posé via `.gesture` avale le feedback de pression des
  `Button` de la liste, replier sur `.simultaneousGesture` (à valider au
  simulateur).
- Franchissement du seuil up (`isArmed` passe à true) : `HapticFeedback.medium()`
  **une seule fois par geste** (flag local réarmé au release).
- Release : `outcome(translation:predicted:)` →
  - `.openMore` → `handlePrimaryAction(.more)` (réutilise onShowMore + dismiss,
    zéro nouveau chemin) ;
  - `.dismiss` → `dismiss()` existant ;
  - `.snapBack` → spring `response 0.35, dampingFraction 0.75` vers 0.
- Geste ignoré tant que `isVisible == false` (animation d'entrée en cours).

### Purge du code mort

**La purge est atomique** : `MessageOverlayMenu.swift` référence encore
`ContextActionMenu.estimatedSize` (:288) et le type `ContextAction` (:155-195)
dans son code résiduel jamais rendu — supprimer les fichiers ET purger ces
résidus dans le même commit, sinon la compile casse entre les deux.

À supprimer (aucun call site vivant — audit revu 2026-07-11) :
- `apps/ios/Meeshy/Features/Main/Views/MessageContextOverlay.swift` (y compris
  `OverlayPhase` et `withAnimationCompletion`, uniquement consommés par ce chemin)
- `apps/ios/Meeshy/Features/Main/Views/ContextActionMenu.swift` (y compris le type
  `ContextAction`)
- `apps/ios/Meeshy/Features/Main/Views/MessageOverlayLayoutEngine.swift`
- `apps/ios/MeeshyTests/Unit/Views/Bubble/MessageOverlayLayoutEngineTests.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ContextOverlay.swift` —
  l'extension `ConversationColorPalette.fallback` qui y vit n'a plus d'usage après
  suppression ; si un autre usage apparaît à la compile, la relocaliser dans le SDK
  (`ColorGeneration.swift`) plutôt que garder le fichier.
- Champs `contextOverlay*` de `ConversationOverlayState`
  (`ConversationView.swift:49-62`) — **préserver** `longPressEnabled` (:39) et
  `quickReactionAnchorFrame` (:66), qui restent vivants.
- Dans `MessageOverlayMenu.swift` : `quickActions`, `handleQuickAction`,
  `quickActionPalette`, la géométrie panneau legacy — bloc :282-334
  (`quickActionMenuHeight`… jusqu'à `clusterIsInteractive`) en **préservant**
  `maxPreviewHeight` / `bubblePreviewScale` / `scaledBubbleHeight` (:274-278,
  consommés par le chemin native-lean) —, `detailPanel`, `panelDragHandle`,
  `panelDragGesture`, `panelBackground`, `overlayActions`, `@State forceTab`,
  l'état `dragOffset` legacy (remplacé par `clusterDragOffset`, y compris le
  reset dans `onAppear` :502).
- Props de `MessageOverlayMenu` orphelines après purge (uniquement consommées
  par `detailPanel`/`overlayActions`) + leurs arguments au call site
  `ConversationView.swift:1590-1678` : `conversationId`, `onReply`,
  `onShowThread`, `onReport`, `onDeleteAttachment`, `onSelectTranslation`,
  `onSelectAudioLanguage`, `onRequestTranslation`. (Répondre / Discussion /
  Signaler restent accessibles via le menu 2 et les swipes latéraux.)
- `BubbleAnimations.swift` est **conservé** (`overlayRevealCrossfade` utilisé par
  `MessageListView`) ; purge des statics orphelins **par grep** (la compile ne
  signale pas les statics inutilisés) : `overlaySpring`, `overlayDismiss`,
  `overlayDismissBubble` (orphelins après purge) et `standard`,
  `reactionFeedback`, `overlayBubble`, `overlayLift`, `overlayMenu`,
  `overlayMenuScale` (déjà orphelins) ; mettre à jour le doc-comment :29 qui
  cite `withAnimationCompletion`.

### Projet Xcode (XcodeGen)

`apps/ios/project.yml` globbe les sources, mais le `project.pbxproj` committé
référence les fichiers supprimés (20 références) et `meeshy.sh` ne lance pas
XcodeGen. Après toute suppression/ajout de fichier :
`cd apps/ios && xcodegen generate`, restaurer `CURRENT_PROJECT_VERSION` si
écrasé, et committer le pbxproj régénéré avec le même commit.

Garder : le chemin legacy `!useSourceFrame` minimal (fallback quand la frame de la
bulle est inconnue) — sans gestes verticaux.

### Ce qui ne change pas

- `MessageActionResolver.primaryActions` / `moreSections` : Répondre / Transférer /
  Discussion restent organisés en tête du menu 2 — pas d'ajout à la liste verticale.
- `MessageMoreSheet` (menu 2) : inchangé.
- Swipes latéraux Répondre / Transférer sur les bulles : inchangés.
- Exclusion des bulles système du long-press : inchangée.
- L'animation d'entrée de `MessageOverlayMenu` depuis la frame source : inchangée.

## Cas limites

- Drag amorcé puis revenu proche de zéro → `.snapBack`, le flag haptic se réarme.
- Tap sur une row pendant un micro-drag < 12 pt → le bouton gagne (minimumDistance).
- Menu 1 ouvert sans frame source (`.zero`) → chemin legacy, pas de gestes
  verticaux (hors scope).
- Le drag ne doit jamais déclencher `.openMore` ET `.dismiss` : les plages sont
  disjointes par construction (chaque branche exige un signe strict de
  `translation`, la vélocité seule ne compte que dans la direction du drag).
- Drag up au-delà du seuil puis fling down au relâchement → `.openMore` (règle
  position) ; l'annulation passe par le slide-off (ramener le doigt sous le
  seuil avant de relâcher).

## Tests

- `apps/ios/MeeshyTests/Unit/Components/MessageOverlayDragLawTests.swift` (TDD,
  à côté de `MessageActionResolverTests`) : outcome up fort / up faible / vélocité
  seule (dans le sens du drag) / **cas croisé translation ≤ -80 avec fling down**
  (→ `.openMore`) / **vélocité inverse au drag ignorée** / down fort / down
  faible / zéro ; `displayOffset` 1:1 sous le seuil, amorti et monotone au-delà ;
  `isArmed` exactement au seuil.
- Suppression de `MessageOverlayLayoutEngineTests` (avec le moteur).
- `xcodegen generate` après ajout/suppression de fichiers, puis
  `./apps/ios/meeshy.sh build` vert + suite ciblée sur simulateur 18.2.
- Vérification visuelle simulateur : long-press → menu 1 unifié ; swipe-up fort →
  menu 2 ; swipe-up faible → retour ; swipe-down → fermeture ; taps rows intacts ;
  scroll barre emoji intact.

## Hors scope

- Toute évolution du menu 2 (`MessageMoreSheet`).
- Animation d'émergence type conversations (morph / chip / drop).
- Le chemin natif `.contextMenu` iOS 26 (non retenu : il perdrait la barre emoji).
