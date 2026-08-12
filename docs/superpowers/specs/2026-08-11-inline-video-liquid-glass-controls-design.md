# Lifting Liquid Glass des contrôles vidéo inline (bulle)

Date : 2026-08-11
Statut : approuvé (user « Oui »)
Périmètre : le lecteur vidéo INLINE (`Style.inline`), 4 fichiers, tous sous `packages/MeeshySDK/Sources/MeeshyUI/Media/` — `MeeshyVideoPlayer+Controls.swift` (`_InlineOverlayControls`, §§ B et C), `MeeshyVideoPlayer.swift` (`ControlSet.inlineDefault`, § A), `MeeshyVideoSurface.swift` + `MeeshyVideoPlayer+Renderers.swift` (câblage PiP, § B.2). Explicitement HORS périmètre du lifting précédent (`docs/superpowers/specs/2026-07-11-video-player-liquid-glass-lifting-design.md`, ligne 5 : « Les contrôles inline dans les bulles (`_InlineOverlayControls`) sont HORS périmètre »). Ce spec en est la suite directe.

## Problèmes constatés (état actuel — vérifié ligne à ligne le 2026-08-11)

`_InlineOverlayControls` — struct `internal` déclarée dans **`packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift` (lignes 13-239)**. Il n'existe PAS de fichier `_InlineOverlayControls.swift`. Rendue par `_InlineRenderer` (`MeeshyVideoPlayer+Renderers.swift:125-131`), qui lui passe `player.controls`.

1. **Top bar pré-Liquid Glass, 2 boutons seulement.** `topBar` (lignes 82-111) : bouton "expand" (`arrow.up.left.and.arrow.down.right`) en `.frame(width: 28, height: 28)` + `.background(Circle().fill(Color.white.opacity(0.2)))` (`:92-93`), bouton vitesse en `Capsule().fill(accent)` avec paddings 8/4 (`:104-106`) — aucun des deux n'utilise `.adaptiveGlass`. `HStack(spacing: 10)`, cluster centré via `.frame(maxWidth: .infinity)`. Pas de bouton PiP, pas de bouton AirPlay. Le bouton expand n'est rendu que si `controls.contains(.expand) && onExpand != nil`.
2. **`ControlSet.inlineDefault` n'inclut ni `.pip` ni `.airplay`** (`MeeshyVideoPlayer.swift:55` : `[.playPause, .scrubber, .duration, .expand, .speed]`), alors que ces deux flags EXISTENT déjà dans l'`OptionSet` (`:50-51`) et sont utilisés par `fullscreenDefault` (`:56-59`). Rien à créer côté types — juste à activer pour l'inline.
3. **Centre (skip/play/skip) pré-Liquid Glass.** `centerControls` (lignes 120-126), `skipButton`/`playPauseButton` (lignes 128-164) : fill `ZStack { Circle().fill(.ultraThinMaterial); Circle().fill(accent.opacity(...)) }` — un bricolage manuel qui PRÉCÈDE l'existence d'`.adaptiveGlass`/`.adaptiveGlassProminent` dans le repo, au lieu de les utiliser.
4. **Le PiP n'est PAS câblé sur le chemin inline** : activer le flag `.pip` sans plus donnerait un bouton mort. Le câblage fait partie de ce chantier — cf. § B.2.

Pour comparaison, `VideoTransportControls` (composant partagé galerie + plein écran, déjà lifté 2026-07-11) fait exactement ce qui est visé ici : `AdaptiveGlassContainer` autour de skip/play/skip, `.adaptiveGlass`/`.adaptiveGlassProminent` sur chaque bouton.

## Design cible

### A. `ControlSet.inlineDefault` étendu
```swift
public nonisolated static let inlineDefault: ControlSet =
    [.playPause, .scrubber, .duration, .expand, .pip, .airplay, .speed]
```
**DÉCISION : on élargit `inlineDefault` directement. Pas de `bubbleDefault` dédié.** Les 6 call sites gagnent donc PiP + AirPlay — c'est voulu, pas un effet de bord :

