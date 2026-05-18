# Sprint 4 — Médias foreground + audio de fond synchronisé dans le Story Viewer / Preview

**Status:** Draft (2026-05-18)

**Scope:**
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift` — l'entrée background n'est jamais lue ; ajout d'un scheduler timeline-synced + enveloppe de fade par défaut.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` — cycle de vie audio (background scene, exit), démarrage du background, double-play.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift` — la vidéo foreground résout `mediaURL` directement au lieu du `postMediaURLResolver`.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift` — propagation des URLs résolues vers les médias foreground.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift` (lecture seule — diagnostic, voir RC4.1) ; le filtrage `isBackground == false` y est déjà correct.
- **NOUVEAU** `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioConductor.swift` — service propriétaire unique de la session audio + transport, protocole `StoryAudioConducting`.
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` — teardown audio sur `.onDisappear` et `scenePhase == .background`.
- Tests : `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Audio/*`, `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/*`.

---

## Problème / Symptômes

Dans le **Story Viewer** (lecture par un consommateur) et le **Story Preview** (preview côté composer, chemin `StoryReaderRepresentable` avec `preloadedImages` / `preloadedVideoURLs` / `preloadedAudioURLs`) :

1. **Les médias foreground ne sont pas visibles.** Une image ou une vidéo posée en *premier plan* d'une slide (`StoryMediaObject.isBackground == false`) ne s'affiche ni dans le viewer ni dans le preview. Seul le fond plein écran (`isBackground == true`) est rendu. L'utilisateur voit la slide "vide" par-dessus le fond.

2. **L'audio n'est pas entendu.** L'audio de fond de la slide (`StoryEffects.resolvedBackgroundAudio`) ne joue jamais. Aucun son n'est émis, ni dans le viewer, ni dans le preview, même quand la slide a un `StoryAudioPlayerObject` background valide avec une URL résoluble.

Les deux symptômes sont reproductibles sur les deux surfaces (viewer publié ET preview composer) à 100 %.

---

## Causes racines

