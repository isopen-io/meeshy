import SwiftUI
import AVFoundation
import MeeshySDK

// MARK: - Flat Renderer

/// Renders a `.flat` style player : no chrome, autoplay + loop + muted.
/// Used for SwiftUI previews of story foreground/background hors canvas.
/// In the canvas itself, `MeeshyVideoCanvasLayer` is used directly.
internal struct _FlatRenderer: View {
    let player: MeeshyVideoPlayer

    @State private var avPlayer: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?
    @State private var aspectRatio: CGFloat?

    var body: some View {
        ZStack {
            Color.black
            if let p = avPlayer {
                MeeshyVideoSurface(player: p, gravity: .resizeAspectFill, isMuted: true)
            }
        }
        .aspectRatio(player.frame.maxAspectRatio == nil ? aspectRatio : nil, contentMode: .fit)
        .applyVideoFrame(player.frame)
        .onAppear { setup() }
        .onDisappear { teardown() }
    }

    private func setup() {
        guard avPlayer == nil,
              let url = MeeshyConfig.resolveMediaURL(player.attachment.fileUrl) else { return }
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = player.performance.preferredForwardBufferDuration
        let queue = AVQueuePlayer(playerItem: item)
        queue.isMuted = true
        queue.automaticallyWaitsToMinimizeStalling = player.performance.waitsToMinimizeStalling
        looper = AVPlayerLooper(player: queue, templateItem: item)
        avPlayer = queue
        aspectRatio = player.attachment.videoAspectRatio
        queue.playImmediately(atRate: 1.0)
    }

