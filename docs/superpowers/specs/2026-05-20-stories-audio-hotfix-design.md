# Stories Audio Hotfix — Design Spec

**Date** : 2026-05-20
**Statut** : Approuvé en brainstorming, revu par Opus, corrigé
**Auteur** : Claude (Opus 4.7) + J. Charles N. M.
**Scope** : `apps/ios`, `packages/MeeshySDK/Sources/MeeshyUI/Story/`, `packages/MeeshySDK/Sources/MeeshyUI/Media/`
**Cible** : iOS 17.0+

## 1. Contexte & symptômes

Depuis le commit `85bf841b` (`feat(story): médias foreground + audio de fond dans le Story Viewer`, 2026-05-18), l'utilisateur signale trois symptômes coordonnés :

| Symptôme | Visibilité utilisateur |
|----------|-----------------------|
| Aucun audio (fg ni bg) ne joue en Reader/Viewer | Stories postées muettes |
| Aucun audio ne joue en preview composer | Auteur ne peut pas vérifier son montage |
| Clips audio ajoutés invisibles dans la liste des médias du composer | Auteur ne peut pas éditer (fg/bg, volume, suppression) un audio attaché |

Avant `85bf841b`, l'audio fonctionnait. Le diagnostic initial du brainstorming pointait une rupture de signature `play()`, mais la review technique a montré que le call site reader appelle déjà la bonne API (`StoryCanvasUIView.swift:670` : `audioMixer.play(originHost: origin, slideKey: currentSlideKey)`). Le silence reader vient donc d'ailleurs, et ce spec adopte une **approche observation-first** avant tout fix.

## 2. Diagnostic des ruptures

### 2.1 Rupture B — Liste de médias composer ignore les audios (confirmée)

`/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift:110-179` itère uniquement sur `mediaObjects` (images/vidéos). Les `audioPlayerObjects` créés par `addAudioObject()` (`StoryComposerViewModel.swift:1017-1041`) sont **persistés** dans `effects.audioPlayerObjects` mais **jamais affichés**. L'auteur n'a aucun feedback visuel ni contrôle.

→ Pas d'observation nécessaire, fix UI direct.

### 2.2 Rupture C — Notification `.timelineDidStartPlaying` jamais postée (confirmée)

`StoryAudioPlayerView` écoute `.timelineDidStartPlaying` pour démarrer son `AVPlayer` interne en preview composer (`StoryAudioPlayerView.swift:96-108`). Aucun `NotificationCenter.default.post(name: .timelineDidStartPlaying, ...)` n'existe dans `StoryTimelineEngine.play()` (`/packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift:217-229`). Résultat : preview composer silent.

→ Fix direct : poster les notifications côté engine.

### 2.3 Rupture A — Silence reader : H2 confirmée par diff avec pipeline message

**Le pipeline message audio FONCTIONNE** (bulles audio dans les conversations). **Le pipeline story audio NE FONCTIONNE PAS**. La diff est éclairante :

| Aspect | Pipeline message (✅ joue) | Pipeline story (❌ silent) |
|--------|---------------------------|---------------------------|
| Player | `AVAudioPlayer(data: Data)` | `AVAudioFile(forReading: URL)` + `AVAudioPlayerNode` |
| Source | `Data` bytes en mémoire | URL passée directement à `AVAudioFile` |
| URL resolver | `MeeshyConfig.resolveMediaURL` → `CacheCoordinator.shared.audio.data(for:)` async → `Data` | `readerContext.postMediaURLResolver(postMediaId)` → URL telle quelle |
| Contrainte source | `AVAudioPlayer(data:)` accepte tout format Core Audio | **`AVAudioFile(forReading:)` n'accepte QUE des URLs `file://`** (Apple docs) |

**Conséquence** : si `postMediaURLResolver` retourne une URL HTTPS (cas viewer post-publication d'une story d'un autre user, où `preloadedAudioURLs` est vide → fallback sur `mediaList.first.url` HTTPS dans `StoryReaderRepresentable.swift:92-98`), `AVAudioFile(forReading: url)` jette `OSStatus 2003334207` ("not a file"). L'erreur est attrapée par le `catch` dans `ReaderAudioMixer.configure` (l.100-102), le clip est skippé silencieusement, `entries` reste vide, `play()` retourne `true` sans rien jouer.