| # | Cause racine | Preuve `file:line` (vérifiée) |
|---|--------------|-------------------------------|
| **RC4.1** | **Vidéo foreground : URL non résolue.** `StoryMediaLayer.configureVideo` lit `media.mediaURL` *directement* (`StoryMediaLayer.swift:229`), tout comme `configureImage` (`:196`). Or pour une story **publiée**, `StoryItem.toRenderableSlide` ne renseigne `mediaURL` que sur la `StorySlide` (`media.first?.url`, `StoryModels.swift:1623`) — **jamais** sur chaque `StoryMediaObject` foreground. Pour le **preview composer**, les bitmaps / vidéos locales arrivent via `preloadedImages` / `preloadedVideoURLs` et ne sont accessibles que par `StoryReaderContext.postMediaURLResolver` (`StoryReaderRepresentable.swift:92-98`). `StoryMediaLayer` n'a aucune référence au resolver : il reçoit seulement `configure(with:geometry:mode:)` (`StoryRenderer.swift:218-219`). Conséquence : `media.mediaURL == nil` (ou un `postMediaId` brut non-URL) → `guard let url` échoue (`StoryMediaLayer.swift:197` / `:230`) → aucun `contents`, aucun `AVPlayerLayer`. Le fond `isBackground == true`, lui, passe par `StoryBackgroundLayer.configure(..., resolver:imageCache:)` (`StoryCanvasUIView.swift:664-670`) qui reçoit bien le resolver — d'où l'asymétrie « fond visible / foreground vide ». |
| **RC4.2** | **L'audio de fond n'est jamais démarré.** `ReaderAudioMixer.configureBackground(audio:url:looping:)` attache un `AVAudioPlayerNode` et le connecte au `mainMixerNode`, mais stocke le résultat dans `backgroundEntry` (`ReaderAudioMixer.swift:334-348`) **sans jamais le programmer ni le lire**. `play()` n'itère que `entries` (clips *foreground*) : `for entry in entries.values { scheduleEntry(...); entry.node.play() }` (`ReaderAudioMixer.swift:94-100`). `backgroundEntry` n'est cité dans aucune méthode de transport — ni `play()`, ni `pause()`, ni `stop()` ; il n'apparaît que dans `fadeOutAndStop` (`:378`) et `backgroundClipCount` (`:330`). Le background node est donc *configuré mais muet*. C'est la cause directe du symptôme 2. |
| **RC4.3** | **Aucune session `AVAudioSession` activée pour le reader.** Le chemin reader (`StoryCanvasUIView` + `ReaderAudioMixer`) ne fait **aucun** `AVAudioSession.setCategory/.setActive`. La grep complète ne trouve la session que dans `StoryMediaCoordinator.swift:40-41`, `MediaSessionCoordinator.swift:52-66`, `AudioMixer`/`StoryTimelineEngine.swift:112` (chemin *composer Pro Timeline*, pas le reader). `StoryViewerView.onAppear` appelle `StoryMediaCoordinator.shared.activate{}` (`StoryViewerView.swift:281`) — mais ce coordinator gère le *mute* du viewer, pas une activation de session pour le `ReaderAudioMixer`. Sans `setCategory(.playback)` + `setActive(true)`, un `AVAudioEngine` démarré peut rester silencieux (catégorie `.ambient`/`.soloAmbient` par défaut, respect du switch silencieux), et la première `engine.start()` est fragile. |
| **RC4.4** | **Le scheduler audio n'est pas synchronisé sur la timeline de la story.** `ReaderAudioMixer` pose chaque clip foreground à `originHost = mach_absolute_time()` capturé dans `play()` (`:92`). Mais `play()` est déclenché par `setMode(.play)` / `setReaderContext` (`StoryCanvasUIView.swift:562`, `:588`) à des instants *différents* du `currentTime` réel du `CADisplayLink` (`displayLinkTick`, `:1114`). L'origine host-time du mixer et l'origine du playhead vidéo ne sont pas le même `t=0` : il n'existe aucune fonction qui calcule `hostTime(t=0 de la slide)` partagée entre la vidéo foreground (`AVPlayer`) et l'audio. Pour le background il n'y a même pas de point de départ du tout (RC4.2). Le besoin produit — *« le background doit démarrer à l'instant exact prévu, relatif à la timeline de la slide »* — n'est structurellement pas adressé. |
| **RC4.5** | **Pas d'arrêt de l'audio à la sortie.** `StoryCanvasUIView.handleWillResignActive` (`:1080-1083`) appelle `forEachAVPlayer { $0.pause() }` + `backgroundLayer.handleAppLifecycle(active:false)` — il **ne touche jamais `audioMixer`**. Quand l'app passe en arrière-plan, l'`AVAudioEngine` du `ReaderAudioMixer` continue de tourner. À la sortie du viewer, `StoryViewerView.onDisappear` (`StoryViewerView.swift:298-307`) arrête le timer, `StoryMediaCoordinator`, le prefetcher — mais n'a aucune prise sur le `ReaderAudioMixer` (privé dans `StoryCanvasUIView`). Le seul teardown du mixer est `deinit` → `Task { shutdown() }` (`StoryCanvasUIView.swift:260-266`), différé et non-déterministe (dépend de la libération ARC de la `UIView`, elle-même retardée par la rétention SwiftUI du `UIViewRepresentable`). Conséquence : **fuite audio** — du son peut persister après que l'utilisateur a quitté la story ou mis l'app en fond. |
| **RC4.6** | **Risque de double-play.** `audioMixer.play()` est appelable depuis trois sites : `setMode(.play)` (`StoryCanvasUIView.swift:588`), la branche `didChange` (`:562`) et `setReaderContext` (`:562`). `setReaderContext` est explicitement « idempotent — safe to call from `updateUIView` » (commentaire `:549`) et SwiftUI rappelle `updateUIView` à chaque re-render. `ReaderAudioMixer.play()` n'a aucune garde d'idempotence : il rappelle `engine.start()` (gardé par `isRunning`) **mais re-`scheduleEntry` + re-`entry.node.play()` à chaque appel**, empilant des buffers programmés sur le même node → un même clip peut s'entendre deux fois / en écho. Le viewer (`StoryReaderRepresentable`) et le preview peuvent par ailleurs monter deux `StoryCanvasUIView` simultanés, chacun avec son `ReaderAudioMixer` → deux moteurs jouant le même fond. |
| **RC4.7** | **Pas d'enveloppe de fade par défaut.** `ReaderAudioMixer.scheduleFades` n'applique un fade que si `entry.fadeIn > 0` / `entry.fadeOut > 0` (`:192`, `:201`), valeurs lues de `audio.fadeIn` / `audio.fadeOut` (`:67-68`). Quand la slide n'a **aucun** effet de fade configuré, l'audio démarre et se coupe sèchement. Le besoin produit d'une enveloppe par défaut (30 %→100 % sur 1,2 s en entrée, 100 %→5 % sur 0,5 s en sortie) n'existe nulle part. |

---

## Design / Solution

### 1. Médias foreground — fix du rendu (RC4.1)

Le bug est une **rupture de la chaîne de résolution d'URL** : `StoryMediaLayer` est le seul layer média qui ne reçoit pas le `postMediaURLResolver`.

**Correctif minimal et cohérent avec `StoryBackgroundLayer`** : étendre `StoryMediaLayer.configure` pour accepter le resolver, exactement comme `StoryBackgroundLayer.configure(kind:transform:geometry:resolver:imageCache:)`.

```swift
// StoryMediaLayer.swift
@MainActor
public func configure(with media: StoryMediaObject,
                      geometry: CanvasGeometry,
                      mode: RenderMode,
                      resolver: (@Sendable (String) -> URL?)? = nil,
                      imageCache: ImageCacheReader? = nil) { ... }
```

`renderItem` (`StoryRenderer.swift:218`) propage `resolver` / `imageCache` — déjà disponibles dans `render(...)` via un nouveau paramètre (le `backdropProvider` est déjà passé ainsi, on suit le même pattern).

Résolution d'URL dans `StoryMediaLayer`, ordre identique au resolver du representable :
1. `resolver?(media.postMediaId)` — preloaded local (composer preview) puis remote publié.
2. Fallback `media.mediaURL` (fixtures, `file://` direct du composer édition).

