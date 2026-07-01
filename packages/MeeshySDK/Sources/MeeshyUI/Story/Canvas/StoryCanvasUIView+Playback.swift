import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - StoryCanvasUIView + Playback

extension StoryCanvasUIView {
    /// Pause tout le média actif sur ce canvas — bg AVPlayer + FG AVPlayer +
    /// audio mixer — sans changer le `mode`. Utilisé par la préemption
    /// canvas-wide pour qu'un canvas évincé n'émette plus rien jusqu'à ce que
    /// SwiftUI le détruise officiellement (willMove(toWindow: nil)).
    ///
    /// Note : on ne touche pas au displayLink ni à `isPlaybackPaused` —
    /// l'instance est en fin de vie côté SwiftUI, son cleanup viendra. On
    /// coupe juste les sources sonores et visuelles immédiatement.
    func preemptMediaPlayback() {
        backgroundLayer.isPlaybackActive = false
        foregroundVideosPlaybackActive = false
        audioMixer.stop()
    }

    /// Enregistre `self` comme canvas actif et préempte tous les autres
    /// canvases en `.play` (sauf self). Appelé à chaque entrée en mode `.play`
    /// (init avec mode `.play`, ou `setMode(.play)`).
    @MainActor func registerAsActiveAndPreemptOthers() {
        let others = Self.activePlayingCanvases.allObjects.filter { $0 !== self }
        for other in others {
            other.preemptMediaPlayback()
            Self.activePlayingCanvases.remove(other)
        }
        Self.activePlayingCanvases.add(self)
    }

    /// Retire `self` du registry actif. Appelé à chaque sortie de `.play` :
    /// `setMode(.edit)`, `willMove(toWindow: nil)`, et lors du deinit (via
    /// la `weakObjects` table — auto-cleanup en théorie, mais on le fait
    /// explicitement quand on sait que le canvas quitte la window).
    @MainActor func unregisterFromActive() {
        Self.activePlayingCanvases.remove(self)
    }

    @objc func handleStoryPlayerPause() {
        setStoryPlaybackPaused(true)
    }

    @objc func handleStoryPlayerResume() {
        setStoryPlaybackPaused(false)
    }

    /// Single entry point for the viewer-level pause/resume toggle. Pauses
    /// (or resumes) **every** media surface this canvas owns:
    /// - the background video (`backgroundLayer.isPlaybackActive`)
    /// - every foreground `AVPlayer` (`forEachAVPlayer`)
    /// - the foreground+background audio engine (`audioMixer.pause/play`)
    /// - the keyframe effects clock (`displayLink.isPaused`)
    ///
    /// **Soft pause** : on ne **détruit pas** le `CADisplayLink` ni les
    /// players — on les met juste en `isPaused = true` / pause. Cela
    /// évite un rebuild coûteux à chaque cycle pause/resume (1 frame de
    /// stutter mesurable au Time Profiler) et préserve les buffers audio
    /// déjà schedulés par `audioMixer`. La destruction reste réservée à
    /// `stopPlayback()` (changement de slide, dismiss du viewer).
    ///
    /// Idempotent — re-applying the same state est cheap (early-return).
    /// Gated on `.play` because pause has no meaning in edit / preview modes.
    /// Public seam pour le viewer parent : propage les pauses UI (sheets,
    /// composer, drag-to-dismiss, long-press) au canvas afin que la timeline
    /// canvas (displayLink + AVPlayer + audioMixer) gèle EN PHASE avec la
    /// progress bar du viewer. Sans ça, `lastPlaybackTime` continuait à
    /// avancer pendant qu'un sheet était ouvert → saut visible au resume.
    /// Idempotent — re-applying the same state est cheap (early-return dans
    /// `setStoryPlaybackPaused`).
    public func setPaused(_ paused: Bool) {
        setStoryPlaybackPaused(paused)
    }

    func setStoryPlaybackPaused(_ paused: Bool) {
        guard mode == .play else { return }
        guard isPlaybackPaused != paused else { return }
        isPlaybackPaused = paused

        if paused {
            // Freeze every media clock — mais ON GARDE le displayLink et
            // les players vivants pour un resume instantané. Vidéo de fond ET
            // vidéos foreground gèlent ensemble via leur gate respectif.
            foregroundVideosPlaybackActive = false
            backgroundLayer.isPlaybackActive = false
            audioMixer.pause()
            displayLink?.isPaused = true
        } else {
            // Resume in place. Réveille le displayLink et les players
            // depuis leur dernière position — pas de re-init coûteuse. Fond,
            // foreground et audio repartent en phase. `pushSlidePlayheadToLayers`
            // rafraîchit la cible timeline ; comme le playhead n'a pas bougé
            // pendant la pause, la dérive est ~0 → aucun seek (pas de hoquet).
            displayLink?.isPaused = false
            pushSlidePlayheadToLayers()
            backgroundLayer.isPlaybackActive = true
            foregroundVideosPlaybackActive = true
            if window != nil, !completionFired {
                startAudioPlayback()
            }
        }
    }

