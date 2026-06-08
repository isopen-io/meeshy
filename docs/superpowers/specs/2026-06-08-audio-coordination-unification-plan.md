# Audio Coordination — Unification & Simplification Plan (2026-06-08)

> Objectif boucle : coordination audio **simple, source unique, sans double gestion
> conflictuelle**. Invariant produit : audio **story/poste** s'arrête en quittant ;
> seuls **conversation** + **vidéo PIP** peuvent continuer après avoir quitté la
> conversation/l'app. Intégration iOS 16/17/18/26. Itératif : simplifier + perfectionner.

## 1. Inventaire des sources audio (état 2026-06-08)

| Composant | Couche | Rôle | Gère session ? | Coordonné ? |
|---|---|---|---|---|
| `PlaybackCoordinator` | SDK MeeshyUI | **Mutex « qui joue »** (stop others) | non | — (c'est LE hub) |
| `MediaSessionCoordinator` | SDK core | Refcount `AVAudioSession.setActive` + events interruption/route | oui (setActive) | indépendant |
| `AudioPlaybackManager` | SDK MeeshyUI | Moteur voice-note (`AVAudioPlayer`) — conversation + previews | oui (`setCategory .playback []`) | `register/willStartPlaying(audio:)` |
| `AudioPlayerManager` (app) | app | **Moteur voice-note DUPLIQUÉ** — status bubble, scroll preview, composer pending | oui (`setCategory .playback [.duckOthers]`) | `registerExternal/willStartPlaying(external:)` |
| `ConversationAudioCoordinator` | app | Orchestrateur conversation (queue, NowPlaying, mini-player) sur un `AudioPlaybackManager` | non (délègue) | via son moteur |
| `StoryMediaCoordinator` | SDK MeeshyUI | Façade « tout média story » comme 1 `StoppablePlayer` | oui (`setCategory .playback [.mixWithOthers,.duckOthers]`) | `registerExternal` |
| `ReaderAudioMixer` | SDK MeeshyUI | Moteur story (`AVAudioEngine` multi-track) | non | `registerExternal` |
| `StoryAudioPlayerView` (internal player) | SDK MeeshyUI | `AVPlayer` clip story — **composer-only** | oui | **NON enregistré** (acceptable car composer-only) |
| `StoryTimelineEngine` | SDK MeeshyUI | Preview timeline éditeur | oui (`.playback .moviePlayback [.mixWithOthers]`) | — |
| `SharedAVPlayerManager` | SDK MeeshyUI | Vidéo + PIP | oui (`.playback [.duckOthers]`) | `willStartPlaying(video:)` |
| `AudioRecorderManager` (app) / `DefaultSDKAudioRecorder` | app/SDK | Enregistrement | oui (`.playAndRecord .voiceChat`) | — |
| `CallManager` / `RTCAudioSession` | app | Appels WebRTC | oui (`.playAndRecord .voiceChat`) — **PRIORITAIRE** | les autres se gardent contre lui |

## 2. Ce qui est SAIN (ne pas casser)
- `PlaybackCoordinator` est déjà la source unique de « qui joue ». Iter-1 a corrigé une
  fuite owned-engine (`AudioPlayerView.onDisappear` ne stoppait pas → commit `da590815d`).
- L'invariant produit est correctement porté : story = `StoppablePlayer` registered (stop
  à la sortie via `StoryViewerView.onDisappear → stopAll()`), conversation = moteur survivant
  via mini-player, vidéo = `SharedAVPlayerManager` + PIP.
- Les deux moteurs voice-note (app + SDK) **sont** mutuellement coordonnés via le hub → pas
  de chevauchement audible entre eux.

## 3. Les VRAIES « doubles gestions conflictuelles »
1. **Split-brain de la session audio** : 16 fichiers appellent `setCategory` directement avec
   des options incohérentes (`[]`, `[.duckOthers]`, `[.mixWithOthers,.duckOthers]`,
   `.moviePlayback`). `MediaSessionCoordinator` existe comme gatekeeper refcompté mais est
   **bypassé** par tout le monde.
2. **Moteur voice-note dupliqué** : `AudioPlayerManager` (app) ≈ `AudioPlaybackManager` (SDK).
   Surface publique quasi identique (`play/stop/togglePlayPause/isPlaying/progress`). Diffèrent
   sur : options session (`[.duckOthers]` vs `[]`), deactivation-on-stop (app oui / SDK non),
   garde appel (app inline `if !CallManager...` / SDK via closure `playbackPermissionGuard`).
3. **Garde « pas de lecture pendant un appel »** réimplémentée 3× (app inline ×3,
   SDK closure, `ConversationAudioCoordinator` inline).

