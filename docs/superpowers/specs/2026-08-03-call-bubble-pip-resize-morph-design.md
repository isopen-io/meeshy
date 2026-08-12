# Bulle d'appel — redimensionnement PiP par pinch + fix du menu long-press

**Date** : 2026-08-03
**Statut** : design validé, prêt pour plan d'implémentation
**Périmètre** : `apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift`, `CallBubbleGestureResolver.swift`, `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`, `WebRTCTypes.swift` — aucun changement gateway, shared, ou schéma.

## Constat de départ (état actuel du code)

Trois vues distinctes composent l'état "réduit" d'un appel, sélectionnées par `CallManager.displayMode` (`CallDisplayMode`, `WebRTCTypes.swift:926-930` : `.fullScreen` / `.pip` / `.bubble`) :

- **`CallBubbleView`** (`CallBubbleView.swift:11-255`) — le cercle flottant avec badge de signal en haut à droite (`.overlay(alignment: .topTrailing)`, `:74-79`), actif quand `displayMode == .bubble`.
- **`FloatingCallPillView`** (`FloatingCallPillView.swift:84-388`) — la bannière pleine largeur en haut, active quand `displayMode == .pip`. **Hors périmètre de ce design** (voir Hors périmètre).
- **`PiPSourceAnchor`** — ancre invisible pour le PiP système AVKit (`PiPCallController.swift`). **Hors périmètre.**

`CallBubbleView` a aujourd'hui trois gestes, tous en `.simultaneousGesture` sur le même conteneur :
- **Drag** (`:83`, `:134-165`) — repositionne la bulle en direct, snap au bord le plus proche au relâchement via `CallBubbleGestureResolver.snappedEdge`, persiste dans `callManager.bubbleEdge` / `bubbleVerticalFraction`.
- **Long press** (`:84-87`, `LongPressGesture(minimumDuration: 0.5, maximumDistance: 6)`) — révèle un mini-menu de 3 boutons (mute/speaker/hangup) composités dans le même `ZStack` que le cercle (`bubbleCluster(in:)`, `:57-112`) — **pas** un overlay séparé pour les boutons eux-mêmes.
- **Tap** (`:88-92`) — passe en `.fullScreen`, sauf si le menu est ouvert.

Le vrai problème du long-press n'est **pas** le mini-menu (déjà correctement composé en cluster local), mais le **`dismissLayer`** (`:48-53`) : un `Color.clear` **plein écran**, monté dès que `isMenuRevealed == true`, dont le seul rôle est d'intercepter n'importe quel tap ailleurs à l'écran pour fermer le menu. Résultat : tant que le menu est ouvert, aucune interaction avec le reste de l'app n'est possible — un tap sur un message en dessous, par exemple, ne fait que refermer le menu au lieu d'atteindre sa cible.

Aucun `MagnificationGesture`/pinch n'existe nulle part dans le code d'appel (`CallManager.swift`, `CallPiPPolicy.swift`, `PiPCallController.swift`, `CallBubbleView.swift`, `FloatingCallPillView.swift`) — le seul usage de pinch dans le repo concerne l'éditeur photo/story/vidéo, sans rapport.

## Modèle d'état

Nouvel état orthogonal à `displayMode`, dans `CallManager` (aux côtés de `bubbleEdge`/`bubbleVerticalFraction`, `CallManager.swift:257-270`) :

```swift
enum CallBubbleSizeTier: Int, Sendable, CaseIterable {
    case circle = 0, small = 1, medium = 2, large = 3
}
@Published var bubbleSizeTier: CallBubbleSizeTier = .circle
```

- Ne s'applique que quand `displayMode == .bubble`. Une transition vers `.fullScreen` ou `.pip` n'y touche pas.
- En ré-entrant en `.bubble` (nouvel appel, ou après un aller-retour fullScreen), `bubbleSizeTier` repart à `.circle` — pas de persistance cross-session : évite qu'un PiP resté agrandi surgisse par surprise à l'appel suivant.
- `bubbleEdge` / `bubbleVerticalFraction` restent la source de vérité pour l'ancrage bord/coin, réutilisée telle quelle à tous les paliers (le rectangle reste drag-gable et ancré au même bord que le cercle aujourd'hui).

## Paliers de taille

4 états, tous ancrés au même bord/coin, tous drag-gables :

| Palier | Forme | Taille indicative | Ratio |
|---|---|---|---|
| `.circle` | cercle | 56pt de diamètre (valeur actuelle) | — |
| `.small` | rectangle | ~90×160pt | 9:16 |
| `.medium` | rectangle | ~120×213pt | 9:16 |
| `.large` | rectangle | ~160×284pt | 9:16 |

Le ratio 9:16 reprend celui déjà configuré côté PiP système (`PiPCallController.swift:119`, `preferredContentSize` 1080×1920) — cohérence visuelle entre le PiP applicatif et le PiP système, même si ce sont deux mécanismes indépendants. Tailles indicatives, ajustables en implémentation sans remettre en cause le design.

`FloatingCallPillView` (bannière `.pip`) n'est **jamais** un palier de ce continuum — les deux mécanismes de réduction (drag-to-collapse pill→bubble, et pinch-resize sur la bulle) coexistent sans se croiser.

## Geste de pinch et morphing continu