**Hypothèses runtime ordonnées par probabilité** :

- **H2 (HAUTE)** : `AVAudioFile(forReading: url)` rejette une URL HTTPS. C'est le diff fondamental avec le pipeline message qui pre-télécharge en `Data` via `CacheCoordinator`.
- **H1 (MOYENNE)** : `postMediaURLResolver` retourne `nil` pour les audios (cache non rempli, `audio.resolvedPostMediaId(preferredLanguages:)` ne match aucun id dans `StoryItem.media`).
- **H3 (FAIBLE pour silence, mais aggravant)** : `StoryTimelineEngine.configureAudioSession()` (`StoryTimelineEngine.swift:110-127`) pose une seconde config `AVAudioSession.setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])` concurrente à `MediaSessionCoordinator` → refcount du coordinator désynchro, peut amplifier H2.
- **H4 (FAIBLE)** : `PlaybackCoordinator` race avant `play()`.
- **H5 (FAIBLE)** : `currentSlideKey` mute entre `configure` et `play`.

→ **Approche corrective** : pré-cache audio garanti (`CacheCoordinator.shared.audio.data(for:)`) + utiliser l'URL locale (`audioLocalFileURL(for:)`) AVANT `audioMixer.configure(urls:)`. Voir § 5.7.

### 2.4 Aggravant — `try?` muet partout

Les chaînes audio sont parsemées de `try?` qui mangent les erreurs (`reconfigureAudioForPlayback()` ligne 601-603, `AudioMixer.configure(audios:urls:)` ligne 59-86). Aucune trace dev → diagnostic impossible. **C'est le livrable n°1** (cf. § 3).

## 3. Approche

**Observation avant chirurgie**. Pas de refonte des types ; on préserve la séparation `AudioMixer` (composer) / `ReaderAudioMixer` (reader) et le `MediaSessionCoordinator` (déjà gestionnaire refcounté de la session audio, RC4.3).

Quatre livrables ordonnés :

1. **Logs (Rupture D)** : remplacer chaque `try?` muet par `try { } catch { Logger.audio.error(...) }`. Sans rien casser, on rend toutes les défaillances visibles en dev.
2. **Panel composer audio (Rupture B)** : `StoryAudioCell` injecté dans `ComposerToolPanelHost.mediaPanel`.
3. **Notification timeline (Rupture C)** : poster `.timelineDidStartPlaying` / `.timelineDidStopPlaying` dans `StoryTimelineEngine`.
4. **Fix root cause Rupture A** : défini après observation runtime ; mise à jour de cette spec quand l'hypothèse est confirmée.

## 4. Contrat & règles produit

### 4.1 Exclusivité audio (validé brainstorming)

- **1 background à la fois** (ambiance, ducké à `0.3` quand un fg joue — déjà géré par `audioMixer.applyDefaultBackgroundEnvelope`).
- **N foreground simultanés** autorisés.
- Promouvoir un fg en bg dégrade l'ancien bg en fg automatiquement.

**Sémantique du flag** : `StoryAudioPlayerObject.isBackground: Bool?` (déjà existant ligne 650 de `StoryModels.swift`) — `nil` signifie *non spécifié, considère le contexte legacy* (cf. `resolvedBackgroundAudio` ligne 1176-1190) ; `true` = bg explicite ; `false` = fg explicite. Le code consommateur compare via `clip.isBackground == true` (équivalent `?? false`). **Ne pas migrer en `Bool` non-optionnel** : casserait la résolution legacy.

### 4.2 AVAudioSession (correction post-review)

**Ne PAS ajouter une nouvelle config de session dans `ReaderAudioMixer`**. La session est déjà gérée par `MediaSessionCoordinator` (actor singleton, refcountée) via `StoryCanvasUIView.requestPlaybackSessionIfNeeded()` (ligne 690-694) qui demande `role: .playback`. Le coordinator pose `.playback + .duckOthers` (`MediaSessionCoordinator.swift:50-67`).