| Fichier | Ligne | Surface |
|---|---|---|
| `apps/ios/.../Views/Bubble/BubbleStandardLayout+Media.swift` | 401, 926 | bulle conversation |
| `apps/ios/.../Views/Bubble/BubbleAttachmentView.swift` | 48 | attachment de bulle |
| `apps/ios/.../Views/FeedPostCard+Media.swift` | 427 | carte de feed |
| `apps/ios/.../Views/PostDetailView.swift` | 1882 | détail de post |
| `apps/ios/.../Views/CommentMediaView.swift` | 223 | média de commentaire |

Aucun de ces sites ne dépend de l'ABSENCE actuelle de PiP/AirPlay — vérifié par grep, et pas seulement supposé :
- Les seuls tests qui touchent `MeeshyVideoPlayer` sont `MeeshyVideoPlayerControlSetTests`, `…AttachmentIdWiringTests`, `…AutoplayDecisionTests`, `TransportLayoutTests` (`packages/MeeshySDK/Tests/MeeshyUITests/Media/`). Aucun n'assert l'absence de `.pip`/`.airplay` dans `inlineDefault`, aucun ne compte les boutons rendus.
- **Aucun test de snapshot ne couvre le lecteur inline ni les surfaces feed/post/commentaire** : les seuls répertoires `__Snapshots__` du repo sont `Location/`, `Timeline/**` et `Story/Snapshot/` (aucun `Media/`). Il n'y a donc pas de baseline d'image à re-enregistrer.
- Côté app, `apps/ios/MeeshyTests` ne référence `inlineDefault` que dans `LocalizationConsistencyTests` (helper homonyme `inlineDefaultValue(in:)`, sans rapport) et `BubbleSwipeResistanceTests` (résistance de swipe, pas de comptage de contrôles).

Si un site futur doit exclure ces flags, il passe un `ControlSet` explicite plutôt que de faire régresser le default partagé.

