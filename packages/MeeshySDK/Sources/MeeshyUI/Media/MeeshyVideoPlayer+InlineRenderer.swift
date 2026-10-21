import SwiftUI
import AVFoundation
import MeeshySDK

// MARK: - Inline Renderer
//
// Plays through `SharedAVPlayerManager` (single active inline at a time).
// While playing the surface fills the bubble area — no `Color.black` letterbox
// underneath because the aspect-ratio constraint matches the video natively
// (height = width × min(1/ratio, maxAspectRatio)). The overlay controls are
// drawn ON the video as a layered top/center/bottom stack (legacy parity
// with `VideoPlayerOverlayControls`).

internal struct _InlineRenderer: View {
    let player: MeeshyVideoPlayer

    @State private var showControls: Bool = true
    @State private var controlsTimer: Timer?
    /// Référence NUE (PAS `@ObservedObject`) : ce renderer existe par vidéo
    /// montée — bulles, cartes du fil, commentaires, rangées Focal, détail de
    /// post — et le moteur republie `currentTime` toutes les 200 ms (battement
    /// thermique). `@ObservedObject` s'abonne à l'OBJET, pas aux champs lus :
    /// dès qu'UNE vidéo jouait, toutes ces vues se réévaluaient cinq fois par
    /// seconde, y compris celles qui n'affichent qu'une vignette. Le
    /// `.equatable()` du parent n'y pouvait rien — l'invalidation naissait ICI.
    ///
    /// Les quatre champs réellement lus sont MIROITÉS ci-dessous, chacun par
    /// son `.onReceive`. Même discipline que `ReelFeedVideoSurface`, écrite
    /// pour la même raison (#6226).
    ///
    /// Les APPELS (`load`, `play`, `release`, `stop`) passent toujours par
    /// `manager` : une méthode n'exige aucun abonnement, et un miroir n'est
    /// pas encore à jour à l'instruction qui suit l'appel.
    private let manager = SharedAVPlayerManager.shared
    @State private var activeURL: String = SharedAVPlayerManager.shared.activeURL
    @State private var enginePlayer: AVPlayer? = SharedAVPlayerManager.shared.player
    @State private var engineDuration: Double = SharedAVPlayerManager.shared.duration
    @State private var engineIsMuted: Bool = SharedAVPlayerManager.shared.isMuted
    @State private var engineIsPipActive: Bool = SharedAVPlayerManager.shared.isPipActive

    /// Aspect ratio DISPLAY (post-rotation) résolu async depuis le
    /// `preferredTransform` de l'AVAsset (priorité 1 une fois en cache).
    @State private var displayAspectRatio: CGFloat?

    /// Aspect ratio extrait du thumbnail PNG cached (priorité 2). Synchrone à
    /// la résolution UIImage cache. Le thumbnail est pré-tourné backend → son
    /// ratio reflète l'orientation d'affichage attendue.
    @State private var thumbnailAspectRatio: CGFloat?

    /// Le verdict est celui du MOTEUR (#9575) : une surface en ligne ne monte
    /// pas le lecteur tant que la fenêtre PiP le joue — elle rend sa vignette.
    private var isThisActive: Bool {
        enginePlayer != nil && SharedAVPlayerManager.mayMountPlayer(
            role: .inline,
            surfaceMedia: player.attachment.fileUrl,
            activeMedia: activeURL,
            isPipActive: engineIsPipActive)
    }

    /// Ratio source-de-vérité unique pour cette bulle. Ordre de priorité :
    /// 1. `displayAspectRatio` — résolu via `AVAsset.preferredTransform` ou
    ///    `VideoDisplayAspectCache` (instantané pour les vidéos déjà vues).
    /// 2. `thumbnailAspectRatio` — natural size du PNG thumbnail (synchrone
    ///    quand l'image est dans le cache mémoire/disque).
    /// 3. `attachment.videoAspectRatio` — metadata storage (peut être en
    ///    paysage rotation 90° pour les vidéos portrait shootées iPhone).
    /// 4. Fallback final : 16:9.
    private var bubbleAspectRatio: CGFloat {
        displayAspectRatio
            ?? thumbnailAspectRatio
            ?? player.attachment.videoAspectRatio
            ?? (16.0 / 9.0)
    }