**Pas de modification de la session audio dans ce hotfix.** Si le ducking doit changer, c'est dans `MediaSessionCoordinator` ; on évite la double config qui briserait le refcount avec les rôles `record` / `playAndRecord` côté calls. `.mixWithOthers` + `.duckOthers` sont conflictuels et seraient un anti-pattern.

### 4.3 Waveform (validé brainstorming)

**Principe global Meeshy** : waveform réelle calculée une seule fois par source audio, mise en cache local persistant via `WaveformCache.shared` (`packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformCache.swift:11`).

**Détails effectifs du cache existant** (à utiliser tel quel, ne PAS reconfigurer) :
- Type : `public actor WaveformCache` singleton (`.shared`)
- L1 : mémoire (`memoryCache: [String: [Float]]`)
- L2 : disque dans `~/Library/Caches/com.meeshy.waveforms/` (fichiers `.waveform`)
- **Clé cache** : `"\(url.lastPathComponent)_\(count)"` (lastPathComponent du URL, généralement le sha256-id côté backend Meeshy)
- **TTL** : aucun expiration explicite — eviction uniquement via `clearAllCaches()` / `clearMemoryCache()`. Cache effectivement persistant.
- API : `samples(from url: URL, count: Int = 120) async throws -> [Float]` et `samples(from data: Data, count: Int) async throws -> [Float]`

Au render d'une cellule audio :
1. `WaveformCache.shared.samples(from:count:)` async via `AudioWaveformAnalyzer` ; pendant le compute, on affiche `AudioWaveformAnalyzer.generateFallback(count: 40)` (lignes déterministes hash).
2. Au callback, remplacement transparent sans flash.

Ce principe s'applique aussi aux autres surfaces (message audio bubble via `AudioPlayerView`, voice profile, story viewer) — déjà câblé. Le spec ne l'élargit pas ; on en hérite uniquement pour la cellule composer.

## 5. Composants & fichiers modifiés

### 5.1 Livrable n°1 — Logs ciblés (rupture D)

| Fichier | Lignes | Modification |
|---------|--------|--------------|
| `StoryCanvasUIView.swift` | ~601-603 (`reconfigureAudioForPlayback`) | `try? audioMixer.configure(audios:, urls:)` → `do { try audioMixer.configure(...) } catch { Logger.audio.error("ReaderAudioMixer.configure failed: \(error.localizedDescription, privacy: .public)") }` |
| `ReaderAudioMixer.swift` | `configure(audios:urls:)` boucle de chargement `AVAudioFile` | Remplacer `try?` interne par `do/catch` + log par clip skipped (id, url, error) |
| `AudioMixer.swift` | idem côté composer | Logs identiques |
| `ReaderAudioMixer.swift` | `play(originHost:slideKey:)` | Log entrée (count audios, urls non-nil count, origin, slideKey) — niveau debug |
| `ReaderAudioMixer.swift` | `configureBackground` | Log entrée + résultat |

`Logger.audio` est déclaré une fois (catégorie `story-audio`) dans `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryLogging.swift` (fichier à créer ou rattacher à un existant) :

```swift
import os.log
public extension os.Logger {
    static let audio = os.Logger(subsystem: "me.meeshy.app", category: "story-audio")
}
```

**Validation** : ce livrable doit être suffisant à lui seul pour identifier la cause runtime de Rupture A en relançant l'app avec `Console.app` ouverte. Les logs deviennent l'instrument de diagnostic.

### 5.2 Livrable n°2 — `StoryAudioCell` + intégration panel

**Nouveau fichier** : `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/StoryAudioCell.swift`

```swift
@MainActor
struct StoryAudioCell: View {
    let audio: StoryAudioPlayerObject
    let url: URL?
    let onToggleBackground: () -> Void
    let onVolumeChanged: (Float) -> Void
    let onDelete: () -> Void

    @StateObject private var waveform = AudioWaveformAnalyzer()
    @StateObject private var playback = AudioPlaybackManager()  // réutilise existant (AudioPlayerView.swift:9)
}
```

