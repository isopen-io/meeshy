# Call Banner Swipe-to-Collapse — Design Spec

## Contexte

Aujourd'hui, `FloatingCallPillView` (`apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift`) est la seule
forme réduite d'un appel en cours : une pill pleine largeur ancrée en haut de l'écran, visible quand
`CallManager.displayMode == .pip && callState.isActive`. Elle affiche le flux vidéo distant (ou l'avatar en
fallback), un glyphe de qualité de signal (`TransientCallSignalGlyph` / `CallSignalStrength`), et se contente
d'un `.onTapGesture` qui rouvre le plein écran. Il n'existe aucun geste de swipe, ni de forme "bulle" plus discrète.

Cette spec ajoute un 3ᵉ état d'affichage : une bulle avatar circulaire, repliable par swipe depuis la pill,
déplaçable, et révélant un mini-menu d'appel rapide (mute, haut-parleur, raccrocher) sans repasser par le plein
écran.

## Objectifs

- Swiper horizontalement (gauche ou droite, même effet) sur la pill la replie en bulle avatar circulaire.
- La bulle affiche le flux vidéo distant (ou l'avatar) + un badge de qualité de signal superposé en haut-droite,
  dans le même esprit visuel que le badge de notification du FAB principal (`NotificationBadge`).
- La bulle est déplaçable (drag libre) et se clipse au bord d'écran le plus proche au relâchement.
- Taper sur la bulle rouvre directement le plein écran (pas d'étape intermédiaire par la pill).
- Un appui long sur la bulle révèle un mini-menu d'appel : bouton mute à gauche de la bulle, bouton
  haut-parleur à droite, bouton raccrocher en dessous — permettant ces 3 actions rapides sans rouvrir le plein
  écran.

## Non-objectifs

- Pas de contrôle caméra sur la bulle — le mini-menu couvre uniquement mute, haut-parleur et raccrocher.
- Pas de changement du comportement existant pill ↔ plein écran (le chevron minimize dans `CallView.swift` continue
  de fonctionner comme aujourd'hui).
- Pas de persistance de la position de la bulle au-delà de la durée de l'appel courant (elle réapparaît à la
  position par défaut au prochain appel).

## État & modèle de données

`CallDisplayMode` (`apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift:820-823`) gagne un cas :

```swift
enum CallDisplayMode: Sendable {
    case fullScreen
    case pip
    case bubble
}
```

`CallManager` (`Features/Main/Services/CallManager.swift`) gagne deux propriétés publiées pour la position de la
bulle, exprimées en fraction de la zone sûre plutôt qu'en point absolu (reste valide après rotation) :

```swift
enum BubbleHorizontalEdge: Sendable { case leading, trailing }

@Published var bubbleEdge: BubbleHorizontalEdge = .trailing
@Published var bubbleVerticalFraction: CGFloat = 0.08 // proche du haut par défaut, sous la Dynamic Island
```

`FloatingCallPillView` est montée sans condition à deux endroits (`RootView.swift:575`,
`iPadRootView+Sheets.swift:148`) ; la garde d'affichage (`displayMode == .pip && callState.isActive &&
!isSystemPiPActive`) vit dans son propre `body` (`FloatingCallPillView.swift:100`), pas au site de montage.
`CallBubbleView` suit le même montage inconditionnel aux deux mêmes emplacements, avec une garde interne
symétrique : `displayMode == .bubble && callState.isActive && !isSystemPiPActive`.

> **Dérogation assumée** : `bubbleEdge`/`bubbleVerticalFraction` sont de l'état de positionnement écran, donc
> a priori de l'état "view-only" que la règle CLAUDE.md *"Never store view-only state (animations, scroll
> position) in ViewModels"* interdit de mettre sur un manager `@Published`. On les met néanmoins sur
> `CallManager`, pour la même raison que `displayMode` y est déjà : cet état doit être visible et cohérent
> depuis deux points de montage distincts (`RootView` et `iPadRootView`), donc ne peut pas vivre en `@State`
> local d'une seule vue. C'est une extension du précédent existant, pas un nouvel écart.

## Geste pill → bulle

`FloatingCallPillView` gagne un `DragGesture` horizontal, sur le même principe que le swipe-to-reply des bulles
de message (`MessageListView.swift:164`, `DragGesture(minimumDistance: BubbleSwipeResistance.minimumDistance(...))`) :

- Suivi de `value.translation.width` uniquement (axe horizontal) ; la composante verticale est ignorée pour ne
  pas entrer en conflit avec un futur scroll de la zone au-dessus.
- Résistance élastique sous le seuil de commit, retour au haptic `.light()` en franchissant le seuil (même
  sensation que l'existant).
- Décision extraite en fonction pure et testable :

```swift
enum CallBubbleGestureResolver {
    static func shouldCollapse(translationWidth: CGFloat, velocityWidth: CGFloat) -> Bool
    static func snappedEdge(centerX: CGFloat, screenWidth: CGFloat) -> BubbleHorizontalEdge
}
```

- Au relâchement : si `shouldCollapse` est vrai (distance OU vélocité au-delà du seuil, direction gauche ou
  droite indifféremment), la pill s'anime en glissant hors écran + fondu, haptic `.success()`, puis
  `callManager.displayMode = .bubble`. Sinon, rebond ressort vers la position d'origine.

## CallBubbleView (nouveau composant)

Fichier : `apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift`.

- Cercle de 56pt de diamètre (cohérent avec `buttonSize` des FAB existants, `FloatingButtons.swift:67`).
- Contenu vidéo/avatar : extraction du bloc `pillLeadingVisual` / `avatarView` de `FloatingCallPillView` (lignes
  172-219) vers une sous-vue partagée `CallParticipantVisual(diameter: CGFloat)` (flux vidéo distant si actif,
  sinon avatar via `CachedAsyncImage`, cache-first via `resolveRemoteProfile`) — paramétrée par `diameter` pour
  être réutilisée à 44pt dans la pill ET à 56pt dans la bulle, sans dupliquer le layout.
- Badge qualité de signal : `TransientCallSignalGlyph(strength:)` existant, réutilisé tel quel, positionné en
  haut-droite du cercle (`.offset(x: 16, y: -16)`, style repris de `NotificationBadge`,
  `FloatingButtons.swift:659-699`).
- Position : `.position()` dérivée de `bubbleEdge` + `bubbleVerticalFraction` du `CallManager`, calculée par
  rapport aux `safeAreaInsets` du conteneur.

### Composition des gestes (tap / drag / long-press)

La bulle porte 3 reconnaisseurs sur la même vue — un cas non couvert tel quel par les 2 précédents existants
dans le code (`MessageListView.swift:90-113` combine drag + long-press via
`.simultaneousGesture(dragGesture)` + `.simultaneousGesture(LongPressGesture(minimumDuration:
maximumDistance:))` ; `ReelsPlayerView.swift:481-482` montre que tap + long-press seuls, sans drag, sont
nativement mutuellement exclusifs). On étend le premier pattern à 3 gestes :

```swift
CallParticipantVisual(diameter: 56)
    .simultaneousGesture(dragGesture)                     // repositionnement, voir plus bas
    .simultaneousGesture(
        LongPressGesture(minimumDuration: 0.5, maximumDistance: 6)
            .onEnded { _ in revealQuickMenu() }
    )
    .onTapGesture { callManager.displayMode = .fullScreen }
```

- `maximumDistance: 6` (même valeur que `MessageListView.swift:108`) : si le doigt bouge de plus de 6pt avant
  0.5s, le `LongPressGesture` s'annule et laisse le `DragGesture` s'approprier le geste — pas de contention
  entre "je veux déplacer la bulle" et "je veux le menu".
- Le tap classique ne fire qu'au relâchement sans mouvement significatif ; comme dans `ReelsPlayerView`, il
  reste mutuellement exclusif du long-press réussi.
- Pendant que le mini-menu est révélé, le tap normal (→ plein écran) est désactivé côté state (`isMenuRevealed`
  gate dans le handler du tap), pour éviter toute ambiguïté après une révélation.

### Geste drag (repositionnement)

- `DragGesture` qui suit le doigt en direct (offset appliqué directement, pas de fraction persistée pendant le
  drag).
- Au relâchement : `CallBubbleGestureResolver.snappedEdge(centerX:screenWidth:)` détermine le bord le plus
  proche ; animation ressort vers ce bord ; `bubbleEdge` et `bubbleVerticalFraction` (clampée dans la zone sûre)
  sont mis à jour sur `CallManager` pour persister la position tant que l'appel est actif.
- **Exclusion du FAB principal** : `bubbleVerticalFraction` est clampée pour exclure la zone occupée par le
  FAB principal (menu ladder / badges de notification, coin bas-droit) — le clamp exact (marge en pt depuis le
  bas de la zone sûre) est à mesurer en implémentation contre la position réelle du FAB, mais le principe est
  que la bulle ne peut jamais se déposer dans/sur cette zone, quel que soit le bord (`leading`/`trailing`) où
  elle est ancrée.

### Geste long-press (mini-menu d'appel)

- Révèle 3 boutons ronds d'au moins 44×44pt (minimum HIG) autour de la bulle :
  - **Mute**, à gauche de la bulle — `icon: callManager.isMuted ? "mic.slash.fill" : "mic.fill"`,
    couleur `callManager.isMuted ? MeeshyColors.error : .white` (mêmes symboles/couleurs que le contrôle
    équivalent de `CallView.swift:1329-1337`), tap → `callManager.toggleMute()`.
  - **Haut-parleur**, à droite de la bulle — `icon: callManager.isSpeaker ? "speaker.wave.3.fill" : "speaker.fill"`,
    couleur `callManager.isSpeaker ? MeeshyColors.info : .white` (repris de `CallView.swift:1344-1352`), tap →
    `callManager.toggleSpeaker()`.
  - **Raccrocher**, en dessous de la bulle — bouton rond rouge (`phone.down.fill`), tap →
    `callManager.endCall()` (existant, `CallManager.swift:1637`).
- Mute et haut-parleur sont des **toggles persistants** : l'icône/couleur reflète l'état courant à chaque
  ouverture du mini-menu (pas de fermeture automatique après action — l'utilisateur peut toggler les deux puis
  fermer le menu manuellement). Raccrocher, lui, ferme le menu et termine l'appel immédiatement au tap (action
  destructive, pas de second niveau de confirmation au-delà du long-press qui l'a révélé).
- **Gestion du bord d'écran** : les positions gauche/droite sont relatives à la bulle. Si la bulle est ancrée
  côté `.trailing`, le bouton droit (haut-parleur) sortirait de l'écran — dans ce cas, à la révélation, le
  cluster bulle + 3 boutons se décale temporairement vers l'intérieur de l'écran (juste assez pour que les 3
  tiennent), et revient à la position ancrée au bord quand le menu se referme. Symétrique si ancrée `.leading`.
  Décision extraite en fonction pure testable au même titre que les 2 autres :
  `CallBubbleGestureResolver.menuOffset(edge: BubbleHorizontalEdge, screenWidth: CGFloat, buttonDiameter:
  CGFloat) -> CGFloat`.
- **Couche de fermeture** : pendant que le mini-menu est révélé, un calque transparent plein écran
  (`Color.clear.contentShape(Rectangle())`) est inséré au-dessus du reste du contenu de `RootView`/
  `iPadRootView` (mais en dessous du cluster bulle+boutons), avec un `.onTapGesture` qui referme le menu sans
  action. Ce calque n'existe QUE pendant la révélation — le reste du temps, la bulle est un overlay minimal qui
  ne capte les touches que sur son propre cercle, et ne bloque rien en dessous.
- Un tap sur ce calque, ou l'absence d'interaction pendant 3 secondes, referme le mini-menu et revient à la
  bulle simple (sans action).

## Accessibilité

Obligatoire par `apps/ios/CLAUDE.md` (règles Accessibility) ; précédent direct dans la même zone
fonctionnelle : `MessageListView.swift:77-79` expose des `.accessibilityAction(named:)` pour ses gestes
reply/forward/long-press swipe. On applique le même principe :

- Pill : `.accessibilityAction(named: "a11y.call.pill.collapse")` en équivalent VoiceOver du swipe de collapse.
- Bulle : `.accessibilityAction(named: "a11y.call.bubble.expand")` (tap → plein écran) et
  `.accessibilityAction(named: "a11y.call.bubble.quickMenu")` (long-press → mini-menu), en plus du geste réel.
- Chaque bouton du mini-menu reçoit un `.accessibilityLabel()` explicite (mute/unmute, activer/désactiver
  haut-parleur, raccrocher) — raccrocher étant destructif, son label doit être sans ambiguïté (ex. "Raccrocher
  l'appel").
- Les 3 boutons du mini-menu et la bulle elle-même respectent le minimum de touch target 44×44pt (HIG).

## Cas limites

- **Fin d'appel pendant que la bulle est affichée** : la garde `displayMode == .bubble && callState.isActive`
  fait disparaître la bulle automatiquement, comme pour la pill aujourd'hui.
- **Apparition/disparition de la vidéo distante pendant l'affichage bulle** : réactif via le binding partagé
  `CallParticipantVisual`, pas de logique supplémentaire à écrire.
- **Rotation d'écran / changement de taille de fenêtre (iPad)** : la position stockée en fraction de zone sûre +
  bord horizontal reste valide ; pas de recalcul spécial nécessaire au changement d'orientation.

## Tests

- `CallBubbleGestureResolverTests` : `shouldCollapse` (sous seuil / au-dessus en distance / au-dessus en
  vélocité, gauche et droite), `snappedEdge` (centre à gauche/droite de l'écran, cas pile au milieu), et
  `menuOffset` (cluster tient déjà à l'écran → offset nul ; ancré `.trailing`/`.leading` → offset qui ramène
  les 3 boutons dans l'écran).
- `CallManagerTests` (existant) : couverture déjà existante de `toggleMute()`/`toggleSpeaker()`/`endCall()` —
  pas de nouveau comportement `CallManager` à tester ici, le mini-menu ne fait qu'appeler ces méthodes
  existantes. Un test au niveau du composant bulle (au niveau ViewModel/état, pas de test UI de geste requis
  par les conventions du projet) vérifie que le tap sur chaque bouton du mini-menu déclenche bien l'appel
  correspondant.
- Pas de test de gesture SwiftUI bas niveau (hors du périmètre XCTest habituel de ce projet) — la logique de
  décision testée est celle extraite dans `CallBubbleGestureResolver`.

## Fichiers touchés

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift` — ajout du cas `.bubble`.
- `apps/ios/Meeshy/Features/Main/Services/CallManager.swift` — `bubbleEdge`, `bubbleVerticalFraction`.
- `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift` — ajout du `DragGesture` de collapse,
  extraction de `CallParticipantVisual`.
- `apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift` — nouveau.
- `apps/ios/Meeshy/Features/Main/Views/CallParticipantVisual.swift` — nouveau (extrait, partagé pill/bulle).
- Nouveau fichier de logique pure `CallBubbleGestureResolver.swift` + tests associés.
- `apps/ios/Meeshy/Features/Main/Views/RootView.swift:575` et
  `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Sheets.swift:148` — ajout du montage
  inconditionnel de `CallBubbleView()`, en miroir du montage existant de `FloatingCallPillView()`.