    /// True quand le surface est mountée mais l'AVPlayerItem n'a pas encore
    /// chargé la durée — proxy pour "buffering / asset loading". Une fois
    /// `engineDuration > 0`, AVPlayer connait la duration de l'asset et
    /// rend ses premières frames.
    private var isLoadingAsset: Bool {
        isThisActive && engineDuration <= 0
    }

    var body: some View {
        // `.aspectRatio(.fit)` est posé au niveau du ZStack OUTER : c'est la
        // seule contrainte qui drive la taille de la bulle, identique entre
        // les branches thumbnail et active. `Color.black` en premier enfant
        // garantit que le ZStack assert une taille même quand les autres
        // enfants n'ont pas d'intrinsic size (MeeshyVideoSurface est un
        // UIViewRepresentable sans intrinsic, _InlineOverlayControls n'a pas
        // de frame explicite). Le ratio outer + le sizeThatFits override sur
        // MeeshyVideoSurface garantissent que la surface accepte exactement
        // la frame proposée par le ratio, sans retomber sur la naturalSize
        // de l'AVPlayerLayer.
        ZStack {
            Color.black

            if isThisActive, let p = enginePlayer {
                MeeshyVideoSurface(
                    player: p,
                    gravity: .resizeAspect,
                    isMuted: engineIsMuted,
                    enablesPip: MeeshyVideoPlayer.surfaceEnablesPip(style: .inline, controls: player.controls)
                )
                    .onTapGesture { handleSurfaceTap() }
                if isLoadingAsset {
                    loadingIndicator
                }
                if showControls {
                    _InlineOverlayControls(
                        manager: manager,
                        accentColor: player.accentColor,
                        controls: player.controls,
                        onExpand: player.onExpand
                    )
                    .transition(.opacity)
                }
            } else {
                MeeshyVideoThumbnail(
                    attachment: player.attachment,
                    accentColor: player.accentColor,
                    showPlayBadge: false,
                    showDurationBadge: player.controls.contains(.duration),
                    onTap: surfaceTapAction == .expand ? player.onExpand : nil
                )
                playButton
            }
        }
        .aspectRatio(bubbleAspectRatio, contentMode: .fit)
        .onReceive(manager.$activeURL) { activeURL = $0 }
        .onReceive(manager.$player) { enginePlayer = $0 }
        .onReceive(manager.$duration) { engineDuration = $0 }
        .onReceive(manager.$isMuted) { engineIsMuted = $0 }
        .onReceive(manager.$isPipActive) { engineIsPipActive = $0 }
        .applyVideoFrame(player.frame)
        .task(id: player.attachment.fileUrl) {
            // Lance les deux résolutions en parallèle. La plus rapide (le
            // thumbnail cache hit) sert de fallback temporaire pendant que
            // l'AVAsset résout son `preferredTransform`.
            async let thumb: Void = resolveThumbnailAspectRatio()
            async let display: Void = resolveDisplayAspectRatio()
            _ = await (thumb, display)
        }
        .adaptiveOnChange(of: isThisActive) { _, nowActive in
            if nowActive {
                // Auto-hide les contrôles 3s après que la lecture démarre, sinon
                // ils restent superposés et masquent la vidéo.
                showControls = true
                scheduleControlsHide()
            } else {
                showControls = true
                controlsTimer?.invalidate()
                controlsTimer = nil
            }
        }
        .onAppear { autoplayIfNeeded() }
        // WS3.7 / F1 — autoplay must ALSO fire when availability flips to `.ready`
        // after first appear. On a cold cache `VideoAvailabilityResolver` mounts
        // this renderer at `.needsDownload/.downloading`; `.onAppear` then fires
        // too early (asset not ready) and never refires when the resolver flips
        // `player.availability` to `.ready` (the view identity is unchanged). Key
        // the retry on that exact value — the resolver re-inits `MeeshyVideoPlayer`
        // with the new availability, so `player.availability` is the observable
        // that changes. `autoplayIfNeeded`'s `!isThisActive` guard prevents a
        // double-start. Mirrors the reel path's `adaptiveOnChange(of: ready)`.
        .adaptiveOnChange(of: player.availability) { _, _ in autoplayIfNeeded() }
        .onDisappear { teardown() }
        .animation(.easeInOut(duration: 0.2), value: showControls)
        .animation(.easeInOut(duration: 0.15), value: isThisActive)
        .animation(.easeInOut(duration: 0.2), value: isLoadingAsset)
    }