**Réutilisation imposée** : `AudioPlaybackManager` (`/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift:9-239`) est le composant existant pour play/pause/seek d'un audio dans l'app. Il gère déjà `AVAudioPlayer(data:)`, pré-cache via `CacheCoordinator.shared.audio.data(for:)`, ainsi que `PlaybackCoordinator.shared.willStartPlaying(audio:)`. **Ne PAS instancier un `AVPlayer` ad-hoc** dans la cellule.

Layout (hauteur 64pt, flat dans la liste) :

```
┌──────────────────────────────────────────────────────────────┐
│ ▶ ▌▍▆▌▍▆▌▍▆▌▍▆▌▍▆▌▍▆▌▍▆▌▍▆▌▍▆ 0:42 [speaker.wave.2.fill] ⓧ │
└──────────────────────────────────────────────────────────────┘
   ↑   ↑                            ↑    ↑                    ↑
   │   waveform (cache)             durée toggle fg/bg        delete
   play/pause local                                            ✕
```

- Toggle fg/bg via SF Symbol : `speaker.wave.2.circle` (fg actif) / `speaker.wave.2.circle.fill` (bg) — couleur indigo500 (filled) ou neutre (outlined), réagit au theme via `MeeshyColors`.
- Slider volume horizontal 0-100% (linéaire, clamp).
- Volume bouton `xmark.circle.fill` (rouge sémantique) en delete.
- Tap waveform → seek (preview local).
- Preview AVPlayer privé à la cellule (pas de connexion avec `StoryTimelineEngine`).

### 5.3 Livrable n°2 (suite) — Intégration `ComposerToolPanelHost`

`/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift` ligne ~110, **au-dessus** de la `ForEach(mediaObjects)` :

```swift
if let audios = viewModel.currentEffects.audioPlayerObjects, !audios.isEmpty {
    ForEach(audios) { audio in
        StoryAudioCell(
            audio: audio,
            url: viewModel.loadedAudioURLs[audio.id],
            onToggleBackground: {
                viewModel.setAudioForeground(audioId: audio.id,
                                             isForeground: audio.isBackground == true)
            },
            onVolumeChanged: { viewModel.setAudioVolume(audioId: audio.id, volume: $0) },
            onDelete: { viewModel.deleteElement(id: audio.id) }  // API existante ligne 1055
        )
    }
}
```

**API URL résolue** : `viewModel.loadedAudioURLs` est le pattern existant pour les médias (cf. `loadedImages[media.id]` ligne 192 de `ComposerToolPanelHost`). Si ce dict n'existe pas pour l'audio, on l'ajoute en miroir dans `StoryComposerViewModel` (alimenté par la même logique que `loadedImages`).

### 5.4 Livrable n°2 (suite) — `StoryComposerViewModel` deux nouvelles méthodes

Pas de `removeAudioObject` à ajouter — `deleteElement(id:)` (ligne 1055) couvre déjà.

```swift
public func setAudioForeground(audioId: String, isForeground: Bool) {
    guard var audios = currentEffects.audioPlayerObjects else { return }

    if !isForeground {
        // Promotion en bg : dégrader l'ancien bg en fg, promouvoir le nouveau
        for idx in audios.indices where audios[idx].isBackground == true {
            audios[idx].isBackground = false
        }
        if let i = audios.firstIndex(where: { $0.id == audioId }) {
            audios[i].isBackground = true
        }
    } else {
        // Dégradation : juste passer en fg
        if let i = audios.firstIndex(where: { $0.id == audioId }) {
            audios[i].isBackground = false
        }
    }
    currentEffects.audioPlayerObjects = audios
}

public func setAudioVolume(audioId: String, volume: Float) {
    guard var audios = currentEffects.audioPlayerObjects,
          let i = audios.firstIndex(where: { $0.id == audioId }) else { return }
    audios[i].volume = max(0, min(1, volume))
    currentEffects.audioPlayerObjects = audios
}
```

### 5.5 Livrable n°3 — Notifications timeline

`/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift`

Dans `play()` après démarrage interne :

```swift
NotificationCenter.default.post(
    name: .timelineDidStartPlaying,
    object: self,
    userInfo: ["projectId": projectId]
)
```

Dans `stop()` et `pause()` :

```swift
NotificationCenter.default.post(name: .timelineDidStopPlaying, object: self)
```

