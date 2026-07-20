import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - StoryCanvasUIView + Audio

extension StoryCanvasUIView {
    /// Stable identifier for the current slide content + language resolution.
    /// Drives `ReaderAudioMixer`'s idempotence guard: a re-render replays with
    /// the same key (no echo) while a genuine content change re-schedules
    /// against a fresh key (RC4.6).
    var currentSlideKey: String {
        let langs = readerContext.preferredLanguages.joined(separator: ",")
        return "\(slide.id)#\(slideContentRevision)#\(langs)"
    }

    /// Materialises the slide's `t = 0` as a host-time. When the playhead is
    /// already advanced (`currentTime > 0`, composer preview scrub) the origin
    /// is back-dated so audio and the canvas playhead share one zero (RC4.4).
    func captureSlideTimelineOrigin() -> UInt64 {
        let now = mach_absolute_time()
        let elapsed = currentTime.seconds
        guard elapsed > 0, elapsed.isFinite else { return now }
        let back = ReaderAudioMixer.hostTime(forDelaySeconds: elapsed)
        return back < now ? now - back : now
    }

    /// Single funnel for the three `.play` audio entry points (`slide.didSet`,
    /// `setReaderContext`, `setMode(.play)`). Captures the timeline origin,
    /// activates the audio session, enforces single-owner exclusion and applies
    /// the default fade envelope — consistently every time.
    func startAudioPlayback() {
        guard mode == .play else { return }
        // Call-safety gate (WS3.2) : ouvrir un reader pendant un appel ne doit
        // PAS faire tourner l'AVAudioEngine du reader sur la session détenue par
        // l'appel. La reprise post-appel est déclenchée par l'événement
        // `MediaSessionCoordinator.callEndedShouldResume` (F3) — émis sur le front
        // descendant de `setCallActive`, car le teardown WebRTC/RTCAudioSession
        // in-process NE poste PAS de façon fiable une fin d'interruption système.
        // Cet événement est géré dans `observeAudioSessionEvents` ci-dessous, qui
        // rappelle `startAudioPlayback()`. Miroir du gate composer
        // (StoryTimelineEngine).
        guard !MediaSessionCoordinator.shared.isCallActive else { return }
        // Off-screen / host-pause gate (RF3) : le funnel audio est ré-entré de
        // façon asynchrone (`reconfigureAudioForPlayback` Task, `fireContentReady
        // IfNeeded`) APRÈS le chargement média. Si l'hôte a posé `setPaused(true)`
        // entre-temps (slide scrollée hors-écran en PostDetail, ou appel actif),
        // ces ré-entrées ne doivent PAS rallumer le mixer sous une slide gelée —
        // sinon l'audio fuit hors-écran. Le détail repost passe désormais en
        // `mute: false`, donc ce gate central (et non plus le backstop `mute`) est
        // l'unique garant. La reprise repasse par `setStoryPlaybackPaused(false)`
        // qui remet `isPlaybackPaused = false` AVANT de rappeler cette méthode.
        guard !isPlaybackPaused else { return }
        // Gate "all media loaded": ne pas démarrer l'audio bg tant que les
        // autres médias chargeables (image bg + foreground videos) ne sont
        // pas prêts. `fireContentReadyIfNeeded()` consomme le drapeau dès que
        // `onContentReady` fire et appelle à nouveau cette méthode.
        if !contentReadyFired {
            pendingBackgroundActivation = true
            return
        }
        // Gate R1 : la slide porte de l'audio résolu mais le pré-cache async de
        // `reconfigureAudioForPlayback` n'a pas encore peuplé le mixer. Un
        // `play()` « à vide » ici poserait la clé de slide (mixer silencieux),
        // libérerait le gate timeline `isSlideAudioPending()` et forcerait le
        // vrai schedule à repartir back-daté (audio en retard, désynchronisé).
        // On attend : la fin du Task de pré-cache re-pose le flag d'après le
        // contenu réel du mixer puis rappelle cette méthode.
        if slideHasSchedulableAudio,
           audioMixer.activeClipCount == 0,
           audioMixer.backgroundClipCount == 0 {
            return
        }
        requestPlaybackSessionIfNeeded()
        let origin = captureSlideTimelineOrigin()
        // Stop any other reader engine before starting this one (RC4.6).
        PlaybackCoordinator.shared.willStartPlaying(external: audioMixer)
        do {
            _ = try audioMixer.play(originHost: origin,
                                    slideKey: currentSlideKey)
            // Default fade envelope retiré 2026-05-27 — user feedback
            // « il y a encore des fade out et in dans le jeu des audio ».
            // Le mixer respecte uniquement les fadeIn/fadeOut explicites
            // posés par l'auteur via le composer (cf. `scheduleFades` pour
            // foreground, `scheduleExplicitBackgroundFades` pour bg). Plus
            // d'enveloppe automatique 30%→100%→5% — le son joue à volume
            // plein dès le début et jusqu'au changement de slide.
        } catch {
            os.Logger(subsystem: "me.meeshy.app", category: "media")
                .error("ReaderAudioMixer.play failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Activates the shared `.playback` `AVAudioSession` through the existing
    /// `MediaSessionCoordinator` (RC4.3). Refcounted; the boolean keeps this
    /// view's request/release at exactly one claim.
    func requestPlaybackSessionIfNeeded() {
        guard !didRequestPlaybackSession else { return }
        didRequestPlaybackSession = true
        Task { try? await MediaSessionCoordinator.shared.request(role: .playback) }
    }

    /// Balances `requestPlaybackSessionIfNeeded()`.
    func releasePlaybackSessionIfNeeded() {
        guard didRequestPlaybackSession else { return }
        didRequestPlaybackSession = false
        Task { await MediaSessionCoordinator.shared.release() }
    }

    /// Subscribes to `MediaSessionCoordinator` interruption / route-change
    /// events and applies Apple's playback policy to the reader engine: pause
    /// on interruption-began and on headset unplug, resume only on an explicit
    /// `shouldResume` while still foreground (RC4.3 / T7).
    func observeAudioSessionEvents() {
        audioSessionEventsCancellable = MediaSessionCoordinator.shared.events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                switch event {
                case .interruptionBegan, .routeChangedOldDeviceUnavailable:
                    self.audioMixer.pause()
                case .interruptionEndedShouldResume, .callEndedShouldResume:
                    // `.callEndedShouldResume` (F3) : un appel VoIP vient de se
                    // terminer ; le teardown in-process ne poste pas de fin
                    // d'interruption système, donc l'audio du reader gaté à
                    // `startAudioPlayback` resterait muet jusqu'au prochain
                    // changement de slide. On le relance ici, mêmes gardes que la
                    // fin d'interruption.
                    // `!isPlaybackPaused` : si l'utilisateur était en pause
                    // (long-press latch / pause UI) au moment de
                    // l'interruption, la fin d'interruption ne doit PAS
                    // relancer l'audio sous une slide visuellement gelée.
                    guard self.mode == .play,
                          self.window != nil,
                          !self.completionFired,
                          !self.isPlaybackPaused else { return }
                    self.startAudioPlayback()
                case .interruptionEndedShouldNotResume, .routeChangedOther:
                    break
                }
            }
    }

    /// Loads the slide's foreground + background audio clips into the
    /// `audioMixer` so the subsequent `startAudioPlayback()` actually emits
    /// sound. No-op outside `.play` mode (the composer never plays while
    /// editing) and skipped
    /// when the slide content hasn't changed since the last configure pass —
    /// `configure(audios:urls:)` tears down prior clips, so repeated calls are
    /// safe but reload AVAudioFiles, which we avoid on every display-link tick.
    ///
    /// URL resolution: `ReaderAudioMixer` keys the `urls` dict by the audio
    /// object's `id`, but `StoryReaderContext.postMediaURLResolver` maps a
    /// `postMediaId` → `URL`. We bridge the two here, dropping any clip whose
    /// `postMediaId` does not resolve.
    func reconfigureAudioForPlayback() {
        // Éditeur sonore : le composer (`playsAudioInEditMode`) fait aussi jouer
        // les clips audio en `.edit`. Le prefetcher hors-écran (`.edit` sans le
        // flag) reste silencieux.
        guard mode == .play || (mode == .edit && playsAudioInEditMode) else { return }
        guard lastAudioConfigRevision != slideContentRevision else { return }
        lastAudioConfigRevision = slideContentRevision

        let effects = slide.effects
        let languages = readerContext.preferredLanguages
        let resolver = readerContext.postMediaURLResolver
        // Résolveur d'URL locale par `audio.id` (composer/preview) — prioritaire
        // sur le resolver par `postMediaId` (vide pour un clip non publié).
        let localAudioResolver = readerContext.localAudioURLResolver

        let foreground = effects.resolvedForegroundAudioPlayers
        let background = effects.resolvedBackgroundAudio
        // Posé SYNC (avant le Task de pré-cache) : la sonde 60 Hz
        // `isSlideAudioPending()` gèle la timeline dès le premier tick d'une
        // slide audio-driven, sans recalculer la résolution d'effets par tick.
        slideHasSchedulableAudio = !foreground.isEmpty || background != nil
        let rawAudioCount = effects.audioPlayerObjects?.count ?? 0
        let legacyBgId = effects.backgroundAudioId ?? "nil"
        os.Logger.storyAudio.info(
            "reconfigureAudioForPlayback slide=\(self.slide.id, privacy: .public) rawAudios=\(rawAudioCount) resolvedFg=\(foreground.count) resolvedBg=\(background == nil ? 0 : 1) legacyBgId=\(legacyBgId, privacy: .public) langs=\(languages.joined(separator: ","), privacy: .public) resolverPresent=\(resolver != nil)"
        )

        // `AVAudioFile(forReading:)` only accepts `file://` URLs. The viewer
        // resolver typically hands us HTTPS URLs from `StoryItem.media` — we
        // must pre-cache them to disk before passing to the mixer or every
        // `configure` call fails with OSStatus 2003334207 ("not a file").
        // The pre-cache is async; we therefore fire-and-forget a Task and
        // call `startAudioPlayback()` from inside it once the configure has
        // populated `entries`. Direct callers of `reconfigureAudioForPlayback`
        // that also call `startAudioPlayback()` synchronously become no-ops
        // (entries=0 at that moment) — the in-Task call is what actually
        // schedules the buffers once the cache is warm.
        let slideId = slide.id
        Task { @MainActor [weak self] in
            guard let self else { return }
            var fgURLs: [String: URL] = [:]
            for audio in foreground {
                // Priorité : URL locale (file://) résolue par `audio.id`. Déjà
                // sur disque → pas de pré-cache réseau.
                if let localURL = localAudioResolver?(audio.id) {
                    fgURLs[audio.id] = localURL
                    continue
                }
                let mediaId = audio.resolvedPostMediaId(preferredLanguages: languages)
                guard let remoteURL = resolver?(mediaId) else {
                    os.Logger.storyAudio.error(
                        "FG audio URL not resolved audioId=\(audio.id, privacy: .public) postMediaId=\(mediaId, privacy: .public)"
                    )
                    continue
                }
                if let localURL = await Self.cachedAudioFileURL(remote: remoteURL) {
                    fgURLs[audio.id] = localURL
                    os.Logger.storyAudio.debug(
                        "FG audio cached audioId=\(audio.id, privacy: .public) localFile=\(localURL.lastPathComponent, privacy: .public)"
                    )
                } else {
                    os.Logger.storyAudio.error(
                        "FG audio cache failed audioId=\(audio.id, privacy: .public) remote=\(remoteURL.absoluteString, privacy: .public)"
                    )
                }
            }

            // Slide may have changed during await (user swiped). Bail if so —
            // a fresh `reconfigureAudioForPlayback` will run for the new slide.
            guard self.slide.id == slideId else { return }

            do {
                try self.audioMixer.configure(audios: foreground, urls: fgURLs)
            } catch {
                os.Logger.storyAudio.error(
                    "ReaderAudioMixer.configure failed: \(error.localizedDescription, privacy: .public)"
                )
            }

            // Background clip (at most one per slide).
            if let background {
                let bgLocalURL: URL?
                if let local = localAudioResolver?(background.id) {
                    // URL locale (composer/preview) — déjà file://.
                    bgLocalURL = local
                } else {
                    let mediaId = background.resolvedPostMediaId(preferredLanguages: languages)
                    if let remoteURL = resolver?(mediaId) {
                        bgLocalURL = await Self.cachedAudioFileURL(remote: remoteURL)
                        if bgLocalURL == nil {
                            os.Logger.storyAudio.error(
                                "BG audio cache failed audioId=\(background.id, privacy: .public) remote=\(remoteURL.absoluteString, privacy: .public)"
                            )
                        }
                    } else {
                        bgLocalURL = nil
                        os.Logger.storyAudio.error(
                            "BG audio URL not resolved audioId=\(background.id, privacy: .public) postMediaId=\(mediaId, privacy: .public)"
                        )
                    }
                }
                if let localURL = bgLocalURL {
                    guard self.slide.id == slideId else { return }
                    os.Logger.storyAudio.debug(
                        "BG audio cached audioId=\(background.id, privacy: .public) localFile=\(localURL.lastPathComponent, privacy: .public)"
                    )
                    do {
                        try self.audioMixer.configureBackground(
                            audio: background,
                            url: localURL,
                            looping: background.loop ?? true
                        )
                    } catch {
                        os.Logger.storyAudio.error(
                            "ReaderAudioMixer.configureBackground failed audioId=\(background.id, privacy: .public): \(error.localizedDescription, privacy: .public)"
                        )
                    }
                }
            }

            self.audioMixer.setMute(self.readerContext.mute)

            // Re-pose du flag R1 d'après ce que le configure a RÉELLEMENT
            // chargé : si tous les clips ont échoué au cache (URL non résolue,
            // téléchargement KO), la slide est de facto silencieuse — le gate
            // timeline se libère immédiatement au lieu d'attendre le watchdog.
            // Gaté par `slide.id` : l'await du cache bg peut avoir laissé
            // passer un changement de slide (branche échec sans re-guard) — un
            // Task périmé ne doit pas écraser le flag de la slide courante.
            if self.slide.id == slideId {
                self.slideHasSchedulableAudio = self.audioMixer.activeClipCount > 0
                    || self.audioMixer.backgroundClipCount > 0
            }

            // The synchronous `startAudioPlayback()` call that follows
            // `reconfigureAudioForPlayback()` in `setMode(.play)` /
            // `setReaderContext` / `slide.didSet` hit the mixer when
            // `entries.count == 0`. Re-run it now that buffers are loaded.
            if self.slide.id == slideId {
                if self.mode == .play {
                    self.startAudioPlayback()
                } else if self.mode == .edit, self.playsAudioInEditMode, !self.isTimelinePreviewActive {
                    self.startEditAudioPlayback()
                }
            }
        }
    }

    /// Démarre la lecture du mixer sur le canvas d'ÉDITION (composer preview
    /// sonore). Plus léger que `startAudioPlayback()` (chemin `.play`) : pas de
    /// gates content-ready ni de session refcomptée — la session `.playback`
    /// est déjà posée par `applyEditPlayback` (éditeur sonore). Respecte le mute
    /// composer et la preview timeline (qui possède alors l'audio via l'engine).
    func startEditAudioPlayback() {
        guard mode == .edit, playsAudioInEditMode, !isTimelinePreviewActive else { return }
        guard !MediaSessionCoordinator.shared.isCallActive else { return }
        guard !isAudioMuted else { return }
        PlaybackCoordinator.shared.willStartPlaying(external: audioMixer)
        let origin = captureSlideTimelineOrigin()
        do {
            _ = try audioMixer.play(originHost: origin, slideKey: currentSlideKey)
        } catch {
            os.Logger(subsystem: "me.meeshy.app", category: "media")
                .error("edit ReaderAudioMixer.play failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Returns a `file://` URL for `remote`, downloading and caching the bytes
    /// when the disk cache misses. Returns `nil` if every path fails — the
    /// caller logs the failure context.
    nonisolated static func cachedAudioFileURL(remote: URL) async -> URL? {
        if remote.isFileURL { return remote }
        if let cached = CacheCoordinator.audioLocalFileURL(for: remote.absoluteString) {
            return cached
        }
        _ = try? await CacheCoordinator.shared.audio.data(for: remote.absoluteString)
        return CacheCoordinator.audioLocalFileURL(for: remote.absoluteString)
    }

    /// R1 — « la progression = disponibilité des données », étendu à l'AUDIO.
    /// `true` quand la slide porte de l'audio résolu que le mixer n'a pas
    /// encore schedulé pour CETTE slide (fichiers en cours de téléchargement /
    /// cache dans `reconfigureAudioForPlayback`). Le tick santé
    /// (`refreshPlaybackHealth`) gèle alors la timeline — la reprise est en
    /// phase car `captureSlideTimelineOrigin()` repart du playhead gelé.
    ///
    /// Anti-deadlock (invariant n°9) :
    /// - clé par slide (`hasStartedPlayback(slideKey:)`) — un `play()` de la
    ///   slide précédente ne libère pas le gate, et le `play()` de cette slide
    ///   le libère MÊME si tous les clips ont échoué au cache (slide silencieuse).
    /// - appel actif : `startAudioPlayback` refuse de démarrer le mixer pendant
    ///   un appel (WS3.2) — la story joue muette, on ne gate pas.
    /// - watchdog `playbackStallWatchdogSeconds` en secours absolu côté
    ///   `applyPlaybackHealth`.
    func isSlideAudioPending() -> Bool {
        guard slideHasSchedulableAudio else { return false }
        guard !MediaSessionCoordinator.shared.isCallActive else { return false }
        return !audioMixer.hasStartedPlayback(slideKey: currentSlideKey)
    }

    /// Test-only seam : read-only access to the reader audio engine so the
    /// lifecycle tests can assert transport state (`isPlaying`) after a
    /// background / window-detach / interruption event without a fixture.
    public var _readerAudioMixerForTesting: ReaderAudioMixer { audioMixer }

    /// Diff la nouvelle valeur du registry contre celle déjà appliquée et
    /// invoque `setMute(_:for:)` uniquement pour les ids qui ont basculé.
    /// Gating sur `.play` : en `.edit` la registry n'a pas de sens (le
    /// composer mute via son propre slider de volume).
    func applyPerTrackMute(_ next: Set<String>) {
        guard mode == .play else { return }
        let toMute = next.subtracting(lastAppliedMutedSet)
        let toUnmute = lastAppliedMutedSet.subtracting(next)
        for id in toMute { audioMixer.setMute(true, for: id) }
        for id in toUnmute { audioMixer.setMute(false, for: id) }
        lastAppliedMutedSet = next
    }

    @objc func handleComposerMute() {
        isAudioMuted = true
        audioMixer.setMute(true)
        forEachMediaLayer { $0.isMuted = true }
        backgroundLayer.isMuted = true
    }

    @objc func handleComposerUnmute() {
        isAudioMuted = false
        audioMixer.setMute(false)
        forEachMediaLayer { $0.isMuted = false }
        backgroundLayer.isMuted = false
    }
}
