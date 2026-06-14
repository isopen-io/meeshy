import SwiftUI
import AVKit
import MeeshySDK
import MeeshyUI

// MARK: - Reels Presenter

/// App-wide presenter for the immersive reel experience. A shared observable so
/// both entry points — a long-press on the feed button (RootView) and a tap on a
/// reel card (FeedView) — drive the same top-level overlay without threading an
/// `@EnvironmentObject` through every host.
@MainActor
final class ReelsPresenter: ObservableObject {
    static let shared = ReelsPresenter()

    struct Launch: Identifiable, Equatable {
        let id = UUID()
        var seedPosts: [FeedPost]
        var startId: String?
        static func == (lhs: Launch, rhs: Launch) -> Bool { lhs.id == rhs.id }
    }

    @Published var launch: Launch?

    private init() {}

    /// Opens the reels seeded from posts already on screen, starting on `startId`.
    func present(posts: [FeedPost], startId: String?) {
        launch = Launch(seedPosts: posts, startId: startId)
    }

    /// Opens the reels with no seed (long-press launch); the view fetches a page.
    func presentFresh() {
        launch = Launch(seedPosts: [], startId: nil)
    }

    func dismiss() {
        launch = nil
    }
}

// MARK: - Reels Player

/// Full-screen, vertically-paged reel experience. Swipe up/down to move between
/// reels (`AdaptiveVerticalPager`); only the visible reel plays, driven through
/// the single shared video engine (`SharedAVPlayerManager`). A back button and a
/// left-edge drag both return to the previous screen.
struct ReelsPlayerView: View {
    let seedPosts: [FeedPost]
    let startId: String?
    /// `true` once the liquid reveal disc has reached full screen. Gates the
    /// first reel's playback: the video stays on its poster (PAUSED) during the
    /// reveal and only starts when this flips true (driven by RootView).
    var revealCompleted: Bool
    var onClose: () -> Void

    @StateObject private var viewModel = ReelsViewModel()
    @State private var commentsReel: FeedPost?
    @State private var edgeDrag: CGFloat = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if viewModel.reels.isEmpty {
                emptyState
            } else {
                pager
            }

            backControls
        }
        .offset(x: max(0, edgeDrag))
        .task { viewModel.seed(posts: seedPosts, startId: startId) }
        .adaptiveOnChange(of: viewModel.currentId) { _, newId in
            guard let newId else { return }
            HapticFeedback.light()
            viewModel.recordView(newId)
        }
        .sheet(item: $commentsReel) { reel in
            CommentsSheetView(post: reel, accentColor: reel.authorColor)
        }
        .statusBarHidden(true)
    }

    // MARK: Pager

    private var pager: some View {
        AdaptiveVerticalPager(items: viewModel.reels, currentPageID: $viewModel.currentId) { _, reel in
            ReelPageView(
                reel: reel,
                isActive: viewModel.currentId == reel.id,
                revealCompleted: revealCompleted,
                isLiked: viewModel.isLiked(reel.id),
                likeCount: viewModel.likeCount(reel),
                isBookmarked: viewModel.isBookmarked(reel.id),
                onLike: { viewModel.toggleLike(reel) },
                onComment: { commentsReel = reel },
                onBookmark: { viewModel.toggleBookmark(reel) },
                onShare: { viewModel.share(reel) }
            )
            .onAppear {
                Task { await viewModel.loadMoreIfNeeded(currentReel: reel) }
            }
        }
        .ignoresSafeArea()
    }

    // MARK: Empty / loading

    @ViewBuilder
    private var emptyState: some View {
        if viewModel.hasLoadedOnce {
            VStack(spacing: 14) {
                Image(systemName: "play.rectangle.on.rectangle")
                    .font(.system(size: 44))
                    .foregroundColor(.white.opacity(0.7))
                Text(String(localized: "reels.empty", defaultValue: "Aucun réel pour le moment", bundle: .main))
                    .font(.headline)
                    .foregroundColor(.white)
            }
            .accessibilityElement(children: .combine)
        } else {
            ProgressView()
                .tint(.white)
                .scaleEffect(1.4)
        }
    }

    // MARK: Back controls (button + left-edge gesture)

    private var backControls: some View {
        ZStack(alignment: .topLeading) {
            // Left-edge drag strip — "retour angle gauche". Confined to the
            // leading 18pt so it never competes with the vertical pager.
            Color.clear
                .frame(width: 18)
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 12)
                        .onChanged { value in
                            edgeDrag = max(0, value.translation.width)
                        }
                        .onEnded { value in
                            if value.translation.width > 70 {
                                onClose()
                            }
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { edgeDrag = 0 }
                        }
                )

            Button(action: onClose) {
                Image(systemName: "chevron.backward")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 40, height: 40)
                    .adaptiveGlass(in: Circle(), tint: .black.opacity(0.35))
            }
            .padding(.leading, 12)
            .padding(.top, 8)
            .accessibilityLabel(String(localized: "reels.back", defaultValue: "Retour", bundle: .main))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Reel Page

