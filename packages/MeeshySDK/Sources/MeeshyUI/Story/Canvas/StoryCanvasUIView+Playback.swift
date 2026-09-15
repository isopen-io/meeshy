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
            settlePlaybackHealthUnderUserPause()
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
              !isTimelinePreviewActive else { return }
        // Éditeur sonore (choix produit) : pose la session `.playback` pour que
        // l'audio des vidéos qui bouclent ET des clips audio soit audible même
        // silent-switch ON. Idempotent / call-aware via la source unique.
        if AVAudioSession.sharedInstance().category != .playback {
            MediaSessionCoordinator.shared.activatePlaybackSync(options: [.mixWithOthers, .duckOthers])
        }
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
        advancePlayheadIfActive(by: link.targetTimestamp - link.timestamp)
        // Le volume suit le playhead : posé APRÈS l'avancée, sinon l'automation
        // retarderait d'une image sur l'image affichée.
        applyVolumeAutomation(at: Float(currentTime.seconds))
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
        // Fresh grace window every time the link is (re)armed — opening the
        // composer, or reattaching after a cover/sheet dismiss — so a screen
        // that just appeared never idles down before the user gets a chance
        // to touch it (issue #3906).
        lastEditInteractionAt = CACurrentMediaTime()
        isEditClockThrottled = false
    }

    func stopEditDisplayLink() {
        editDisplayLink?.invalidate()
        editDisplayLink = nil
        isEditClockThrottled = false
    }

    @objc func editTick(_ link: CADisplayLink) {
        driveEditClock(now: link.timestamp)
    }

    /// Core of `editTick`, extracted so `_driveEditClockForTesting(now:)` can
    /// exercise the idle-throttle decision without spinning a real
    /// `CADisplayLink`.
    ///
    /// Issue #3906 — a screen nobody is touching (no gesture, no keystroke,
    /// no active playback) must not keep the display's high-refresh clock —
    /// nor the ambient edit-mode preview loop it drives — running forever.
    /// Idling down PAUSES `editDisplayLink` itself: once paused, no further
    /// tick arrives, so waking back up is entirely the job of
    /// `noteEditInteraction()`, called from every interaction entry point.
    func driveEditClock(now: CFTimeInterval) {
        let regime = EditClockThrottle.regime(now: now,
                                              lastInteractionAt: lastEditInteractionAt,
                                              isMediaActivelyPlaying: isEditMediaActivelyPlaying)
        guard regime == .full else {
            idleDownEditClock()
            return
        }
        // Gesture handlers drive their own rebuilds; the tick keeps the 120 Hz
        // clock alive on ProMotion while editing AND (WS2.1) re-feeds the glass
        // text backdrop so it tracks a playing video background between rebuilds.
        refreshEditGlassBackdropIfNeeded(now: now)
        // #4999 — et repose la pose des décorations animées sur les couches
        // déjà montées. Aucune reconstruction : la passe ne touche que la
        // transformation et l'opacité, et elle sort au premier `guard` quand la
        // scène ne porte aucune décoration animée — le cas courant.
        refreshStickerMotion(now: now)
    }

    /// `true` while a media clock genuinely needs `editDisplayLink` at full
    /// rate regardless of touch activity — currently only the timeline
    /// preview transport actually PLAYING (`StoryCanvasTimelineBridge
    /// .setPlaying(true)`). Deliberately excludes the ambient
    /// `playsVideoInEditMode` / `playsAudioInEditMode` loop: that loop is
    /// exactly what idling is meant to suspend (see `EditClockThrottle`).
    var isEditMediaActivelyPlaying: Bool {
        isTimelinePreviewActive && timelinePreviewPlaying
    }

    /// Feeds `EditClockThrottle`. Called by every gesture entry point
    /// (`gestureRecognizerShouldBegin`), by inline text edits
    /// (`textViewDidChange`), by the timeline-preview transport
    /// (`setTimelinePreview` / `setTimelinePreviewPlaying`) and by every
    /// real slide mutation while editing (`slide.didSet`). Resets the idle
    /// clock and, if the clock was throttled down, immediately restores full
    /// rate and resumes the suspended preview loop — an interaction must
    /// never wait out any part of the idle delay to feel responsive again.
    func noteEditInteraction() {
        lastEditInteractionAt = CACurrentMediaTime()
        guard isEditClockThrottled else { return }
        resumeEditClockFromIdle()
    }

    private func idleDownEditClock() {
        guard !isEditClockThrottled else { return }
        isEditClockThrottled = true
        editDisplayLink?.isPaused = true
        suspendEditModeMediaForIdle()
        onEditClockThrottleChanged?(true)
    }

    private func resumeEditClockFromIdle() {
        isEditClockThrottled = false
        editDisplayLink?.isPaused = false
        resumeEditModeMediaFromIdle()
        onEditClockThrottleChanged?(false)
    }

    /// Suspends the ambient edit-mode preview loop when the edit clock idles
    /// down: background + foreground video (`playsVideoInEditMode`) and the
    /// foreground/background audio mixer (`playsAudioInEditMode`). A SOFT
    /// pause — players stay attached, the mixer's schedule stays intact — so
    /// `resumeEditModeMediaFromIdle()` can restart in place with no reload
    /// and no audible restart-from-zero.
    func suspendEditModeMediaForIdle() {
        guard mode == .edit else { return }
        if playsVideoInEditMode {
            backgroundLayer.isPlaybackActive = false
            forEachAVPlayer { $0.pause() }
        }
        if playsAudioInEditMode {
            audioMixer.pause()
        }
    }

    /// Resumes the ambient edit-mode preview loop suspended by
    /// `suspendEditModeMediaForIdle()`. Reuses `applyEditPlayback()` for the
    /// video branch (idempotent — exactly what re-flipping
    /// `playsVideoInEditMode` already does) and calls `startEditAudioPlayback()`
    /// directly for audio: `reconfigureAudioForPlayback()` (which
    /// `applyEditPlayback()` also calls) is gated on `slideAudioRevision` and
    /// would no-op here since the composition hasn't changed — it would
    /// never actually resume the transport. Both no-op while a timeline
    /// preview owns the transport (`isTimelinePreviewActive`), by the same
    /// guards `applyEditPlayback()`/`startEditAudioPlayback()` already carry.
    func resumeEditModeMediaFromIdle() {
        guard mode == .edit else { return }
        applyEditPlayback()
        if playsAudioInEditMode {
            startEditAudioPlayback()
        }
    }

    /// Test-only seam: drives the idle-throttle decision exactly as
    /// `editTick` does, at an explicit timestamp, without spinning a real
    /// `CADisplayLink`.
    public func _driveEditClockForTesting(now: CFTimeInterval) {
        driveEditClock(now: now)
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
