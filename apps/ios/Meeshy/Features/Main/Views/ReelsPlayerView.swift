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
    /// Real safe-area insets (the media is full-bleed via `.ignoresSafeArea()`,
    /// so the chrome reads them explicitly to clear the Dynamic Island / home bar).
    var safeArea: EdgeInsets = EdgeInsets()
    var onClose: () -> Void
    /// Opens the author's profile (wired in RootView to the same
    /// `router.deepLinkProfileUser` sheet the feed uses). `nil` = no-op.
    var onOpenProfile: ((_ userId: String, _ username: String) -> Void)? = nil
    /// Opens the author's active story (wired in RootView to the same
    /// `StoryViewerCoordinator` the feed uses). `nil` = no-op.
    var onOpenStory: ((_ userId: String) -> Void)? = nil
    /// Reports whether the given author currently has an active story, so the
    /// avatar tap can route to the story (else it falls back to the profile).
    /// Backed by `StoryViewModel.hasUnviewedStories` / `storyRingState` in
    /// RootView — the single source of truth the feed avatars read.
    var authorHasStory: ((_ userId: String) -> Bool)? = nil

    @StateObject private var viewModel = ReelsViewModel()
    @State private var commentsReel: FeedPost?
    @State private var edgeDrag: CGFloat = 0
    /// Immersive mode: when `true`, ALL chrome (back button, info overlay,
    /// action rail, scrub) is hidden for distraction-free viewing. Toggled on
    /// by a long-press; any tap restores it (mirrors the Story viewer).
    @State private var chromeHidden = false

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
                chromeHidden: $chromeHidden,
                onLike: { viewModel.toggleLike(reel) },
                onComment: { commentsReel = reel },
                onBookmark: { viewModel.toggleBookmark(reel) },
                onShare: { viewModel.share(reel) },
                onTapAuthorName: { openProfile(for: reel) },
                onTapAvatar: { openAvatarDestination(for: reel) }
            )
            .onAppear {
                Task { await viewModel.loadMoreIfNeeded(currentReel: reel) }
            }
        }
        .ignoresSafeArea()
    }

    // MARK: Author navigation

    /// Author name tap → profile. Mirrors the feed's
    /// `router.deepLinkProfileUser = ProfileSheetUser(...)` path via the
    /// `onOpenProfile` callback wired in RootView.
    private func openProfile(for reel: FeedPost) {
        guard !reel.authorId.isEmpty else { return }
        HapticFeedback.light()
        onOpenProfile?(reel.authorId, reel.authorUsername ?? reel.author)
    }

    /// Avatar tap → the author's story if they have an active one (mirrors the
    /// feed avatar's story-ring behavior), otherwise opens the profile.
    private func openAvatarDestination(for reel: FeedPost) {
        guard !reel.authorId.isEmpty else { return }
        HapticFeedback.light()
        if authorHasStory?(reel.authorId) == true {
            onOpenStory?(reel.authorId)
        } else {
            onOpenProfile?(reel.authorId, reel.authorUsername ?? reel.author)
        }
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
            // Sit clearly below the Dynamic Island. `safeArea.top` fluctuates
            // once the status bar hides, so floor it to clear the island reliably.
            .padding(.top, max(safeArea.top, 50) + 28)
            .accessibilityLabel(String(localized: "reels.back", defaultValue: "Retour", bundle: .main))
            // Part of the chrome — fades out in immersive mode (long-press).
            .opacity(chromeHidden ? 0 : 1)
            .allowsHitTesting(!chromeHidden)
            .animation(.easeInOut(duration: 0.25), value: chromeHidden)
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
    /// Shared immersive flag (owned by `ReelsPlayerView`). Long-press hides all
    /// chrome; the next tap restores it (mirrors the Story viewer).
    @Binding var chromeHidden: Bool
    var onLike: () -> Void
    var onComment: () -> Void
    var onBookmark: () -> Void
    var onShare: () -> Void
    /// Author name tap → profile.
    var onTapAuthorName: () -> Void
    /// Avatar tap → story (if active) else profile.
    var onTapAvatar: () -> Void

    @State private var descriptionExpanded = false
    /// Prisme: the language the viewer explicitly picked via a flag / the
    /// translate toggle. `nil` = the auto-resolved preferred translation.
    @State private var selectedLanguage: String?
    // Plain reference (NOT @ObservedObject): the page itself doesn't need to
    // re-render on every 0.1s time tick — only `ReelScrubBar` observes the
    // manager. Used here only for the fire-and-forget `togglePlayPause()` tap.
    private let playerManager = SharedAVPlayerManager.shared

    private var accentColor: String { reel.authorColor }

    /// Description text for the currently-explored language (Prisme): preferred
    /// by default, the original when the translate toggle is on, or a specific
    /// available translation when a flag is tapped.
    private var displayedDescription: String {
        guard let sel = selectedLanguage?.lowercased() else { return reel.displayContent }
        if sel == reel.originalLanguage?.lowercased() { return reel.content }
        if let t = reel.translations?.first(where: { $0.key.lowercased() == sel })?.value {
            return t.text
        }
        return reel.displayContent
    }

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

            // Immersive gesture zone — fills the screen BEHIND the overlay.
            //   • Tap (chrome visible)  → toggle play/pause (video reels only).
            //   • Tap (chrome hidden)   → ONLY restore chrome; do NOT also
            //     play/pause on this restoring tap (mirrors the Story reader's
            //     resume-tap guard).
            //   • Long-press            → enter immersive mode (hide chrome).
            // Always present (even for image/audio reels) so long-press immersion
            // works everywhere; play/pause is gated to video reels inside.
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { handleContentTap() }
                .onLongPressGesture(minimumDuration: 0.3) { enterImmersive() }

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
            // The whole chrome stack (info + rail + scrub) fades out together in
            // immersive mode and stops taking touches so the restoring tap and
            // long-press reach the content zone underneath.
            .opacity(chromeHidden ? 0 : 1)
            .allowsHitTesting(!chromeHidden)
            .animation(.easeInOut(duration: 0.25), value: chromeHidden)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Immersive mode

    /// Long-press confirmed → hide all chrome for distraction-free viewing.
    private func enterImmersive() {
        guard !chromeHidden else { return }
        HapticFeedback.medium()
        withAnimation(.easeInOut(duration: 0.25)) { chromeHidden = true }
    }

    /// A tap on the content zone. The FIRST tap while immersed only restores the
    /// chrome — it must NOT also toggle play/pause (Story-reader resume-tap
    /// semantics). Otherwise it's the normal play/pause toggle (video only).
    private func handleContentTap() {
        if chromeHidden {
            withAnimation(.easeInOut(duration: 0.25)) { chromeHidden = false }
            return
        }
        if isVideoReel { playerManager.togglePlayPause() }
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

    // MARK: Info overlay (author + description + timestamp + language flags)

    private var infoOverlay: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                // Avatar tap → author's story (if active) else profile.
                Button(action: onTapAvatar) {
                    MeeshyAvatar(
                        name: reel.author,
                        context: .postAuthor,
                        accentColor: accentColor,
                        avatarURL: reel.authorAvatarURL
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "reels.author.avatar", defaultValue: "Story de l'auteur", bundle: .main))

                // Name tap → author profile.
                Button(action: onTapAuthorName) {
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
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "reels.author.profile", defaultValue: "Profil de l'auteur", bundle: .main))
            }

            if !displayedDescription.isEmpty {
                Text(displayedDescription)
                    .font(.subheadline)
                    .foregroundColor(.white)
                    .lineLimit(descriptionExpanded ? nil : 3)
                    .fixedSize(horizontal: false, vertical: true)
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: 0.2)) { descriptionExpanded.toggle() }
                    }
            }

            // Prisme Linguistique — meta row mirroring the message-bubble footer:
            // timestamp, then the translate toggle, then the available-language
            // flag pills (tap a flag to read that language; the active one is
            // underlined). Inline next to the date, as in conversation bubbles.
            ReelMetaRow(
                timestamp: RelativeTimeFormatter.shortString(for: reel.timestamp),
                originalLanguage: reel.originalLanguage,
                translationLanguages: Array(reel.translations?.keys ?? Dictionary<String, PostTranslation>().keys),
                selectedLanguage: selectedLanguage,
                onSelectLanguage: { code in
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedLanguage = (selectedLanguage?.lowercased() == code.lowercased()) ? nil : code
                    }
                },
                onToggleTranslate: {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        let orig = reel.originalLanguage
                        selectedLanguage = (selectedLanguage?.lowercased() == orig?.lowercased()) ? nil : orig
                    }
                }
            )
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