    /// Spinner subtle teinté accent — visible uniquement pendant le chargement
    /// initial de l'asset (avant que la première frame ne soit rendue).
    /// `ultraThinMaterial` derrière pour ne pas masquer le contenu vidéo si
    /// jamais une preview frame s'affiche en arrière-plan.
    private var loadingIndicator: some View {
        ZStack {
            Circle().fill(.ultraThinMaterial).frame(width: 48, height: 48)
            ProgressView()
                .tint(Color(hex: player.accentColor))
                .scaleEffect(1.2)
        }
        .transition(.opacity)
    }

    /// Charge l'AVAsset et applique son `preferredTransform` à la `naturalSize`
    /// pour obtenir l'orientation d'affichage réelle. Couvre le cas iPhone
    /// portrait stocké en paysage + rotation 90°. Consulte d'abord le cache
    /// session-scope avant de toucher au disque.
    @MainActor
    private func resolveDisplayAspectRatio() async {
        guard displayAspectRatio == nil else { return }
        let urlKey = player.attachment.fileUrl
        if let cached = await VideoDisplayAspectCache.shared.ratio(for: urlKey) {
            displayAspectRatio = cached
            return
        }
        guard let url = MeeshyConfig.resolveMediaURL(urlKey) else { return }
        let asset = AVURLAsset(url: url)
        do {
            let tracks = try await asset.loadTracks(withMediaType: .video)
            guard let track = tracks.first else { return }
            let naturalSize = try await track.load(.naturalSize)
            let transform = try await track.load(.preferredTransform)
            let display = naturalSize.applying(transform)
            let w = abs(display.width)
            let h = abs(display.height)
            guard w > 0, h > 0 else { return }
            let ratio = w / h
            displayAspectRatio = ratio
            await VideoDisplayAspectCache.shared.store(ratio, for: urlKey)
        } catch {
            // Le fallback `thumbnailAspectRatio → attachment.videoAspectRatio
            // → 16/9` reste actif.
        }
    }

    /// Récupère le thumbnail PNG depuis `CacheCoordinator.images` (mémoire
    /// puis disque) et extrait son natural size comme hint synchrone pour
    /// `bubbleAspectRatio`. Si le thumbnail n'est pas encore en cache, no-op
    /// (ProgressiveCachedImage le téléchargera en parallèle et l'app verra
    /// le ratio se mettre à jour quand le thumbnail finit de loader plus
    /// tard via la résolution AVAsset).
    @MainActor
    private func resolveThumbnailAspectRatio() async {
        guard thumbnailAspectRatio == nil else { return }
        guard let thumbUrl = player.attachment.thumbnailUrl, !thumbUrl.isEmpty else { return }
        let image = await CacheCoordinator.shared.images.image(for: thumbUrl)
        guard let size = image?.size, size.width > 0, size.height > 0 else { return }
        thumbnailAspectRatio = size.width / size.height
    }

    /// Facteur d'échelle des glyphes/anneau du bouton play, dérivé du diamètre
    /// opaque `playButtonDiameter` (référence historique : 64pt).
    private var playButtonScale: CGFloat { player.playButtonDiameter / 64 }