**Garde anti-double-playback** : `StoryAudioPlayerView` (ligne 96-108) guard déjà via `externalPlayer == nil`. Tester sur transition composer → viewer (la view doit voir `externalPlayer != nil` avant le post) pour éviter une fenêtre fugace de double playback.

### 5.6 Localizable.xcstrings

Nouvelles clés (FR / EN) :

| Clé | FR | EN |
|-----|----|----|
| `story.audio.foreground` | Premier plan | Foreground |
| `story.audio.background` | Fond | Background |
| `story.audio.volume` | Volume | Volume |
| `story.audio.remove` | Supprimer | Remove |
| `story.audio.empty` | Aucun audio | No audio |

(Pas de clé `story.audio.duration` — formatage local via `DurationFormatter`.)

### 5.7 Livrable n°4 — Fix Rupture A : pré-cache audio garanti

**Approche** : aligner le pipeline story sur ce qui fait fonctionner le pipeline message — **garantir que les URLs passées à `audioMixer.configure(urls:)` sont des `file://` locales**.

#### Contrat AVAudioFile

`AVAudioFile(forReading: URL)` (`ReaderAudioMixer.swift:83`, `AudioMixer.swift` côté composer) **n'accepte QUE des URLs `file://`**. La doc Apple est explicite : "The fileURL parameter is the URL of an audio file. The file must be in a format supported by Core Audio." Une URL HTTPS lève `OSStatus 2003334207` ("not a file") — c'est la cause du silence reader.

#### Fix dans `reconfigureAudioForPlayback()`

`/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` ~ligne 745-770 :

```swift
private func reconfigureAudioForPlayback() {
    guard mode == .play else { return }
    guard slideContentRevision != lastAudioConfigRevision else { return }
    let audios = slide.effects.audioPlayerObjects ?? []
    let languages = readerContext.preferredLanguages
    Task { @MainActor [weak self] in
        guard let self else { return }
        var localURLs: [String: URL] = [:]
        for audio in audios {
            let mediaId = audio.resolvedPostMediaId(preferredLanguages: languages)
            guard let remoteURL = self.readerContext.postMediaURLResolver?(mediaId) else {
                Logger.audio.error("Audio URL not resolved for postMediaId=\(mediaId, privacy: .public)")
                continue
            }
            // Garantir une URL file:// locale avant de toucher AVAudioFile
            if remoteURL.isFileURL {
                localURLs[audio.id] = remoteURL
            } else if let cached = CacheCoordinator.audioLocalFileURL(for: remoteURL.absoluteString) {
                localURLs[audio.id] = cached
            } else {
                do {
                    _ = try await CacheCoordinator.shared.audio.data(for: remoteURL.absoluteString)
                    if let local = CacheCoordinator.audioLocalFileURL(for: remoteURL.absoluteString) {
                        localURLs[audio.id] = local
                    } else {
                        Logger.audio.error("Audio cache populated but local URL nil: \(remoteURL.absoluteString, privacy: .public)")
                    }
                } catch {
                    Logger.audio.error("Audio fetch failed: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
        // Tous les chemins sont garantis file:// à ce point
        do {
            try self.audioMixer.configure(audios: audios, urls: localURLs)
            self.lastAudioConfigRevision = self.slideContentRevision
        } catch {
            Logger.audio.error("ReaderAudioMixer.configure failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
```

**Pré-requis** : `CacheCoordinator.audioLocalFileURL(for:)` doit exister (sinon créer en miroir de `videoLocalFileURL`). À vérifier dans `CacheCoordinator.swift:69` — si absent, ajouter :

```swift
nonisolated public static func audioLocalFileURL(for urlString: String) -> URL? {
    shared.audio.cachedFileURL(for: urlString)
}
```

#### Conflit `StoryTimelineEngine.configureAudioSession`

Le `StoryTimelineEngine.configureAudioSession()` (`StoryTimelineEngine.swift:110-127`) pose une seconde config `AVAudioSession.setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])` **concurrente** à `MediaSessionCoordinator`. Cela désynchronise le refcount du coordinator et peut aggraver les symptômes.

**Action** : refactorer `configureAudioSession()` pour déléguer à `MediaSessionCoordinator.shared.request(role: .playback)`. **Hors scope du hotfix** si trop risqué (impact composer preview) — à traiter en sprint dédié. Documenter en out of scope (§ 9).

