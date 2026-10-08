import UIKit
@preconcurrency import AVFoundation
import MeeshySDK

// MARK: - App Lifecycle

extension StoryBackgroundLayer {

    /// Attache un AVPlayer pour une URL vidéo. Factorisé pour les trois chemins :
    /// `file://` (composer / cache disque déjà téléchargé), cache disque chaud,
    /// et URL distante HTTPS streamée en direct. `AVPlayerItem(url:)` gère les
    /// trois — pour une URL distante, `AVPlayer` fait du progressive/range
    /// loading (premier frame en ~centaines de ms) et le cache disque se peuple
    /// en arrière-plan via le caller. NE PAS bloquer sur un download intégral
    /// avant d'appeler ceci (régression 2026-05-20 → grosses stories injouables
    /// sur réseau device).
    @MainActor
    func attachBackgroundPlayer(url: URL, looping: Bool, mute: Bool, fitOverride: String? = nil) {
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = 2.0
        if looping {
            let queuePlayer = AVQueuePlayer()
            // Fond de canvas en boucle : décor, jamais un contenu regardé (#6221).
            queuePlayer.preventsDisplaySleepDuringVideoPlayback = false
            self.avPlayerLooper = AVPlayerLooper(player: queuePlayer, templateItem: item)
            self.avPlayer = queuePlayer
        } else {
            self.avPlayer = providedCarrierPlayer() ?? AVPlayer(playerItem: item)
        }
        // Le paramètre `mute` reste pris en compte pour compat avec les call
        // sites existants (renderer), mais on respecte aussi l'état dynamique
        // `self.isMuted` mis à jour par le canvas. Le OR garantit que si l'un
        // OU l'autre demande mute, le player démarre silencieux ; le toggle
        // unmute du sidebar passera ensuite par `isMuted.didSet`.
        self.avPlayer?.isMuted = mute || self.isMuted
        // Volume explicite : le player est recréé à chaque re-attache (cache
        // LRU), il faut donc lui réappliquer la valeur courante de la couche —
        // et surtout pas un 1.0 codé en dur, qui rendait le réglage de l'auteur
        // inopérant sur toute vidéo de fond.
        self.avPlayer?.volume = self.volume
        // Defensive : assurer la catégorie `.playback` avant de jouer. La
        // session est normalement déjà `.playback` (via `StoryMediaCoordinator
        // .activate` sync depuis `onAppear`), mais le re-attach peut intervenir
        // entre un retour foreground et l'activation `MediaSessionCoordinator`
        // — sans cette ligne, la vidéo joue sous `.ambient` et reste silencieuse
        // en mode silent (simulator OU device avec switch).
        // Pose la session de lecture via la source UNIQUE (call-aware) si pas déjà
        // `.playback` — idempotent, no-op pendant un appel (micro préservé).
        if AVAudioSession.sharedInstance().category != .playback {
            MediaSessionCoordinator.shared.activatePlaybackSync(options: [.mixWithOthers, .duckOthers])
        }
        let pl = AVPlayerLayer(player: avPlayer)
        pl.frame = bounds
        // Initial gravity: aspectFill as fallback until naturalSize loads.
        // If override is set, apply immediately.
        pl.videoGravity = {
            if let o = fitOverride {
                return o == "fit" ? .resizeAspect : .resizeAspectFill
            }
            return .resizeAspectFill
        }()
        Self.withDisabledCAActions {
            addSublayer(pl)
        }
        self.avPlayerLayer = pl

        // Async resolve naturalSize to refine gravity once available.
        // `[weak pl]` so we don't strand the AVPlayerLayer alive if the bg is
        // re-attached (slide change / configure() with different kind) between
        // the Task launch and the asset load completion.
        let canvasSize = self.bounds.size
        let asset = AVURLAsset(url: url)
        attachedVideoAsset = asset
        Task { @MainActor [weak self, weak pl] in
            guard self != nil else { return }
            let tracks: [AVAssetTrack]
            if #available(iOS 16.0, *) {
                tracks = (try? await asset.loadTracks(withMediaType: .video)) ?? []
            } else {
                tracks = asset.tracks(withMediaType: .video)
            }
            guard let videoTrack = tracks.first else { return }
            let naturalSize: CGSize
            if #available(iOS 16.0, *) {
                naturalSize = (try? await videoTrack.load(.naturalSize)) ?? .zero
            } else {
                naturalSize = videoTrack.naturalSize
            }
            guard naturalSize.width > 0, naturalSize.height > 0 else { return }
            guard let pl else { return }
            let resolved = StoryBackgroundLayer.resolveVideoGravity(
                naturalSize: naturalSize, canvasSize: canvasSize, override: fitOverride)
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            pl.videoGravity = resolved
            CATransaction.commit()
        }
        // IMPORTANT — on n'appelle PLUS `play()` ici inconditionnellement.
        // `attachBackgroundPlayer` peut être invoqué depuis un canvas en
        // `.edit` mode (prefetcher, composer preview), auquel cas démarrer
        // la lecture leakerait l'audio d'une story qui n'est PAS encore à
        // l'écran (« vidéo joue avant son tour »). C'est désormais le canvas
        // qui décide via `isPlaybackActive` (drapeau levé en mode `.play`).
        // La vidéo prefetchée reste prête à jouer instantanément sans
        // gaspiller le décodeur audio.
        if isPlaybackActive {
            alignToTimelineThenPlay()
        }

        // La boucle d'un fond bouclé est l'affaire de l'`AVPlayerLooper` seul
        // (#9702) : il joue des COPIES de `item`, jamais `item` lui-même. Un
        // observateur de fin posé sur ce gabarit ne tirait donc jamais — et
        // s'il avait tiré, son `seek(.zero)` + `play()` aurait ouvert le trou
        // que le looper existe pour éviter.

        // Les réglages du fond (#9496) : posés sur l'item dès l'attache, comme
        // à chaque changement de curseur.
        applyBackgroundVideoLook()
        onPlayerAttached?()
    }

    /// Le player que le chemin de LECTURE porte déjà pour ce média de fond, ou
    /// `nil` — auquel cas la couche ouvre le sien (composition, prefetch).
    @MainActor
    func providedCarrierPlayer() -> AVPlayer? {
        guard let identity = Self.mediaIdentity(for: kind),
              let provided = playerProvider?.player(for: identity),
              provided.currentItem != nil else { return nil }
        return provided
    }

    /// Identité du média porté par ce fond — la clé du fournisseur (O16).
    nonisolated static func mediaIdentity(for kind: Kind) -> String? {
        switch kind {
        case .image(let postMediaId, _):      return postMediaId
        case .video(let postMediaId, _, _, _): return postMediaId
        case .solidColor, .gradient:          return nil
        }
    }

    /// Cale la vidéo de fond sur le playhead unifié puis lance la lecture.
    ///
    /// On ne cale QUE les fonds **non loopés** (`avPlayerLooper == nil`, clip ≥
    /// durée du slide) : leur temps interne doit suivre le playhead, donc une
    /// ouverture/scrub à `t>0` les positionne correctement. Un fond **loopé**
    /// remplit la durée du slide et sa phase exacte n'a aucun sens timeline — le
    /// recaler risquerait un saut visible sur un resume en place, donc on le
    /// laisse boucler librement. `seek` uniquement au-delà du seuil de dérive
    /// (resume déjà aligné / bascule plein écran = aucun saut).
    @MainActor
    func alignToTimelineThenPlay() {
        guard let player = avPlayer else { return }
        if avPlayerLooper == nil {
            let target = max(0, slidePlayheadSeconds)
            let current = player.currentTime().seconds
            if target.isFinite, current.isFinite,
               abs(current - target) > Self.timelineSeekDriftThreshold {
                player.seek(to: CMTime(seconds: target, preferredTimescale: 600),
                            toleranceBefore: .zero, toleranceAfter: .zero)
            }
        }
        player.play()
    }

    /// Recale un fond NON bouclé qui a dérivé de la timeline au-delà du seuil
    /// PENDANT la lecture (#9702) — le calage n'avait lieu qu'au démarrage et
    /// à la reprise. Appelé par le canvas toutes les ~0,5 s. Un fond bouclé
    /// n'a pas de phase timeline (cf. `alignToTimelineThenPlay`).
    @MainActor
    func correctTimelineDriftIfNeeded() {
        guard isPlaybackActive, avPlayerLooper == nil,
              let player = avPlayer,
              player.timeControlStatus == .playing,
              let target = VideoDriftCorrection.driftCorrection(
                  expected: max(0, slidePlayheadSeconds),
                  actual: player.currentTime().seconds,
                  threshold: Self.timelineSeekDriftThreshold) else { return }
        player.seek(to: target,
                    toleranceBefore: VideoDriftCorrection.seekTolerance,
                    toleranceAfter: VideoDriftCorrection.seekTolerance)
    }

    /// Scrub de preview timeline : pause puis cale le player de fond sur le
    /// playhead unifié avec une tolérance large. Même règle que
    /// `alignToTimelineThenPlay` pour un fond bouclé (`avPlayerLooper`) : sa
    /// phase n'a aucun sens timeline, on le fige sans le recaler.
    @MainActor
    public func alignPausedToSlidePlayhead() {
        guard let player = avPlayer else { return }
        player.pause()
        guard avPlayerLooper == nil else { return }
        let target = max(0, slidePlayheadSeconds)
        guard target.isFinite else { return }
        let tolerance = CMTime(seconds: 0.05, preferredTimescale: 600)
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600),
                    toleranceBefore: tolerance, toleranceAfter: tolerance)
    }

    @MainActor
    public func handleAppLifecycle(active: Bool) {
        guard let player = avPlayer else { return }
        if active {
            // Reprise gated sur l'autorisation canonique : un retour
            // foreground ne doit JAMAIS relancer un player dont la lecture
            // n'est pas active (canvas détaché/retenu, prefetcher, viewer
            // fermé). Sans ce guard, la dernière story jouée reprenait son
            // audio à la réouverture de l'app, sans aucun viewer à l'écran
            // (bug user 2026-06-11) — violation de l'invariant « seuls les
            // audios de conversation ou le PiP jouent hors de leur vue ».
            guard isPlaybackActive else { return }
            player.play()
        } else {
            player.pause()
        }
    }
}