`configureVideo` : la branche `mode == .play` doit appeler `player.play()` **uniquement** (déjà le cas, `:246`) ; ne pas pré-roller un `AVPlayer` non `.readyToPlay` (commentaire `:241-245` déjà correct).

`configureImage` : pour une URL réseau, le chemin async `imageLoader.image(for:)` (`:215-222`) reste ; pour un `file://` (preview), le chemin synchrone (`:207-213`) reste. On ajoute simplement la résolution préalable du `postMediaId → URL`.

**`onContentReady`** : `scheduleContentReadyEvaluation` (`StoryCanvasUIView.swift:700`) ne juge la "prêt-itude" que du `bgKind`. À étendre pour attendre aussi qu'au moins un média foreground vidéo atteigne `.readyToPlay` — sinon le timer de progression démarre sur une slide encore noire (hors scope strict du bug mais à corriger dans le même passage car directement lié au symptôme 1 ; tâche T6).

### 2. Choix du framework audio + justification

| Option | Verdict | Raison |
|--------|---------|--------|
| `AVAudioPlayer` | ❌ Rejeté | Pas de planification host-time. `play(atTime:)` est en `deviceCurrentTime` (secondes `Double`), précision ~20-50 ms ; pas de ramps de volume programmées sample-accurate ; un node par fichier sans graphe de mix commun. |
| `AVPlayer` + `AVAudioMix` | ❌ Rejeté pour le background | `AVPlayer` excelle pour l'audio *embarqué dans une vidéo*. `setVolumeRampFromStartVolume(_:toEndVolume:timeRange:)` sur `AVMutableAudioMixInputParameters` donnerait des fades parfaits — mais cela force à construire un `AVComposition` pour un simple fichier audio de fond, et `setRate(atHostTime:)` n'est fiable qu'après `preroll`. Surcoût injustifié pour un mono-fichier en boucle. |
| **`AVAudioEngine` + `AVAudioPlayerNode`** | ✅ **Retenu** | Le projet a **déjà** ce moteur (`ReaderAudioMixer`). `scheduleBuffer`/`scheduleFile(at: AVAudioTime(hostTime:))` donne un démarrage **sample-accurate** ancré sur `mach_absolute_time()` — exactement le besoin "démarrer à l'instant exact de la timeline". Un seul graphe : background + clips foreground + (futur) ducking convergent sur `mainMixerNode`. `AVAudioPlayerNode.volume` lu par le thread de rendu à chaque slice → ramps de volume fluides pilotées main-thread. Cohérent avec `AudioMixer` (chemin composer) qui partage `AudioMixer.hostTime(forDelaySeconds:)` (`ReaderAudioMixer.swift:281`). |

**Audio du fond vs piste audio d'une vidéo foreground.** Une vidéo foreground garde sa propre piste audio jouée par son `AVPlayer` (`StoryMediaLayer`). Le `StoryAudioConductor` ne mixe **pas** cette piste — elle reste sous `AVPlayer`. Pour éviter que les deux se masquent : quand la slide possède à la fois un background audio ET une vidéo foreground non muette, le `StoryAudioConductor` active le **ducking** déjà présent (`ReaderAudioMixer.duckingEnabled`, `:356`) — le fond descend à `duckedBackgroundVolume` pendant la fenêtre de la vidéo. Les deux moteurs (`AVAudioEngine` et `AVPlayer`) coexistent sous la même `AVAudioSession .playback`.

### 3. `AVAudioSession` — configuration (RC4.3)

Réutiliser l'acteur **existant** `MediaSessionCoordinator` (`packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift`) — ne pas créer une 2ᵉ gestion de session.

- À l'entrée en `.play` : `await MediaSessionCoordinator.shared.request(role: .playback)` → `setCategory(.playback, mode: .default, options: [.duckOthers])` + `setActive(true)`, refcompté (`:50-68`).
- À la sortie : `await MediaSessionCoordinator.shared.release()` (refcount −1 ; `setActive(false, .notifyOthersOnDeactivation)` quand il retombe à 0, `:71-78`).
- Scene background : `await MediaSessionCoordinator.shared.deactivateForBackground()` (`:84-94`) force la libération.
- **Interruptions / route changes** : `MediaSessionCoordinator` rebroadcast déjà `interruptionBegan`, `interruptionEndedShouldResume`, `routeChangedOldDeviceUnavailable` via `events` (`:31-37`, `:98+`). Le `StoryAudioConductor` s'abonne à ce `PassthroughSubject` : `interruptionBegan` → `conductor.pause()` ; `routeChangedOldDeviceUnavailable` (casque débranché) → `pause()` (politique Apple : ne pas reprendre tout seul) ; `interruptionEndedShouldResume` → `resume()` seulement si le viewer est encore au premier plan et la story pas terminée.

### 4. `StoryAudioConductor` — propriétaire unique du transport (RC4.2, RC4.4, RC4.6)

