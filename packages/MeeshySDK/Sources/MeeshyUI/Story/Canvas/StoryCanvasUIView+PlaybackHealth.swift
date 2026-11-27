import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - StoryCanvasUIView + PlaybackHealth

extension StoryCanvasUIView {
    /// Le player média « primaire » de la slide qui pilote la timeline : vidéo
    /// de fond en priorité, sinon première vidéo foreground. `nil` pour une
    /// slide sans vidéo (image / couleur / audio-only) → jamais gatée.
    ///
    /// Un clip de premier plan joué jusqu'au bout n'en est plus un (#6757) : il
    /// n'attend plus rien, et sa pause de fin se lisait comme un stall — spinner
    /// et timeline gelée jusqu'au watchdog, puis relances qui rejouaient sa fin.
    func primaryMediaPlayer() -> AVPlayer? {
        if case .video = backgroundLayer.kind, let player = backgroundLayer.avPlayer {
            return player
        }
        for sub in itemsContainer.sublayers ?? [] {
            if let media = sub as? StoryMediaLayer,
               media.media?.isBackground == false,
               media.media?.kind == .video,
               !media.hasPlayedToEnd,
               let player = media.avPlayer {
                return player
            }
        }
        return nil
    }

    /// Production feed : sonde le player primaire à chaque tick (uniquement une
    /// fois le contenu prêt — avant ça la timeline est déjà gatée par
    /// content-ready et la vidéo bg n'a pas démarré).
    func refreshPlaybackHealth(now: CFTimeInterval) {
        guard contentReadyFired else { return }
        probePlaybackHealth(now: now)
    }

    func probePlaybackHealth(now: CFTimeInterval) {
        let player = primaryMediaPlayer()
        applyPlaybackHealth(status: player?.timeControlStatus,
                            failed: player?.currentItem?.status == .failed,
                            audioPending: isSlideAudioPending(),
                            mediaPending: isBackgroundImagePending(),
                            now: now)
    }