## 4. ⚠️ Prérequis bloquant la « simple unification »
Unifier (1) en routant tout via `MediaSessionCoordinator.request(role:)` **réintroduit le bug
call-audio** : les `setCategory` directs sont gardés par `if !CallManager.callState.isActive`
PRÉCISÉMENT parce que `MediaSessionCoordinator` **n'est pas call-aware** et écraserait le
`.playAndRecord/.voiceChat` d'un appel (→ micro muet, cf. leçons mémoire RTCAudioSession).

**Donc l'ordre sûr est : rendre `MediaSessionCoordinator` call-aware D'ABORD, puis unifier.**

## 5. Plan staged sûr (1 étape par itération, build + device-test entre chaque)

- **Étape A — `MediaSessionCoordinator` call-aware (fondation). ✅ FAIT (commit `c6252edbb`).**
  Mirror `callActive` poussé par l'app via `setCallActive(_:)` (push, pas pull : `CallManager`
  est `@MainActor`, le coordinator un `actor`) + helper pur `shouldManageSession(callActive:)`.
  `request`/`release` gardent toute (re)config/teardown de session derrière le helper. Behavior-
  preserving : `callActive` défaut `false` ⇒ identique à avant. **Non câblé app encore.** TDD vert.
  ⚠️ **Caveat refcount découvert (iter-5)** : l'I/O session est gardée mais le refcount reste
  inchangé. Séquence *request-pendant-appel / release-après-appel* = dérive possible (le player
  éditeur story utilise AUSSI un `AVPlayer` interne hors coordinator). À résoudre dans B/C avec
  device-test du refcount à travers la frontière d'appel — NE PAS câbler A sans ce device-test.
- **Étape B — câbler + unifier la garde appel (DEVICE-TEST REQUIS).** Câbler `CallManager`
  → `setCallActive(true/false)` (idéalement via un observer app-root de `$callState`, additif,
  reset-correct, sans toucher la logique d'appel fragile). Puis remplacer les 3+ gardes inline
  `if !CallManager.callState.isActive` par le seam unique. Valider le refcount cross-appel sur device.
- **Étape C — router les players de lecture via `MediaSessionCoordinator`.** Un par un
  (AudioPlaybackManager, puis app AudioPlayerManager, puis Story*, puis SharedAVPlayerManager),
  supprimer le `setCategory` direct au profit de `request(role: .playback)`. Vérifier que la
  config résultante est identique (`.playback .default [.duckOthers]` = le rôle `.playback`
  existant ⇒ aligne aussi l'incohérence d'options). Device-test ducking + appel + interruptions.
- **Étape D — fusionner les moteurs voice-note.** Migrer les 3 usages app
  (`StatusBubbleOverlay`, `scrollButtonAudioPlayer`, `pendingAudioPlayer`) vers le SDK
  `AudioPlaybackManager` (drop-in surface + `playbackPermissionGuard`), puis supprimer
  `apps/ios/.../Services/AudioPlayerManager.swift` (+ test + 4 entrées pbxproj). Device-test
  previews + recorder + appel.
- **Étape E — session relâchée à la sortie story/poste (raffinement non-audible).** Aujourd'hui
  la sortie ne `release()` pas explicitement la session (bénin). À intégrer une fois le refcount
  unifié (étape C) — `deactivate()`/owned-disappear appellent `release()`.

## 6. Hors-périmètre / vérifié non-problématique
- **Teardown audio STORY VIEWER vérifié robuste (iter-5)** : `StoryViewerView.onDisappear` →
  `StoryMediaCoordinator.deactivate()` (stopHandler volontairement no-op) + `PlaybackCoordinator.
  stopAll()` qui atteint le `ReaderAudioMixer` (registered external → foreground+background audio
  stoppés) ; `StoryCanvasUIView.willMove(toWindow:nil)` met en pause les `AVPlayer` vidéo, `deinit`
  → `mixer.shutdown()` ; `scenePhase==.background` → `stopAll()` + dismiss. Aucune source audio
  story ne survit à la fermeture. (`ReaderState` n'existe plus qu'en commentaires obsolètes.)
- `StoryAudioPlayerView` internal player : composer-only, pas de gap viewer.
- `StoryMediaCoordinator` : façade légitime, garder.
- Aucune branche audio iOS-version-spécifique (seuls conditionnels = `isiOSAppOnMac` CallKit +
  `AVPictureInPictureController.isPictureInPictureSupported`). L'unification doit rester
  version-agnostique (APIs `AVAudioSession`/`AVPlayer`/PIP communes iOS 16→26).

## 7. Smoke device (invariant à re-valider à chaque étape)
story → quitter → silence · poste/feed audio → quitter → silence · conversation audio →
quitter → mini-player continue · background → conversation/PIP continue · appel entrant
pendant lecture → appel prioritaire, micro OK · fin d'appel → reprise propre.