// MARK: - Reel Language Flags (Prisme Linguistique)

/// Meta row for a reel — mirrors the conversation message-bubble footer
/// (`BubbleFooter.metaLeading`): the timestamp, then the translate toggle
/// (`🌐`, stable position), then the available-language flag pills. Tapping a
/// flag reads that language; the active one is underlined in its language color.
/// The translate toggle flips between the viewer's preferred translation and the
/// original. (Per-language is a LOCAL switch over the post's pre-loaded
/// translations — iOS has no on-demand post-translation request path.)
private struct ReelMetaRow: View {
    let timestamp: String
    let originalLanguage: String?
    let translationLanguages: [String]
    let selectedLanguage: String?
    var onSelectLanguage: (String) -> Void
    var onToggleTranslate: () -> Void

    /// Deduped, ordered (original first), capped at 4 to stay discreet.
    private var codes: [String] {
        var seen = Set<String>()
        var ordered: [String] = []
        func add(_ raw: String?) {
            guard let code = raw, !code.isEmpty, !seen.contains(code.lowercased()) else { return }
            seen.insert(code.lowercased())
            ordered.append(code)
        }
        add(originalLanguage)
        translationLanguages.sorted().forEach { add($0) }
        return Array(ordered.prefix(4))
    }

    var body: some View {
        HStack(spacing: 8) {
            Text(timestamp)
                .font(.caption2)
                .foregroundColor(.white.opacity(0.65))

            if !codes.isEmpty {
                // Translate affordance first (stable), exactly like the bubble footer.
                Button(action: onToggleTranslate) {
                    Image(systemName: "translate")
                        .font(.caption2.weight(.medium))
                        .foregroundColor(MeeshyColors.indigo400)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "reels.translate", defaultValue: "Traduire", bundle: .main))

                HStack(spacing: 6) {
                    ForEach(codes, id: \.self) { code in
                        let display = LanguageDisplay.from(code: code)
                        let isActive = selectedLanguage?.lowercased() == code.lowercased()
                        Button { onSelectLanguage(code) } label: {
                            VStack(spacing: 1) {
                                Text(display?.flag ?? code.uppercased())
                                    .font(isActive ? .caption : .caption2)
                                if isActive {
                                    RoundedRectangle(cornerRadius: 1)
                                        .fill(Color(hex: display?.color ?? LanguageDisplay.defaultColor))
                                        .frame(width: 10, height: 1.5)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(display?.name ?? code.uppercased())
                    }
                }
            }
        }
        .shadow(color: .black.opacity(0.4), radius: 3, y: 1)
    }
}

// MARK: - Reel Scrub Bar

/// Draggable seek bar for the active reel video — Instagram-reels style: just
/// the track + thumb, no time numbers. Bound to the shared engine's
/// `currentTime` / `duration`; dragging seeks anywhere in the clip via
/// `seek(to:)`. Reuses the proven scrub pattern (GeometryReader + high-priority
/// drag so the horizontal pan wins over the vertical pager).
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

    var body: some View {
        track
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "reels.scrub", defaultValue: "Avancer ou reculer", bundle: .main))
            // No on-screen time numbers (Instagram-reels style), but VoiceOver
            // still announces playback position as a percentage.
            .accessibilityValue("\(Int((progress * 100).rounded()))%")
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
                        // ALWAYS clear the seeking flag, even on the early
                        // duration==0 bail. A drag whose `onEnded` leaves
                        // `isSeeking` stuck `true` would freeze `progress` on
                        // the stale `seekFraction` forever — the scrub would
                        // stop tracking playback and seeks would die (the
                        // "scrub dead after a play-through" failure mode).
                        defer { isSeeking = false; seekFraction = 0 }
                        guard manager.duration > 0 else { return }
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        manager.seek(to: fraction * manager.duration)
                        HapticFeedback.light()
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
        // GeometryReader reports the REAL finite allocated size; an explicit
        // `.frame(width:height:)` from it pins the video surface to the screen.
        // A layer-backed `UIViewRepresentable` otherwise reports the video's
        // aspect-fill intrinsic width (e.g. 1561pt for 16:9) and `.frame(maxWidth:
        // .infinity)` does NOT clamp it — that inflated the page ZStack to the
        // video width and pushed the action rail / info / scrub bar off-screen.
        GeometryReader { geo in
            ZStack {
                ReelPoster(thumbHash: media.thumbHash, url: media.thumbnailUrl ?? media.url, color: media.thumbnailColor)

                // Tap-to-pause is handled by the page-level tap zone (ReelPageView),
                // so this surface stays gesture-free to avoid swallowing scrub/rail
                // touches.
                if isActive, ready, isShowingThis, let player = manager.player {
                    ReelVideoSurface(player: player)
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
            .adaptiveOnChange(of: isActive) { _, _ in drive(ready: ready) }
            .adaptiveOnChange(of: ready) { _, _ in drive(ready: ready) }
            .adaptiveOnChange(of: revealCompleted) { _, _ in drive(ready: ready) }
            .onDisappear {
                // Releasing only when this page actually owns the engine avoids
                // tearing down the next reel that has already loaded during paging.
                if isShowingThis { manager.stop() }
            }
        }
        .ignoresSafeArea()
    }

    private func drive(ready: Bool) {
        guard isActive, ready else { return }
        if manager.activeURL != attachment.fileUrl {
            manager.attachmentId = media.id
            manager.isMuted = false
            manager.load(urlString: attachment.fileUrl)
        }
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
private struct ReelVideoSurface: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> ReelPlayerLayerView {
        let view = ReelPlayerLayerView()
        view.backgroundColor = .black
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ view: ReelPlayerLayerView, context: Context) {
        if view.playerLayer.player !== player {
            view.playerLayer.player = player
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
private final class ReelPlayerLayerView: UIView {
    override static var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
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