    func forEachAVPlayer(_ block: (AVPlayer) -> Void) {
        for sub in itemsContainer.sublayers ?? [] {
            if let media = sub as? StoryMediaLayer, let player = media.avPlayer {
                block(player)
            }
        }
    }

    /// Pousse le playhead unifié courant (`currentTime`) sur la vidéo de fond et
    /// toutes les `StoryMediaLayer`, afin que `alignToTimelineThenPlay()` cale le
    /// player sur la bonne position au prochain démarrage. Appelé aux transitions
    /// de lecture (GO, resume) où aucun rebuild ne vient rafraîchir la valeur.
    func pushSlidePlayheadToLayers() {
        let playheadSeconds = currentTime.seconds
        backgroundLayer.slidePlayheadSeconds = playheadSeconds
        forEachMediaLayer { $0.slidePlayheadSeconds = playheadSeconds }
    }

    /// Composer live preview : démarre (et fait boucler) la lecture des vidéos
    /// du canvas en mode `.edit` quand `playsVideoInEditMode` est levé. No-op en
    /// `.play` (le reader gère sa propre lecture) et quand le drapeau est bas
    /// (prefetcher hors-écran → reste silencieux). Idempotent : appelé à chaque
    /// `rebuildLayers()` (les layers `.edit` sont reconstruits à neuf à chaque
    /// mutation) et au flip du drapeau.
    func applyEditPlayback() {
        guard mode == .edit, playsVideoInEditMode else { return }
        // Éditeur sonore (choix produit) : pose la session `.playback` pour que
        // l'audio des vidéos qui bouclent soit audible même silent-switch ON.
        // Idempotent / call-aware via la source unique.
        if AVAudioSession.sharedInstance().category != .playback {
            MediaSessionCoordinator.shared.activatePlaybackSync(options: [.mixWithOthers, .duckOthers])
        }
        // Fond : `isPlaybackActive` joue le player (qui boucle déjà via son
        // `AVPlayerLooper`). Audio inclus (choix produit : éditeur sonore).
        backgroundLayer.isPlaybackActive = true
        // Foreground : marque chaque layer pour qu'elle (re)joue — y compris
        // après un swap d'URL async (cache local résolu) — et démarre le
        // player déjà attaché. Le loop est armé par `attachPlayer` (loop en
        // `.edit`).
        forEachMediaLayer { layer in
            layer.playsInEditMode = true
            layer.avPlayer?.play()
        }
    }

