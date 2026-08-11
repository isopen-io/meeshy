# Lifting Liquid Glass des contrôles vidéo inline (bulle)

Date : 2026-08-11
Statut : approuvé (user « Oui »)
Périmètre : `_InlineOverlayControls` (`packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift`) — le lecteur vidéo INLINE des bulles de conversation, explicitement HORS périmètre du lifting précédent (`docs/superpowers/specs/2026-07-11-video-player-liquid-glass-lifting-design.md`, ligne 5 : « Les contrôles inline dans les bulles (`_InlineOverlayControls`) sont HORS périmètre »). Ce spec en est la suite directe.

## Problèmes constatés (état actuel)

`_InlineOverlayControls.swift` (lignes 74-175) :

1. **Top bar pré-Liquid Glass, 2 boutons seulement.** `topBar` (lignes 82-111) : bouton "expand" (`arrow.up.left.and.arrow.down.right`) en `.background(Circle().fill(Color.white.opacity(0.2)))`, bouton vitesse en `Capsule().fill(accent)` — aucun des deux n'utilise `.adaptiveGlass`. Pas de bouton PiP, pas de bouton AirPlay.
2. **`ControlSet.inlineDefault` n'inclut ni `.pip` ni `.airplay`** (`MeeshyVideoPlayer.swift:55` : `[.playPause, .scrubber, .duration, .expand, .speed]`), alors que ces deux flags EXISTENT déjà dans l'`OptionSet` (lignes 50-51) et sont utilisés par `fullscreenDefault` (ligne 56-59). Rien à créer côté types — juste à activer pour l'inline.
3. **Centre (skip/play/skip) pré-Liquid Glass.** `centerControls` (lignes 120-126), `skipButton`/`playPauseButton` (lignes 128-164) : fill `ZStack { Circle().fill(.ultraThinMaterial); Circle().fill(accent.opacity(...)) }` — un bricolage manuel qui PRÉCÈDE l'existence d'`.adaptiveGlass`/`.adaptiveGlassProminent` dans le repo, au lieu de les utiliser.

Pour comparaison, `VideoTransportControls` (composant partagé galerie + plein écran, déjà lifté 2026-07-11) fait exactement ce qui est visé ici : `AdaptiveGlassContainer` autour de skip/play/skip, `.adaptiveGlass`/`.adaptiveGlassProminent` sur chaque bouton.

## Design cible

### A. `ControlSet.inlineDefault` étendu
```swift
public nonisolated static let inlineDefault: ControlSet =
    [.playPause, .scrubber, .duration, .expand, .pip, .airplay, .speed]
```
Avant de modifier, vérifier par grep tous les call sites qui construisent explicitement `Style.inline` ou passent `controls:` en dur pour un player inline (bulle de conversation, éventuellement galerie/carousel si elle partage le même `Style`) — s'assurer que l'extension du default n'introduit pas PiP/AirPlay sur une surface où ils seraient indésirables (ex. une preview de composer). Si un site doit explicitement les exclure, il passe un `ControlSet` personnalisé plutôt que de faire régresser le default partagé.