/// One full-screen reel: media background + bottom gradient + author/description
/// overlay + a right-hand action rail (like / comment / bookmark / share).
struct ReelPageView: View {
    let reel: FeedPost
    let isActive: Bool
    let revealCompleted: Bool
    let isLiked: Bool
    let likeCount: Int
    let isBookmarked: Bool
    var onLike: () -> Void
    var onComment: () -> Void
    var onBookmark: () -> Void
    var onShare: () -> Void

    @State private var descriptionExpanded = false
    // Plain reference (NOT @ObservedObject): the page itself doesn't need to
    // re-render on every 0.1s time tick — only `ReelScrubBar` observes the
    // manager. Used here only for the fire-and-forget `togglePlayPause()` tap.
    private let playerManager = SharedAVPlayerManager.shared

    private var accentColor: String { reel.authorColor }

    /// True when this active reel is a video so the scrub bar shows only where
    /// there is a seekable timeline (images/audio reels have none here).
    private var isVideoReel: Bool {
        reel.primaryReelMedia?.type == .video
    }

    var body: some View {
        ZStack {
            mediaLayer
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
                .clipped()

            // Tap-pause zone — fills the screen BEHIND the overlay. Taps that
            // land OUTSIDE the description and the action rail (which sit on top
            // with their own gestures) reach this layer and toggle play/pause on
            // the video surface. Image/audio reels have no toggle, so it's gated.
            if isVideoReel {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { playerManager.togglePlayPause() }
            }

            LinearGradient(
                colors: [.clear, .clear, .black.opacity(0.6)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            .allowsHitTesting(false)

            VStack {
                Spacer()
                HStack(alignment: .bottom, spacing: 12) {
                    infoOverlay
                    Spacer(minLength: 8)
                    actionRail
                }
                .padding(.horizontal, 16)

                // Draggable scrub bar — only for the active video reel. Sits
                // just below the description / action rail. Drag to seek.
                if isVideoReel && isActive {
                    ReelScrubBar(manager: playerManager, accentColor: accentColor)
                        .padding(.horizontal, 16)
                        .padding(.top, 14)
                }
            }
            .padding(.bottom, 96)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Media

    @ViewBuilder
    private var mediaLayer: some View {
        if let media = reel.primaryReelMedia {
            switch media.type {
            case .video:
                ReelVideoView(media: media, isActive: isActive, revealCompleted: revealCompleted)
            case .image:
                ReelImageView(reel: reel)
            case .audio:
                ReelAudioView(media: media, accentColor: accentColor)
            default:
                accentBackground
            }
        } else {
            accentBackground
        }
    }

    private var accentBackground: some View {
        LinearGradient(
            colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.4)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    // MARK: Info overlay (author + description + timestamp)

    private var infoOverlay: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                MeeshyAvatar(
                    name: reel.author,
                    context: .postAuthor,
                    accentColor: accentColor,
                    avatarURL: reel.authorAvatarURL
                )

                VStack(alignment: .leading, spacing: 1) {
                    Text(reel.author)
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.white)
                    if let username = reel.authorUsername, !username.isEmpty {
                        Text("@\(username)")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.7))
                    }
                }
            }

            if !reel.displayContent.isEmpty {
                Text(reel.displayContent)
                    .font(.subheadline)
                    .foregroundColor(.white)
                    .lineLimit(descriptionExpanded ? nil : 3)
                    .fixedSize(horizontal: false, vertical: true)
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: 0.2)) { descriptionExpanded.toggle() }
                    }
            }

            Text(RelativeTimeFormatter.shortString(for: reel.timestamp))
                .font(.caption2)
                .foregroundColor(.white.opacity(0.65))
        }
        .shadow(color: .black.opacity(0.4), radius: 4, y: 1)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Action rail

    private var actionRail: some View {
        VStack(spacing: 22) {
            ReelActionButton(
                systemName: isLiked ? "heart.fill" : "heart",
                tint: isLiked ? MeeshyColors.error : .white,
                count: likeCount,
                action: onLike
            )
            .accessibilityLabel(String(localized: "reels.action.like", defaultValue: "J'aime", bundle: .main))

            ReelActionButton(
                systemName: "bubble.right.fill",
                tint: .white,
                count: reel.commentCount,
                action: onComment
            )
            .accessibilityLabel(String(localized: "reels.action.comment", defaultValue: "Commenter", bundle: .main))

            ReelActionButton(
                systemName: isBookmarked ? "bookmark.fill" : "bookmark",
                tint: isBookmarked ? MeeshyColors.warning : .white,
                count: nil,
                action: onBookmark
            )
            .accessibilityLabel(String(localized: "reels.action.bookmark", defaultValue: "Enregistrer", bundle: .main))

            ReelActionButton(
                systemName: "arrowshape.turn.up.right.fill",
                tint: .white,
                count: nil,
                action: onShare
            )
            .accessibilityLabel(String(localized: "reels.action.share", defaultValue: "Partager", bundle: .main))
        }
    }
}