    /// **Une pause utilisateur n'est pas un stall, même lu juste avant elle (#6757).**
    ///
    /// La pause gèle `displayLink`, dont le tick est le SEUL site qui sonde la
    /// santé. Un stall lu à l'image d'avant — un clip arrivé à sa fin, un
    /// buffering — restait donc émis pendant toute la pause : le spinner de l'hôte
    /// ne tombait jamais, et le watchdog comptait le temps de pause comme un stall,
    /// si bien que la reprise forçait « progresse » sur une vidéo encore bloquée.
    ///
    /// Le solde rejoue la sonde SOUS la pause, où `StoryPlaybackHealth` rend
    /// « progresse » et où le watchdog repart de zéro. Il passe par la file
    /// principale : l'hôte appelle `setPaused` depuis `updateUIView`, où lui rendre
    /// un état est interdit. Une reprise survenue entre-temps le rend caduc.
    func settlePlaybackHealthUnderUserPause() {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.mode == .play, self.isPlaybackPaused else { return }
            self.probePlaybackHealth(now: CACurrentMediaTime())
        }
    }

    /// R2 — image de fond dont le bitmap FINAL n'est pas encore stampé : le
    /// failsafe readiness 2 s peut avoir démarré la timeline sur le ThumbHash
    /// flou (KVO raté OU download lent — indistinguables au moment du
    /// failsafe). Le gel santé attend `hasFinalContentStamped` (posé par
    /// l'unique choke point `stampFinalImage`, tous chemins : warm hit,
    /// cache composer, URL). Vidéo bg : déjà couverte par `timeControlStatus` ;
    /// couleur/gradient : jamais pending. Anti-deadlock : watchdog 5 s (un
    /// download qui échoue définitivement retombe sur l'horloge murale).
    func isBackgroundImagePending() -> Bool {
        if case .image = backgroundLayer.kind {
            return !backgroundLayer.hasFinalContentStamped
        }
        return false
    }

    /// Cœur testable : timing du watchdog + mapping pur (`StoryPlaybackHealth`)
    /// + emit-on-change. Alimenté en prod par `refreshPlaybackHealth`, en test
    /// par `_refreshPlaybackHealthForTesting` (statut injecté).
    func applyPlaybackHealth(status: AVPlayer.TimeControlStatus?,
                                     failed: Bool,
                                     audioPending: Bool = false,
                                     mediaPending: Bool = false,
                                     now: CFTimeInterval) {
        // Le watchdog n'accumule QUE pendant une non-disponibilité réelle d'un
        // média gaté — vidéo primaire non-`.playing`, audio pas encore
        // schedulé (R1), OU image bg pas encore stampée (R2). Pause user et
        // échec comptent comme « sains » (reset) — l'échec retombe déjà sur
        // l'horloge murale.
        let videoGated = status != nil && status != .playing
        let gatedForWatchdog = (videoGated || audioPending || mediaPending) && !isPlaybackPaused && !failed
        if !gatedForWatchdog {
            playbackStallSince = nil
        } else if playbackStallSince == nil {
            playbackStallSince = now
        }
        let watchdogExpired = playbackStallSince.map { now - $0 >= Self.playbackStallWatchdogSeconds } ?? false
        let progressing = StoryPlaybackHealth.isProgressing(
            status: status,
            isUserPaused: isPlaybackPaused,
            isFailed: failed,
            watchdogExpired: watchdogExpired,
            isAudioPending: audioPending,
            isPrimaryMediaPending: mediaPending
        )
        isPlaybackStalled = !progressing
        // R1 s'applique aussi aux AVPLAYER (#6580). Le watchdog gouverne la
        // retenue comme il gouverne le gel du playhead : une fois expiré,
        // `progressing` redevient vrai et l'image ne doit pas rester figée sur
        // un audio qui n'arrivera jamais.
        holdVideosWhileAudioPending(audioPending && !watchdogExpired)

        // C-DIR3 — self-heal : un player `.paused` alors que rien ne le pause
        // (ni user, ni échec) ne se relancera JAMAIS seul — les didSet
        // `isPlaybackActive` ne rejouent que sur changement de valeur. Vécu
        // device (iPhone 16 Pro Max) : story figée au boot jusqu'à un
        // long-press/relâcher manuel. La sonde re-drive le chemin canonique
        // du resume, avec grâce et budget bornés (règle pure testée).
        if status == .paused, !isPlaybackPaused, !failed {
            if playbackPausedProbeSince == nil { playbackPausedProbeSince = now }
        } else {
            playbackPausedProbeSince = nil
        }
        if StoryPlaybackHealth.shouldKickPlayback(
            status: status,
            isUserPaused: isPlaybackPaused,
            isFailed: failed,
            pausedSinceSeconds: playbackPausedProbeSince.map { now - $0 } ?? 0,
            kicksDelivered: playbackSelfHealKicks
        ) {
            playbackSelfHealKicks += 1
            playbackPausedProbeSince = nil
            kickPlayback()
        }
        guard progressing != lastProgressingEmitted else { return }
        lastProgressingEmitted = progressing
        onPlaybackProgressing?(progressing)
    }

    /// **R1 étendu aux AVPlayer (#6580).** La porte R1 attend que le fichier
    /// audio de la slide soit téléchargé et schedulé ; elle gelait le PLAYHEAD
    /// (`isPlaybackStalled` coupe `advancePlayheadIfActive`) et laissait les
    /// `AVPlayer` rouler. La vidéo prenait donc une avance qu'aucun recalage ne
    /// rattrape — le recalage vise `slidePlayheadSeconds`, c'est-à-dire le
    /// playhead gelé.
    ///
    /// **Une SUSPENSION, pas une re-décision.** On mémorise l'état des deux
    /// portes et on le restaure à l'identique ; rejouer les gates du « GO »
    /// ici lèverait des portes que d'autres conditions (fenêtre absente,
    /// préemption d'un autre canvas) tenaient délibérément fermées.
    ///
    /// L'audio n'est PAS ajouté à `contentReadyFired`, par conception : l'image
    /// ne doit pas attendre le son, et l'y ajouter rallongerait l'ouverture.
    /// On gèle ce qui doit rester EN PHASE ; on ne retarde pas l'affichage.
    func holdVideosWhileAudioPending(_ pending: Bool) {
        guard mode == .play else { return }
        guard pending else {
            guard let held = videoGatesHeldForAudio else { return }
            videoGatesHeldForAudio = nil
            // Une pause utilisateur posée PENDANT la retenue gouverne : la
            // relâche rendrait la lecture sous une slide gelée. Le marqueur est
            // soldé quand même — `setStoryPlaybackPaused(false)` reprendra par
            // son propre chemin.
            guard !isPlaybackPaused else { return }
            pushSlidePlayheadToLayers()
            backgroundLayer.isPlaybackActive = held.background
            foregroundVideosPlaybackActive = held.foreground
            forEachMediaLayer { $0.startAlignedIfActive() }
            return
        }
        guard videoGatesHeldForAudio == nil else { return }
        // Rien qui roule ⇒ rien à retenir, et surtout aucun marqueur posé :
        // sans ça, la relâche RELÈVERAIT des portes que personne n'avait levées.
        guard backgroundLayer.isPlaybackActive || foregroundVideosPlaybackActive else { return }
        videoGatesHeldForAudio = (backgroundLayer.isPlaybackActive, foregroundVideosPlaybackActive)
        backgroundLayer.isPlaybackActive = false
        foregroundVideosPlaybackActive = false
    }

    /// C-DIR3 — re-drive la lecture par le chemin canonique du resume en
    /// FORÇANT les didSet (flip false→true) : exactement ce que le cycle
    /// long-press/relâcher réparait à la main sur device. Loggé pour le
    /// diagnostic terrain (Console.app, catégorie story-media).
    func kickPlayback() {
        storyMediaLog.info("playback self-heal kick #\(self.playbackSelfHealKicks, privacy: .public) — primary player stuck .paused while gates say play")
        pushSlidePlayheadToLayers()
        backgroundLayer.isPlaybackActive = false
        backgroundLayer.isPlaybackActive = true
        foregroundVideosPlaybackActive = false
        foregroundVideosPlaybackActive = true
        forEachMediaLayer { $0.startAlignedIfActive() }
    }

    /// Remet l'état de santé à « progressant » au démarrage d'une session de
    /// lecture (nouveau slide / re-attach). N'ÉMET PAS — `setCurrentSlide`/`reset`
    /// du timer côté viewer réinitialisent symétriquement leur propre `isPlaybackStalled`.
    func resetPlaybackHealthState() {
        isPlaybackStalled = false
        lastProgressingEmitted = true
        playbackStallSince = nil
        playbackPausedProbeSince = nil
        playbackSelfHealKicks = 0
        // Une nouvelle session de lecture ne doit pas hériter d'une retenue R1
        // de la session précédente : son état restauré n'aurait plus de sens.
        videoGatesHeldForAudio = nil
    }

    /// Test-only seam : drive the health core with an injected `timeControlStatus`
    /// (and `failed` / `audioPending`) at an explicit `now` so the watchdog +
    /// emit-on-change + freeze contract is exercised without a live `AVPlayer`
    /// or `CADisplayLink`.
    public func _refreshPlaybackHealthForTesting(status: AVPlayer.TimeControlStatus?,
                                                 failed: Bool,
                                                 audioPending: Bool = false,
                                                 mediaPending: Bool = false,
                                                 now: CFTimeInterval) {
        applyPlaybackHealth(status: status, failed: failed,
                            audioPending: audioPending, mediaPending: mediaPending, now: now)
    }

    /// Test-only seam : run the gated playhead advance exactly as `displayLinkTick`
    /// does, so the `!isPlaybackStalled` freeze can be asserted deterministically.
    public func _advancePlayheadForTesting(by dt: Double) {
        advancePlayheadIfActive(by: dt)
    }

    /// Test-only seam: simulate a displayLink tick at a specific timestamp
    /// to validate completion logic without spinning a real CADisplayLink.
    /// Bypasses the `contentReadyFired` gate of `displayLinkTick` — tests
    /// drive the seam directly, so the gate isn't relevant for unit testing.
    /// Émet aussi `onPlaybackTime` pour parité avec le tick réel.
    public func simulateTickAt(seconds: Double) {
        let effectiveDuration = effectiveSlideTotalDuration
        let clamped = min(seconds, effectiveDuration)
        currentTime = CMTime(seconds: clamped, preferredTimescale: 600_000)
        onPlaybackTime?(clamped)
        rebuildLayers()
        StoryRenderer.applyClosing(slide.effects.closing,
                                   rootLayer: rootLayer,
                                   elapsed: clamped,
                                   totalDuration: effectiveDuration)
        if !completionFired,
           mode == .play,
           currentTime.seconds >= effectiveDuration {
            completionFired = true
            readerContext.onCompletion?()
        }
    }
}