### B. Top bar : une seule zone Liquid Glass groupée
`topBar` devient un unique `AdaptiveGlassContainer` (même primitive que `VideoTransportControls.centerControls`, `VideoTransportControls.swift:68` ; garantit le blending/morph entre boutons adjacents — cf. doc `AdaptiveGlassContainer`, `AdaptiveGlass.swift:112-114` : « glass ne peut pas s'échantillonner sur du glass ; sans conteneur, du glass qui se chevauche se clippe »), contenant, dans l'ordre, jusqu'à 4 boutons circulaires :

1. **Plein écran** (`.expand`) — `arrow.up.left.and.arrow.down.right`, `onExpand()`.
2. **PiP** (`.pip`) — **MASQUÉ** (pas désactivé) quand `AVPictureInPictureController.isPictureInPictureSupported()` est faux : pas de bouton mort dans une bulle. C'est un écart assumé vis-à-vis du plein écran, qui lui *désactive* son item de menu (`VideoTransportControls.swift:195`, `.disabled(!…)`) — un item de menu grisé reste explicable, un bouton grisé flottant sur une vidéo ne l'est pas. Action : `manager.isPipActive ? manager.stopPip() : manager.startPip()` (API publique confirmée : `SharedAVPlayerManager.isPipActive:19`, `startPip():356`, `stopPip():361`). Le câblage qui rend cette action effective est en § B.2.
3. **AirPlay** (`.airplay`) — `AirPlayRoutePicker(tintColor: .white)` (`packages/MeeshySDK/Sources/MeeshyUI/Media/AirPlayRoutePicker.swift`, `public init(tintColor: UIColor = .white, prioritizesVideoDevices: Bool = true)`). Composant SDK avec **2 call sites existants** (pas 3) : `VideoTransportControls.swift:162` — partagé galerie + plein écran — et `AudioFullscreenView.swift:840`. Pas de nouvelle logique, juste un nouveau call site.
4. **Vitesse** (`.speed`) — comportement actuel conservé (`manager.cycleSpeed()`, label `manager.playbackSpeed.label`), migré en `.adaptiveGlass(in: Capsule())` au lieu de `Capsule().fill(accent)`.

**Taille : 28×28 — la taille ACTUELLE, conservée.** (La version initiale de ce spec écrivait « 36×36 (taille actuelle conservée) », ce qui était auto-contradictoire : `28×28` est la taille inline réelle (`MeeshyVideoPlayer+Controls.swift:92`), `36×36` est celle du top bar PLEIN ÉCRAN (`:296`, `:316`, `:334`).) Budget : 4 boutons × 28 + 3 espacements × 10 = 142 pt — tient dans toute bulle vidéo, y compris iPhone SE.
28 pt n'atteint pas le minimum de cible tactile HIG 44×44 — c'est déjà le cas aujourd'hui, ce spec ne régresse rien. Si on veut le corriger, c'est via `.contentShape` / un élargisseur de hit-area **posé APRÈS le glass**, jamais en gonflant le visuel (hors périmètre ici).

Chaque bouton (hors AirPlay, qui gère son propre chrome) : `.adaptiveGlass(in: Circle(), interactive: true)`, appliqué APRÈS le `.frame(...)` (règle du repo : glass après sizing, jamais après un élargisseur de hit-area).

#### B.2 — Câbler le PiP sur la surface inline (sans quoi le bouton serait mort)

**Le problème (vérifié).** `startPip()` fait `guard let pipController, pipController.isPictureInPicturePossible else { return }` (`SharedAVPlayerManager.swift:356-359`) et `pipController` n'est peuplé que par `configurePip(playerLayer:)` (`:324`). Grep exhaustif des call sites de `configurePip` : `ReelsPlayerView.swift:1540/1556` et `VideoLegacySupport.swift:51/60` (`FullscreenAVPlayerLayerView`, galerie). **Le renderer inline ne l'appelle jamais** : `_InlineRenderer` monte `MeeshyVideoSurface(player:gravity:isMuted:)` (`MeeshyVideoPlayer+Renderers.swift:120`) et `MeeshyVideoSurface` (`MeeshyVideoSurface.swift:13-37`) ne configure aucun contrôleur PiP, bien que sa `_SurfaceUIView` expose un `playerLayer` (`:60-65`) — sa `layerClass` EST un `AVPlayerLayer` (`:59`). Sans câblage, le bouton PiP s'afficherait et ne ferait **rien**.

**DÉCISION : on câble le PiP.** `.pip` reste dans le périmètre.

**Design retenu — `enablesPip`, strict miroir de `ReelVideoSurface`.** Le repo a déjà exactement ce pattern : `ReelVideoSurface` (`ReelsPlayerView.swift:1517`) porte `var enablesPip: Bool = false` (`:1530`) et n'appelle `configurePip` que sous ce flag, dans `makeUIView` ET `updateUIView` (`:1539`, `:1552`). On reproduit à l'identique dans `MeeshyVideoSurface` :

```swift
internal struct MeeshyVideoSurface: UIViewRepresentable {
    let player: AVPlayer
    let gravity: AVLayerVideoGravity
    let isMuted: Bool
    /// Opt-in Picture-in-Picture. `false` par défaut : attacher un
    /// `AVPictureInPictureController` pose aussi
    /// `canStartPictureInPictureAutomaticallyFromInline = true`, donc une
    /// surface qui n'expose pas de contrôle PiP ne doit JAMAIS l'activer —
    /// elle ouvrirait une fenêtre système au passage en arrière-plan sans
    /// que l'utilisateur l'ait demandé. Miroir de `ReelVideoSurface.enablesPip`.
    var enablesPip: Bool = false

    func makeUIView(context: Context) -> _SurfaceUIView {
        …
        if enablesPip { SharedAVPlayerManager.shared.configurePip(playerLayer: view.playerLayer) }
        return view
    }

    func updateUIView(_ uiView: _SurfaceUIView, context: Context) {
        …
        // Idempotent : garde d'identité de layer dans `configurePip`.
        if enablesPip { SharedAVPlayerManager.shared.configurePip(playerLayer: uiView.playerLayer) }
    }
}
```
`var` (et non `let`) avec valeur par défaut : `MeeshyVideoSurface` est `internal` et n'a pas d'init explicite, l'init memberwise synthétisé porte donc le défaut — tout call site futur reste inchangé et hors PiP.

**Le flag est piloté par la `ControlSet`, pas par une nouvelle API publique.** Au seul call site (`MeeshyVideoPlayer+Renderers.swift:120`) :
```swift
MeeshyVideoSurface(player: p, gravity: .resizeAspect, isMuted: manager.isMuted,
                   enablesPip: player.controls.contains(.pip))
```
Conséquence : une surface qui ne montre pas de bouton PiP ne configure pas le PiP. L'opt-in et l'affichage du bouton sont pilotés par la MÊME source — impossible d'avoir l'un sans l'autre. Aucun paramètre à ajouter à `MeeshyVideoPlayer`.

**Non-conflit avec le chantier réels — vérifié.**
- `SharedAVPlayerManager` ne détient qu'UN `pipController`, et `configurePip` fait `guard pipController?.playerLayer !== playerLayer else { return }` puis `invalidatePlaybackState()` + reconstruit le contrôleur (`:325-330`) : sémantique **dernier écrivain gagnant**, une seule surface possède le PiP à un instant donné.
- Les réels n'opt-in QUE sur le viewer plein écran (`ReelsPlayerView.swift:1419`, `enablesPip: true`) ; la surface muette du feed (`ReelFeedVideoSurface`) reste hors PiP par design documenté (`:1524-1530`). Il n'y a donc pas deux surfaces réels concurrentes.
- Côté inline, `_InlineRenderer` ne monte `MeeshyVideoSurface` que sous `isThisActive` (`manager.activeURL == player.attachment.fileUrl && manager.player != nil`, `MeeshyVideoPlayer+Renderers.swift:78-80`) : **au plus UNE surface inline montée à la fois** sur toute l'app, quelle que soit la surface (bulle, feed, post, commentaire).
- Reste le cas théorique « viewer réels plein écran + bulle inline active simultanément » : impossible en pratique (le viewer réels est un cover plein écran), et le dernier-écrivain-gagnant le résout proprement si ça arrivait. À re-vérifier néanmoins si le chantier réels/PiP touche `configurePip` avant le merge de celui-ci.

**`isPictureInPictureSupported()` est FAUX sur simulateur** (cf. `CallPiPPolicy.swift:8`) : le bouton PiP est masqué en simu, sa vérification visuelle est device-only.

### C. Centre : migration vers `.adaptiveGlass`/`.adaptiveGlassProminent`
`centerControls` passe sous `AdaptiveGlassContainer`. Tailles et hiérarchie visuelle INCHANGÉES (skip 36pt `:136`, play 54pt `:157` — l'inline reste plus compact que le plein écran 52/64pt `VideoTransportControls.swift:87/105`, le bubble vidéo est petit) :
- Skip ±10s : `.adaptiveGlass(in: Circle(), interactive: true)` neutre (remplace le double-fill `ultraThinMaterial` + `accent.opacity(0.30)` + le `.overlay(Circle().stroke(...))` de `:143`). `interactive: true` pour rester homogène avec `VideoTransportControls.skipButton:88` et avec les boutons de la top bar (§ B) — l'omettre créerait deux styles de verre pour le même geste.
- Play/pause : `.adaptiveGlassProminent(in: Circle(), tint: accent.opacity(0.85))` (remplace le double-fill `ultraThinMaterial` + `accent.opacity(0.55)` + le stroke `:158` + la shadow manuelle `:159` — `adaptiveGlassProminentFallback` porte déjà un `shadow(radius: 8, y: 4)`, `AdaptiveGlass.swift:98`, équivalent). L'opacité `0.85` est celle du composant partagé (`VideoTransportControls.swift:106`) ; passer `accent` nu donnerait un verre plus saturé que le plein écran, pour la même commande.
- `playPauseIcon` (`:168-174`, `adaptiveSymbolReplace`) et l'`accessibilityLabel` (`:161-163`) sont CONSERVÉS tels quels.

### D. Fallback iOS < 26
Rien de spécifique à faire ici — `.adaptiveGlass`/`.adaptiveGlassProminent`/`AdaptiveGlassContainer` encapsulent déjà tout le gate `#available(iOS 26.0, *)` (`Compatibility/AdaptiveGlass.swift`). Le point du design est justement de ne PLUS avoir de styling ad-hoc à côté : tout passe par ces 3 primitives existantes, qui dégradent déjà proprement (blur + teinte translucide, ou fill solide + shadow pour le prominent).

## Non-régression (intouchés)
- `scrimGradients` (`:57-72`), `bottomBar` (seek + time, `:178-196`), `seekBar` + son `highPriorityGesture` (`:200-238`), `@GestureState isSeeking` et `MediaScrubbingPreferenceKey` (`:52`) : hors périmètre, inchangés. **Ne pas convertir `isSeeking` en `@State`** en passant (le `@GestureState` est un correctif documenté sur `:19-23`).
- `_FullscreenOverlayControls`, `VideoTransportControls`, `ConversationMediaGalleryView` : non touchés par ce spec (déjà liftés 2026-07-11). Le fait que `VideoTransportControls` et `_InlineOverlayControls` restent deux implémentations distinctes est ASSUMÉ (cf. en-tête `VideoTransportControls.swift:18-19`) — ce spec ne fusionne pas les deux.
- `BouncyControlButtonStyle` (`:346-353`, appliqué au ZStack racine `:47`) reste : le press feedback ne doit pas disparaître au profit du seul `interactive:` du verre.
- Comportement de `manager.cycleSpeed()`, `manager.skip(seconds:)`, `manager.togglePlayPause()`, `manager.startPip()`/`stopPip()`, et de `configurePip` elle-même : signatures et logique inchangées. Le SEUL changement de comportement non visuel est le nouvel appel à `configurePip` depuis `MeeshyVideoSurface` sous `enablesPip` (§ B.2) — assumé, borné par la `ControlSet`, et par construction limité à une surface à la fois.
- `ReelVideoSurface` / `ReelFeedVideoSurface` (`ReelsPlayerView.swift`) : non touchés. Ce spec copie leur pattern `enablesPip`, il ne les modifie pas.
- Aucun effet supprimé de l'écran (règle projet) : tous les boutons disponibles du top bar restent visibles simultanément (pas de repli dans un menu ⋯ comme au plein écran). 4 boutons sur un device compatible PiP, 3 quand le PiP n'est pas supporté (§ B.2) — c'est le seul masquage prévu, et il retire un contrôle qui ne servirait à rien sur cet appareil, pas une fonctionnalité disponible. Le budget calculé (142 pt) tient sur iPhone SE ; si la mesure réelle contredisait ce calcul, la piste par défaut est de RÉDUIRE l'espacement entre boutons (actuellement 10, `:83`) avant d'envisager un regroupement, et jamais de retirer un item sans le rendre accessible ailleurs.
- **Indépendance des 4 chantiers** : ce spec ne touche que `packages/MeeshySDK/Sources/MeeshyUI/Media/**` — `MeeshyVideoPlayer.swift` (§ A), `MeeshyVideoPlayer+Controls.swift` (§ B, § C), `MeeshyVideoSurface.swift` et `MeeshyVideoPlayer+Renderers.swift` (§ B.2). Aucun recouvrement de fichier avec les 3 autres chantiers (qui touchent `ConversationView.swift`, `MessageMoreSheet.swift`, `MessageActionResolver.swift`, `MeeshyUI/Conversation/**`, `ConversationView+ScrollIndicators.swift`).

## Tests (TDD)
1. `MeeshyVideoPlayerControlSetTests` existe : `packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerControlSetTests.swift`. Aucun test existant n'assert l'ABSENCE de `.pip`/`.airplay` dans `inlineDefault` → l'extension ne casse rien, il faut donc ÉCRIRE le test RED (`inlineDefault.contains(.pip)` / `.airplay`). `test_fullscreenDefault_*` et `miniDefault` servent déjà de non-régression sur les autres sets.
2. **Garde d'affichage du bouton PiP.** `_InlineOverlayControls` est `internal` à `MeeshyUI` — accessible via `@testable import MeeshyUI` (comme le fait déjà `MeeshyVideoPlayerControlSetTests`), mais c'est une `View` SwiftUI sans point d'entrée décidable. Extraire donc la règle en fonction pure **avant** d'écrire le test — même pattern que `_InlineRenderer.shouldAutoplayOnAppear`, déjà testée par `MeeshyVideoPlayerAutoplayDecisionTests` :
   ```swift
   // dans _InlineOverlayControls
   nonisolated static func showsPipButton(controls: MeeshyVideoPlayer.ControlSet, isPipSupported: Bool) -> Bool {
       controls.contains(.pip) && isPipSupported
   }
   ```
   Tests RED : `showsPipButton(controls: .inlineDefault, isPipSupported: true) == true` ; `… isPipSupported: false) == false` (masqué, pas désactivé) ; `showsPipButton(controls: [.playPause], isPipSupported: true) == false`. Le paramètre `isPipSupported` est injecté (le body passe `AVPictureInPictureController.isPictureInPictureSupported()`), donc le test ne dépend PAS de l'environnement CI — où le support est faux.
3. **Câblage PiP de la surface (§ B.2).** Même approche, la décision est pure :
   ```swift
   // dans _InlineRenderer
   nonisolated static func surfaceEnablesPip(controls: MeeshyVideoPlayer.ControlSet) -> Bool {
       controls.contains(.pip)
   }
   ```
   Tests RED : `surfaceEnablesPip(controls: .inlineDefault) == true` (après extension § A) ; `surfaceEnablesPip(controls: .miniDefault) == false` — garantit qu'une surface sans contrôle PiP n'arme jamais `canStartPictureInPictureAutomaticallyFromInline`. Compléter par une garde de source sur `MeeshyVideoSurface.swift` : `configurePip(` n'apparaît QUE sous `if enablesPip` (mêmes deux occurrences que `ReelVideoSurface`), et `enablesPip` a bien `= false` pour défaut. L'engagement PiP réel (ouverture de la fenêtre système) n'est pas testable en simu — vérification device.
4. Vérification visuelle simulateur (avant/après, iPhone 16 Pro ET iPhone SE 375pt — cf. leçon du chantier audio immersif sur les petits écrans) : les boutons de la top bar inline (28×28, budget 142 pt) tiennent sans troncature ni chevauchement sur une bulle vidéo de largeur standard. **Le bouton PiP ne sera pas visible en simu** (support false) — 3 boutons visibles en simu, 4 sur device.
5. Build complet (`./apps/ios/meeshy.sh build`) : le SDK et l'app compilent avec le `ControlSet` étendu, aucun des 6 call sites `.inlineDefault` ne casse.
6. Suite SDK complète (`meeshy.sh test` phase 0, scheme `MeeshySDK-Package`) : les tests SDK font partie du verdict du gate depuis 2026-07-30, ne pas les sauter.
7. Vérification device (non automatisable) : le bouton PiP ouvre bien une fenêtre système depuis une bulle vidéo, et la refermer arrête la lecture (`shouldHaltPlaybackOnPipStop`, `SharedAVPlayerManager.swift:317-320`).