    private var playButton: some View {
        Button(action: handlePlayTap) {
            ZStack {
                Circle().fill(.ultraThinMaterial)
                Circle().fill(Color(hex: player.accentColor).opacity(0.55))
                playButtonContent
                downloadProgressRing
            }
            .frame(width: player.playButtonDiameter, height: player.playButtonDiameter)
            .overlay(Circle().stroke(Color.white.opacity(0.22), lineWidth: 0.8))
            .shadow(color: Color(hex: player.accentColor).opacity(0.45), radius: 12, y: 4)
        }
        .accessibilityLabel(playButtonAccessibilityLabel)
        .disabled(isDownloading)
    }

    @ViewBuilder
    private var playButtonContent: some View {
        switch player.availability {
        case .ready:
            Image(systemName: "play.fill")
                .font(.system(size: 22 * playButtonScale, weight: .bold))
                .foregroundColor(.white)
                .offset(x: 2 * playButtonScale)
        case .needsDownload:
            VStack(spacing: MeeshySpacing.xxs) {
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: 22 * playButtonScale, weight: .bold))
                    .foregroundColor(.white)
                if player.attachment.fileSize > 0 {
                    Text(formatSize(Int64(player.attachment.fileSize)))
                        .font(.system(size: 9 * playButtonScale, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.9))
                }
            }
        case .downloading(let progress):
            VStack(spacing: MeeshySpacing.xxs) {
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: 16 * playButtonScale, weight: .bold))
                    .foregroundColor(.white.opacity(0.6))
                if progress > 0 {
                    Text("\(Int(progress * 100))%")
                        .font(.system(size: 10 * playButtonScale, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                } else {
                    ProgressView().tint(.white).scaleEffect(0.6 * playButtonScale)
                }
            }
        }
    }

    @ViewBuilder
    private var downloadProgressRing: some View {
        if case .downloading(let progress) = player.availability {
            Circle()
                .trim(from: 0, to: progress > 0 ? progress : 0.05)
                .stroke(Color.white, style: StrokeStyle(lineWidth: 3 * playButtonScale, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: player.playButtonDiameter - 4, height: player.playButtonDiameter - 4)
                .animation(.linear(duration: 0.2), value: progress)
        }
    }

    private var isDownloading: Bool {
        if case .downloading = player.availability { return true }
        return false
    }

    private var playButtonAccessibilityLabel: String {
        switch player.availability {
        case .ready:         return String(localized: "media.video.play", defaultValue: "Lire la vidéo", bundle: .module)
        case .needsDownload: return String(localized: "media.video.download", defaultValue: "Télécharger la vidéo", bundle: .module)
        case .downloading:   return String(localized: "media.video.downloading", defaultValue: "Téléchargement en cours", bundle: .module)
        }
    }

    private func formatSize(_ bytes: Int64) -> String {
        let kb = Double(bytes) / 1024
        if kb < 1 { return "\(bytes)B" }
        if kb < 1024 { return String(format: "%.0fKB", kb) }
        return String(format: "%.1fMB", kb / 1024)
    }

    private func handlePlayTap() {
        switch player.availability {
        case .ready:
            startPlayback()
        case .needsDownload:
            player.onDownload?()
            HapticFeedback.light()
        case .downloading:
            break
        }
    }

    private func startPlayback() {
        HapticFeedback.light()
        // `attachmentId` MUST be the `load()` argument, not set beforehand —
        // `load()` calls `cleanup()` internally, which wipes `attachmentId` to
        // `nil` before the new value could apply. Passing it as a parameter
        // (applied AFTER `cleanup()`) is what keeps `reportWatchProgress`
        // firing. See `SharedAVPlayerManagerAttachmentTrackingTests`.
        if player.reportsConsumption {
            manager.load(urlString: player.attachment.fileUrl, attachmentId: player.attachment.id)
            // Reposée APRÈS `load()` — qui appelle `cleanup()` — et clé par la pièce
            // jointe qu'elle qualifie : ce moteur est partagé (#7212).
            manager.setServedConsumption(player.attachment.currentUserConsumption, for: player.attachment.id)
        } else {
            manager.load(urlString: player.attachment.fileUrl)
        }
        manager.play()
        scheduleControlsHide()
    }

    /// Pure autoplay-on-appear decision (WS3.7). Autoplay only when the opaque
    /// opt-in is set AND the asset is ready AND the view is on-screen AND no call
    /// owns the audio session. Extracted `static` so the contract is unit-testable
    /// without a SwiftUI render lifecycle.
    static func shouldAutoplayOnAppear(
        autoplayOnAppear: Bool,
        isReady: Bool,
        isOnScreen: Bool,
        isCallActive: Bool
    ) -> Bool {
        autoplayOnAppear && isReady && isOnScreen && !isCallActive
    }

    private func autoplayIfNeeded() {
        let isReady: Bool = { if case .ready = player.availability { return true }; return false }()
        guard Self.shouldAutoplayOnAppear(
            autoplayOnAppear: player.autoplayOnAppear,
            isReady: isReady,
            isOnScreen: true,
            isCallActive: MediaSessionCoordinator.shared.isCallActive
        ) else { return }
        // No-op if this attachment is already the active inline playback (avoids
        // restarting on a re-appear after the surface was already driving).
        guard !isThisActive else { return }
        // F5 — the mute intent is an opaque param: the SDK applies it, the app
        // decides it. PostDetailView passes `autoplayMuted: false` (detail = sound
        // on); the default `false` keeps the historical unmute-on-autoplay. The
        // product mute decision stays app-side (SDK purity).
        manager.isMuted = player.autoplayMuted
        startPlayback()
    }

    private func teardown() {
        controlsTimer?.invalidate(); controlsTimer = nil
        // Release plutôt que pause : sans ça, `manager.player` + `activeURL`
        // restent câblés sur cette URL après scroll out. Au scroll back,
        // `isThisActive` redevient vrai et la surface remonte sur la dernière
        // frame jouée — l'utilisateur voit une image figée au lieu du
        // thumbnail. `release(urlString:)` est URL-gated (no-op si une autre
        // bulle a pris la main entre temps), donc safe.
        //
        // Note SwiftUI : `.onDisappear` ne fire pas quand un `fullScreenCover`
        // se présente au-dessus de la conversation — la cellule reste mountée
        // sous le cover. Donc ouvrir le fullscreen ne déclenche pas ce release.
        manager.release(urlString: player.attachment.fileUrl)
    }

    /// Ce que fait un toucher sur la vidéo HORS de ses contrôles.
    nonisolated enum SurfaceTapAction: Equatable, Sendable {
        case toggleControls
        case expand
    }

    /// Décision pure (#8231) : le plein écran n'est choisi que si l'appelant
    /// le demande ET fournit l'hôte qui le présente — sinon le toucher ne
    /// ferait rien, pire que son effet historique.
    nonisolated static func surfaceTapAction(surfaceTapExpands: Bool, hasExpandHandler: Bool) -> SurfaceTapAction {
        surfaceTapExpands && hasExpandHandler ? .expand : .toggleControls
    }

    /// Quand le toucher ouvre le plein écran, il ne peut plus faire revenir
    /// des contrôles masqués : ils restent donc à l'écran, sans quoi pause et
    /// son deviendraient inatteignables pendant la lecture.
    nonisolated static func autoHidesControls(surfaceTapAction: SurfaceTapAction) -> Bool {
        surfaceTapAction == .toggleControls
    }

    private var surfaceTapAction: SurfaceTapAction {
        Self.surfaceTapAction(surfaceTapExpands: player.surfaceTapExpands,
                              hasExpandHandler: player.onExpand != nil)
    }

    private func handleSurfaceTap() {
        switch surfaceTapAction {
        case .expand:
            HapticFeedback.light()
            player.onExpand?()
        case .toggleControls:
            toggleControls()
        }
    }

    private func toggleControls() {
        showControls.toggle()
        if showControls { scheduleControlsHide() }
    }

    private func scheduleControlsHide() {
        guard Self.autoHidesControls(surfaceTapAction: surfaceTapAction) else { return }
        controlsTimer?.invalidate()
        controlsTimer = Timer.scheduledTimer(withTimeInterval: FullscreenChromeMetrics.autoHideDelay, repeats: false) { _ in
            Task { @MainActor in
                withAnimation { showControls = false }
            }
        }
    }
}