// MARK: - Action Button

private struct ReelActionButton: View {
    let systemName: String
    let tint: Color
    let count: Int?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 5) {
                Image(systemName: systemName)
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundColor(tint)
                    .shadow(color: .black.opacity(0.35), radius: 3, y: 1)
                if let count, count > 0 {
                    Text(Self.compact(count))
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(.white)
                        .shadow(color: .black.opacity(0.35), radius: 2)
                }
            }
            .frame(width: 48)
        }
        .buttonStyle(.plain)
    }

    private static func compact(_ value: Int) -> String {
        if value >= 1_000_000 { return String(format: "%.1fM", Double(value) / 1_000_000) }
        if value >= 1_000 { return String(format: "%.1fk", Double(value) / 1_000) }
        return "\(value)"
    }
}

// MARK: - Reel Scrub Bar

/// Draggable seek bar for the active reel video. Bound to the shared engine's
/// `currentTime` / `duration`; dragging seeks anywhere in the clip via
/// `seek(to:)`. Position / duration are shown above the track. Reuses the
/// proven scrub pattern (GeometryReader + high-priority drag so the horizontal
/// pan wins over the vertical pager) and the SDK's `formatMediaDuration`.
///
/// App-side (not an SDK atom): it is bound to the `SharedAVPlayerManager`
/// singleton and placed by a product decision (reels-only, no skip, no
/// tap-zones — the user explicitly chose the draggable bar only).
private struct ReelScrubBar: View {
    @ObservedObject var manager: SharedAVPlayerManager
    let accentColor: String

    @State private var isSeeking = false
    @State private var seekFraction: Double = 0

    private var accent: Color { Color(hex: accentColor) }

    private var progress: Double {
        guard manager.duration > 0 else { return 0 }
        return isSeeking ? seekFraction : manager.currentTime / manager.duration
    }