    func startPlayback() {
        stopPlayback()
        // Nouvelle session de lecture → on repart « progressant » (non gaté).
        // Couvre init(.play), setMode(.play) au slide-change, et le re-arm
        // `didMoveToWindow` (dismiss d'un cover). Le sondage du tick re-dérivera
        // l'état réel dès la première frame.
        resetPlaybackHealthState()
        // Proxy weak partagé : le link ne retient pas le canvas — un canvas
        // jamais fenêtré (setMode avant attach puis jeté) reste libérable.
        let link = WeakDisplayLinkTarget.makeLink { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.displayLinkTick(link)
        }
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 60)
        link.add(to: .main, forMode: .common)
        displayLink = link
        // Autorise (ou ré-autorise après pause) la lecture du player vidéo de
        // fond. `attachBackgroundPlayer` ne joue plus automatiquement —
        // l'autorisation passe désormais EXCLUSIVEMENT par ce drapeau, ce qui
        // garantit qu'un canvas en `.edit` mode (prefetcher, composer
        // preview) n'émet jamais d'audio même si son player est attaché et
        // prêt. Gate supplémentaire : tant que tous les médias chargeables
        // ne sont pas prêts (cf. `contentReadyFired`), la vidéo bg attend —
        // le user-spec exige que ni vidéo ni audio bg ne joue tant que la
        // slide n'est pas visuellement complète.
        if contentReadyFired {
            backgroundLayer.isPlaybackActive = true
            foregroundVideosPlaybackActive = true
        } else {
            pendingBackgroundActivation = true
        }
    }

    func stopPlayback() {
        displayLink?.invalidate()
        displayLink = nil
        // Pause symétrique des players vidéo (fond + foreground). Une slide qui
        // sort du mode `.play` (changement de mode, dismiss du viewer, transition
        // vers prefetch off-screen) ne doit plus émettre ni vidéo ni audio.
        backgroundLayer.isPlaybackActive = false
        foregroundVideosPlaybackActive = false
    }

    @objc func displayLinkTick(_ link: CADisplayLink) {
        guard mode == .play else { return }
        // Timeline unifiée : sonder la santé de lecture du média PRIMAIRE AVANT
        // d'avancer le playhead, afin de geler EN PHASE avec un buffer stall
        // (et de la reprendre dès que la vidéo rejoue). Le sondage tourne sur
        // le displayLink déjà actif (zéro observer KVO à gérer / fuir) et reste
        // un simple lecture d'enum + comparaisons — négligeable face au
        // `rebuildLayers()` 60 Hz qui suit. Le link continue de ticker pendant
        // un stall (seul `isPlaybackPaused` met le link en pause), donc ce
        // sondage détecte aussi la reprise alors que le playhead est gelé.
        refreshPlaybackHealth(now: link.timestamp)
        advancePlayheadIfActive(by: link.targetTimestamp - link.timestamp)
    }

    /// Avance le playhead canvas (`currentTime`) si la lecture est active.
    /// Gated sur :
    /// - mode == .play (l'edit a son propre `editDisplayLink`)
    /// - contentReadyFired (sans ça, currentTime avançait pendant le chargement
    ///   initial → progress bar du viewer sautait dès le content ready)
    /// - !isPlaybackPaused (pauses user/lifecycle propagées par le viewer via `setPaused`)
    /// - !isPlaybackStalled (buffer stall du média primaire — parité in-canvas
    ///   avec la progress bar du viewer ; sans ce gate les keyframes foreground
    ///   et le playhead audio dériveraient devant une vidéo de fond gelée)
    ///
    /// Si le gate échoue, on RETOURNE sans rebuild — les mutations modèle sont
    /// déjà capturées par `slide.didSet → rebuildLayers()` à l'écriture. L'ancien
    /// `rebuildLayers()` inconditionnel ici causait un scintillement (60
    /// rebuilds/s avant content ready). Bug user-reporté 2026-05-27 « la story
    /// scintille seulement ».
    func advancePlayheadIfActive(by dt: Double) {
        guard mode == .play, contentReadyFired, !isPlaybackPaused, !isPlaybackStalled else {
            return
        }
        let nextSeconds = CMTimeGetSeconds(currentTime) + dt
        let effectiveDuration = slide.computedTotalDuration()
        let clamped = min(nextSeconds, effectiveDuration)
        currentTime = CMTime(seconds: clamped, preferredTimescale: 600_000)
        // Publie le playhead pour les overlays SwiftUI (chip audio foreground).
        // Préfère le clock audio réel du mixer (`slideElapsedSeconds`) quand une
        // slide est en lecture audio — même référentiel host-time que les
        // `AVAudioTime` qui schedulent les buffers, donc sample-accurate.
        // Fallback sur le `clamped` du displayLink pour les slides sans audio.
        let publishedTime = audioMixer.slideElapsedSeconds ?? clamped
        StoryReaderPlayheadState.shared.publish(min(publishedTime, effectiveDuration))
        // Source de vérité timeline pour la progress bar du viewer — on émet la
        // même valeur que celle du clamp (et non le `publishedTime`
        // audio-priorisé) pour rester cohérent avec le check
        // `clamped >= effectiveDuration` qui fire `onCompletion`.
        onPlaybackTime?(clamped)
        rebuildLayers()
        if clamped >= effectiveDuration {
            stopPlayback()
            if !completionFired {
                completionFired = true
                readerContext.onCompletion?()
            }
        }
    }

    /// Le player média « primaire » de la slide qui pilote la timeline : vidéo
    /// de fond en priorité, sinon première vidéo foreground. `nil` pour une
    /// slide sans vidéo (image / couleur / audio-only) → jamais gatée.
    func primaryMediaPlayer() -> AVPlayer? {
        if case .video = backgroundLayer.kind, let player = backgroundLayer.avPlayer {
            return player
        }
        for sub in itemsContainer.sublayers ?? [] {
            if let media = sub as? StoryMediaLayer,
               media.media?.isBackground == false,
               media.media?.kind == .video,
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
        let player = primaryMediaPlayer()
        applyPlaybackHealth(status: player?.timeControlStatus,
                            failed: player?.currentItem?.status == .failed,
                            now: now)
    }

    /// Cœur testable : timing du watchdog + mapping pur (`StoryPlaybackHealth`)
    /// + emit-on-change. Alimenté en prod par `refreshPlaybackHealth`, en test
    /// par `_refreshPlaybackHealthForTesting` (statut injecté).
    func applyPlaybackHealth(status: AVPlayer.TimeControlStatus?,
                                     failed: Bool,
                                     now: CFTimeInterval) {
        // Le watchdog n'accumule QUE pendant une non-lecture réelle d'un média
        // gaté. `.playing`, absence de vidéo, pause user, et échec comptent comme
        // « sains » (reset) — l'échec retombe déjà sur l'horloge murale.
        let healthyForWatchdog = status == .playing || status == nil || isPlaybackPaused || failed
        if healthyForWatchdog {
            playbackStallSince = nil
        } else if playbackStallSince == nil {
            playbackStallSince = now
        }
        let watchdogExpired = playbackStallSince.map { now - $0 >= Self.playbackStallWatchdogSeconds } ?? false
        let progressing = StoryPlaybackHealth.isProgressing(
            status: status,
            isUserPaused: isPlaybackPaused,
            isFailed: failed,
            watchdogExpired: watchdogExpired
        )
        isPlaybackStalled = !progressing
        guard progressing != lastProgressingEmitted else { return }
        lastProgressingEmitted = progressing
        onPlaybackProgressing?(progressing)
    }

    /// Remet l'état de santé à « progressant » au démarrage d'une session de
    /// lecture (nouveau slide / re-attach). N'ÉMET PAS — `setCurrentSlide`/`reset`
    /// du timer côté viewer réinitialisent symétriquement leur propre `isPlaybackStalled`.
    func resetPlaybackHealthState() {
        isPlaybackStalled = false
        lastProgressingEmitted = true
        playbackStallSince = nil
    }

    /// Test-only seam : drive the health core with an injected `timeControlStatus`
    /// (and `failed`) at an explicit `now` so the watchdog + emit-on-change +
    /// freeze contract is exercised without a live `AVPlayer` or `CADisplayLink`.
    public func _refreshPlaybackHealthForTesting(status: AVPlayer.TimeControlStatus?,
                                                 failed: Bool,
                                                 now: CFTimeInterval) {
        applyPlaybackHealth(status: status, failed: failed, now: now)
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
        let effectiveDuration = slide.computedTotalDuration()
        let clamped = min(seconds, effectiveDuration)
        currentTime = CMTime(seconds: clamped, preferredTimescale: 600_000)
        onPlaybackTime?(clamped)
        rebuildLayers()
        if !completionFired,
           mode == .play,
           currentTime.seconds >= effectiveDuration {
            completionFired = true
            readerContext.onCompletion?()
        }
    }

    func startEditDisplayLinkIfNeeded() {
        guard mode == .edit, editDisplayLink == nil else { return }
        let link = WeakDisplayLinkTarget.makeLink { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.editTick(link)
        }
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)
        editDisplayLink = link
    }

    func stopEditDisplayLink() {
        editDisplayLink?.invalidate()
        editDisplayLink = nil
    }

    @objc func editTick(_ link: CADisplayLink) {
        // Gesture handlers drive their own rebuilds; the tick keeps the 120 Hz
        // clock alive on ProMotion while editing AND (WS2.1) re-feeds the glass
        // text backdrop so it tracks a playing video background between rebuilds.
        refreshEditGlassBackdropIfNeeded(now: link.timestamp)
    }

    /// WS2.1 — keep glass-style text backdrops in sync with a PLAYING video
    /// background while editing. `rebuildLayers()` only re-captures the backdrop
    /// on a model mutation, so without this the glass blur froze on the video
    /// frame present at the last rebuild. Bounded to the narrow "glass text over
    /// a video bg, in edit" case: it no-ops for static (image/color) backgrounds
    /// (the backdrop can't change between rebuilds) and `captureCanvasBackdrop`
    /// itself short-circuits when the slide carries no glass text. Throttled to
    /// ~18 fps via `StoryEditBackdropThrottle` since the link runs up to 120 Hz.
    /// Reuses the exact capture path of `rebuildLayers` (same `geometry`,
    /// `currentTime`, languages) so the crop geometry can't drift.
    func refreshEditGlassBackdropIfNeeded(now: CFTimeInterval) {
        guard mode == .edit, case .video = backgroundLayer.kind else { return }
        guard StoryEditBackdropThrottle.shouldEmit(now: now, last: lastEditBackdropTimestamp) else { return }
        lastEditBackdropTimestamp = now
        backdropCapture.invalidate()
        _ = backdropCapture.captureCanvasBackdrop(slide: slide,
                                                  geometry: geometry,
                                                  time: currentTime,
                                                  mode: mode,
                                                  languages: readerContext.preferredLanguages)
        // Re-feed the already-attached text layers in place — no rebuildLayers().
        // `setBackdropTexture` is a no-op on a non-glass text layer (its glass
        // backdrop sublayer is nil), so the filter is the crop work, which the
        // capture skips entirely when no glass text exists.
        itemsContainer.sublayers?.forEach { sub in
            guard let textLayer = sub as? StoryTextLayer else { return }
            textLayer.setBackdropTexture(backdropCapture.cropRegion(textLayer.frame))
        }
    }
}