#### Critère de succès du livrable 4

`audioMixer.configure(audios:urls:)` reçoit uniquement des URLs satisfaisant `url.isFileURL == true`. Vérification automatique :

```swift
public func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws {
    for (audioId, url) in urls {
        assert(url.isFileURL, "ReaderAudioMixer.configure requires file:// URLs (got \(url) for audioId=\(audioId))")
    }
    // ...
}
```

## 6. Data flow cible (post-fix complet)

```
COMPOSER (édition)                          READER (visionnage)
═══════════════════                         ═══════════════════
addAudioObject()                            StoryCanvasUIView.setMode(.play)
  ↓                                           ↓
effects.audioPlayerObjects                  reconfigureAudioForPlayback()
  ↓                                           ↓
ComposerToolPanelHost.mediaPanel            audioMixer.configure(audios:, urls:)
  └─ StoryAudioCell × N                       ↓
       ├─ WaveformCache.samples (cached)    requestPlaybackSessionIfNeeded()
       ├─ play/pause local AVPlayer           └─ MediaSessionCoordinator.request(.playback)
       ├─ toggle fg/bg (setAudioForeground)   ↓
       ├─ volume slider (setAudioVolume)    startAudioPlayback()
       └─ delete (deleteElement)              └─ audioMixer.play(originHost:, slideKey:)
                                                ↓
preview composer:                              [sample-accurate scheduling]
  StoryTimelineEngine.play()                   ↓
    ├─ audioMixer.play()  // AudioMixer       [fade envelopes]
    └─ post .timelineDidStartPlaying           ↓
       ↓                                      [bg ducké à 0.3 quand fg joue]
       StoryAudioPlayerView.onReceive
         └─ AVPlayer(url:).play()
```

## 7. Stratégie de tests

### 7.1 Unit (XCTest sous `MeeshySDK-Package`)

- `StoryAudioPlayerObjectTests`
  - Decode payload sans `isBackground` → reste `nil` (back-compat legacy)
  - Decode payload avec `isBackground: true` → `true`
  - JSON byte-equal round-trip avec `.sortedKeys` (cf. `feedback_jsonencoder_key_order_unstable`)

- `StoryComposerViewModelAudioTests`
  - `setAudioForeground(id, isForeground: false)` promeut un fg en bg, dégrade l'ancien bg
  - `setAudioForeground(id, isForeground: true)` dégrade le bg en fg
  - `setAudioVolume` clamp à `[0, 1]`
  - `setAudioForeground` sur un clip legacy (`isBackground == nil`) → considéré comme fg avant promotion

### 7.2 Integration (XCTest sous `meeshyTests`)

- `StoryTimelineEngineNotificationsTests`
  - `play()` poste `.timelineDidStartPlaying` avec `userInfo.projectId` correct
  - `stop()` poste `.timelineDidStopPlaying`
  - `pause()` poste `.timelineDidStopPlaying`

### 7.3 Snapshot UI (Swift Testing + SnapshotTesting)

- `StoryAudioCell` :
  - foreground state, light/dark
  - background state, light/dark
  - playing state (cursor sur waveform)
  - waveform en cache vs fallback

### 7.4 E2E manuel (validation device)

1. **Logs** : ajouter un audio → ouvrir Console.app filtre catégorie `story-audio` → vérifier que tous les chargements/play/échecs apparaissent
2. **Composer** : ajouter audio → cellule apparaît dans le panel → tap play → audio joue (preview)
3. **Composer** : toggle fg/bg → état persiste après reload du composer
4. **Composer** : 2 audios fg simultanés → les 2 jouent en preview
5. **Composer** : promouvoir 2e clip en bg → 1er bg dégradé en fg, 2e devient bg
6. **Reader (après fix livrable 4)** : story publiée avec 1 bg + 1 fg → les 2 audios jouent, bg ducké
7. **Reader** : mode silencieux iOS activé → audio story joue quand même (`.playback`)
8. **Reader** : Spotify lancé en // → musique baisse au démarrage story (`.duckOthers` déjà géré par `MediaSessionCoordinator`)

