# Sprint 4 — Médias foreground + audio de fond synchronisé dans le Story Viewer / Preview

**Status:** Draft (2026-05-18)

**Scope:**
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift` — l'entrée background n'est jamais lue ; ajout `in place` de `startBackground(originHost:)`, `applyDefaultBackgroundEnvelope(...)`, `backgroundStartOffset`, garde d'idempotence `slideKey`, et prise en compte du background dans `pause()/stop()/teardown()`.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` — capture d'une vraie origine de timeline (`slideTimelineOriginHost`), appel `ReaderAudioMixer.play(originHost:)`, cycle de vie audio (background scene, exit, retrait de fenêtre), réutilisation de `MediaSessionCoordinator` et `PlaybackCoordinator`.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift` — la vidéo/image foreground résout `mediaURL` directement au lieu de passer par le `postMediaURLResolver`.
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift` — propagation du `resolver` / `imageCache` vers `StoryMediaLayer` (le filtrage `isBackground == false` y est déjà correct).
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift` — exposition du `ReaderAudioMixer` au viewer pour un teardown déterministe.
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` — teardown audio explicite sur `.onDisappear` et `scenePhase == .background`.
- Tests : `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Audio/*`, `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/*`.

**Sprint 4 n'ajoute AUCUN fichier `.swift` de production et ne touche PAS `project.pbxproj`.** Les seuls fichiers créés sont des fichiers de test sous `packages/MeeshySDK/` (compilés automatiquement par SPM).

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
| **RC4.4** | **Le scheduler audio n'est pas synchronisé sur la timeline de la story.** `ReaderAudioMixer` pose chaque clip foreground à `originHost = mach_absolute_time()` capturé *dans* `play()` (`:92`). Mais `play()` est déclenché par `setMode(.play)` / `setReaderContext` (`StoryCanvasUIView.swift:562`, `:588`) à des instants *différents* du `currentTime` réel du `CADisplayLink` (`displayLinkTick`, `:1114`). L'origine host-time du mixer et l'origine du playhead vidéo ne sont pas le même `t = 0` : le mixer s'auto-attribue son origine au lieu de la *recevoir*. **Le mécanisme de scheduling host-time existe déjà** : `AudioMixer.scheduleNodeFromTimelineTime` (`AudioMixer.swift:124-154`) programme déjà chaque node contre une vraie origine de timeline. Le `ReaderAudioMixer` a la même primitive (`hostTime(forDelaySeconds:)`, `:281`) mais ne reçoit jamais de vraie origine. **Le défaut n'est donc pas l'absence de scheduler — c'est l'absence de propagation d'un `t = 0` réel.** |
| **RC4.5** | **Pas d'arrêt de l'audio à la sortie.** `StoryCanvasUIView.handleWillResignActive` (`:1080-1083`) appelle `forEachAVPlayer { $0.pause() }` + `backgroundLayer.handleAppLifecycle(active:false)` — il **ne touche jamais `audioMixer`**. Quand l'app passe en arrière-plan, l'`AVAudioEngine` du `ReaderAudioMixer` continue de tourner. À la sortie du viewer, `StoryViewerView.onDisappear` (`StoryViewerView.swift:298-307`) arrête le timer, `StoryMediaCoordinator`, le prefetcher — mais n'a aucune prise sur le `ReaderAudioMixer` (privé dans `StoryCanvasUIView`). Le seul teardown du mixer est `deinit` → `Task { shutdown() }` (`StoryCanvasUIView.swift:260-266`), différé et non-déterministe (dépend de la libération ARC de la `UIView`, elle-même retardée par la rétention SwiftUI du `UIViewRepresentable`). Conséquence : **fuite audio** — du son peut persister après que l'utilisateur a quitté la story ou mis l'app en fond. |
| **RC4.6** | **Risque de double-play.** `audioMixer.play()` est appelable depuis trois sites : `setMode(.play)` (`StoryCanvasUIView.swift:588`), la branche `didChange` (`:562`) et `setReaderContext` (`:562`). `setReaderContext` est explicitement « idempotent — safe to call from `updateUIView` » (commentaire `:549`) et SwiftUI rappelle `updateUIView` à chaque re-render. `ReaderAudioMixer.play()` n'a aucune garde d'idempotence : il rappelle `engine.start()` (gardé par `isRunning`) **mais re-`scheduleEntry` + re-`entry.node.play()` à chaque appel**, empilant des buffers programmés sur le même node → un même clip peut s'entendre deux fois / en écho. Le viewer (`StoryReaderRepresentable`) et le preview peuvent par ailleurs monter deux `StoryCanvasUIView` simultanés, chacun avec son `ReaderAudioMixer` → deux moteurs jouant le même fond. |
| **RC4.7** | **Pas d'enveloppe de fade par défaut.** `ReaderAudioMixer.scheduleFades` n'applique un fade que si `entry.fadeIn > 0` / `entry.fadeOut > 0` (`:192`, `:201`), valeurs lues de `audio.fadeIn` / `audio.fadeOut` (`:67-68`). Quand la slide n'a **aucun** effet de fade configuré, l'audio démarre et se coupe sèchement. Le besoin produit d'une enveloppe par défaut (30 %→100 % sur 1,2 s en entrée, 100 %→5 % sur 0,5 s en sortie) n'existe nulle part. |

---

## Design / Solution

### Décision d'architecture — pas de nouveau service

L'audit du codebase montre que **toutes les responsabilités du transport audio reader sont déjà couvertes par des services existants**. Introduire un nouveau coordinator (« StoryAudioConductor ») dupliquerait des mécanismes en place et violerait le principe **Single Source of Truth** de `CLAUDE.md`. Sprint 4 **n'ajoute donc aucun service ni protocole** ; il **réutilise** l'existant et **étend `ReaderAudioMixer` in place**.

| Responsabilité | Service propriétaire **existant** | Preuve `file:line` | Rôle dans Sprint 4 |
|----------------|-----------------------------------|--------------------|--------------------|
| Cycle de vie `AVAudioSession` (`.playback`, refcount, deactivation background, rebroadcast interruptions/route) | `actor MediaSessionCoordinator` | `MediaSessionCoordinator.swift:31-37`, `:52-66`, `:71-78`, `:84-94` | **Réutilisé tel quel** — `request(.playback)` / `release()` / `deactivateForBackground()`, abonnement à `events`. Aucun code de session nouveau. |
| Exclusion mutuelle « un seul moteur audible » (viewer + preview montés ensemble) | `PlaybackCoordinator` | registre `willStartPlaying(external:)` | **Réutilisé tel quel** — c'est *littéralement* le mécanisme pour le cas « deux moteurs jouant le même fond » (RC4.6). |
| Mute global du viewer / coordination de surface média | `StoryMediaCoordinator` | `StoryMediaCoordinator.swift:40-41` ; activé déjà par `StoryViewerView.swift:281` | **Réutilisé tel quel** — porte le mute ; aucun changement. |
| Scheduling host-time ancré sur une vraie timeline | `ReaderAudioMixer` (primitive `hostTime(forDelaySeconds:)`) ; pattern de référence `AudioMixer.scheduleNodeFromTimelineTime` (`AudioMixer.swift:124-154`) | `ReaderAudioMixer.swift:281` | **Étendu in place** — le mixer reçoit désormais une vraie origine via `play(originHost:)`. |
| Transport audio reader bas-niveau (engine, nodes, fades, ducking) | `ReaderAudioMixer` | `ReaderAudioMixer.swift` (classe `@MainActor`, `:24`) | **Étendu in place** — `startBackground`, enveloppe par défaut, garde d'idempotence. |

**Règle `{ServiceName}Providing`.** La règle `CLAUDE.md` iOS (« tout NEW service → protocole `{ServiceName}Providing` ») ne s'applique **qu'aux services nouveaux**. `ReaderAudioMixer` **existe déjà** : aucun protocole n'est mandaté. `ReaderAudioMixer` est `@MainActor` et directement instanciable — il est **testable tel quel** en injectant les arguments de test (URLs de fixtures, origines host-time fixées). On n'invente pas de protocole « pour en avoir un ».

**Mock de `MediaSessionCoordinator`.** `MediaSessionCoordinator` est un `actor` `.shared`. Les tests de Sprint 4 ciblent `ReaderAudioMixer` directement et **n'ont pas besoin de mocker la session** : `ReaderAudioMixer` programme l'`AVAudioEngine` indépendamment de l'activation de session (la session est requise/libérée par `StoryCanvasUIView`, pas par le mixer). Les tests de lifecycle (T6) vérifient les *appels* faits par `StoryCanvasUIView`/`StoryViewerView` sans dépendre de l'état interne de la session. Aucun nouveau seam n'est introduit ; pas de sur-ingénierie.

### 1. Médias foreground — fix du rendu (RC4.1)

Le bug est une **rupture de la chaîne de résolution d'URL** : `StoryMediaLayer` est le seul layer média qui ne reçoit pas le `postMediaURLResolver`. **Ce fix est indépendant de l'audio et inchangé par rapport à l'audit.**

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

`renderItem` (`StoryRenderer.swift:218`) propage `resolver` / `imageCache` — déjà disponibles dans `render(...)` (le `backdropProvider` est déjà passé ainsi, on suit le même pattern).

Résolution d'URL dans `StoryMediaLayer`, ordre identique au resolver du representable :
1. `resolver?(media.postMediaId)` — preloaded local (composer preview) puis remote publié.
2. Fallback `media.mediaURL` (fixtures, `file://` direct du composer édition).

`configureVideo` : la branche `mode == .play` doit appeler `player.play()` **uniquement** (déjà le cas, `:246`) ; ne pas pré-roller un `AVPlayer` non `.readyToPlay` (commentaire `:241-245` déjà correct).

`configureImage` : pour une URL réseau, le chemin async `imageLoader.image(for:)` (`:215-222`) reste ; pour un `file://` (preview), le chemin synchrone (`:207-213`) reste. On ajoute simplement la résolution préalable du `postMediaId → URL`.

**`onContentReady`** : `scheduleContentReadyEvaluation` (`StoryCanvasUIView.swift:700`) ne juge la "prêt-itude" que du `bgKind`. À étendre pour attendre aussi qu'au moins un média foreground vidéo atteigne `.readyToPlay` — sinon le timer de progression démarre sur une slide encore noire (directement lié au symptôme 1 ; tâche T6).

### 2. Choix du framework audio + justification

| Option | Verdict | Raison |
|--------|---------|--------|
| `AVAudioPlayer` | ❌ Rejeté | Pas de planification host-time. `play(atTime:)` est en `deviceCurrentTime` (secondes `Double`), précision ~20-50 ms ; pas de ramps de volume programmées sample-accurate ; un node par fichier sans graphe de mix commun. |
| `AVPlayer` + `AVAudioMix` | ❌ Rejeté pour le background | `AVPlayer` excelle pour l'audio *embarqué dans une vidéo*. `setVolumeRampFromStartVolume(_:toEndVolume:timeRange:)` sur `AVMutableAudioMixInputParameters` donnerait des fades parfaits — mais cela force à construire un `AVComposition` pour un simple fichier audio de fond, et `setRate(atHostTime:)` n'est fiable qu'après `preroll`. Surcoût injustifié pour un mono-fichier en boucle. |
| **`AVAudioEngine` + `AVAudioPlayerNode`** | ✅ **Retenu — déjà en place** | Le projet a **déjà** ce moteur (`ReaderAudioMixer`). `scheduleBuffer`/`scheduleFile(at: AVAudioTime(hostTime:))` donne un démarrage **sample-accurate** ancré sur `mach_absolute_time()` — exactement le besoin "démarrer à l'instant exact de la timeline". Un seul graphe : background + clips foreground + ducking convergent sur `mainMixerNode`. Cohérent avec `AudioMixer` (chemin composer) qui partage la même primitive host-time. |

**Audio du fond vs piste audio d'une vidéo foreground.** Une vidéo foreground garde sa propre piste audio jouée par son `AVPlayer` (`StoryMediaLayer`). `ReaderAudioMixer` ne mixe **pas** cette piste — elle reste sous `AVPlayer`. Pour éviter que les deux se masquent : quand la slide possède à la fois un background audio ET une vidéo foreground non muette, on active le **ducking déjà présent** (`ReaderAudioMixer.duckingEnabled`, `:356`) — le fond descend à `duckedBackgroundVolume`. Les deux moteurs (`AVAudioEngine` et `AVPlayer`) coexistent sous la même `AVAudioSession .playback` ouverte par `MediaSessionCoordinator`.

### 3. `AVAudioSession` — réutilisation de `MediaSessionCoordinator` (RC4.3)

Réutiliser l'acteur **existant** `MediaSessionCoordinator` (`packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift`) — **aucun nouveau code de session**.

- À l'entrée en `.play` : `await MediaSessionCoordinator.shared.request(role: .playback)` → `setCategory(.playback, mode: .default, options: [.duckOthers])` + `setActive(true)`, refcompté (`:50-68`). Appelé par `StoryCanvasUIView` au moment du basculement `.play`.
- À la sortie : `await MediaSessionCoordinator.shared.release()` (refcount −1 ; `setActive(false, .notifyOthersOnDeactivation)` quand il retombe à 0, `:71-78`).
- Scene background : `await MediaSessionCoordinator.shared.deactivateForBackground()` (`:84-94`) force la libération.
- **Interruptions / route changes** : `MediaSessionCoordinator` rebroadcast déjà `interruptionBegan`, `interruptionEndedShouldResume`, `routeChangedOldDeviceUnavailable` via `events` (`PassthroughSubject`, `:31-37`, `:98+`). `StoryCanvasUIView` s'abonne à ce subject : `interruptionBegan` → `audioMixer.pause()` ; `routeChangedOldDeviceUnavailable` (casque débranché) → `audioMixer.pause()` (politique Apple : ne pas reprendre tout seul) ; `interruptionEndedShouldResume` → `audioMixer.play(originHost:)` (reprise) seulement si le viewer est encore au premier plan et la story pas terminée.

### 4. Exclusion mutuelle « un seul moteur audible » — `PlaybackCoordinator` (RC4.6, partie multi-surface)

Le cas « viewer + preview montés en même temps → deux `ReaderAudioMixer`, deux moteurs jouant le même fond » est **exactement** ce que résout `PlaybackCoordinator` : son registre `willStartPlaying(external:)` impose une **exclusion mutuelle single-owner** entre lecteurs.

- Avant de lancer `audioMixer.play(originHost:)`, `StoryCanvasUIView` appelle `PlaybackCoordinator.shared.willStartPlaying(external: ...)`.
- Le coordinator notifie le propriétaire précédent, qui s'arrête (`audioMixer.stop()`).
- `StoryMediaCoordinator` (déjà activé par `StoryViewerView.swift:281`) reste le propriétaire du *mute* de surface ; il n'est pas modifié.

**Aucun nouveau drapeau `static` ni notification custom** : `PlaybackCoordinator` *est* le single-owner registry. On ne réimplémente pas un compteur de conductors — ce serait une seconde source de vérité.

### 5. Démarrage du background — extension `in place` de `ReaderAudioMixer` (RC4.2)

Le seul code *genuinement nouveau* du sprint vit **sur la classe `ReaderAudioMixer` existante** : une méthode `startBackground(originHost:)` (~15 lignes) qui programme `backgroundEntry` sur la timeline, et une branche d'enveloppe par défaut. Aucun nouveau type.

```swift
// ReaderAudioMixer.swift — membre AJOUTÉ à la classe existante — corrige RC4.2
public func startBackground(originHost: UInt64) {
    guard let bg = backgroundEntry else { return }
    let startSeconds = backgroundStartOffset            // depuis la timeline (voir §6)
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

`play()` du mixer reçoit désormais l'origine — signature `play(originHost: UInt64)` — et appelle `startBackground(originHost:)` après la boucle des `entries` (chaque clip foreground est programmé contre la même origine). `pause()` / `stop()` / `teardown()` doivent aussi traiter `backgroundEntry.player` (ajout des `bg.player.pause()/.stop()` manquants — RC4.5 partielle).

**Garde d'idempotence (RC4.6, re-render).** `ReaderAudioMixer` porte une propriété `private var startedSlideKey: String?`. `play(originHost:)` prend en argument une clé `slideKey` (`"\(slide.id)#\(slideContentRevision)#\(languages)"`) ; si elle est inchangée **et** le moteur tourne, l'appel est un *no-op*. Seule une nouvelle clé déclenche `stop()` (teardown) puis re-configuration + lecture. `setReaderContext` / `updateUIView` peuvent ainsi rappeler `play` sans empiler de buffers.

### 6. Synchronisation timeline — propager un vrai `t = 0` (RC4.4)

Le besoin : *le background démarre à l'instant exact prévu, relatif à la timeline de la slide, en phase avec le média foreground.*

**Le scheduler host-time existe déjà** (`AudioMixer.scheduleNodeFromTimelineTime`, `AudioMixer.swift:124-154`, et la primitive `ReaderAudioMixer.hostTime(forDelaySeconds:)`, `:281`). Le défaut RC4.4 est uniquement que `ReaderAudioMixer` **capture `mach_absolute_time()` dans `play()`** au lieu de **recevoir** l'origine de la slide. **Le fix n'est pas un nouveau scheduler — c'est passer la bonne origine.**

**Origine de timeline unique.** `StoryCanvasUIView` matérialise `t = 0` de la slide par un host-time : au moment du basculement `.play`, juste avant le premier `displayLinkTick`, il capture `slideTimelineOriginHost = mach_absolute_time()` (corrigé du `currentTime` initial s'il est non nul : `origin = now − hostTime(forDelaySeconds: currentTime.seconds)`). Cette même origine est ensuite passée :
- à `ReaderAudioMixer.play(originHost: slideTimelineOriginHost, slideKey:)` → le mixer programme `background` à `origin + hostTime(forDelaySeconds: backgroundStartOffset)` et chaque clip foreground à `origin + hostTime(forDelaySeconds: clip.startTime)`.
- aux `AVPlayer` des vidéos foreground via `setRate(1, time: .zero, atHostTime: origin + hostTime(forDelaySeconds: media.startTime))` après `preroll` — alignant la vidéo sur la **même** horloge que l'audio.

`backgroundStartOffset` est une propriété **ajoutée à `ReaderAudioMixer`**, calculée depuis le modèle : `StoryAudioPlayerObject.startTime` (background résolu) ; à défaut `StoryEffects.backgroundAudioStart` (`StoryModels.swift:1225`) ; à défaut `0`. `configureBackground` la renseigne.

`AVAudioTime(hostTime:)` est la **seule** référence inter-node fiable (`sampleTime` diffère entre input/output — déjà documenté `ReaderAudioMixer.swift:20-23`). Le décalage audio↔vidéo est ainsi borné par la latence de sortie matérielle (< 1 frame), pas par le jitter du `CADisplayLink`.

### 7. Enveloppe de fade par défaut — branche `in place` sur `ReaderAudioMixer` (RC4.7)

**Condition d'application** — le défaut s'applique **uniquement** si la slide n'a *aucun* effet de fade explicite :

```swift
// sur l'entrée background résolue
let hasExplicitFade = (background.fadeIn ?? 0) > 0 || (background.fadeOut ?? 0) > 0
```

`StoryAudioPlayerObject.fadeIn` / `.fadeOut` sont les champs configurés par le composer (lus en `ReaderAudioMixer.swift:67-68`). Si l'un des deux est `> 0`, on **respecte la configuration** et l'enveloppe par défaut n'est pas posée. Sinon `ReaderAudioMixer` injecte l'enveloppe par défaut :

| Phase | Volume départ → arrivée | Durée | Déclenchement (host-time) |
|-------|--------------------------|-------|----------------------------|
| Fade-in | **30 % → 100 %** de `targetVolume` | **1,2 s** | `origin + hostTime(backgroundStartOffset)` |
| Fade-out | **100 % → 5 %** de `targetVolume` | **0,5 s** | `origin + hostTime(effectiveSlideDuration − 0,5)` |

**Mécanisme de ramp.** On réutilise `ReaderAudioMixer.runVolumeRamp` (`:232-262`) — ramp sur `AVAudioPlayerNode.volume`, portée à un pas plus fin pour des fades courts : un `CADisplayLink` dédié (60 Hz, aligné sur l'horloge de rendu) interpole `volume` linéairement entre les bornes. `AVAudioPlayerNode.volume` étant échantillonné par le thread audio à chaque slice (~5 ms), un pas 60 Hz est imperceptible (justification déjà actée `ReaderAudioMixer.swift:186-190`).

Le fade-out à `effectiveSlideDuration − 0,5 s` utilise `slide.effectiveSlideDuration()` (`StoryModels.swift`, cf. spec `2026-05-08`) — la même durée que le `displayLinkTick` (`StoryCanvasUIView.swift:1117`), garantissant que le fade-out finit pile à la fin de la story.

Nouvelle méthode **ajoutée à la classe `ReaderAudioMixer` existante** :

```swift
// ReaderAudioMixer.swift — membre AJOUTÉ
/// Default envelope applied to the background entry ONLY when the slide has
/// no explicit fadeIn/fadeOut sound effect configured.
public func applyDefaultBackgroundEnvelope(originHost: UInt64,
                                           slideDuration: Double)
```

### 8. Teardown du cycle de vie — appels explicites au mixer (RC4.5)

Le teardown ne passe **pas** par un conductor : `StoryViewerView` et `StoryCanvasUIView` appellent **directement** les méthodes de transport de `ReaderAudioMixer`.

| Événement | Action |
|-----------|--------|
| `scenePhase == .background` (`StoryViewerView.swift:308`) | `StoryViewerView` appelle **explicitement** `audioMixer.stop()` (en plus de `PlaybackCoordinator.shared.stopAll()` déjà présent `:312`), puis `await MediaSessionCoordinator.shared.deactivateForBackground()`. |
| `StoryViewerView.onDisappear` (`:298`) | Ajout `audioMixer.shutdown()` + `await MediaSessionCoordinator.shared.release()` — l'audio s'arrête net quand l'utilisateur quitte la story. |
| `StoryCanvasUIView.handleWillResignActive` (`:1080`) | Ajout `audioMixer.stop()` (en plus du `forEachAVPlayer { $0.pause() }` existant). Filet de sécurité si la slide est montée hors du `StoryViewerView` (feed embed). |
| `StoryCanvasUIView` retiré de la fenêtre (`willMove(toWindow: nil)`) | `audioMixer.stop()` — couvre le cas où SwiftUI démonte la `UIView` sans `deinit` immédiat. |
| `deinit` | `Task { @MainActor in audioMixer.shutdown() }` (`StoryCanvasUIView.swift:260-266`) — reste comme dernier filet, mais n'est plus le *seul* chemin de teardown. |

Pour que ce teardown soit **déterministe** (pas dépendant de l'ARC), le `ReaderAudioMixer` doit être **joignable depuis `StoryViewerView`**. `StoryReaderRepresentable` l'expose via une closure légère (`onAudioMixerReady`) ou un binding — le viewer obtient une référence et peut appeler `stop()/shutdown()` sans attendre la libération de la `UIView`. (Aucun service intermédiaire ; juste une référence remontée.)

### 9. Schéma de flux cible

```
StoryViewerView (.play)
  └─ StoryReaderRepresentable  (remonte la réf. du mixer via onAudioMixerReady)
       └─ StoryCanvasUIView.setMode(.play)
            ├─ capture slideTimelineOriginHost = mach_absolute_time()
            ├─ await MediaSessionCoordinator.shared.request(.playback)        ← RC4.3 (réutilisé)
            ├─ PlaybackCoordinator.shared.willStartPlaying(external: ...)      ← RC4.6 (réutilisé)
            ├─ ReaderAudioMixer.configure(foreground) + configureBackground    (backgroundStartOffset renseigné)
            ├─ ReaderAudioMixer.play(originHost: slideTimelineOriginHost, slideKey:)
            │    ├─ idempotence guard (startedSlideKey)                       ← RC4.6
            │    ├─ scheduleEntry(foreground) à origin + hostTime(clip.startTime) ← RC4.4
            │    └─ startBackground(originHost:) → scheduleFile(at: origin + hostTime(startOffset)) ← RC4.2
            ├─ if !hasExplicitFade: applyDefaultBackgroundEnvelope(origin, slideDuration) ← RC4.7
            ├─ StoryRenderer.render → StoryMediaLayer.configure(resolver:imageCache:)      ← RC4.1
            └─ AVPlayer.setRate(atHostTime: origin + hostTime(media.startTime))
  onDisappear / scenePhase.background
       → audioMixer.stop()/shutdown() + MediaSessionCoordinator.release()/deactivateForBackground()  ← RC4.5
```

---

## Tâches (TDD RED → GREEN → REFACTOR)

> Cible de framework de test : Swift Testing pour la logique pure (host-time, calcul d'enveloppe) ; XCTest pour tout ce qui touche `AVAudioEngine` / `UIView` (cf. `apps/ios/CLAUDE.md`). `ReaderAudioMixer` est `@MainActor` et instanciable directement — les tests le ciblent **sans mock** (URLs de fixtures, origines host-time fixées).

| Tâche | Phase | Détail |
|-------|-------|--------|
| **T0** | RED | Écrire toute la batterie de tests *défaillants* : `ReaderAudioMixerBackgroundTests`, `ReaderAudioMixerIdempotenceTests`, `ReaderAudioMixerDefaultEnvelopeTests`, `StoryMediaLayer_ForegroundResolverTests`, `CanvasAudioLifecycleTests`. Aucune prod encore. Tout en rouge. |
| **T1** | GREEN | RC4.1 — `StoryMediaLayer.configure(...,resolver:imageCache:)` + propagation `StoryRenderer.renderItem`. Tests `test_configure_foregroundVideoWithResolver_attachesAVPlayerLayer`, `test_configure_foregroundImageWithResolver_setsContents`, `test_configure_noResolver_fallsBackToMediaURL`. |
| **T2** | GREEN | RC4.2 — `ReaderAudioMixer.startBackground(originHost:)` + intégration dans `play(originHost:)/pause()/stop()/teardown()`. Tests `test_play_withBackgroundEntry_schedulesAndPlaysBackgroundNode`, `test_stop_stopsBackgroundNode`, `test_play_loopingBackground_reschedulesOnCompletion`. |
| **T3** | GREEN | RC4.4 — sync timeline. `ReaderAudioMixer.play(originHost:)` reçoit une vraie origine. Tests `test_play_schedulesBackgroundAt_originPlusStartOffset`, `test_play_foregroundClipAt_originPlusClipStartTime`, `test_play_originHostMatchesProvidedValue` (le mixer ne re-capture pas `mach_absolute_time()`). |
| **T4** | GREEN | RC4.6 — idempotence + exclusion mutuelle. `ReaderAudioMixer.play(originHost:slideKey:)` avec garde `startedSlideKey`. Tests `test_play_calledTwiceSameSlideKey_doesNotDoubleSchedule`, `test_play_calledTwiceSameSlideKey_isNoOp`, `test_play_newSlideKey_stopsThenReschedules`. Wiring `PlaybackCoordinator.willStartPlaying` vérifié via test d'intégration `StoryCanvasUIView`. |
| **T5** | GREEN | RC4.7 — enveloppe par défaut. Tests `test_defaultEnvelope_noExplicitFade_rampsFrom30To100Over1_2s`, `test_defaultEnvelope_noExplicitFade_rampsFrom100To5Over0_5sBeforeEnd`, `test_defaultEnvelope_explicitFadeInConfigured_notApplied`, `test_defaultEnvelope_explicitFadeOutConfigured_notApplied`. |
| **T6** | GREEN | RC4.5 — teardown explicite. Tests `test_handleWillResignActive_stopsMixer`, `test_willMoveToWindowNil_stopsMixer`, `test_onDisappear_shutsDownMixer`, `test_scenePhaseBackground_stopsMixer`. RC4.3 : `test_setModePlay_requestsPlaybackSession`. + extension `scheduleContentReadyEvaluation` (foreground vidéo `.readyToPlay`). |
| **T7** | GREEN | Interruptions / route via `MediaSessionCoordinator.events`. Tests `test_interruptionBegan_pausesMixer`, `test_routeChangedOldDeviceUnavailable_pausesMixer`, `test_interruptionEndedShouldResume_resumesWhenForeground`. |
| **T8** | REFACTOR (OPTIONNEL — hors scope si risqué) | Fermer le fork `AudioMixer` / `ReaderAudioMixer` en portant `backgroundEntry` + ducking sur `AudioMixer`, pour que reader et composer partagent un seul moteur. **Non requis pour le sprint** — à ne tenter que si la déduplication est sûre et que les tests T0-T7 sont verts. Sinon, ne pas faire. |
| **T9** | VERIFY | `./apps/ios/meeshy.sh build` puis `./apps/ios/meeshy.sh test` doivent passer. Vérif manuelle simulateur + device (voir Vérification). Aucune entrée `project.pbxproj` à modifier. |

**Aucun mock de service à écrire.** Sprint 4 n'introduit aucun protocole de service, donc aucun `Mock{Service}` n'est requis. Les tests instancient `ReaderAudioMixer` directement et passent des origines host-time et des URLs de fixtures déterministes.

---

## Risques

| Risque | Mitigation |
|--------|------------|
| **Interruption (appel, Siri)** pendant la lecture | `MediaSessionCoordinator.events` rebroadcast déjà `interruptionBegan` ; `StoryCanvasUIView` s'y abonne (T7) et appelle `audioMixer.pause()`. Ne jamais reprendre sans `interruptionEndedShouldResume`. |
| **Route change** (AirPods/casque débranchés) | `routeChangedOldDeviceUnavailable` → `audioMixer.pause()` (politique Apple : pas de reprise auto). Testé T7. |
| **Drift audio↔vidéo** | Origine host-time **unique** capturée par `StoryCanvasUIView` et partagée entre `ReaderAudioMixer.play(originHost:)` et `AVPlayer.setRate(atHostTime:)`. Drift borné par la latence de sortie matérielle, pas par le `CADisplayLink`. |
| **Swift 6 / actor isolation** | `AVAudioEngine` n'est pas `Sendable`. `ReaderAudioMixer` est `@MainActor` (déjà le cas, `ReaderAudioMixer.swift:24`). `MediaSessionCoordinator` est un `actor` → appels `await`. Pas de `Task.detached`. |
| **Quirks audio simulateur** | Le simulateur restitue l'audio mais le timing host-time peut différer du matériel ; les asserts de timing T3/T5 tolèrent ±1 frame (16,6 ms). Vérification finale sur device réel. |
| **Double activation `AVAudioSession`** | `MediaSessionCoordinator` est refcompté (`activationCount`, `:39`, `:67`, `:72-77`) → `request`/`release` équilibrés ; `deactivateForBackground` force `count = 0`. Aucun code de session nouveau, aucun double-comptage. |
| **Piste audio d'une vidéo foreground vs musique de fond** | Les deux coexistent sous `.playback` ; ducking du fond (`ReaderAudioMixer.duckingEnabled`) quand une vidéo foreground non muette est présente. Pas de mix de la piste vidéo dans l'`AVAudioEngine`. |
| **Double-play viewer + preview montés ensemble** | `PlaybackCoordinator.willStartPlaying(external:)` — registre single-owner **existant** — arrête le moteur précédent. Pas de nouveau drapeau `static` (RC4.6). |
| **Re-entrée de slide** (swipe arrière) | Idempotence par `slideKey` sur `ReaderAudioMixer` ; une nouvelle clé force `stop()` propre avant re-`play()`. |
| **Fuite si `deinit` retardé** | Teardown rendu déterministe via `onDisappear` / `scenePhase` appelant `audioMixer.stop()/shutdown()` ; `deinit` n'est plus l'unique chemin (RC4.5). |

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
| `packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift` | MODIFIER — `startBackground(originHost:)`, `play(originHost:slideKey:)`, background dans `pause/stop/teardown`, `applyDefaultBackgroundEnvelope`, `backgroundStartOffset`, garde `startedSlideKey` | — |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift` | MODIFIER — `configure(...,resolver:imageCache:)`, résolution d'URL foreground | — |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift` | MODIFIER — propager `resolver`/`imageCache` à `renderItem` | — |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` | MODIFIER — capture `slideTimelineOriginHost`, `audioMixer.play(originHost:slideKey:)`, `MediaSessionCoordinator.request/release`, `PlaybackCoordinator.willStartPlaying`, teardown lifecycle, abonnement `events`, `scheduleContentReadyEvaluation` foreground vidéo | — |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift` | MODIFIER — exposer la référence `ReaderAudioMixer` au viewer (`onAudioMixerReady`) | — |
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` | MODIFIER — `audioMixer.stop()/shutdown()` + `MediaSessionCoordinator` sur `onDisappear` + `scenePhase == .background` | — |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Audio/ReaderAudioMixerBackgroundTests.swift` | **CRÉER** — démarrage + scheduling du background (SPM, pas de `pbxproj`) | ✅ (SDK/SPM) |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Audio/ReaderAudioMixerIdempotenceTests.swift` | **CRÉER** — garde `slideKey`, no double-schedule (SPM, pas de `pbxproj`) | ✅ (SDK/SPM) |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Audio/ReaderAudioMixerDefaultEnvelopeTests.swift` | **CRÉER** — enveloppe par défaut vs fade explicite (SPM, pas de `pbxproj`) | ✅ (SDK/SPM) |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryMediaLayer_ForegroundResolverTests.swift` | **CRÉER** — résolution d'URL foreground (SPM, pas de `pbxproj`) | ✅ (SDK/SPM) |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/CanvasAudioLifecycleTests.swift` | **CRÉER** — teardown / interruptions / route (SPM, pas de `pbxproj`) | ✅ (SDK/SPM) |

> **Sprint 4 n'ajoute aucun fichier `.swift` de production.** Les seuls fichiers créés sont des fichiers de test, tous sous `packages/MeeshySDK/Tests/` — compilés *automatiquement* par SPM via la convention de dossier de `Package.swift`. **Aucune entrée `project.pbxproj` n'est requise** : `project.pbxproj` ne concerne que d'éventuels nouveaux fichiers sous `apps/ios/Meeshy/`, et ici `StoryViewerView.swift` est **modifié**, pas créé. **Sprint 4 ne touche donc pas `project.pbxproj`.**

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

Sprint 4 touche exclusivement la feature **Story** : `ReaderAudioMixer.swift`, `StoryMediaLayer.swift`, `StoryRenderer.swift`, `StoryCanvasUIView.swift`, `StoryReaderRepresentable.swift`, `StoryViewerView.swift`. **Aucun fichier de production nouveau.**

**Intersection : ∅ (vide).** Aucun fichier source n'est partagé entre Sprint 4 et Sprint 1, 2 ou 3.
- `DiskCacheStore.swift` est cité en lecture seule par Sprint 3 ; Sprint 4 ne le touche pas.
- `MediaSessionCoordinator.swift`, `PlaybackCoordinator`, `StoryMediaCoordinator` sont *réutilisés* (pas modifiés) par Sprint 4 ; aucun autre sprint ne les touche.

**Conclusion.** Sprint 4 peut être développé dans un **git worktree pleinement indépendant** `feat/story-viewer-media-audio`, en parallèle de Sprint 1, 2 et 3, sans aucun risque de conflit de fichier source.

```bash
git worktree add ../v2_meeshy-story-viewer-media-audio -b feat/story-viewer-media-audio main
```

**`project.pbxproj`.** Sprint 4 **ne crée aucun fichier `.swift` de production** et **n'ajoute aucun fichier au `project.pbxproj`**. Tous les fichiers créés sont des fichiers de test sous `packages/MeeshySDK/Tests/` — compilés par SPM via `Package.swift`, sans entrée `project.pbxproj`. La règle CLAUDE.md « le dernier worktree à merger possède `project.pbxproj` » ne s'applique donc **pas** à Sprint 4 : il peut être mergé dans n'importe quel ordre relatif aux Sprints 1-3 sans réconciliation de `project.pbxproj`. Si l'un des Sprints 1-3 ajoute des fichiers sous `apps/ios/Meeshy/`, c'est ce sprint-là qui porte la responsabilité du `pbxproj`.

**Ordre de merge recommandé.** Sprint 4 étant sans intersection et sans `pbxproj`, son ordre est libre. Recommandation : merger Sprint 4 **en premier ou indépendamment**, puis lancer un build clean depuis `main` après tous les merges pour valider l'intégration (règle worktree CLAUDE.md).

---

**Fin du document.**
