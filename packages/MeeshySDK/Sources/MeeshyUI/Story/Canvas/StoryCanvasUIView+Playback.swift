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
        isPlaybackRequestedPaused = paused
        applyPlaybackPause()
    }

    /// L'hôte réclame l'audio (#8725) : le canvas gèle en place et reprend à
    /// la fin de l'interruption — sauf si le viewer le tient lui-même en pause.
    func setPlaybackInterrupted(_ interrupted: Bool) {
        isPlaybackInterrupted = interrupted
        guard mode == .play else { return }
        applyPlaybackPause()
    }

    private func applyPlaybackPause() {
        let paused = isPlaybackRequestedPaused || isPlaybackInterrupted
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
            settlePlaybackHealthUnderUserPause()
        } else {
            // Resume in place. Réveille le displayLink et les players
            // depuis leur dernière position — pas de re-init coûteuse. Fond,
            // foreground et audio repartent en phase. `pushSlidePlayheadToLayers`
            // rafraîchit la cible timeline ; comme le playhead n'a pas bougé
            // pendant la pause, la dérive est ~0 → aucun seek (pas de hoquet).
            // Reprendre, c'est devenir LE canvas qui joue : c'est ici, et non à
            // la naissance en pause, qu'il préempte les autres (#9827).
            registerAsActiveAndPreemptOthers()
            displayLink?.isPaused = false
            playheadTickClock.reset()
            pushSlidePlayheadToLayers()
            backgroundLayer.isPlaybackActive = true
            foregroundVideosPlaybackActive = true
            forEachMediaLayer { $0.startAlignedIfActive() }
            // Le « GO » de fin de chargement a pu tomber PENDANT la pause : il
            // reste alors armé plutôt que consommé sous le gel (cf.
            // `fireContentReadyIfNeeded`). Les lignes ci-dessus VIENNENT de le
            // rejouer — on le solde donc ici, AVANT `startAudioPlayback` qui le
            // ré-arme légitimement si le contenu n'est toujours pas prêt.
            pendingBackgroundActivation = false
            if window != nil, !completionFired {
                startAudioPlayback()
            }
        }
    }

    /// **Ouvre la slide à `seconds` plutôt qu'à zéro (#6580).**
    ///
    /// Le porteur : « lorsqu'on a un son de fond, ouverture en détail on joue le
    /// son directement aligné, correctement ». La carte publiait déjà sa
    /// position (`onPlaybackTime`) et personne ne la lisait — une loi qui
    /// calcule une valeur que personne ne consomme. Ce point d'entrée la rend
    /// consommable, sans fabriquer une horloge de plus : il SÈME
    /// `currentTime`, la seule position que la vidéo suit déjà
    /// (`alignToTimelineThenPlay` lit `slidePlayheadSeconds`, poussé depuis
    /// elle), et que `captureSlideTimelineAnchor()` remet au mixer.
    ///
    /// À appeler AVANT toute lecture — `makeUIView` le fait avant
    /// `setReaderContext`, qui est le premier site qui démarre quoi que ce
    /// soit. Semé plus tard, il ferait sauter l'image et redémarrerait l'audio.
    ///
    /// N'ÉMET PAS `onPlaybackTime` : le site d'appel est l'évaluation du body
    /// SwiftUI de l'hôte, et lui rendre un état pendant sa propre mise à jour
    /// est exactement ce que SwiftUI interdit. Le premier tick du displayLink
    /// l'émettra.
    public func seedPlayhead(_ seconds: Double) {
        guard seconds.isFinite, seconds > 0 else { return }
        let clamped = min(seconds, effectiveSlideTotalDuration)
        guard clamped > 0 else { return }
        currentTime = CMTime(seconds: clamped, preferredTimescale: 600_000)
        pushSlidePlayheadToLayers()
    }

    /// **Re-sème la position APRÈS le montage (#6580).**
    ///
    /// `seedPlayhead` ne s'exécute qu'à `makeUIView`, et la position d'ouverture
    /// est une valeur ASYNCHRONE : l'hôte du détail la tient de la carte. Un
    /// hôte monté avant qu'elle soit connue restait à ZÉRO pour toujours — il
    /// n'existait aucun second chemin de semis. La moitié « ouvrir à la bonne
    /// seconde » n'était donc servie qu'aux hôtes assez chanceux pour la
    /// connaître avant leur premier rendu.
    ///
    /// **Re-semer n'est pas semer.** La passe audio est déjà planifiée contre
    /// l'ANCIENNE origine : déplacer le playhead sans la refaire partir ferait
    /// sauter la vidéo à `t` sous un son resté à zéro — le défaut que ce lot
    /// corrige, à l'envers. `realignAudioToPlayhead()` solde la clé
    /// d'idempotence du mixer pour que le funnel replanifie depuis la NOUVELLE
    /// ancre.
    ///
    /// L'idempotence (« ne pas recaler à chaque rendu ») appartient à
    /// l'APPELANT, qui seul sait ce qu'il a déjà demandé :
    /// `StoryReaderRepresentable.shouldReseed(requested:seeded:)`. Ici, le
    /// playhead COURANT ne peut pas servir de référence — il avance en
    /// permanence, et le comparer à la position d'ouverture ferait reculer la
    /// lecture une image sur deux.
    @discardableResult
    public func reseedPlayhead(_ seconds: Double) -> Bool {
        guard seconds.isFinite, seconds > 0 else { return false }
        let clamped = min(seconds, effectiveSlideTotalDuration)
        guard clamped > 0 else { return false }
        seedPlayhead(clamped)
        realignAudioToPlayhead()
        return true
    }

    /// Fait repartir la passe audio depuis l'ancre courante. No-op tant que le
    /// mixer n'a rien planifié pour CETTE slide : la passe à venir lira la
    /// nouvelle position d'elle-même, et un `stop()` prématuré ne ferait que
    /// retarder son démarrage.
    private func realignAudioToPlayhead() {
        guard mode == .play else { return }
        guard audioMixer.hasStartedPlayback(slideKey: currentSlideKey) else { return }
        audioMixer.stop()
        startAudioPlayback()
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
        // Preview timeline active → l'engine possède audio ET transport ;
        // les boucles vidéo libres de l'édition reprennent à la sortie.
        guard mode == .edit, (playsVideoInEditMode || playsAudioInEditMode),
              !isTimelinePreviewActive, !StoryEditPlaybackCover.covers(self) else { return }
        // Éditeur sonore (choix produit) : pose la session `.playback` pour que
        // l'audio des vidéos qui bouclent ET des clips audio soit audible même
        // silent-switch ON. Idempotent / call-aware via la source unique.
        MediaSessionCoordinator.shared.ensureContentPlayback(.audible)
        if playsVideoInEditMode {
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
        if playsAudioInEditMode {
            // Clips audio / voix : configure + joue le mixer (gate revision →
            // no-op si le contenu audio n'a pas changé depuis le dernier pass).
            reconfigureAudioForPlayback()
        }
    }

    func startPlayback() {
        stopPlayback()
        // Nouvelle session de lecture → on repart « progressant » (non gaté).
        // Couvre init(.play), setMode(.play) au slide-change, et le re-arm
        // `didMoveToWindow` (dismiss d'un cover). Le sondage du tick re-dérivera
        // l'état réel dès la première frame.
        resetPlaybackHealthState()
        playheadTickClock = PlayheadTickClock()
        // Proxy weak partagé : le link ne retient pas le canvas — un canvas
        // jamais fenêtré (setMode avant attach puis jeté) reste libérable.
        let cadence = StoryPlaybackCadence.frameRateRange(for: playbackCadenceTier(), mediaTier: DeviceMediaTier.current)
        let link = WeakDisplayLinkTarget.makeLink(frameRateRange: cadence) { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.displayLinkTick(link)
        }
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
        // Gate de pause : `startPlayback()` est ré-entré à l'attachement window
        // et aux transitions de mode, qui peuvent survenir ALORS QUE l'hôte a
        // gelé la lecture (interstitiel d'identité, overlay commentaires,
        // appel). Sans ce test, la vidéo de fond et les foreground repartaient
        // sous le gel — la story s'entendait pendant l'interlude. L'intention
        // est armée à la place, et soldée par `setStoryPlaybackPaused(false)`.
        if contentReadyFired, !isPlaybackPaused {
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
        // Temps RÉEL écoulé depuis le tick précédent, pas la durée nominale
        // d'une frame : une image perdue ne fait plus prendre de retard à la
        // scène sur l'audio (#9702). Mesuré à CHAQUE tick, même gaté, pour
        // qu'un stall ne se rattrape pas d'un bond à la reprise.
        let elapsed = playheadTickClock.advance(now: link.timestamp,
                                                nominal: link.targetTimestamp - link.timestamp)
        advancePlayheadIfActive(by: elapsed)
        // Le volume suit le playhead : posé APRÈS l'avancée, sinon l'automation
        // retarderait d'une image sur l'image affichée.
        applyVolumeAutomation(at: Float(currentTime.seconds))
        if playheadTickClock.isDriftCheckDue(now: link.timestamp) {
            correctVideoDriftIfNeeded()
        }
        applyPlaybackCadence(to: link)
    }

    /// Le palier du lien de lecture pour la slide à l'instant courant (#9864).
    /// La loi est `StoryPlaybackCadence` ; la vue ne fournit que ce qu'elle
    /// seule sait : le genre du fond, l'audio planifiable, et si un hôte
    /// dessine sa barre depuis `onPlaybackTime`.
    func playbackCadenceTier() -> StoryPlaybackCadenceTier {
        let backgroundIsVideo: Bool = {
            if case .video = backgroundLayer.kind { return true }
            return false
        }()
        return StoryPlaybackCadence.tier(slide: slide,
                                         elapsed: currentTime.seconds,
                                         totalDuration: effectiveSlideTotalDuration,
                                         backgroundIsVideo: backgroundIsVideo,
                                         hasSchedulableAudio: slideHasSchedulableAudio,
                                         relaysPlaybackClock: onPlaybackTime != nil)
    }

    /// Ré-évaluée à chaque tick : une ouverture qui se termine, une fermeture
    /// qui approche, un audio qui se planifie ou un hôte qui s'abonne changent
    /// le palier sans repasser par `startPlayback`. N'écrit que sur changement.
    func applyPlaybackCadence(to link: CADisplayLink) {
        let range = StoryPlaybackCadence.frameRateRange(for: playbackCadenceTier(), mediaTier: DeviceMediaTier.current)
        let current = link.preferredFrameRateRange
        guard current.minimum != range.minimum
                || current.maximum != range.maximum
                || current.preferred != range.preferred else { return }
        link.preferredFrameRateRange = range
    }

    /// Les vidéos ne se calaient sur la timeline qu'au démarrage et à la
    /// reprise : une dérive en cours de route (stall d'une vidéo non primaire,
    /// décodage en retard) ne se rattrapait jamais (#9702). Gaté comme
    /// l'avancée du playhead : rien à recaler sur une timeline gelée.
    func correctVideoDriftIfNeeded() {
        guard mode == .play, contentReadyFired, !isPlaybackPaused, !isPlaybackStalled else { return }
        backgroundLayer.correctTimelineDriftIfNeeded()
        forEachMediaLayer { $0.correctTimelineDriftIfNeeded() }
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
        let effectiveDuration = effectiveSlideTotalDuration
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
        // Closing de slide piloté par le playhead : l'état de sortie est
        // re-dérivé à chaque tick depuis `clamped` (aucune CAAnimation
        // autonome), donc pause / stall / seek restent frame-exacts.
        StoryRenderer.applyClosing(slide.effects.closing,
                                   rootLayer: rootLayer,
                                   elapsed: clamped,
                                   totalDuration: effectiveDuration)
        if clamped >= effectiveDuration {
            stopPlayback()
            if !completionFired {
                completionFired = true
                readerContext.onCompletion?()
            }
        }
    }
}