### B. Top bar : une seule zone Liquid Glass groupée
`topBar` devient un unique `AdaptiveGlassContainer` (même primitive que `VideoTransportControls.centerControls`, garantit le blending/morph entre boutons adjacents — cf. doc `AdaptiveGlassContainer` : « glass ne peut pas s'échantillonner sur du glass ; sans conteneur, du glass qui se chevauche se clippe »), contenant, dans l'ordre, jusqu'à 4 boutons circulaires 36×36 (taille actuelle conservée) :

1. **Plein écran** (`.expand`) — `arrow.up.left.and.arrow.down.right`, `onExpand()`.
2. **PiP** (`.pip`) — affiché SEULEMENT si `AVPictureInPictureController.isPictureInPictureSupported()` (même garde que le menu ⋯ du plein écran, `VideoTransportControls.swift:195`). Action : `manager.isPipActive ? manager.stopPip() : manager.startPip()`.
3. **AirPlay** (`.airplay`) — `AirPlayRoutePicker(tintColor: .white)`, composant SDK déjà réutilisé 3 fois ailleurs (galerie, plein écran, plein écran audio) ; pas de nouvelle logique, juste un nouveau call site.
4. **Vitesse** (`.speed`) — comportement actuel conservé (`manager.cycleSpeed()`, label `manager.playbackSpeed.label`), migré en `.adaptiveGlass(in: Capsule())` au lieu de `Capsule().fill(accent)`.

Chaque bouton (hors AirPlay, qui gère son propre chrome) : `.adaptiveGlass(in: Circle(), interactive: true)`, appliqué APRÈS le `.frame(width: 36, height: 36)` (règle du repo : glass après sizing, jamais après un élargisseur de hit-area).

### C. Centre : migration vers `.adaptiveGlass`/`.adaptiveGlassProminent`
`centerControls` passe sous `AdaptiveGlassContainer`. Tailles et hiérarchie visuelle INCHANGÉES (skip 36pt, play 54pt — l'inline reste plus compact que le plein écran 52/64pt, le bubble vidéo est petit) :
- Skip ±10s : `.adaptiveGlass(in: Circle())` neutre (remplace le double-fill `ultraThinMaterial` + `accent.opacity(0.30)`).
- Play/pause : `.adaptiveGlassProminent(in: Circle(), tint: accent)` (remplace le double-fill `ultraThinMaterial` + `accent.opacity(0.55)` + shadow manuelle — `adaptiveGlassProminentFallback` porte déjà un `shadow` équivalent pour iOS < 26).

### D. Fallback iOS < 26
Rien de spécifique à faire ici — `.adaptiveGlass`/`.adaptiveGlassProminent`/`AdaptiveGlassContainer` encapsulent déjà tout le gate `#available(iOS 26.0, *)` (`Compatibility/AdaptiveGlass.swift`). Le point du design est justement de ne PLUS avoir de styling ad-hoc à côté : tout passe par ces 3 primitives existantes, qui dégradent déjà proprement (blur + teinte translucide, ou fill solide + shadow pour le prominent).

## Non-régression (intouchés)
- `scrimGradients`, `bottomBar` (seek + time), `MediaScrubbingPreferenceKey` : hors périmètre, inchangés.
- `_FullscreenOverlayControls`, `VideoTransportControls`, `ConversationMediaGalleryView` : non touchés par ce spec (déjà liftés).
- Comportement de `manager.cycleSpeed()`, `manager.skip(seconds:)`, `manager.togglePlayPause()`, `manager.startPip()`/`stopPip()` : signatures et logique inchangées, seul le rendu visuel change.
- Aucun effet supprimé de l'écran (règle projet) : les 4 boutons du top bar restent tous visibles simultanément par défaut (pas de repli dans un menu ⋯ comme au plein écran). Vérifier sur iPhone SE (375pt, le plus étroit) à l'implémentation : si les 4 boutons à 36pt + espacement ne tiennent pas sur la largeur d'une bulle vidéo standard, la piste par défaut est de RÉDUIRE l'espacement entre boutons (pas leur taille, ni leur nombre) avant d'envisager un regroupement ; un item retiré du top bar doit systématiquement rester accessible ailleurs (ex. menu ⋯ existant côté plein écran), jamais disparaître silencieusement.

## Tests (TDD)
1. `MeeshyVideoPlayerControlSetTests` (existant, SDK) : `inlineDefault` contient bien `.pip` et `.airplay` en plus des flags actuels — test de non-régression sur les AUTRES sets (`fullscreenDefault`, `miniDefault`) inchangés.
2. Nouveau test (SDK, `MeeshyUITests`) sur la garde PiP : le bouton PiP de `_InlineOverlayControls` ne s'affiche pas quand `AVPictureInPictureController.isPictureInPictureSupported()` est faux (pattern à établir — probablement une closure injectable côté test, à l'image des autres gardes testables du repo, plutôt que dépendre de l'environnement CI réel).
3. Vérification visuelle simulateur (avant/après, iPhone 16 Pro ET iPhone SE 375pt — cf. leçon du chantier audio immersif sur les petits écrans) : les 4 boutons de la top bar inline tiennent sans troncature ni chevauchement sur une bulle vidéo de largeur standard.
4. Build complet (`./apps/ios/meeshy.sh build`) : le SDK et l'app compilent avec le `ControlSet` étendu, aucun call site existant ne casse.