    private func teardown() {
        looper?.disableLooping()
        looper = nil
        avPlayer?.pause()
        avPlayer = nil
    }
}

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
    @ObservedObject private var manager = SharedAVPlayerManager.shared

    /// Aspect ratio DISPLAY (post-rotation) résolu async depuis le
    /// `preferredTransform` de l'AVAsset (priorité 1 une fois en cache).
    @State private var displayAspectRatio: CGFloat?

    /// Aspect ratio extrait du thumbnail PNG cached (priorité 2). Synchrone à
    /// la résolution UIImage cache. Le thumbnail est pré-tourné backend → son
    /// ratio reflète l'orientation d'affichage attendue.
    @State private var thumbnailAspectRatio: CGFloat?

    private var isThisActive: Bool {
        manager.activeURL == player.attachment.fileUrl && manager.player != nil
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
    /// `manager.duration > 0`, AVPlayer connait la duration de l'asset et
    /// rend ses premières frames.
    private var isLoadingAsset: Bool {
        isThisActive && manager.duration <= 0
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

            if isThisActive, let p = manager.player {
                MeeshyVideoSurface(
                    player: p,
                    gravity: .resizeAspect,
                    isMuted: manager.isMuted,
                    enablesPip: Self.surfaceEnablesPip(controls: player.controls)
                )
                    .onTapGesture { toggleControls() }
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
                    showDurationBadge: player.controls.contains(.duration)
                )
                playButton
            }
        }
        .aspectRatio(bubbleAspectRatio, contentMode: .fit)
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
            VStack(spacing: 2) {
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
            VStack(spacing: 2) {
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
        case .ready:         return String(localized: "media.video.play", defaultValue: "Lire la video", bundle: .module)
        case .needsDownload: return String(localized: "media.video.download", defaultValue: "Telecharger la video", bundle: .module)
        case .downloading:   return String(localized: "media.video.downloading", defaultValue: "Telechargement en cours", bundle: .module)
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
        manager.load(urlString: player.attachment.fileUrl, attachmentId: player.attachment.id)
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

    /// Décision pure (§ B.2) : une surface sans bouton PiP visible ne doit
    /// jamais configurer le PiP — `configurePip` arme implicitement
    /// `canStartPictureInPictureAutomaticallyFromInline`. Miroir de
    /// `ReelVideoSurface.enablesPip` ; source de vérité unique avec
    /// `_InlineOverlayControls.showsPipButton` (même `ControlSet` pilote les
    /// deux — impossible d'avoir l'un sans l'autre).
    nonisolated static func surfaceEnablesPip(controls: MeeshyVideoPlayer.ControlSet) -> Bool {
        controls.contains(.pip)
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

    private func toggleControls() {
        showControls.toggle()
        if showControls { scheduleControlsHide() }
    }

    private func scheduleControlsHide() {
        controlsTimer?.invalidate()
        controlsTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { _ in
            Task { @MainActor in
                withAnimation { showControls = false }
            }
        }
    }
}

// MARK: - Mini Renderer

internal struct _MiniRenderer: View {
    let player: MeeshyVideoPlayer

    var body: some View {
        MeeshyVideoThumbnail(
            attachment: player.attachment,
            accentColor: player.accentColor,
            showPlayBadge: true,
            showDurationBadge: player.controls.contains(.duration),
            cornerRadius: player.frame.cornerRadius,
            onTap: player.onExpand
        )
        .aspectRatio(player.attachment.videoAspectRatio ?? 1.0, contentMode: .fit)
        .applyVideoFrame(player.frame)
    }
}

// MARK: - Fullscreen Renderer
//
// Routes through `SharedAVPlayerManager` so PIP + global play coordination
// keep working. Legacy parity : filename in top bar, big center play/pause
// + skip ±10s, custom seek bar with thumb + time current/total, speed row,
// swipe-down dismiss (with PIP handoff), pinch-zoom aspect toggle, real
// save and share buttons, availability gate (downloads if not ready).

internal struct _FullscreenRenderer: View {
    let player: MeeshyVideoPlayer

    @State private var showControls: Bool = true
    @State private var controlsTimer: Timer?
    @State private var videoGravity: AVLayerVideoGravity = .resizeAspect
    @State private var saveState: SaveState = .idle
    @State private var dismissOffset: CGFloat = 0
    @State private var watchStartTime: Date?
    // NOTE (BUG B fix): the fullscreen renderer no longer registers its own
    // `.AVPlayerItemDidPlayToEndTime` observer. `SharedAVPlayerManager` is the
    // single source of truth for end-of-stream — it reports watch progress
    // (`complete: true`) and then stops/loops. A second observer here caused a
    // duplicate `POST /attachments/.../status complete:true`. The partial-watch
    // report on disappear (`reportWatch(complete:false)`) stays here.
    /// Guards the initial-mount auto-load against a teardown-triggered nil.
    /// When a non-loop fullscreen video reaches the end, the manager calls
    /// `stop()` → `player = nil`, which re-inserts the loading `else` branch.
    /// Without this flag its `.onAppear` would RELOAD + REPLAY the just-watched
    /// video from 0. We only auto-load on the very first mount.
    @State private var didInitialLoad = false
    /// #3895 (défaut 3) : `SharedAVPlayerManager.load` peut retomber dans son
    /// repli réseau supprimé (spec §4.10) — l'appelant n'avait pas gaté sur
    /// `availability == .ready` — et laisser `player` `nil` pour toujours.
    /// Sans ce drapeau, cet état était indiscernable d'une fin de flux
    /// légitime : même poster figé, même absence de spinner, mais aucune
    /// vidéo n'avait jamais joué. `attemptLoad()` le pose de façon SYNCHRONE
    /// (`load()` ne fait rien d'asynchrone dans ce cas — repli supprimé).
    @State private var loadFailed = false
    @ObservedObject private var manager = SharedAVPlayerManager.shared
    /// Poster NET (opaque, résolu par l'app) : lu au montage, résolu sinon.
    @State private var poster: UIImage?
    /// Fond décoratif pendant la résolution — le thumbHash, flou assumé. La
    /// vignette serveur n'est jamais montée comme image affichée.
    @State private var thumbHashBackdrop: UIImage?
    /// Première frame COMPOSÉE par la surface (KVO `isReadyForDisplay`).
    /// Jamais `currentItem` (leçon 24) ; failsafe temporel en plus (leçon 25).
    @State private var surfaceReady = false

    init(player: MeeshyVideoPlayer) {
        self.player = player
        let initial = player.poster?.initial
        _poster = State(initialValue: initial)
        _thumbHashBackdrop = State(initialValue: initial == nil
            ? player.attachment.thumbHash.flatMap(UIImage.fromThumbHash)
            : nil)
    }

    /// Le poster reste tant qu'aucune frame n'est composée — présence du
    /// PLAYER + `isReadyForDisplay`. Un player relâché (fin de flux) le remonte.
    nonisolated static func showsPoster(playerPresent: Bool, surfaceReady: Bool) -> Bool {
        !playerPresent || !surfaceReady
    }

    /// Le spinner discret n'accompagne que ce qui CHARGE : avant le premier
    /// load, puis jusqu'à la première frame. Jamais sur un player relâché.
    nonisolated static func showsLoadingSpinner(playerPresent: Bool, surfaceReady: Bool, didInitialLoad: Bool) -> Bool {
        playerPresent ? !surfaceReady : !didInitialLoad
    }

    /// Failsafe temporel (leçon 25) : couvre le spin-up décodeur d'un fichier
    /// local ; un KVO manqué ne fige jamais le poster sur une vidéo qui joue.
    private static let surfaceReadyFailsafe: Duration = .milliseconds(2500)

    internal enum SaveState { case idle, saving, saved, failed }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            switch player.availability {
            case .ready:
                // L'overlay est toujours rendu pour .ready, même si
                // `manager.player` n'est pas encore chargé. Sans ça, le user
                // voit un écran noir + ProgressView sans aucun contrôle
                // pendant la phase load (1–2 s sur cold cache), et croit que
                // les contrôles ont disparu. Les boutons centre + speed +
                // seekbar sont rendus disabled tant que `duration == 0`.
                //
                // #3895 : `loadFailed` bascule sur l'overlay de reprise — le
                // chargement synchrone n'a produit aucun player malgré
                // `.ready` (repli réseau supprimé) ; sans ce branchement,
                // `playerContent` restait figé sur son poster pour toujours,
                // sans spinner ni erreur.
                if loadFailed {
                    downloadOverlay
                } else {
                    playerContent
                }
            case .needsDownload, .downloading:
                downloadOverlay
            }
        }
        .offset(y: dismissOffset)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: dismissOffset)
        .task(id: player.attachment.id) { await resolvePosterIfNeeded() }
        // #3897 — sans ce relais, un poster non résolu au premier montage
        // (fichier pas encore local, ex. politique réseau restrictive) ne
        // l'était plus JAMAIS : `.task(id: player.attachment.id)` ne rejoue
        // qu'au changement d'ATTACHMENT, jamais quand ce même attachment
        // devient disponible après un téléchargement déclenché par
        // `downloadOverlay`. Miroir de la page galerie app
        // (`GalleryVideoPage.task(id: downloader.isCached)`). La comparaison
        // `== .ready` (pas `player.availability` brut) évite de rejouer à
        // chaque tick de `.downloading(progress:)`.
        .task(id: player.availability == .ready) {
            guard poster == nil, player.availability == .ready else { return }
            await resolvePosterIfNeeded()
        }
        .task(id: manager.player != nil) { await armSurfaceReadyFailsafe() }
        .onAppear {
            watchStartTime = Date()
            // Defensive : reset l'auto-hide state à l'entrée du fullscreen.
            showControls = true
        }
        .onDisappear { onDisappearTeardown() }
        .statusBarHidden(true)
    }

    private var isActive: Bool {
        manager.player != nil && manager.activeURL == player.attachment.fileUrl
    }

    // MARK: Player content (active)

    private var playerContent: some View {
        ZStack {
            if let p = manager.player {
                MeeshyVideoSurface(
                    player: p,
                    gravity: videoGravity,
                    isMuted: manager.isMuted,
                    onReadyForDisplay: { surfaceReady = true }
                )
                    .ignoresSafeArea()
                    .onTapGesture { toggleControls() }
                    .gesture(swipeDownGesture)
                    .gesture(pinchGesture)
            } else {
                // Player en cours de chargement : le poster net (ci-dessous)
                // tient l'écran, le spinner discret l'accompagne — les contrôles
                // overlay restent visibles, boutons disabled tant que
                // `duration == 0`.
                Color.clear
                    .onAppear {
                        // Only auto-load on the INITIAL mount. An end-of-stream
                        // nil (manager.stop() on non-loop end) re-inserts this
                        // branch — guarding here prevents an unwanted reload +
                        // replay of the just-watched video.
                        guard !didInitialLoad else { return }
                        didInitialLoad = true
                        attemptLoad()
                    }
            }
            // Le poster NET reste AU-DESSUS de la surface tant qu'elle n'a pas
            // COMPOSÉ sa première frame (`isReadyForDisplay`) : sans lui, la
            // couche vidéo est noire pendant le spin-up décodeur (1–2 s sur
            // cache froid). Jamais gaté sur `currentItem` (leçon 24).
            if Self.showsPoster(playerPresent: manager.player != nil, surfaceReady: surfaceReady) {
                posterLayer
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
            if Self.showsLoadingSpinner(playerPresent: manager.player != nil, surfaceReady: surfaceReady, didInitialLoad: didInitialLoad) {
                ProgressView()
                    .tint(.white.opacity(0.85))
                    .allowsHitTesting(false)
            }
            if showControls {
                _FullscreenOverlayControls(
                    manager: manager,
                    accentColor: player.accentColor,
                    controls: player.controls,
                    fileName: player.fileName,
                    onClose: { closePlayer() },
                    onSave: {
                        if let onSaveRequested = player.onSaveRequested {
                            onSaveRequested()
                        } else {
                            saveToPhotos()
                        }
                    },
                    onShare: player.onShare,
                    saveState: saveState
                )
                .transition(.opacity)
                authorAndCaptionOverlay
            }
        }
        .animation(.easeInOut(duration: 0.2), value: showControls)
        .animation(.easeInOut(duration: 0.2), value: surfaceReady)
    }

    /// Le poster net, ou — le temps de sa résolution — le thumbHash en fond
    /// décoratif. La vignette serveur n'est jamais montée ici comme image
    /// affichée : elle peut être floue au plein écran, et rien ne garantit
    /// qu'elle soit remplacée.
    @ViewBuilder
    private var posterLayer: some View {
        if let poster {
            Image(uiImage: poster)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea()
        } else if let thumbHashBackdrop {
            Image(uiImage: thumbHashBackdrop)
                .resizable()
                .interpolation(.low)
                .aspectRatio(contentMode: .fit)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea()
        }
    }

    private func resolvePosterIfNeeded() async {
        guard poster == nil, let resolve = player.poster?.resolve else { return }
        let resolved = await resolve()
        guard !Task.isCancelled, let resolved else { return }
        withAnimation(.easeIn(duration: 0.15)) { poster = resolved }
    }

    /// Rejoué à chaque (dis)parition du player : un player relâché remet le
    /// poster (fin de flux non bouclée) ; un player présent arme le failsafe.
    private func armSurfaceReadyFailsafe() async {
        guard manager.player != nil else {
            surfaceReady = false
            return
        }
        guard !surfaceReady else { return }
        try? await Task.sleep(for: Self.surfaceReadyFailsafe)
        guard !Task.isCancelled else { return }
        surfaceReady = true
    }

    @ViewBuilder
    private var authorAndCaptionOverlay: some View {
        VStack {
            if player.controls.contains(.author), let author = player.author {
                HStack {
                    authorChip(author)
                        .padding(.top, 56)
                        .padding(.leading, 16)
                    Spacer()
                }
            }
            Spacer()
            if let caption = player.caption, !caption.isEmpty {
                Text(caption)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 16)
                    .padding(.bottom, 140)
                    .lineLimit(4)
            }
        }
        .allowsHitTesting(false)
    }

    private func authorChip(_ author: MeeshyVideoPlayer.VideoAuthor) -> some View {
        Button {
            author.onTap?()
            HapticFeedback.light()
        } label: {
            HStack(spacing: 6) {
                if let avatarUrl = author.avatarUrl, !avatarUrl.isEmpty {
                    // CachedAvatarImage : échec silencieux (initiales + accent
                    // du player), zéro bouton retry sur un chip 24pt — l'avatar
                    // auteur est déjà dans le DiskCacheStore (MeeshyAvatar l'y a mis).
                    CachedAvatarImage(
                        urlString: avatarUrl,
                        name: author.displayName,
                        size: 24,
                        accentColor: player.accentColor
                    )
                }
                Text(author.displayName)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(.ultraThinMaterial.opacity(0.7)))
        }
    }

    // MARK: Load attempt (#3895)

    /// See `startPlayback()` above — `attachmentId` must be passed as the
    /// `load()` argument, applied AFTER the internal `cleanup()`, or it is
    /// silently wiped and watch-progress tracking never fires.
    ///
    /// `load()` is SYNCHRONOUS for every branch that can populate `player`
    /// (prerolled cache, local disk file) — the network fallback that would
    /// have made a later branch resolve asynchronously was removed (spec
    /// §4.10). So `manager.player == nil` read right after the call is a
    /// DEFINITIVE failure, never an "in flight" state: nothing is coming.
    /// Shared by the initial mount and the retry button so they can never
    /// diverge into two different failure behaviours.
    private func attemptLoad() {
        manager.load(urlString: player.attachment.fileUrl, attachmentId: player.attachment.id)
        if manager.player == nil {
            loadFailed = true
        } else {
            loadFailed = false
            manager.play()
        }
    }

    /// `manager.stop()` first: `load()` no-ops when `urlString == activeURL`,
    /// which the failed attempt already set — without releasing it, tapping
    /// retry would silently do nothing.
    private func retryLoad() {
        manager.stop()
        attemptLoad()
    }

    // MARK: Download overlay (availability != ready)

    @ViewBuilder
    private var downloadOverlay: some View {
        ZStack {
            if let poster {
                // Frame NETTE disponible : servie telle quelle — ni flou ni
                // voile. Le flou reste réservé au repli vignette/thumbHash.
                Image(uiImage: poster)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .ignoresSafeArea()
            } else if player.attachment.thumbHash != nil ||
               (player.attachment.thumbnailUrl?.isEmpty == false) {
                ProgressiveCachedImage(
                    thumbHash: player.attachment.thumbHash,
                    thumbnailUrl: player.attachment.thumbnailUrl,
                    fullUrl: player.attachment.thumbnailUrl ?? ""
                ) {
                    Color.black
                }
                .aspectRatio(contentMode: .fill)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
                .blur(radius: 18)
                .overlay(Color.black.opacity(0.45))
                .ignoresSafeArea()
            }

            VStack(spacing: 16) {
                Button {
                    HapticFeedback.light()
                    // #3895 : `.ready` + `loadFailed` retries the SAME
                    // synchronous checks (prerolled cache, local disk file)
                    // rather than `onDownload` — the availability was never
                    // actually `.needsDownload`, so `onDownload` may not be
                    // wired for it at all. A genuine `.needsDownload` /
                    // `.downloading` state keeps its normal action below.
                    if loadFailed {
                        retryLoad()
                    } else {
                        player.onDownload?()
                    }
                } label: {
                    ZStack {
                        Circle().fill(.ultraThinMaterial).frame(width: 88, height: 88)
                        Circle().fill(Color(hex: player.accentColor).opacity(0.9)).frame(width: 72, height: 72)
                        downloadOverlayIcon
                    }
                    .shadow(color: .black.opacity(0.5), radius: 12, y: 4)
                }
                .disabled({
                    if case .downloading = player.availability { return true }
                    return false
                }())

                Text(downloadOverlayMessage)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white.opacity(0.85))
                    .shadow(color: .black.opacity(0.6), radius: 4)
                    .multilineTextAlignment(.center)

                Button {
                    closePlayer()
                    HapticFeedback.light()
                } label: {
                    Text(String(localized: "media.video.close", defaultValue: "Fermer", bundle: .module))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white.opacity(0.7))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(Color.white.opacity(0.12)))
                }
                .padding(.top, 8)
            }
        }
    }

    @ViewBuilder
    private var downloadOverlayIcon: some View {
        // #3895 : `loadFailed` overrides the `.ready` branch below — reached
        // only when the synchronous load found nothing playable despite the
        // claimed availability. `EmptyView()` there was correct for the
        // ordinary `.ready` (this overlay isn't shown at all in that case,
        // see `body`) but would silently blank a retry affordance the user
        // actually needs.
        if loadFailed {
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 30, weight: .bold))
                .foregroundColor(.white)
        } else {
            switch player.availability {
            case .ready:
                EmptyView()
            case .needsDownload:
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundColor(.white)
            case .downloading(let progress):
                if progress > 0 {
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(Color.white, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .frame(width: 44, height: 44)
                        .animation(.linear(duration: 0.2), value: progress)
                } else {
                    ProgressView().tint(.white).scaleEffect(1.2)
                }
            }
        }
    }

    private var downloadOverlayMessage: String {
        if loadFailed {
            return String(localized: "media.video.unavailableRetry", defaultValue: "Video indisponible. Reessayer.", bundle: .module)
        }
        switch player.availability {
        case .ready:         return ""
        case .needsDownload: return String(localized: "media.video.downloadToPlay", defaultValue: "Telechargez pour lire la video", bundle: .module)
        case .downloading:   return String(localized: "media.video.downloadingHint", defaultValue: "La lecture demarrera apres le telechargement", bundle: .module)
        }
    }

    // MARK: Gestures

    private var swipeDownGesture: some Gesture {
        DragGesture(minimumDistance: 30)
            .onChanged { value in
                guard value.translation.height > 0 else { return }
                dismissOffset = value.translation.height
            }
            .onEnded { value in
                if value.translation.height > 150 {
                    if manager.isPlaying { manager.startPip() }
                    closePlayer()
                } else {
                    dismissOffset = 0
                }
            }
    }

    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .onEnded { scale in
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    videoGravity = scale > 1 ? .resizeAspectFill : .resizeAspect
                }
                HapticFeedback.light()
            }
    }

    // MARK: Lifecycle

    private func onDisappearTeardown() {
        controlsTimer?.invalidate(); controlsTimer = nil
        // End-of-stream watch reporting is owned by SharedAVPlayerManager
        // (BUG B fix). Here we only report the partial watch on dismiss.
        reportWatch(complete: false)
        watchStartTime = nil
    }

    private func closePlayer() {
        // Reset loop défensif : sans ça, le flag persisterait jusqu'au prochain
        // load() et pourrait faire boucler une vidéo inline ouverte ensuite.
        manager.shouldLoop = false
        // BUG E fix : si la lecture est en pause/terminée au moment de la
        // fermeture, on libère le player pour vider `activeURL`. Sans ça,
        // `hasPlayingInlineVideo` reste vrai côté bulle (footer/timestamp
        // masqué) et le player traîne en mémoire. Choix : ne PAS stopper un
        // player encore en lecture — l'utilisateur peut vouloir un handoff PIP
        // ou une continuation inline ; seul un dismiss "à l'arrêt" coupe.
        if !manager.isPlaying {
            manager.stop()
        }
        player.onClose?()
    }

    private func toggleControls() {
        withAnimation { showControls.toggle() }
        if showControls { scheduleControlsHide() }
    }

    private func scheduleControlsHide() {
        controlsTimer?.invalidate()
        controlsTimer = Timer.scheduledTimer(withTimeInterval: 4.0, repeats: false) { _ in
            Task { @MainActor in
                withAnimation { showControls = false }
            }
        }
    }

    private func reportWatch(complete: Bool) {
        guard let start = watchStartTime else { return }
        let watched = Date().timeIntervalSince(start)
        guard complete || watched >= 3 else { return }
        let currentSec = manager.currentTime
        let totalSec = manager.duration
        let attId = player.attachment.id
        let body = AttachmentStatusBody(
            action: "watched",
            playPositionMs: Int((currentSec.isNaN ? 0 : currentSec) * 1000),
            durationMs: Int((totalSec.isNaN || totalSec.isInfinite ? 0 : totalSec) * 1000),
            complete: complete
        )
        AttachmentStatusReporter.report(attachmentId: attId, body: body)

        // Resume-where-you-stopped on dismiss — the manager's own
        // `reportWatchProgress` never fires here (this path only reports the
        // partial-watch on disappear, see the BUG B fix note above).
        guard !currentSec.isNaN, !totalSec.isNaN, !totalSec.isInfinite else { return }
        if complete || !SharedAVPlayerManager.isResumable(currentSec, totalDuration: totalSec) {
            VideoPlaybackPositionStore.shared.clear(for: attId)
        } else {
            VideoPlaybackPositionStore.shared.save(currentSec, for: attId)
        }
    }

    private func saveToPhotos() {
        guard let url = MeeshyConfig.resolveMediaURL(player.attachment.fileUrl) else { return }
        saveState = .saving
        HapticFeedback.light()
        Task {
            do {
                let tempFile = FileManager.default.temporaryDirectory
                    .appendingPathComponent("save_\(UUID().uuidString).mp4")
                if let cached = CacheCoordinator.videoLocalFileURL(for: url.absoluteString) {
                    // Cache-first : l'état .ready qui a permis la lecture implique
                    // que le fichier est déjà dans le DiskCacheStore vidéo — le
                    // copier évite de re-télécharger un média déjà sur disque.
                    try FileManager.default.copyItem(at: cached, to: tempFile)
                } else {
                    // Pull from URLSession.download (streams to disk) — avoids
                    // double-loading a 200MB file into memory like .data(from:) would.
                    let (tempURL, _) = try await URLSession.shared.download(from: url)
                    try FileManager.default.moveItem(at: tempURL, to: tempFile)
                }
                let ok = await PhotoLibraryManager.shared.saveVideo(at: tempFile)
                try? FileManager.default.removeItem(at: tempFile)
                await MainActor.run {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        saveState = ok ? .saved : .failed
                    }
                    if ok {
                        HapticFeedback.success()
                        player.onSaveSuccess?()
                    } else {
                        HapticFeedback.error()
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { saveState = .idle }
                    }
                }
            } catch {
                await MainActor.run {
                    withAnimation { saveState = .failed }
                    HapticFeedback.error()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { saveState = .idle }
                    }
                }
            }
        }
    }
}

// MARK: - Frame Modifier Helper

internal extension View {
    /// Applies the `Frame` parameters : max height, corner radius, border.
    /// Aspect ratio is applied separately by each renderer because the
    /// effective ratio depends on the cap.
    @ViewBuilder
    func applyVideoFrame(_ frame: MeeshyVideoPlayer.Frame) -> some View {
        self.modifier(_VideoFrameModifier(frame: frame))
    }
}

internal struct _VideoFrameModifier: ViewModifier {
    let frame: MeeshyVideoPlayer.Frame

    func body(content: Content) -> some View {
        content
            .frame(maxHeight: frame.maxHeight)
            .clipShape(RoundedRectangle(cornerRadius: frame.cornerRadius))
            .overlay(
                Group {
                    if let border = frame.border {
                        RoundedRectangle(cornerRadius: frame.cornerRadius)
                            .stroke(border.color, lineWidth: border.width)
                    }
                }
            )
    }
}
