# Audio iOS — Position de lecture persistée + Now Playing (next/previous)

## Contexte / état existant (iOS)
- Moteur réel : `AudioPlaybackManager` (MeeshyUI, `Media/AudioPlayerView.swift`).
- Orchestration file/conversation : `ConversationAudioCoordinator` (app) + `PlaybackCoordinator` (SDK, mutex 1 audio).
- Now Playing : `ConversationAudioCoordinator+NowPlaying.swift` — MPNowPlayingInfoCenter + RemoteCommand (play/pause/**next**/seek), activé dans `AdaptiveRootView`.
- Waveform : DÉJÀ fidèle (PCM via `WaveformCache`) + calculée 1× + cachée mémoire/disque → **rien à refaire** (point 2 satisfait sur iOS).

## Manques à combler
- [ ] Position de lecture jamais persistée → `play()` repart toujours de 0, perdue au stop / app kill.
- [ ] Now Playing : pas de `previousTrackCommand` ; pas d'historique pour revenir en arrière.

## Plan

### 1. Store de position (SDK core) — persistance locale
- [ ] `MeeshySDK/Cache/AudioPlaybackPositionStore.swift`
  - Struct pure `AudioPlaybackPositions` (Codable) : `[attachmentId: Entry{positionSeconds, updatedAt}]`, méthodes pures `setting / removing / pruned(max:) / position(for:)`.
  - `@MainActor final class AudioPlaybackPositionStore` singleton, UserDefaults JSON, cap (prune), API `position(for:) / save(_:for:) / clear(for:)`.

### 2. Reprise + sauvegarde dans le moteur (MeeshyUI)
- [ ] `playData(_:)` : après `duration`, si position sauvegardée valide (`1s < pos < duration-1s`) → `player.currentTime = pos` avant `play()`.
- [ ] `persistPosition()` : sauvegarde si mid-track, sinon clear. Appelé sur pause (`togglePlayPause`), `stop()`, et `UIApplication.willResignActive` (couvre app kill).
- [ ] `handlePlaybackFinished()` : `clear(for:)` (relecture repart de 0).

### 3. Now Playing previous/next + historique (app)
- [ ] `ConversationAudioCoordinator` : `history: [QueuedAudio]`, push dans `advanceQueue`, reset dans `play()`/`close()`.
- [ ] `playPrevious()` : si `currentTime > 3s` → restart (seek 0) ; sinon pop history → réinsère head courant → joue le précédent ; sinon restart.
- [ ] `+NowPlaying` : ajouter `previousTrackCommand` → `playPrevious()`, enable.

### 4. Tests
- [ ] SDK : `AudioPlaybackPositionStoreTests` (struct pure + store via UserDefaults suite dédiée).
- [ ] App : `ConversationAudioCoordinatorTests` — previous restart / previous via history / previous sans history.

## Note d'environnement
Container Linux : impossible de compiler/tester iOS ici (Xcode/simulateur = macOS).
Code écrit selon les patterns existants ; build `./apps/ios/meeshy.sh test` + SDK xcodebuild à lancer sur Mac/CI.

## Review

### Fait
- **Store position (SDK core)** : `AudioPlaybackPositionStore` + struct pure `AudioPlaybackPositions`
  (UserDefaults JSON, cap 500, éviction LRU). Tests `AudioPlaybackPositionStoreTests`.
- **Reprise + sauvegarde (moteur `AudioPlaybackManager`)** :
  - reprise dans `playData` (position valide `1s < pos < durée-1s`, morceaux ≥ 2s) ;
  - sauvegarde sur pause, `stop()`, `willResignActive` (app kill), et au **switch de morceau**
    via `didSet` sur `attachmentId` (couvre tap d'un autre audio / skip) ;
  - `clear` à la fin naturelle (relecture repart de 0).
- **Now Playing previous/next (app)** : historique `history` dans `ConversationAudioCoordinator`,
  `playPrevious()` (restart si >3s, sinon morceau précédent), `hasPrevious` ; `previousTrackCommand`
  ajouté au bridge `+NowPlaying`. Tests coordinator (3 cas + hasPrevious).
- **Waveform** : déjà fidèle + cachée 1× sur iOS (`WaveformCache`) → aucune modif nécessaire.

### Validation
- ⚠️ Build/tests iOS NON exécutés ici (container Linux ; Xcode/simulateur = macOS requis).
  À lancer sur Mac/CI : `./apps/ios/meeshy.sh test` (app) + `xcodebuild test -scheme MeeshySDK-Package` (SDK).
- Fichiers SDK auto-découverts par SPM ; fichiers app modifiés déjà référencés (pas de `project.pbxproj` à toucher).