    private var displayedTime: Double {
        isSeeking ? seekFraction * manager.duration : manager.currentTime
    }

    var body: some View {
        VStack(spacing: 6) {
            HStack {
                Text(formatMediaDuration(displayedTime))
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white.opacity(0.85))
                Spacer()
                Text(formatMediaDuration(manager.duration))
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white.opacity(0.7))
            }
            .shadow(color: .black.opacity(0.4), radius: 3, y: 1)

            track
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "reels.scrub", defaultValue: "Avancer ou reculer", bundle: .main))
        .accessibilityValue(formatMediaDuration(displayedTime))
    }

    private var track: some View {
        GeometryReader { geo in
            let trackHeight: CGFloat = 4
            let thumbSize: CGFloat = 14
            let filledWidth = geo.size.width * CGFloat(progress)

            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.3)).frame(height: trackHeight)
                Capsule().fill(accent).frame(width: max(0, filledWidth), height: trackHeight)
                Circle().fill(Color.white).frame(width: thumbSize, height: thumbSize)
                    .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                    .scaleEffect(isSeeking ? 1.25 : 1.0)
                    .offset(x: max(0, min(filledWidth - thumbSize / 2, geo.size.width - thumbSize)))
            }
            // 32pt target + high-priority drag so the scrub wins over the
            // vertical pager (same rationale as VideoTransportControls.seekBar).
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .highPriorityGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        guard manager.duration > 0 else { return }
                        isSeeking = true
                        seekFraction = max(0, min(1, value.location.x / geo.size.width))
                    }
                    .onEnded { value in
                        guard manager.duration > 0 else { isSeeking = false; return }
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        manager.seek(to: fraction * manager.duration)
                        HapticFeedback.light()
                        isSeeking = false
                        seekFraction = 0
                    }
            )
        }
        .frame(height: 32)
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isSeeking)
    }
}

// MARK: - Reel Video

/// Plays a reel video full-bleed through the single shared engine
/// (`SharedAVPlayerManager`). Because the manager holds one player, only the
/// active reel ever plays — moving to the next reel loads its URL and the
/// previous one is released. The poster (thumbHash → thumbnail) stays visible
/// underneath until the first frame is ready. Tap toggles play/pause.
private struct ReelVideoView: View {
    let media: FeedMedia
    let isActive: Bool
    /// Gate: the first reel's playback starts only once the liquid reveal disc
    /// has reached full screen. Until then the poster (first frame) stays
    /// visible PAUSED. Subsequent reels (paged to after the reveal) see this as
    /// already `true`, so they play normally.
    let revealCompleted: Bool

    @ObservedObject private var manager = SharedAVPlayerManager.shared

    private var attachment: MeeshyMessageAttachment { media.toMessageAttachment() }
    private var isShowingThis: Bool {
        manager.player != nil && manager.activeURL == attachment.fileUrl
    }

    var body: some View {
        VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, _ in
            content(ready: availability == .ready)
        }
    }

    @ViewBuilder
    private func content(ready: Bool) -> some View {
        ZStack {
            ReelPoster(thumbHash: media.thumbHash, url: media.thumbnailUrl ?? media.url, color: media.thumbnailColor)

            // Tap-to-pause is handled by the page-level tap zone (ReelPageView),
            // so this surface stays gesture-free to avoid swallowing scrub/rail
            // touches.
            if isActive, ready, isShowingThis, let player = manager.player {
                ReelVideoSurface(player: player)
                    .ignoresSafeArea()
            } else if isActive, !ready {
                ProgressView()
                    .tint(.white)
            }
        }
        .onAppear { drive(ready: ready) }
        .adaptiveOnChange(of: isActive) { _, _ in drive(ready: ready) }
        .adaptiveOnChange(of: ready) { _, _ in drive(ready: ready) }
        .adaptiveOnChange(of: revealCompleted) { _, _ in drive(ready: ready) }
        .onDisappear {
            // Releasing only when this page actually owns the engine avoids
            // tearing down the next reel that has already loaded during paging.
            if isShowingThis { manager.stop() }
        }
    }

    private func drive(ready: Bool) {
        guard isActive, ready else { return }
        if manager.activeURL != attachment.fileUrl {
            manager.attachmentId = media.id
            manager.shouldLoop = true
            manager.isMuted = false
            manager.load(urlString: attachment.fileUrl)
        }
        // Hold on the poster (PAUSED) until the liquid reveal completes; start
        // playback only when the disc has reached full screen.
        guard revealCompleted else { return }
        manager.play()
    }
}