## 8. Risques & mitigations

| Risque | Probabilité | Mitigation |
|--------|-------------|------------|
| Logs ajoutés exposent du verbeux en prod | Moyen | Niveau `.error` par défaut, `.debug` pour les entrées de méthode (filtrés en release par `os.log`) |
| Notification `.timelineDidStartPlaying` double-trigger (composer + viewer) | Moyen | `StoryAudioPlayerView` guard via `externalPlayer == nil` ; test integration explicit pour viewer mode |
| Cellule audio surcharge le panel composer | Faible | Hauteur fixe 64pt, scroll vertical existant absorbe |
| Cache waveform invalide entre versions | Faible | Clé = `postMediaId` ou `sha256(url)`. Pas de breaking change. |
| Régression sur stories existantes (legacy `backgroundAudioId`) | Faible | `isBackground: Bool?` préservé, sémantique `nil` = legacy intacte |
| Fix Rupture A nécessite plus de 30 lignes | Moyen | Mise à jour de cette spec ; si rewrite nécessaire, plan séparé |

## 9. Out of scope (déféré)

- Edition fine audio dans un sheet dédié (trim, fade-in/out custom) → `MeeshyAudioEditorView` existant
- Multi-track UI (timeline éditeur pro) → `TimelineTrackView` existant
- Cross-fade entre 2 bg consécutifs
- Visualizer en lecture reader (waveform animée pendant playback)
- Upload de waveform pré-calculée côté backend
- Modification de la config `MediaSessionCoordinator` (ducking semantics)
- **Refactor de `StoryTimelineEngine.configureAudioSession`** pour déléguer à `MediaSessionCoordinator` (impact composer preview, sprint dédié) — à documenter comme dette technique

## 10. Critères d'acceptation

1. Logs `Logger.audio` visibles dans Console.app pour chaque transition audio (configure / play / fail)
2. Clips audio visibles dans le panel composer avec waveform, durée, toggle fg/bg, slider volume, bouton delete
3. Audio composer preview joue (vérifiable au son sur device)
4. Toggle fg ↔ bg fonctionnel, exclusivité 1 bg respectée (promotion auto)
5. `.timelineDidStartPlaying` / `.timelineDidStopPlaying` postés aux transitions du timeline engine
6. (Livrable 4) Audio reader joue (vérifiable au son sur device avec story publiée + 1 audio)
7. (Livrable 4) Mise à jour de cette spec avec la cause root cause + correctif
8. Tous les `try?` audio remplacés par `do/catch` + log
9. 100% des tests unit + integration passent
10. Snapshots `StoryAudioCell` validés
11. Checklist E2E manuelle complétée

## 11. Décisions de design (récapitulatif)

| Décision | Choix | Raison |
|----------|-------|--------|
| Découpage | Hotfix audio en standalone | Régression bloquante post-`85bf841b`, fix court |
| Approche | Observation-first (logs avant fix Rupture A) | Diagnostic initial faux (cf. review Opus) ; on confirme runtime avant de modifier |
| Exclusivité fg/bg | 1 bg + N fg, promotion automatique | Équilibre simplicité/flexibilité |
| `isBackground` | Reste `Bool?` (déjà existant) | Préserve la résolution legacy `backgroundAudioId` (`resolvedBackgroundAudio` ligne 1176) |
| Waveform | Réelle calculée 1×, cache long via `WaveformCache.shared` | Principe global Meeshy ; clé = `postMediaId` (stable post-publish) |
| AVAudioSession | Inchangée — `MediaSessionCoordinator` reste l'unique propriétaire | Évite double-config et refcount cassé |
| Cellule audio toggle | SF Symbol `speaker.wave.2.circle[.fill]` | Respect theme dark/light, pas d'emoji |
| `removeAudioObject` | Pas de nouvelle méthode — `deleteElement(id:)` couvre | API existante (`StoryComposerViewModel.swift:1055`) |
| URL audio | `viewModel.loadedAudioURLs[audio.id]` | Pattern existant (cf. `loadedImages` ligne 192) |
| `try?` muets | Remplacés par `do/catch` + `Logger.audio.error` | Visibilité dev, tolérance préservée |