Un seul `MagnificationGesture`, posé sur le composant unifié aux côtés des gestes existants (`.simultaneousGesture`, même style que l'association drag+longPress actuelle) — **pas** un pinch par palier : un geste swappé entre plusieurs vues perdrait sa continuité au changement de palier.

**Morphing** : largeur, hauteur et rayon de coin dérivent tous d'un seul scalaire continu `progress: CGFloat` (0 = `.circle`, 1 = `.small`, 2 = `.medium`, 3 = `.large`), interpolé linéairement entre paliers adjacents pendant le geste :

- `RoundedRectangle(cornerRadius: r, style: .continuous)` rend un cercle parfait quand `r = min(largeur, hauteur) / 2` — pas besoin de `Shape` custom ni de conformance `Animatable` maison. Le même `clipShape` sert donc à tous les paliers, `r` interpolant de `min(w,h)/2` (cercle) vers un rayon fixe (~20pt) aux paliers rectangle.
- Pendant le pinch, `progress` suit l'échelle du doigt en direct (déjà verrouillé au geste, pas d'animation implicite nécessaire) : largeur/hauteur/rayon évoluent en continu, jamais de saut visuel entre formes.
- Au relâchement, `progress` snap à l'entier le plus proche via une nouvelle fonction pure `CallBubbleGestureResolver.nextTier(current:progress:velocity:) -> CallBubbleSizeTier` (même famille que `shouldCollapse`/`snappedEdge` existants), avec `.spring()` pour l'arrêt.
- Le contenu vidéo (`CallParticipantVisual`) reste en `.aspectRatio(contentMode: .fill)` dans le frame courant — il suit le recadrage cercle→rectangle sans distorsion.
- La barre de contrôle (voir section suivante) suit le même `progress` : opacité 0 tant que `progress < 0.5`, puis fade-in progressif jusqu'à `progress ≈ 1` — elle apparaît en douceur avec l'ouverture de la forme, pas d'un coup à un seuil.

## Barre de contrôle aux paliers `.small` / `.medium` / `.large`

Mute + speaker + hangup **toujours visibles** (pas de long-press requis), alignés horizontalement en haut du rectangle — un petit bandeau local, pas un scrim plein écran. Chaque `Button` capte son propre tap en priorité sur le `.onTapGesture` ancêtre (même mécanisme déjà en place dans `FloatingCallPillView.swift:126-174` pour ses boutons de contrôle). Taper la zone vidéo hors boutons → passe en `.fullScreen`, comme le cercle aujourd'hui.

Au palier `.circle`, ces 3 actions restent exclusivement derrière le long-press (pas assez de place pour un bandeau permanent) — voir section suivante pour son comportement corrigé.

## Fix du long-press au palier `.circle`

Suppression du `dismissLayer` plein écran (`CallBubbleView.swift:48-53`). Le mini-menu (`bubbleCluster`, `:57-112`) reste inchangé dans sa composition (3 boutons en cluster local autour du cercle). Sa fermeture passe désormais uniquement par :

1. Le timer d'auto-dismiss à 3s déjà existant (`armAutoDismiss()`, `:184-191`).
2. Un re-tap sur le cercle lui-même, qui ferme immédiatement le menu (nouveau — remplace le `guard !isMenuRevealed else { return }` actuel de `:88-92`, qui aujourd'hui ne fait rien tant que le menu est ouvert ; il doit désormais fermer le menu au lieu d'être un no-op).
3. Un tap sur l'un des 3 boutons du menu, qui le referme après action (déjà le cas aujourd'hui).

Aucun tap ailleurs à l'écran n'est intercepté : le reste de l'app redevient pleinement manipulable pendant que le menu est ouvert, ce qui était le problème signalé.

## Accessibilité (VoiceOver)

Le pinch n'est pas nativement pilotable en VoiceOver. Ajout d'une `accessibilityAdjustableAction` (incrémenter/décrémenter) sur le composant unifié, permettant de changer de palier sans geste de pincement — cohérent avec le travail Dynamic Type/VoiceOver déjà livré sur des composants proches du projet (`StatusBubbleOverlay`, mini-menu `CallBubbleView`).

## Limites de composant

`CallBubbleView.swift` (255 lignes) gère déjà drag + long-press + tap + mini-menu. L'ajout du pinch, des 4 rendus de forme et de la barre de contrôle grossirait le fichier significativement. Le rendu spécifique à chaque palier (cluster de boutons au palier `.circle` vs bandeau de contrôle aux paliers rectangle) sera extrait dans une fonction/sous-vue dédiée (ex. `tierContent(for:)`), pour garder les gestes (au niveau conteneur) séparés du rendu par palier. Pas de nouveau fichier : la frontière reste interne à `CallBubbleView.swift`, sauf si l'implémentation révèle un besoin réel de découpage en fichier séparé.

## Tests (TDD)

- Nouveaux tests purs pour `CallBubbleGestureResolver.nextTier(...)` dans `CallBubbleGestureResolverTests.swift` — snapping, clamping aux bornes `.circle`/`.large`, direction du geste.
- Mise à jour de `CallBubbleViewMiniMenuWiringTests.swift` (source-inspection) : absence du `dismissLayer`, présence du re-tap-pour-fermer.
- Nouveaux tests source-inspection pour le rendu et le câblage de la barre de contrôle aux paliers `.small`/`.medium`/`.large`.
- `CallManagerTests.swift` : couverture de `bubbleSizeTier` (valeur par défaut, reset à la ré-entrée en `.bubble`, non-impact sur `.pip`/`.fullScreen`).

## Hors périmètre

- `FloatingCallPillView` / mode `.pip` (bannière) — inchangé, mécanisme de réduction indépendant.
- `PiPCallController` / PiP système AVKit — inchangé.
- Persistance cross-session du palier choisi — explicitement non retenue (reset à `.circle` à chaque nouvelle entrée en mode bulle).
