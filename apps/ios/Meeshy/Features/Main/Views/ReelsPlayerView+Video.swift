import SwiftUI
import AVKit
import MeeshySDK
import MeeshyUI

// =============================================================================
//  Cluster VIDÉO des réels — extrait de `ReelsPlayerView.swift` (#4628)
// =============================================================================
//
//  Le fichier hôte faisait 1 969 lignes pour un budget de 800-1100 (`CLAUDE.md`
//  racine, § Code Style). La règle qui mord n'est pas le dépassement mais sa
//  conséquence : « Ajouter à un fichier déjà hors budget est INTERDIT : on
//  extrait d'abord, on ajoute ensuite. » Elle bloquait #3912, dont le site
//  d'assignation naturel (`ReelVideoView.drive()`) vit ici.
//
//  Trois types, un seul sujet — la vidéo d'un réel jouée par le moteur partagé :
//  la vue de page, sa surface `UIViewRepresentable`, et la `UIView` dont le
//  calque EST un `AVPlayerLayer`.
//
//  Ce que la découpe NE fait PAS : elle ne solde pas la dette. L'hôte descend à
//  ~1 711 lignes, toujours hors budget — les clusters IMAGE et AUDIO restent à
//  sortir, dans leur propre lot pour ne pas mêler un rangement à un déblocage.

// MARK: - Reel Video

/// Plays a reel video full-bleed through the single shared engine
/// (`SharedAVPlayerManager`). Because the manager holds one player, only the
/// active reel ever plays — moving to the next reel loads its URL and the
/// previous one is released. The poster (thumbHash → thumbnail) stays visible
/// underneath until the first frame is ready. Tap toggles play/pause.
/// `internal` (et non `private`) depuis la découpe : `ReelPageView` la monte
/// depuis `ReelsPlayerView.swift`, et `private` porte sur le FICHIER.
struct ReelVideoView: View {
    let media: FeedMedia
    let isActive: Bool
    /// Gate: the first reel's playback starts only once the liquid reveal disc
    /// has reached full screen. Until then the poster (first frame) stays
    /// visible PAUSED. Subsequent reels (paged to after the reveal) see this as
    /// already `true`, so they play normally.
    let revealCompleted: Bool

    // Plain reference (NOT @ObservedObject): only `player` identity and
    // `activeURL` matter for this page wrapper (backdrop + poster +
    // GeometryReader) — `ReelScrubBar` is the one view that legitimately needs
    // the 5-10Hz `currentTime` ticks. Observing the singleton here re-rendered
    // the WHOLE page on every tick. Scoped via onReceive($activeURL/$player).
    private let manager = SharedAVPlayerManager.shared
    @State private var activeURL: String = SharedAVPlayerManager.shared.activeURL
    @State private var player: AVPlayer?

    private var attachment: MeeshyMessageAttachment { media.toMessageAttachment() }
    private var isShowingThis: Bool {
        player != nil && activeURL == attachment.fileUrl
    }

