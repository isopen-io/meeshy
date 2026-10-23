import SwiftUI
import AVFoundation
import MeeshySDK

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
    /// `internal` — `saveToPhotos()` l'écrit depuis `+FullscreenSave.swift`.
    @State var saveState: SaveState = .idle
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
    /// Référence NUE, champs lus MIROITÉS — même discipline que
    /// `_InlineRenderer` : `@ObservedObject` réévaluait tout le plein écran
    /// (surface, poster, légende, gestes) à chaque battement de `currentTime`
    /// (5 Hz). La barre de lecture observe le moteur elle-même.
    private let manager = SharedAVPlayerManager.shared
    @State private var enginePlayer: AVPlayer? = SharedAVPlayerManager.shared.player
    @State private var engineIsMuted: Bool = SharedAVPlayerManager.shared.isMuted
    @State private var engineActiveURL: String = SharedAVPlayerManager.shared.activeURL
    /// Le bouton central s'efface une seconde après le début de la lecture
    /// (#9577) — sa règle est `FullscreenPlayPauseFade`, distincte de
    /// l'effacement du reste du chrome (`showControls`, trois secondes).
    @State private var playPauseFade = FullscreenPlayPauseFade()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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

    internal nonisolated enum SaveState: Equatable, Sendable { case idle, saving, saved, failed }

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
        .task(id: enginePlayer != nil) { await armSurfaceReadyFailsafe() }
        .onReceive(manager.$player) { enginePlayer = $0 }
        .onReceive(manager.$isMuted) { engineIsMuted = $0 }
        .onReceive(manager.$activeURL) { engineActiveURL = $0 }
        .onReceive(manager.$isPlaying) { playPauseFade = playPauseFade.playback(isPlaying: $0) }
        .task(id: playPauseFade) { await fadePlayPauseAfterDelay() }
        // **Le plein écran REPREND sa vidéo** (#9575) : au retour au premier
        // plan, la fenêtre PiP ouverte en quittant l'application se referme et
        // la lecture continue ici — jamais aux deux endroits.
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            manager.reclaimFromPip(urlString: player.attachment.fileUrl)
        }
        .onAppear {
            watchStartTime = Date()
            // Defensive : reset l'auto-hide state à l'entrée du fullscreen.
            showControls = true
            manager.reclaimFromPip(urlString: player.attachment.fileUrl)
        }
        .onDisappear { onDisappearTeardown() }
        .statusBarHidden(true)
        .settling($saveState, to: .idle, after: .seconds(2), animation: .default, when: { $0 == .saved || $0 == .failed })
    }

    private var isActive: Bool {
        manager.player != nil
            && manager.mayMountPlayer(role: .fullscreen, urlString: player.attachment.fileUrl)
    }

    /// Le player que CETTE surface monte : celui du moteur, si le verdict de
    /// montage le lui accorde (#9575). Un moteur occupé par un autre média ne
    /// prête pas son image à ce plein écran.
    private var mountedPlayer: AVPlayer? {
        SharedAVPlayerManager.mayMountFullscreenPlayer(
            surfaceMedia: player.attachment.fileUrl,
            activeMedia: engineActiveURL) ? enginePlayer : nil
    }

    // MARK: Player content (active)

    private var playerContent: some View {
        ZStack {
            if let p = mountedPlayer {
                // `enablesPip` : la fenêtre PiP se CONFIGURE avant de se
                // demander — sans contrôleur attaché à cette couche,
                // `startPip()` ne faisait rien (#9575).
                MeeshyVideoSurface(
                    player: p,
                    gravity: videoGravity,
                    isMuted: engineIsMuted,
                    enablesPip: MeeshyVideoPlayer.surfaceEnablesPip(style: .fullscreen, controls: player.controls),
                    onReadyForDisplay: { surfaceReady = true }
                )
                    .ignoresSafeArea()
                    .onTapGesture { handleSurfaceTap() }
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
            if Self.showsPoster(playerPresent: enginePlayer != nil, surfaceReady: surfaceReady) {
                posterLayer
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
            if Self.showsLoadingSpinner(playerPresent: enginePlayer != nil, surfaceReady: surfaceReady, didInitialLoad: didInitialLoad) {
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
                    saveState: saveState,
                    infoSegments: infoSegments,
                    declaredDuration: declaredDuration,
                    isInAlbum: PhotoAlbumSaveFeedback.isInAlbum(attachmentId: player.attachment.id)
                )
                .transition(.opacity)
                authorAndCaptionOverlay
            }
            // Le bouton central vit HORS du chrome : il suit sa propre seconde,
            // et reste à l'écran en pause même quand le chrome s'est effacé.
            if mountedPlayer != nil {
                VideoTransportControls(manager: manager,
                                       accentColor: player.accentColor,
                                       controls: Self.centerControls(player.controls),
                                       placement: .center,
                                       centerVisible: playPauseFade.isVisible)
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
        guard await cancellableSleep(for: Self.surfaceReadyFailsafe) else { return }
        surfaceReady = true
    }

    @ViewBuilder
    private var authorAndCaptionOverlay: some View {
        VStack {
            if player.controls.contains(.author), let author = player.author {
                HStack {
                    authorChip(author)
                        .padding(.top, 56)
                        .padding(.leading, MeeshySpacing.lg)
                    Spacer()
                }
            }
            Spacer()
            if let caption = player.caption, !caption.isEmpty {
                Text(caption)
                    .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                    .foregroundStyle(Color.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.vertical, MeeshySpacing.smPlus)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
                    .padding(.horizontal, MeeshySpacing.lg)
                    // La colonne son · (...) tient le bord droit (#9577).
                    .padding(.trailing, FullscreenChromeMetrics.tapTarget)
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
            HStack(spacing: MeeshySpacing.xsPlus) {
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
                    .font(.system(size: MeeshyFont.smallSize, weight: .semibold))
                    .foregroundStyle(Color.white)
            }
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xs)
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
        if player.reportsConsumption {
            manager.load(urlString: player.attachment.fileUrl, attachmentId: player.attachment.id)
            // Reposée APRÈS `load()` — qui appelle `cleanup()` — et clé par la pièce
            // jointe qu'elle qualifie : ce moteur est partagé (#7212).
            manager.setServedConsumption(player.attachment.currentUserConsumption, for: player.attachment.id)
        } else {
            // Sans identifiant, le moteur ne rapporte ni ne reprend rien (#9890).
            manager.load(urlString: player.attachment.fileUrl)
        }
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

            VStack(spacing: MeeshySpacing.lg) {
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
                    .font(.system(size: MeeshyFont.labelSize, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.85))
                    .shadow(color: .black.opacity(0.6), radius: 4)
                    .multilineTextAlignment(.center)

                Button {
                    closePlayer()
                    HapticFeedback.light()
                } label: {
                    Text(String(localized: "media.video.close", defaultValue: "Fermer", bundle: .module))
                        .font(.system(size: MeeshyFont.labelSize, weight: .semibold))
                        .foregroundStyle(Color.white.opacity(0.7))
                        .padding(.horizontal, 18)
                        .padding(.vertical, MeeshySpacing.sm)
                        .background(Capsule().fill(Color.white.opacity(0.12)))
                }
                .padding(.top, MeeshySpacing.sm)
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
                .foregroundStyle(Color.white)
        } else {
            switch player.availability {
            case .ready:
                EmptyView()
            case .needsDownload:
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(Color.white)
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
            return String(localized: "media.video.unavailableRetry", defaultValue: "Vidéo indisponible. Réessayer.", bundle: .module)
        }
        switch player.availability {
        case .ready:         return ""
        case .needsDownload: return String(localized: "media.video.downloadToPlay", defaultValue: "Téléchargez pour lire la vidéo", bundle: .module)
        case .downloading:   return String(localized: "media.video.downloadingHint", defaultValue: "Préparation de la lecture…", bundle: .module)
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
                    // Le glissement vers le bas DEMANDE le PiP ; s'il ne part
                    // pas (appareil sans PiP, surface sans l'option), fermer
                    // arrête la lecture comme la croix.
                    let handedOff = manager.isPlaying && manager.startPip(haltsOnFailure: true)
                    closePlayer(pipHandedOff: handedOff || manager.isPipActive)
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

    /// **Fermer n'abandonne la lecture qu'au PiP** (#9575).
    ///
    /// Jusqu'ici, fermer pendant la lecture laissait le player tourner « pour
    /// une continuation en ligne » : la bulle restée derrière se remettait à
    /// jouer, son compris, sans que personne l'ait demandé. Le seul lieu où la
    /// lecture survit à la fermeture est une fenêtre PiP — demandée par le
    /// glissement vers le bas, ou déjà ouverte depuis le menu.
    private func closePlayer(pipHandedOff: Bool? = nil) {
        // Reset loop défensif : sans ça, le flag persisterait jusqu'au prochain
        // load() et pourrait faire boucler une vidéo inline ouverte ensuite.
        manager.shouldLoop = false
        let handedOff = pipHandedOff ?? manager.isPipActive
        if SharedAVPlayerManager.fullscreenCloseDisposition(pipHandedOff: handedOff) == .stops {
            // URL-gated : ne touche pas un autre média qui aurait pris le moteur.
            manager.release(urlString: player.attachment.fileUrl)
        }
        player.onClose?()
    }

    private func toggleControls() {
        withAnimation { showControls.toggle() }
        if showControls { scheduleControlsHide() }
    }

    private func scheduleControlsHide() {
        controlsTimer?.invalidate()
        controlsTimer = Timer.scheduledTimer(withTimeInterval: FullscreenChromeMetrics.autoHideDelay, repeats: false) { _ in
            Task { @MainActor in
                withAnimation { showControls = false }
            }
        }
    }

    // MARK: Bouton central (#9577)

    /// Le jeu de la couche centrale : play/pause, et les ±10 s que ce lecteur a
    /// toujours portés dès qu'il offre une progression.
    nonisolated static func centerControls(_ controls: MeeshyVideoPlayer.ControlSet) -> MeeshyVideoPlayer.ControlSet {
        var center = controls.intersection([.playPause])
        if controls.contains(.playPause), controls.contains(.scrubber) { center.insert(.skip) }
        return center
    }

    private var declaredDuration: Double {
        Double(player.attachment.duration ?? 0) / 1000
    }

    private var infoSegments: [MediaInfoLine.Segment] {
        MediaInfoLine.segments(
            width: player.attachment.width,
            height: player.attachment.height,
            fileSizeLabel: player.attachment.fileSize > 0 ? player.attachment.fileSizeFormatted : nil,
            hasDuration: declaredDuration > 0)
    }

    /// Un toucher sur l'image ramène le bouton central (la seconde repart) ET
    /// bascule le chrome, en un seul geste — y compris quand le bouton était
    /// effacé (#9577, décision porteur 2026-10-08, alignée sur le web).
    private func handleSurfaceTap() {
        withAnimation(fadeAnimation) { playPauseFade = playPauseFade.tappingMedia() }
        toggleControls()
    }

    private var fadeAnimation: Animation? {
        reduceMotion ? nil : .easeOut(duration: 0.25)
    }

    private func fadePlayPauseAfterDelay() async {
        guard let delay = playPauseFade.fadeDelay else { return }
        guard await cancellableSleep(for: .seconds(delay)) else { return }
        withAnimation(fadeAnimation) { playPauseFade = playPauseFade.fading() }
    }

    private func reportWatch(complete: Bool) {
        guard player.reportsConsumption, let start = watchStartTime else { return }
        // Règle et raison : `VideoDismissWatchReport`. En deux mots — un player
        // détaché a déjà rapporté ET persisté sa position ; le relire ici
        // effacerait ce qu'il vient d'écrire (#3908).
        guard VideoDismissWatchReport.shouldReport(
            complete: complete,
            watchedSeconds: Date().timeIntervalSince(start),
            playerStillHoldsAttachment: isActive
        ) else { return }
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