Per la règle CLAUDE.md (« tout NEW service → protocole `{ServiceName}Providing` AVANT l'implémentation, dans le même fichier, au-dessus du type concret »), on introduit **un service** et son protocole.

**Fichier NOUVEAU** : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioConductor.swift`

```swift
/// Behaviour contract for the single owner of story-reader audio playback.
/// Idempotent transport: implementations MUST guarantee that `start(...)`
/// called twice for the same slide does not double-schedule any node.
@MainActor
public protocol StoryAudioConducting: AnyObject {
    var isPlaying: Bool { get }
    /// Configure + activate the AVAudioSession + schedule background & foreground
    /// audio relative to `slideTimelineOrigin` (host-time of slide `t = 0`).
    func start(slide: StorySlide,
               languages: [String],
               resolver: (@Sendable (String) -> URL?)?,
               slideTimelineOrigin: UInt64,
               mute: Bool) async
    func pause()
    func resume()
    /// Stops everything, deactivates the session, releases nodes. Idempotent.
    func stop() async
    func setMute(_ muted: Bool)
}

@MainActor
public final class StoryAudioConductor: StoryAudioConducting { ... }
```

`StoryAudioConductor` **possède** le `ReaderAudioMixer` (le mixer reste l'exécutant bas-niveau ; le conductor ajoute session + idempotence + sync timeline). `StoryCanvasUIView` remplace son `private let audioMixer = ReaderAudioMixer()` par `private let audioConductor: StoryAudioConducting`, injecté en `init` avec un défaut `StoryAudioConductor()` (DI testable, CLAUDE.md iOS).

**Idempotence (RC4.6).** Le conductor garde `private var startedSlideKey: String?`. `start(slide:...)` calcule une clé `"\(slide.id)#\(slideContentRevision)#\(languages)"` ; si elle est inchangée **et** `isPlaying`, l'appel est un *no-op*. Seule une nouvelle clé déclenche `mixer.stop()` (teardown) puis re-configuration + lecture. `setReaderContext` / `updateUIView` peuvent donc rappeler `start` sans danger.

**Propriétaire unique viewer+preview (RC4.6).** Le conductor expose un drapeau de classe `static var hasActiveConductor: Bool` (compteur). Quand un 2ᵉ conductor démarre alors qu'un est déjà actif (viewer + preview montés en même temps), le nouveau **gagne** : il appelle `stop()` sur le précédent via une notification `storyAudioConductorWillTakeOver` avant de configurer la session. Garantit *un seul* moteur audible.

**Démarrage du background (RC4.2).** Le conductor étend `ReaderAudioMixer` pour que le background soit un vrai citoyen du transport. Nouvelle méthode sur le mixer :

```swift
// ReaderAudioMixer.swift — corrige RC4.2
public func startBackground(originHost: UInt64) {
    guard let bg = backgroundEntry else { return }
    let startSeconds = backgroundStartOffset            // depuis la timeline (voir §5)
    let scheduleAt = AVAudioTime(hostTime: originHost
        + ReaderAudioMixer.hostTime(forDelaySeconds: startSeconds))
    let completion: AVAudioNodeCompletionHandler? = bg.looping ? { [weak self] in
        Task { @MainActor [weak self] in
            guard let self, let bg = self.backgroundEntry,
                  bg.player.isPlaying else { return }
            bg.player.scheduleFile(bg.file, at: nil, completionHandler: nil)
        }
    } : nil
    bg.player.scheduleFile(bg.file, at: scheduleAt, completionHandler: completion)
    bg.player.play()
}
```

`play()` du mixer appelle désormais `startBackground(originHost:)` après la boucle des `entries`. `pause()`/`stop()`/`teardown()` doivent aussi traiter `backgroundEntry.player` (ajout des `bg.player.pause()/.stop()` manquants — RC4.5 partielle).

### 5. Scheduler synchronisé sur la timeline (RC4.4)

Le besoin : *le background démarre à l'instant exact prévu, relatif à la timeline de la slide, en phase avec le média foreground.*

**Origine de timeline unique.** `StoryCanvasUIView` matérialise `t = 0` de la slide par un host-time : au moment du basculement `.play`, juste avant le premier `displayLinkTick`, il capture `slideTimelineOriginHost = mach_absolute_time()` (corrigé du `currentTime` initial s'il est non nul : `origin = now − hostTime(forDelaySeconds: currentTime.seconds)`). Cette même origine est passée :
- au `StoryAudioConductor.start(slideTimelineOrigin:)` → le mixer programme `background` à `origin + hostTime(forDelaySeconds: backgroundStartOffset)` et chaque clip foreground à `origin + hostTime(forDelaySeconds: clip.startTime)`.
- aux `AVPlayer` des vidéos foreground via `setRate(1, time: .zero, atHostTime: origin + hostTime(forDelaySeconds: media.startTime))` après `preroll` — alignant la vidéo sur la **même** horloge que l'audio.

`backgroundStartOffset` provient du modèle : `StoryAudioPlayerObject.startTime` (background résolu) ; à défaut `StoryEffects.backgroundAudioStart` (`StoryModels.swift:1225`) ; à défaut `0`. Le conductor le calcule et le stocke sur le mixer (`backgroundStartOffset`).

`AVAudioTime(hostTime:)` est la **seule** référence inter-node fiable (`sampleTime` diffère entre input/output — déjà documenté `ReaderAudioMixer.swift:20-23`). Le décalage audio↔vidéo est ainsi borné par la latence de sortie matérielle (< 1 frame), pas par le jitter du `CADisplayLink`.

### 6. Enveloppe de fade par défaut (RC4.7)

**Condition d'application** — le défaut s'applique **uniquement** si la slide n'a *aucun* effet de fade explicite :

```swift
// sur l'entrée background résolue
let hasExplicitFade = (background.fadeIn ?? 0) > 0 || (background.fadeOut ?? 0) > 0
```

`StoryAudioPlayerObject.fadeIn` / `.fadeOut` sont les champs configurés par le composer (lus en `ReaderAudioMixer.swift:67-68`). Si l'un des deux est `> 0`, on **respecte la configuration** et l'enveloppe par défaut n'est pas posée. Sinon le conductor injecte l'enveloppe par défaut :

| Phase | Volume départ → arrivée | Durée | Déclenchement (host-time) |
|-------|--------------------------|-------|----------------------------|
| Fade-in | **30 % → 100 %** de `targetVolume` | **1,2 s** | `origin + hostTime(backgroundStartOffset)` |
| Fade-out | **100 % → 5 %** de `targetVolume` | **0,5 s** | `origin + hostTime(effectiveSlideDuration − 0,5)` |

**Mécanisme de ramp.** On réutilise `ReaderAudioMixer.runVolumeRamp` (`:232-262`) — ramp sur `AVAudioPlayerNode.volume`, pas relue 30 Hz mais portée à un pas plus fin pour des fades courts : un `CADisplayLink` dédié (60 Hz, aligné sur l'horloge de rendu) interpole `volume` linéairement entre les bornes. `AVAudioPlayerNode.volume` étant échantillonné par le thread audio à chaque slice (~5 ms), un pas 60 Hz est imperceptible. `AVAudioMixerNode` + automation de paramètre serait sample-exact mais surdimensionné pour des fades de 0,5–1,2 s perçus par l'oreille humaine (justification déjà actée `ReaderAudioMixer.swift:186-190`).

Le fade-out à `effectiveSlideDuration − 0,5 s` utilise `slide.effectiveSlideDuration()` (`StoryModels.swift`, cf. spec `2026-05-08`) — la même durée que le `displayLinkTick` (`StoryCanvasUIView.swift:1117`), garantissant que le fade-out finit pile à la fin de la story.

Nouvelle API mixer :

```swift
// ReaderAudioMixer.swift
/// Default envelope applied to the background entry ONLY when the slide has
/// no explicit fadeIn/fadeOut sound effect configured.
public func applyDefaultBackgroundEnvelope(originHost: UInt64,
                                           slideDuration: Double)
```

### 7. Teardown du cycle de vie (RC4.5)

| Événement | Action |
|-----------|--------|
| `scenePhase == .background` (`StoryViewerView.swift:308`) | `StoryViewerView` appelle `audioConductor.stop()` **explicitement** (en plus de `PlaybackCoordinator.shared.stopAll()` déjà présent `:312`). Le conductor : `mixer.stop()` + `MediaSessionCoordinator.deactivateForBackground()`. |
| `StoryViewerView.onDisappear` (`:298`) | Ajout d'un `await audioConductor.stop()` — l'audio s'arrête net quand l'utilisateur quitte la story. |
| `StoryCanvasUIView.handleWillResignActive` (`:1080`) | Ajout `audioConductor.pause()` (en plus du `forEachAVPlayer { $0.pause() }` existant). Filet de sécurité si la slide est montée hors du `StoryViewerView` (feed embed). |
| `StoryCanvasUIView` retiré de la fenêtre (`willMove(toWindow: nil)`) | `audioConductor.pause()` — couvre le cas où SwiftUI démonte la `UIView` sans `deinit` immédiat. |
| `deinit` | `Task { @MainActor in conductor.stop() }` — reste comme dernier filet, mais n'est plus le *seul* chemin de teardown. |

Le `StoryAudioConductor` étant accessible depuis `StoryViewerView` (exposé par `StoryReaderRepresentable` via une closure `onAudioConductorReady` ou un binding), le teardown devient **déterministe**, pas dépendant de l'ARC.

### 8. Schéma de flux cible

```
StoryViewerView (.play)
  └─ StoryReaderRepresentable
       └─ StoryCanvasUIView.setMode(.play)
            ├─ capture slideTimelineOriginHost = mach_absolute_time()
            ├─ StoryAudioConductor.start(slide, languages, resolver, origin, mute)
            │    ├─ MediaSessionCoordinator.request(.playback)   ← RC4.3
            │    ├─ idempotence guard (slideKey)                 ← RC4.6
            │    ├─ ReaderAudioMixer.configure(foreground) + configureBackground
            │    ├─ mixer.play()  →  scheduleEntry(foreground) + startBackground ← RC4.2
            │    │    └─ scheduleFile(at: origin + hostTime(startOffset))        ← RC4.4
            │    └─ if !hasExplicitFade: applyDefaultBackgroundEnvelope          ← RC4.7
            ├─ StoryRenderer.render → StoryMediaLayer.configure(resolver:)  ← RC4.1
            └─ AVPlayer.setRate(atHostTime: origin + hostTime(media.startTime))
  onDisappear / scenePhase.background → conductor.stop() → mixer.stop() + session release  ← RC4.5
```

---

## Tâches (TDD RED → GREEN → REFACTOR)

> Cible de framework de test : Swift Testing pour la logique pure (host-time, calcul d'enveloppe) ; XCTest pour tout ce qui touche `AVAudioEngine` / `UIView` (cf. `apps/ios/CLAUDE.md`). Mocks `Mock{Service}` conformes au protocole, stubs `Result<T,Error>` + compteurs d'appels.

| Tâche | Phase | Détail |
|-------|-------|--------|
| **T0** | RED | Écrire toute la batterie de tests *défaillants* : `ReaderAudioMixerBackgroundTests`, `StoryAudioConductorTests`, `StoryMediaLayer_ForegroundResolverTests`, `CanvasAudioIntegrationTests`. Aucune prod encore. Tout en rouge. |
| **T1** | GREEN | RC4.1 — `StoryMediaLayer.configure(...,resolver:imageCache:)` + propagation `StoryRenderer.renderItem`. Test `test_configure_foregroundVideoWithResolver_attachesAVPlayerLayer`, `test_configure_foregroundImageWithResolver_setsContents`, `test_configure_noResolver_fallsBackToMediaURL`. |
| **T2** | GREEN | RC4.2 — `ReaderAudioMixer.startBackground(originHost:)` + intégration dans `play()/pause()/stop()/teardown()`. `test_play_withBackgroundEntry_schedulesAndPlaysBackgroundNode`, `test_stop_stopsBackgroundNode`. |
| **T3** | GREEN | RC4.4 — sync timeline. `MockStoryAudioConducting` capture `slideTimelineOrigin`. `test_start_schedulesBackgroundAt_originPlusStartOffset`, `test_start_foregroundClipAt_originPlusClipStartTime`, `test_hostTimeOrigin_matchesDisplayLinkZero`. |
| **T4** | GREEN | Protocole + service. `StoryAudioConducting` + `StoryAudioConductor`. RC4.3 (session via `MediaSessionCoordinator`) + RC4.6 (idempotence). `test_start_calledTwiceSameSlide_doesNotDoubleSchedule`, `test_start_calledTwiceSameSlide_callCountIsOne`, `test_secondConductor_takesOver_stopsFirst`, `test_start_requestsPlaybackSession`. |
| **T5** | GREEN | RC4.7 — enveloppe par défaut. `test_defaultEnvelope_noExplicitFade_rampsFrom30To100Over1_2s`, `test_defaultEnvelope_noExplicitFade_rampsFrom100To5Over0_5sBeforeEnd`, `test_defaultEnvelope_explicitFadeInConfigured_notApplied`, `test_defaultEnvelope_explicitFadeOutConfigured_notApplied`. |
| **T6** | GREEN | RC4.5 — teardown. `test_stop_deactivatesAudioSession`, `test_handleWillResignActive_pausesConductor`, `test_onDisappear_stopsConductor`, `test_scenePhaseBackground_stopsConductor`. + extension `scheduleContentReadyEvaluation` (foreground vidéo `.readyToPlay`). |
| **T7** | GREEN | Interruptions / route. `test_interruptionBegan_pausesConductor`, `test_routeChangedOldDeviceUnavailable_pausesConductor`, `test_interruptionEndedShouldResume_resumesWhenForeground`. |
| **T8** | REFACTOR | Dédupliquer le code host-time entre `AudioMixer` et `ReaderAudioMixer` si une asymétrie apparaît. Revue d'élégance. |
| **T9** | VERIFY | `pbxproj` : ajouter `StoryAudioConductor.swift` (objectVersion 63, voir Coordination & Merge). `./apps/ios/meeshy.sh build` puis `./apps/ios/meeshy.sh test` doivent passer. Vérif manuelle simulateur (voir Vérification). |

**Pattern de mock** (CLAUDE.md) :

```swift
@MainActor
final class MockStoryAudioConducting: StoryAudioConducting {
    var isPlaying = false
    var startCallCount = 0
    var stopCallCount = 0
    var lastSlideTimelineOrigin: UInt64?
    var lastStartLanguages: [String]?
    func start(slide: StorySlide, languages: [String],
               resolver: (@Sendable (String) -> URL?)?,
               slideTimelineOrigin: UInt64, mute: Bool) async {
        startCallCount += 1
        lastSlideTimelineOrigin = slideTimelineOrigin
        lastStartLanguages = languages
        isPlaying = true
    }
    func stop() async { stopCallCount += 1; isPlaying = false }
    func pause() { isPlaying = false }
    func resume() { isPlaying = true }
    func setMute(_ muted: Bool) {}
    func reset() { startCallCount = 0; stopCallCount = 0
                   lastSlideTimelineOrigin = nil; lastStartLanguages = nil
                   isPlaying = false }
}
```

---

## Risques

| Risque | Mitigation |
|--------|------------|
| **Interruption (appel, Siri)** pendant la lecture | `MediaSessionCoordinator.events` rebroadcast déjà `interruptionBegan` ; le conductor s'y abonne (T7). Ne jamais reprendre sans `interruptionEndedShouldResume`. |
| **Route change** (AirPods/casque débranchés) | `routeChangedOldDeviceUnavailable` → `pause()` (politique Apple : pas de reprise auto). Testé T7. |
| **Drift audio↔vidéo** | Origine host-time **unique** partagée entre `AVAudioPlayerNode` et `AVPlayer.setRate(atHostTime:)`. Drift borné par la latence de sortie matérielle, pas par le `CADisplayLink`. |
| **Swift 6 / actor isolation** | `AVAudioEngine` n'est pas `Sendable`. `StoryAudioConductor` et `ReaderAudioMixer` sont `@MainActor` (déjà le cas, `ReaderAudioMixer.swift:24`). `MediaSessionCoordinator` est un `actor` → appels `await`. Pas de `Task.detached`. |
| **Quirks audio simulateur** | Le simulateur restitue l'audio mais le timing host-time peut différer du matériel ; les asserts de timing T3/T5 tolèrent ±1 frame (16,6 ms). Vérification finale sur device réel. |
| **Double activation `AVAudioSession`** | `MediaSessionCoordinator` est refcompté (`activationCount`, `:39`, `:67`, `:72-77`) → `request`/`release` équilibrés ; `deactivateForBackground` force `count = 0`. |
| **Piste audio d'une vidéo foreground vs musique de fond** | Les deux coexistent sous `.playback` ; ducking du fond (`ReaderAudioMixer.duckingEnabled`) quand une vidéo foreground non muette est présente. Pas de mix de la piste vidéo dans l'`AVAudioEngine`. |
| **Double-play viewer + preview montés ensemble** | `StoryAudioConductor.hasActiveConductor` + notification `storyAudioConductorWillTakeOver` → un seul moteur audible (RC4.6). |
| **Re-entrée de slide** (swipe arrière) | Idempotence par `slideKey` ; une nouvelle clé force `stop()` propre avant re-`start()`. |
| **Fuite si `deinit` retardé** | Teardown rendu déterministe via `onDisappear` / `scenePhase` ; `deinit` n'est plus l'unique chemin (RC4.5). |

---

## Critères d'acceptation / Vérification

Vérification manuelle sur simulateur **et** device réel :

1. ✅ Un média **image foreground** est visible dans le **viewer** ET dans le **preview composer**.
2. ✅ Un média **vidéo foreground** est visible et joue dans le viewer ET le preview.
3. ✅ L'**audio de fond** d'une slide est **audible** dès l'ouverture de la story.
4. ✅ L'audio de fond **démarre à l'instant attendu** : pour un `backgroundStartOffset = 2 s`, le son commence 2 s après `t = 0` de la slide, en phase avec la vidéo foreground (vérif visuelle + log host-time).
5. ✅ **Pas de double-play** : ouvrir une story, faire re-render (`updateUIView` répété), re-entrer la slide → un seul son, pas d'écho.
6. ✅ **Arrêt à la mise en arrière-plan** : passer l'app en fond (Cmd+Shift+H) → audio coupé immédiatement, aucun son résiduel.
7. ✅ **Arrêt à la sortie de la story** : fermer le viewer → audio coupé net.
8. ✅ **Enveloppe par défaut** (slide *sans* effet de fade configuré) : fade-in de 30 %→100 % sur 1,2 s en entrée ; fade-out de 100 %→5 % sur 0,5 s juste avant la fin de la story (mesuré via tap sur `AVAudioPlayerNode.volume` dans les tests T5).
9. ✅ **Effet explicite respecté** : slide avec `fadeIn`/`fadeOut` configuré → l'enveloppe par défaut n'est PAS appliquée, la configuration du composer prévaut.
10. ✅ `./apps/ios/meeshy.sh test` passe (tous les tests `Story/Reader/Audio/*` + nouveaux), `./apps/ios/meeshy.sh build` clean.

---

## Fichiers

| Fichier | Action | Nouveau `.swift` ? |
|---------|--------|:------------------:|
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioConductor.swift` | **CRÉER** — protocole `StoryAudioConducting` + classe `StoryAudioConductor` | ✅ → entrée `project.pbxproj` |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift` | MODIFIER — `startBackground(originHost:)`, background dans `play/pause/stop/teardown`, `applyDefaultBackgroundEnvelope`, `backgroundStartOffset` | — |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift` | MODIFIER — `configure(...,resolver:imageCache:)`, résolution d'URL foreground | — |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift` | MODIFIER — propager `resolver`/`imageCache` à `renderItem` | — |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` | MODIFIER — `audioConductor` injecté, origine host-time, teardown lifecycle, `scheduleContentReadyEvaluation` foreground vidéo | — |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift` | MODIFIER — exposer le conductor au viewer (`onAudioConductorReady`) | — |
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` | MODIFIER — `conductor.stop()` sur `onDisappear` + `scenePhase == .background` | — |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Audio/StoryAudioConductorTests.swift` | **CRÉER** | ✅ → entrée `project.pbxproj` (cible test) |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Audio/ReaderAudioMixerBackgroundTests.swift` | MODIFIER — tests démarrage background | — |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryMediaLayer_ForegroundResolverTests.swift` | **CRÉER** | ✅ → entrée `project.pbxproj` (cible test) |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Audio/Mocks/MockStoryAudioConducting.swift` | **CRÉER** | ✅ → entrée `project.pbxproj` (cible test) |

> Note : les fichiers sous `packages/MeeshySDK/` sont gérés par `Package.swift` (SPM) — les nouveaux `.swift` y sont compilés *automatiquement* par convention de dossier. **Aucune entrée `project.pbxproj` n'est requise pour les fichiers SDK.** L'entrée `project.pbxproj` (objectVersion 63) ne concerne que d'éventuels nouveaux fichiers sous `apps/ios/Meeshy/` — ici, **aucun** : `StoryViewerView.swift` est modifié, pas créé. **Sprint 4 n'ajoute donc aucun fichier au `project.pbxproj`** (tous les nouveaux fichiers vivent dans le SDK SPM). Cette conclusion lève la contrainte de merge `pbxproj` ci-dessous.

---

## Coordination & Merge

Sprint 4 est le **quatrième de quatre specs de sprint parallèles** datées 2026-05-18 :

| Sprint | Spec | Domaine |
|--------|------|---------|
| Sprint 1 | `2026-05-18-sprint1-typing-indicator.md` | Écran **Conversation** — indicateur de saisie |
| Sprint 2 | `2026-05-18-sprint2-realtime-message-rendering.md` | Écran **Conversation** — rendu temps réel des messages |
| Sprint 3 | `2026-05-18-sprint3-optimistic-media.md` | Écran **Conversation** — médias optimistes |
| **Sprint 4** | `2026-05-18-sprint4-story-viewer-media-audio.md` (ce doc) | **Story Viewer / Preview** — médias foreground + audio |

**Vérification du partage de fichiers source.** Les scopes vérifiés des sprints 1-3 portent exclusivement sur la feature *Conversation* :
- Sprint 1 : `ConversationListViewModel.swift`, `ConversationView.swift`, `ConversationView+ScrollIndicators.swift` (+ fichiers en lecture seule).
- Sprint 2 : `MessageListViewController.swift`, `ConversationSocketHandler.swift`, `ConversationViewModel.swift`, `ConversationView.swift`, `MessagePersistenceActor.swift`, `MeeshySocketIOManager.ts`.
- Sprint 3 : `MeeshyConfig.swift`, `ConversationMediaViews.swift`, `ThemedMessageBubble+Media.swift`, `ConversationSocketHandler.swift`, `ConversationView+AttachmentHandlers.swift`, `DiskCacheStore.swift` (lecture seule).

Sprint 4 touche exclusivement la feature **Story** : `StoryAudioConductor.swift` (nouveau), `ReaderAudioMixer.swift`, `StoryMediaLayer.swift`, `StoryRenderer.swift`, `StoryCanvasUIView.swift`, `StoryReaderRepresentable.swift`, `StoryViewerView.swift`.

**Intersection : ∅ (vide).** Aucun fichier source n'est partagé entre Sprint 4 et Sprint 1, 2 ou 3.
- `DiskCacheStore.swift` est cité en lecture seule par Sprint 3 ; Sprint 4 ne le touche pas.
- `MediaSessionCoordinator.swift` est *réutilisé* (pas modifié) par Sprint 4 ; aucun autre sprint ne le touche.

**Conclusion.** Sprint 4 peut être développé dans un **git worktree pleinement indépendant** `feat/story-viewer-media-audio`, en parallèle de Sprint 1, 2 et 3, sans aucun risque de conflit de fichier source.

```bash
git worktree add ../v2_meeshy-story-viewer-media-audio -b feat/story-viewer-media-audio main
```

**`project.pbxproj`.** Tous les nouveaux fichiers `.swift` de Sprint 4 (`StoryAudioConductor.swift`, `StoryAudioConductorTests.swift`, `StoryMediaLayer_ForegroundResolverTests.swift`, `MockStoryAudioConducting.swift`) vivent sous `packages/MeeshySDK/` — compilés par SPM via la convention de dossier de `Package.swift`, **sans entrée `project.pbxproj`**. Sprint 4 **ne modifie pas `project.pbxproj`**. La règle CLAUDE.md « le dernier worktree à merger possède `project.pbxproj` » ne s'applique donc **pas** à Sprint 4 : il peut être mergé dans n'importe quel ordre relatif aux Sprints 1-3 sans réconciliation de `project.pbxproj`. Si l'un des Sprints 1-3 ajoute des fichiers sous `apps/ios/Meeshy/`, c'est ce sprint-là qui porte la responsabilité du `pbxproj`.

**Ordre de merge recommandé.** Sprint 4 étant sans intersection et sans `pbxproj`, son ordre est libre. Recommandation : merger Sprint 4 **en premier ou indépendamment**, puis lancer un build clean depuis `main` après tous les merges pour valider l'intégration (règle worktree CLAUDE.md).

---

**Fin du document.**