/// Hidden-chrome AVKit surface filling the screen. The player itself is owned by
/// `SharedAVPlayerManager`; this only renders it.
private struct ReelVideoSurface: UIViewControllerRepresentable {
    let player: AVPlayer

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.player = player
        controller.showsPlaybackControls = false
        controller.videoGravity = .resizeAspectFill
        controller.view.backgroundColor = .black
        controller.allowsPictureInPicturePlayback = false
        controller.updatesNowPlayingInfoCenter = false
        return controller
    }

    func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {
        if controller.player !== player {
            controller.player = player
        }
    }
}

// MARK: - Reel Image

/// Image reel: a single image fills the screen; multiple images become a
/// horizontal carousel (orthogonal to the vertical reel paging) with dots.
private struct ReelImageView: View {
    let reel: FeedPost
    @State private var currentImageId: String?

    private var images: [FeedMedia] { reel.media.filter { $0.type == .image } }

    var body: some View {
        Group {
            if images.count <= 1, let media = images.first {
                imageFill(media)
            } else {
                ZStack(alignment: .bottom) {
                    AdaptiveHorizontalPager(items: images, currentPageID: $currentImageId) { _, media in
                        imageFill(media)
                    }
                    dots
                        .padding(.bottom, 150)
                }
            }
        }
        .onAppear { if currentImageId == nil { currentImageId = images.first?.id } }
    }

    private func imageFill(_ media: FeedMedia) -> some View {
        ReelPoster(thumbHash: media.thumbHash, url: media.url ?? media.thumbnailUrl, color: media.thumbnailColor)
    }

    private var dots: some View {
        HStack(spacing: 6) {
            ForEach(images) { media in
                Circle()
                    .fill(Color.white.opacity(media.id == currentImageId ? 0.95 : 0.4))
                    .frame(width: 6, height: 6)
            }
        }
    }
}

// MARK: - Reel Audio

/// Audio reel: an accent-tinted canvas with a waveform glyph and the standard
/// feed audio player control (tap to play). Audio is not auto-started so it
/// never collides with the shared video engine while paging.
private struct ReelAudioView: View {
    let media: FeedMedia
    let accentColor: String

    private var attachment: MeeshyMessageAttachment { media.toMessageAttachment() }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.35)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 28) {
                Image(systemName: "waveform")
                    .font(.system(size: 72, weight: .semibold))
                    .foregroundColor(.white.opacity(0.9))
                    .shadow(color: .black.opacity(0.25), radius: 8)

                AudioAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
                    AudioPlayerView(
                        attachment: attachment,
                        context: .feedPost,
                        accentColor: media.thumbnailColor,
                        transcription: media.transcription,
                        availability: availability,
                        onDownload: onDownload
                    )
                }
                .padding(.horizontal, 28)
            }
            .padding(.bottom, 120)
        }
    }
}

// MARK: - Reel Poster

/// Edge-to-edge progressive image used as a video poster and as the image-reel
/// content. Falls back to a tinted fill while loading.
private struct ReelPoster: View {
    let thumbHash: String?
    let url: String?
    let color: String

    var body: some View {
        ProgressiveCachedImage(
            thumbHash: thumbHash,
            thumbnailUrl: url,
            fullUrl: url,
            autoLoad: true
        ) {
            Color(hex: color).shimmer()
        }
        .aspectRatio(contentMode: .fill)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .ignoresSafeArea()
    }
}