    var body: some View {
        VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, _ in
            content(ready: availability == .ready)
        }
        .onReceive(manager.$activeURL) { activeURL = $0 }
        .onReceive(manager.$player) { player = $0 }
    }

    /// Ratio du média, 9:16 par défaut quand les dimensions manquent — le même
    /// repli que `ReelImageView.mediaAspect`, pour que poster et image ne
    /// puissent pas diverger sur un média sans dimensions.
    private var mediaAspect: CGFloat {
        guard let w = media.width, let h = media.height, w > 0, h > 0 else { return 9.0 / 16.0 }
        return CGFloat(w) / CGFloat(h)
    }

    /// La plus grande boîte au ratio du média qui tient dans `container`.
    /// Garde un conteneur nul (première passe de layout) en le rendant tel quel.
    private func posterFit(in container: CGSize) -> CGSize {
        guard container.width > 0, container.height > 0 else { return container }
        let containerAspect = container.width / container.height
        if mediaAspect > containerAspect {
            return CGSize(width: container.width, height: container.width / mediaAspect)
        }
        return CGSize(width: container.height * mediaAspect, height: container.height)
    }

    @ViewBuilder
    private func content(ready: Bool) -> some View {
        // GeometryReader reports the REAL finite allocated size; an explicit
        // `.frame(width:height:)` from it pins the video surface to the screen.
        // A layer-backed `UIViewRepresentable` otherwise reports the video's
        // aspect-fill intrinsic width (e.g. 1561pt for 16:9) and `.frame(maxWidth:
        // .infinity)` does NOT clamp it — that inflated the page ZStack to the
        // video width and pushed the action rail / info / scrub bar off-screen.
        GeometryReader { geo in
            ZStack {
                // Blurred ambient fill behind the `.fit` poster/video so the WHOLE
                // reel is visible (letterboxed), never cropped and never black
                // bars — mirrors the `.fit` image carousel (`ReelImageBackdrop`).
                ReelImageBackdrop(media: media).equatable()

                // Le poster est CADRÉ à la boîte du réel, jamais laissé
                // s'étendre (directive porteur 2026-08-30 : « le réel en plein
                // écran a en fond une image SANS FLOU »).
                //
                // `contentMode: .fit` ne suffisait pas : `ReelPoster` pose
                // ensuite `.frame(maxWidth: .infinity, maxHeight: .infinity)`,
                // et `ProgressiveCachedImage` n'a aucun ratio intrinsèque avant
                // le chargement — le poster prenait donc TOUTE la surface et
                // recouvrait le fond flou du thumbHash par le thumbnail NET.
                // Le fond ThumbHash était bien monté ; on ne le voyait pas.
                //
                // Même remède que le chemin IMAGE (`fittedSize(in:)` de
                // `ReelImageView`) : une frame explicite calculée depuis les
                // dimensions du média, qui laisse le fond flou visible autour.
                ReelPoster(thumbHash: media.thumbHash, url: media.thumbnailUrl ?? media.url, color: media.thumbnailColor, contentMode: .fit)
                    .equatable()
                    .frame(width: posterFit(in: geo.size).width, height: posterFit(in: geo.size).height)
                    .clipped()

                // Tap-to-pause is handled by the page-level tap zone (ReelPageView),
                // so this surface stays gesture-free to avoid swallowing scrub/rail
                // touches.
                if isActive, ready, isShowingThis, let player {
                    ReelVideoSurface(player: player, videoGravity: .resizeAspect, enablesPip: true)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                } else if isActive, !ready {
                    ProgressView()
                        .tint(.white)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
            .onAppear { drive(ready: ready) }
            .adaptiveOnChange(of: isActive) { _, active in
                // Page away → pause this reel's video at once (don't wait for the
                // delayed onDisappear during paging) so its sound doesn't bleed.
                if active { drive(ready: ready) }
                else if isShowingThis { manager.pause() }
            }
            .adaptiveOnChange(of: ready) { _, _ in drive(ready: ready) }
            .adaptiveOnChange(of: revealCompleted) { _, _ in drive(ready: ready) }
            // F3 — re-drive the video when a call ENDS. The call-start (true) edge
            // pauses via `ReelsPlayerView`'s `$callState` subscription; the
            // in-process WebRTC teardown posts no system interruption-ended, so a
            // reel opened during a call would stay frozen on its poster. `drive`
            // is gated on `!isCallActive` + a no-op once already playing.
            // `.receive(on: .main)` so `isCallActive` is already cleared when the
            // guard re-checks it.
            .onReceive(
                CallManager.shared.$callState
                    .map(\.isActive)
                    .removeDuplicates()
                    .receive(on: DispatchQueue.main)
            ) { callActive in
                if !callActive { drive(ready: ready) }
            }
            .onDisappear {
                // Releasing only when this page actually owns the engine avoids
                // tearing down the next reel that has already loaded during paging.
                //
                // `!revealCompleted` : NE PAS détruire l'engine sur le disappear
                // TRANSITOIRE de l'ouverture. À t≈duration le masque tombe
                // (`reelsRevealMasked → false`), ce qui fait basculer
                // `ReelsRevealMaskModifier` de `content.mask(...)` vers `content`
                // (branches d'identité différentes) → SwiftUI recrée cette vue.
                // Détruire ici le player qui vient de démarrer (playLead) forçait un
                // reload + `play()` depuis 0 → le réel jouait DEUX fois. La vraie
                // fermeture passe par `closeReels()` qui met `revealCompleted = false`
                // d'abord, donc le teardown légitime fire toujours.
                if isShowingThis, !revealCompleted { manager.stop() }
            }
        }
        .ignoresSafeArea()
    }

    /// **La langue que le rapport `watched` déclare (#3912).**
    ///
    /// `SharedAVPlayerManager.consumedLanguageProvider` était DÉCLARÉ (`:110`) et
    /// LU (`:412`), assigné nulle part — un contrat mort. Tout rapport de
    /// visionnage partait donc avec `language: nil`.
    ///
    /// **Ce n'est PAS le miroir du chemin audio**, et la différence décide de ce
    /// qu'il faut déclarer. `AudioPlayerView` publie une SÉLECTION : l'auditeur
    /// choisit une piste TTS traduite, et `"orig"` se résout en langue de
    /// transcription. La vidéo n'offre aucun choix — `drive()` charge
    /// `attachment.fileUrl`, l'ORIGINAL, sans condition ; la sélection de piste
    /// (`ReelPageView.resolvedAudioUrl`) ne sert que les réels AUDIO.
    ///
    /// Ce qu'un lecteur ENTEND sur une vidéo est donc la piste d'origine, et la
    /// seule source qui en connaisse la langue est sa TRANSCRIPTION. Ce n'est
    /// pas un pis-aller : `reel.originalLanguage` décrit la langue du POST — son
    /// texte — qui peut différer de ce qui est parlé dans la vidéo.
    ///
    /// Sans transcription, le fournisseur rend `nil` — et c'est exact : personne
    /// ne sait quelle langue a été entendue. Un `nil` qui dit « je ne sais pas »
    /// vaut mieux qu'une langue inventée depuis le texte du post.
    private func publishConsumedLanguage() {
        let spoken = Self.consumedLanguage(for: media)
        manager.consumedLanguageProvider = { spoken }
    }

    /// La résolution PURE, testable sans moteur ni vue — même patron que
    /// `ReelMediaAutostart.shouldStart` : ce qui se décide se décide dans une
    /// fonction qu'un témoin peut appeler.
    nonisolated static func consumedLanguage(for media: FeedMedia) -> String? {
        media.transcription?.language
    }

    private func drive(ready: Bool) {
        // Défense en profondeur call-aware (miroir de `ReelFeedVideoSurface.drive`) :
        // ne jamais (re)lancer un réel pendant un appel — la session audio appartient
        // à l'appel. La mise en pause immédiate au démarrage d'un appel est gérée par
        // l'abonnement `CallManager.$callState` dans `ReelsPlayerView`.
        guard isActive, ready, !MediaSessionCoordinator.shared.isCallActive else { return }
        if manager.activeURL != attachment.fileUrl {
            manager.load(urlString: attachment.fileUrl, attachmentId: media.id)
        }
        publishConsumedLanguage()
        // Le viewer plein écran joue TOUJOURS avec le son. La surface de fond du
        // feed (`ReelFeedVideoSurface`) exprime maintenant son silence via
        // `isForceMuted` (intention PAR SURFACE, transitoire) plutôt que la
        // préférence globale `isMuted` — elle se relâche d'elle-même en perdant
        // l'activité, mais on la réaffirme ici en défense en profondeur : sur
        // l'entrée depuis le feed pour la MÊME url, le court-circuit
        // `activeURL == fileUrl` ci-dessus saute `load()` (qui l'aurait sinon
        // réinitialisée via `cleanup()`), et l'ordre exact des transitions
        // `isActive` entre le feed et le viewer n'est pas garanti.
        manager.isForceMuted = false
        // `isMuted` reste réaffirmé inconditionnellement : c'est la préférence
        // utilisateur globale (persistée entre vidéos par design), mais le
        // viewer plein écran est le contexte où le son est TOUJOURS attendu.
        manager.isMuted = false
        // Looping MUST be (re)asserted AFTER `load()`. `load()` calls
        // `cleanup()` internally, which resets `shouldLoop = false`; setting it
        // before `load()` is silently clobbered, so the very first end-of-item
        // takes the tear-down branch and the reel never replays (the "scrub bar
        // dead after one play-through" bug). Re-asserting here every drive pass
        // also keeps it true across the reveal transition's disappear/reappear.
        manager.shouldLoop = true
        // Hold on the poster (PAUSED) until the liquid reveal completes; start
        // playback only when the disc has reached full screen.
        guard revealCompleted else { return }
        manager.play()
    }
}

/// Full-bleed video surface backed DIRECTLY by an `AVPlayerLayer` (not
/// `AVPlayerViewController`). A plain layer-backed `UIView` composites correctly
/// BENEATH the SwiftUI overlays in the ZStack; `AVPlayerViewController` instead
/// renders its video ABOVE same-level SwiftUI siblings, which was hiding the
/// action rail / info / scrub bar. The player is owned by `SharedAVPlayerManager`;
/// this only renders it. Mirrors the SDK's `_AVPlayerLayerView` (Story player).
/// `internal` (not `private`) so the feed-card surface (`ReelFeedVideoSurface`)
/// can reuse the same chrome-free render path for muted background playback.
struct ReelVideoSurface: UIViewRepresentable {
    let player: AVPlayer
    /// `.resizeAspectFill` (default) crops the video edge-to-edge — kept for the
    /// feed-card surface. The fullscreen viewer passes `.resizeAspect` so the
    /// WHOLE video is visible, letterboxed over the blurred ambient backdrop
    /// (mirrors the `.fit` image carousel — never a cropped reel).
    var videoGravity: AVLayerVideoGravity = .resizeAspectFill
    /// Le viewer plein écran opte pour le Picture-in-Picture : quitter l'app
    /// pendant la lecture bascule le réel en fenêtre PiP (auto-start système)
    /// au lieu de laisser sa bande-son jouer invisible en arrière-plan ;
    /// fermer la fenêtre arrête la vidéo. La surface muette du feed
    /// (`ReelFeedVideoSurface`) reste hors PiP — un autoplay silencieux ne
    /// doit jamais ouvrir de fenêtre.
    var enablesPip: Bool = false

    func makeUIView(context: Context) -> ReelPlayerLayerView {
        let view = ReelPlayerLayerView()
        // Transparent (was black): under `.resizeAspect` the letterbox bars must
        // reveal the blurred backdrop behind the surface, not a black band.
        view.backgroundColor = .clear
        view.playerLayer.player = player
        view.playerLayer.videoGravity = videoGravity
        if enablesPip {
            SharedAVPlayerManager.shared.configurePip(playerLayer: view.playerLayer)
        }
        return view
    }

    func updateUIView(_ view: ReelPlayerLayerView, context: Context) {
        if view.playerLayer.player !== player {
            view.playerLayer.player = player
        }
        if view.playerLayer.videoGravity != videoGravity {
            view.playerLayer.videoGravity = videoGravity
        }
        if enablesPip {
            // Idempotent (garde d'identité de layer dans `configurePip`) —
            // ré-attache après le remount que provoque la chute du masque de
            // reveal (`ReelsRevealMaskModifier` change de branche d'identité).
            SharedAVPlayerManager.shared.configurePip(playerLayer: view.playerLayer)
        }
    }

    /// Pin the surface to the proposed size. Without this a layer-backed
    /// `UIViewRepresentable` reports the video's aspect-fill intrinsic size,
    /// inflating the enclosing ZStack and pushing the SwiftUI overlays off-screen.
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: ReelPlayerLayerView, context: Context) -> CGSize? {
        proposal.replacingUnspecifiedDimensions()
    }
}

/// Layer-backed `UIView` whose backing layer IS an `AVPlayerLayer` — GPU-composited
/// video that respects SwiftUI ZStack z-ordering (overlays stay on top).
/// `internal` (not `private`) because the now-`internal` `ReelVideoSurface`
/// exposes it through its representable methods (shared with `ReelFeedVideoSurface`).
final class ReelPlayerLayerView: UIView {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    override static var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}
