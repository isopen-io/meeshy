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

Règles d'outcome :
- `translation ≤ -80` **ou** `predicted ≤ -160` → `.openMore`
- `translation ≥ 80` **ou** `predicted ≥ 160` → `.dismiss`
- sinon → `.snapBack`

Les seuils sont cohérents avec l'existant du fichier (fade threshold 80 pt) et
l'ancien `swipeDownGesture` (predicted > 60) durci à 80 pour symétrie.

### Câblage dans `MessageOverlayMenu`

- `DragGesture(minimumDistance: 12)` attaché à `MessageActionsMenu` (le menu
  vertical) dans le chemin native-lean (`useSourceFrame == true`).
  **Pas** sur la barre emoji (elle scrolle horizontalement — conflit de gestes) ni
  sur la bulle (elle est `allowsHitTesting(false)` pour laisser le tap-fond fermer).
- Pendant le drag : le **cluster entier** (barre emoji + bulle + menu) suit
  `displayOffset` en `.offset(y:)` — cohésion visuelle ; état local
  `@State clusterDragOffset: CGFloat`.
- Franchissement du seuil up (`isArmed` passe à true) : `HapticFeedback.medium()`
  **une seule fois par geste** (flag local réarmé au release).
- Release : `outcome(translation:predicted:)` →
  - `.openMore` → `handlePrimaryAction(.more)` (réutilise onShowMore + dismiss,
    zéro nouveau chemin) ;
  - `.dismiss` → `dismiss()` existant ;
  - `.snapBack` → spring `response 0.35, dampingFraction 0.75` vers 0.
- Geste ignoré tant que `isVisible == false` (animation d'entrée en cours).

### Purge du code mort

À supprimer (vérifié : zéro call site hors d'eux-mêmes) :
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
- Dans `MessageOverlayMenu.swift` : `quickActions`, `handleQuickAction`,
  `quickActionPalette`, la géométrie panneau legacy (`gridVisibleHeight`,
  `naturalPanelBaseHeight`… jusqu'à `clusterIsInteractive`), `detailPanel`,
  `panelDragHandle`, `panelDragGesture`, `panelBackground`, `overlayActions`,
  `@State forceTab`, et l'état `dragOffset` legacy (remplacé par
  `clusterDragOffset`).
- `BubbleAnimations.swift` est **conservé** (`overlayRevealCrossfade` utilisé par
  `MessageListView`) ; retirer seulement les constantes devenues orphelines si la
  compile le confirme.

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
  disjointes par construction (signes opposés).

## Tests

- `apps/ios/MeeshyTests/Unit/Components/MessageOverlayDragLawTests.swift` (TDD,
  à côté de `MessageActionResolverTests`) : outcome up fort / up faible / vélocité
  seule / down fort / down faible / zéro ; `displayOffset` 1:1 sous le seuil,
  amorti et monotone au-delà ; `isArmed` exactement au seuil.
- Suppression de `MessageOverlayLayoutEngineTests` (avec le moteur).
- `./apps/ios/meeshy.sh build` vert + suite ciblée sur simulateur 18.2.
- Vérification visuelle simulateur : long-press → menu 1 unifié ; swipe-up fort →
  menu 2 ; swipe-up faible → retour ; swipe-down → fermeture ; taps rows intacts ;
  scroll barre emoji intact.

## Hors scope

- Toute évolution du menu 2 (`MessageMoreSheet`).
- Animation d'émergence type conversations (morph / chip / drop).
- Le chemin natif `.contextMenu` iOS 26 (non retenu : il perdrait la barre emoji).
