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
        /// Comment targeted by a notification — when set, the reel auto-opens its
        /// comments sheet and scrolls to / highlights this comment.
        var commentId: String?
        /// Parent comment when `commentId` is a reply — the sheet expands the
        /// parent thread before scrolling to the reply.
        var parentCommentId: String?
        static func == (lhs: Launch, rhs: Launch) -> Bool { lhs.id == rhs.id }
    }

    @Published var launch: Launch?

    private init() {}

    /// Opens the reels seeded from posts already on screen, starting on `startId`.
    /// `commentId` (optional) opens the comments sheet on the seed reel and scrolls
    /// to that comment — used by tapped reel comment notifications.
    func present(posts: [FeedPost], startId: String?, commentId: String? = nil, parentCommentId: String? = nil) {
        launch = Launch(seedPosts: posts, startId: startId, commentId: commentId, parentCommentId: parentCommentId)
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
    /// Comment targeted by a notification — when set, the seed reel auto-opens
    /// its comments sheet and scrolls to / highlights this comment.
    var commentTargetId: String? = nil
    /// Parent comment when `commentTargetId` is a reply (expands the parent thread).
    var commentParentTargetId: String? = nil
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
    /// Comment target carried into the comments sheet when it auto-opens from a
    /// notification. Cleared when the user opens comments manually so a later tap
    /// never re-scrolls to the old target.
    @State private var pendingCommentTargetId: String?
    @State private var pendingCommentParentTargetId: String?
    @State private var edgeDrag: CGFloat = 0
    /// Immersive mode: when `true`, ALL chrome (back button, info overlay,
    /// action rail, scrub) is hidden for distraction-free viewing. Toggled on
    /// by a long-press; any tap restores it (mirrors the Story viewer).
    @State private var chromeHidden = false
    /// Set once `ReelsViewModel.shareLink(for:)` returns — the `.sheet(item:)`
    /// presents the system share UI (the same `meeshy.me/l/<token>` link the
    /// feed shares) and clears it on dismiss. Aligns the reel share with the feed.
    @State private var shareableLink: ShareableLink?
    /// Reel ids whose share request is currently in flight, so a double-tap of the
    /// share button can't fire two mints (mirrors the feed's `postShareInFlightIds`).
    @State private var shareInFlightIds: Set<String> = []

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
        .task {
            viewModel.seed(posts: seedPosts, startId: startId)
            // Reel comment notification: auto-open the comments sheet on the seed
            // reel and scroll to the targeted comment. Brief delay so the reel is
            // on screen first (the reveal disc settles), then present.
            guard let cid = commentTargetId, !cid.isEmpty else { return }
            try? await Task.sleep(nanoseconds: 450_000_000)
            let reel = seedPosts.first(where: { $0.id == startId }) ?? seedPosts.first ?? viewModel.reels.first
            if let reel {
                pendingCommentTargetId = cid
                pendingCommentParentTargetId = commentParentTargetId
                commentsReel = reel
            }
        }
        // Cycle de vie de la post room du réel actif (real-time du like). Idempotent
        // côté serveur : rejoindre/quitter une room déjà (non) jointe est un no-op,
        // donc une disparition transitoire du reveal se ré-auto-corrige. Le `leave`
        // est fait dans le `.onDisappear` plus bas (combiné avec la finalisation
        // d'engagement).
        .onAppear {
            if let id = viewModel.currentId { SocialSocketManager.shared.joinPostRoom(postId: id) }
        }
        .adaptiveOnChange(of: viewModel.currentId) { old, newId in
            // Never carry immersive-hidden chrome into the next reel — the scrub
            // bar / action rail / info must reappear when you page.
            if chromeHidden { chromeHidden = false }
            if newId != nil { HapticFeedback.light() }
            // Order matters: finalize the PREVIOUS reel's session (real watch-time +
            // heartbeat samples + completed) and `end` it BEFORE `begin` of the next —
            // both in the SAME Task so `begin` never races ahead of the deferred `end`
            // (which would drop the previous reel's qualified view).
            Task {
                if old != nil {
                    finalizeReelSession()
                    await EngagementTracker.shared.end(surface: .reels)
                }
                guard let newId else { return }
                EngagementTracker.shared.begin(postId: newId, contentType: .reel, surface: .reels)
                viewModel.recordView(newId)
            }
        }
        .sheet(item: $commentsReel) { reel in
            CommentsSheetView(
                post: reel,
                accentColor: reel.authorColor,
                targetCommentId: pendingCommentTargetId,
                targetParentCommentId: pendingCommentParentTargetId,
                onCommentSent: { postId in viewModel.didSendComment(postId: postId) }
            )
        }
        .sheet(item: $shareableLink) { link in
            // Same `meeshy.me/l/<token>` URL the feed shares — the gateway already
            // recorded the (deduplicated) share + minted the caller's TrackingLink.
            ShareSheet(activityItems: [link.url])
        }
        // Call-aware : un appel entrant pendant un réel ouvert doit le mettre en
        // pause (vidéo + audio) — la session audio appartient alors à l'appel. Le
        // viewer étant immobile, aucune `drive`-pass n'est rappelée ; on pause donc
        // ici dès la transition inactif→actif. La garde `!isCallActive` dans `drive`
        // empêche le redémarrage tant que l'appel dure.
        .onReceive(
            CallManager.shared.$callState
                .map(\.isActive)
                .removeDuplicates()
                .receive(on: DispatchQueue.main)
        ) { callActive in
            guard callActive else { return }
            SharedAVPlayerManager.shared.pause()
            PlaybackCoordinator.shared.stopAllAudio()
        }
        .onDisappear {
            // Quitte la post room du réel actif (real-time like) + finalise la session
            // d'engagement (watch-time + vue qualifiée) du réel courant.
            viewModel.leaveActivePostRoom()
            finalizeReelSession()
            Task { await EngagementTracker.shared.end(surface: .reels) }
        }
        .statusBarHidden(true)
    }

    /// Finalizes the current reel's engagement session: pushes the real watch-time,
    /// the drained heartbeat samples (→ server's 30%/90% qualified-view rule), and
    /// whether playback reached the end (→ playCount). Does NOT call `end` — the
    /// caller orders `end` (and any subsequent `begin`) around it.
    private func finalizeReelSession() {
        let m = SharedAVPlayerManager.shared
        let watchMs = m.currentTime.isNaN ? 0 : Int(m.currentTime * 1000)
        let durMs = m.duration > 0 ? Int(m.duration * 1000) : nil
        let drained = m.drainWatchSamples()
        let maxPos = max(watchMs, drained.samples.map(\.positionMs).max() ?? 0)
        let completed: Bool = {
            if drained.reachedEnd { return true }
            guard let d = durMs, d > 0 else { return false }
            return maxPos >= Int(Double(d) * 0.95)
        }()
        EngagementTracker.shared.attachWatch(surface: .reels, watchMs: watchMs,
            mediaDurationMs: durMs, completed: completed, samples: drained.samples)
    }

    // MARK: Share

    /// Reel share — mirrors the feed's `sharePostWithLink`. Guards against a
    /// double-tap, fires haptic immediately, then mints the deduplicated tracking
    /// link via the view-model and presents the system share sheet. On failure it
    /// still surfaces the raw post URL so the user always has something to share.
    @MainActor
    private func shareReel(_ reel: FeedPost) {
        guard !shareInFlightIds.contains(reel.id) else { return }
        shareInFlightIds.insert(reel.id)
        HapticFeedback.light()
        Task {
            defer { Task { @MainActor in shareInFlightIds.remove(reel.id) } }
            if let shortUrl = await viewModel.shareLink(for: reel),
               let url = URL(string: shortUrl) {
                shareableLink = ShareableLink(url: url)
            } else if let raw = ShareableLink.fallback(forPostId: reel.id) {
                shareableLink = raw
            }
        }
    }

    // MARK: Pager

    private var pager: some View {
        AdaptiveVerticalPager(items: viewModel.reels, currentPageID: $viewModel.currentId) { _, reel in
            ReelPageView(
                reel: reel,
                isActive: viewModel.currentId == reel.id,
                revealCompleted: revealCompleted,
                viewModel: viewModel,
                chromeHidden: $chromeHidden,
                onComment: {
                    // Manual open: drop any notification target so we don't
                    // re-scroll to a stale comment.
                    pendingCommentTargetId = nil
                    pendingCommentParentTargetId = nil
                    commentsReel = reel
                },
                onShare: { shareReel(reel) },
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
                // Glyphe héros décoratif ≥40pt : figé (doctrine 74i/86i) + masqué VoiceOver (le texte porte le sens)
                Image(systemName: "play.rectangle.on.rectangle")
                    .font(.system(size: 44))
                    .foregroundColor(.white.opacity(0.7))
                    .accessibilityHidden(true)
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
                // Glyphe chrome dans un cadre de tap fixe 40×40 : figé (doctrine 82i) ; le bouton porte le libellé
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

// MARK: - Reel media open-autostart gate (pure)

/// The single open-autostart gate shared by a reel's audio AND video paths
/// (WS3.1): an active reel starts its media only once the liquid reveal has
/// completed and no call owns the audio session. Extracted as a pure function so
/// the truth table is unit-testable. `ReelVideoView.drive()` encodes the
/// identical condition for the video engine, so both media kinds start in
/// lockstep.
enum ReelMediaAutostart {
    nonisolated static func shouldStart(isActive: Bool, revealCompleted: Bool, isCallActive: Bool) -> Bool {
        isActive && revealCompleted && !isCallActive
    }

    /// Idempotency guard for the audio open-autostart (F4/F6): only (re)start the
    /// engine when it is not already loaded with this url. `currentUrl` and `url`
    /// MUST be compared in the SAME normalized form the engine stores — for a
    /// `file://` url `AudioPlaybackManager.playLocal` stores `URL.absoluteString`,
    /// which can differ from the raw string, so the caller normalizes first. Keeps
    /// a re-render / reveal flip from restarting in-place audio.
    nonisolated static func shouldLoadAudio(currentUrl: String?, url: String) -> Bool {
        currentUrl != url
    }
}

// MARK: - Reel Page

/// One full-screen reel: media background + bottom gradient + author/description
/// overlay + a right-hand action rail (like / comment / bookmark / share).
struct ReelPageView: View {
    let reel: FeedPost
    let isActive: Bool
    let revealCompleted: Bool
    /// The reels view-model — passed so the action rail can read the live
    /// like/bookmark/comment counters reactively (the rail observes it).
    let viewModel: ReelsViewModel
    /// Shared immersive flag (owned by `ReelsPlayerView`). Long-press hides all
    /// chrome; the next tap restores it (mirrors the Story viewer).
    @Binding var chromeHidden: Bool
    var onComment: () -> Void
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
    /// Audio-reel playback engine — SHARED between the play/scrub control
    /// (`ReelAudioControl` → `AudioPlayerView(externalPlayer:)`) and the hero
    /// transcript (`ReelAudioView` → `MediaTranscriptionView`) so the karaoke
    /// highlight tracks the SAME position the user scrubs/plays. One engine per
    /// page; only the active audio reel ever plays.
    @StateObject private var audioPlayer = AudioPlaybackManager()

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
        reel.primaryReelDisplayMedia?.type == .video
    }

    /// The audio media for an audio reel, else `nil`. Drives the immersive
    /// transcript hero + the audio control + audio-language flag strip.
    private var audioMedia: FeedMedia? {
        guard let media = reel.primaryReelDisplayMedia, media.type == .audio else { return nil }
        return media
    }

    /// The "original" language for the meta-row flag strip: the audio
    /// transcription language for an audio reel, else the post's original
    /// language. Listed first in the strip.
    private var metaOriginalLanguage: String? {
        if let audioMedia { return audioMedia.transcription?.language ?? reel.originalLanguage }
        return reel.originalLanguage
    }

    /// The translation languages for the meta-row flag strip: the translated
    /// audio (TTS) target languages for an audio reel, else the post-body
    /// translation languages.
    private var metaTranslationLanguages: [String] {
        if let audioMedia { return audioMedia.translatedAudios.map(\.targetLanguage) }
        return Array(reel.translations?.keys ?? Dictionary<String, PostTranslation>().keys)
    }

    var body: some View {
        ZStack {
            // Tap + long-press attach DIRECTLY to the media, NOT as a separate
            // full-screen `Color.clear` sibling above it. A hit-testing overlay
            // above the media swallowed the touch-down for an image reel's
            // horizontal carousel (whose `ScrollView` lives INSIDE `mediaLayer`,
            // below the overlay), so the carousel could not be swiped.
            //   • Tap (chrome visible)  → toggle play/pause (video reels only).
            //   • Tap (chrome hidden)   → ONLY restore chrome (Story-reader
            //     resume-tap guard).
            //   • Long-press            → enter immersive mode (hide chrome).
            // `.onTapGesture` / `.onLongPressGesture` stay mutually exclusive
            // (tap does not fire after a successful long-press) and, being
            // `.gesture`-based, yield to the child `ScrollView` pans: a horizontal
            // carousel swipe and the vertical reel pager both win once the drag
            // passes the press threshold. All four gestures coexist.
            mediaLayer
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
                .clipped()
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

                // Audio reel: the play/scrub control sits in the chrome (on top
                // of the transcript hero) just above the author/flags row, so it
                // is tappable and fades in immersive mode. Driven by
                // `selectedLanguage` so a flag tap plays that language's TTS.
                if let audioMedia, isActive {
                    ReelAudioControl(media: audioMedia, selectedLanguage: $selectedLanguage, player: audioPlayer)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 10)
                }

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
            // Sit the description / action rail / scrub lower, closer to the
            // bottom edge (just clearing the home indicator).
            .padding(.bottom, 44)
            // The whole chrome stack (info + rail + scrub) fades out together in
            // immersive mode and stops taking touches so the restoring tap and
            // long-press reach the content zone underneath.
            .opacity(chromeHidden ? 0 : 1)
            .allowsHitTesting(!chromeHidden)
            .animation(.easeInOut(duration: 0.25), value: chromeHidden)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            autoSelectPreferredAudioLanguage()
            startActiveAudioIfNeeded()
        }
        // Cut the previous reel's audio the moment we page away from it (the
        // video engine is left alone — the incoming video reel drives its own).
        // Becoming active (re)starts this reel's audio through the SAME open-
        // autostart gate `ReelVideoView.drive()` uses for the video engine.
        .adaptiveOnChange(of: isActive) { _, active in
            if active { startActiveAudioIfNeeded() }
            else { PlaybackCoordinator.shared.stopAllAudio() }
        }
        // The first reel holds on its poster (audio paused) until the liquid
        // reveal completes; start audio when the disc reaches full screen —
        // mirror of `ReelVideoView.drive`'s `revealCompleted` trigger.
        .adaptiveOnChange(of: revealCompleted) { _, _ in startActiveAudioIfNeeded() }
        // F3 — resume this reel's audio when a call ENDS. The call-start (true)
        // edge is paused by `ReelsPlayerView`'s `$callState` subscription, but the
        // in-process WebRTC teardown posts no system interruption-ended, so a reel
        // opened during a call would stay silent. Re-run the open-autostart gate
        // on the false edge (`startActiveAudioIfNeeded` is gated on
        // `!isCallActive` + idempotent on the loaded url). `.receive(on: .main)`
        // so `MediaSessionCoordinator.isCallActive` is already cleared (set in
        // `callState.didSet`) by the time the gate re-checks it.
        .onReceive(
            CallManager.shared.$callState
                .map(\.isActive)
                .removeDuplicates()
                .receive(on: DispatchQueue.main)
        ) { callActive in
            if !callActive { startActiveAudioIfNeeded() }
        }
    }

    // MARK: Audio open-autostart (WS3.1)

    /// Single open-autostart gate shared by this reel's audio and video paths:
    /// an active reel starts its media only once the liquid reveal has completed
    /// and no call owns the audio session. `ReelVideoView.drive` encodes the
    /// identical condition for the video engine, so both media kinds start in
    /// lockstep. Backed by the pure `ReelMediaAutostart.shouldStart` truth table.
    private var shouldStartActiveMedia: Bool {
        ReelMediaAutostart.shouldStart(
            isActive: isActive,
            revealCompleted: revealCompleted,
            isCallActive: MediaSessionCoordinator.shared.isCallActive
        )
    }

    /// The audio URL to play for the active audio reel, honoring the explored
    /// language (translated TTS) — mirrors `AudioPlayerView.currentAudioUrl`.
    private func resolvedAudioUrl(for media: FeedMedia) -> String {
        if let sel = selectedLanguage?.lowercased(),
           let translated = media.translatedAudios.first(where: { $0.targetLanguage.lowercased() == sel }) {
            return translated.url
        }
        return media.toMessageAttachment().fileUrl
    }

    /// Starts the per-page audio engine for an audio reel on open — the audio
    /// analogue of `ReelVideoView.drive()` (there was none, so audio reels opened
    /// paused). No-ops for non-audio reels, when the open-autostart gate is not
    /// met (inactive / reveal pending / call active), or when the engine is
    /// already loaded with this URL (so a re-render or reveal flip never restarts
    /// it). Uses the SAME play path `AudioPlayerView` uses: `file://` →
    /// `playLocal`, else `play(urlString:)`. `PlaybackCoordinator` keeps a single
    /// audio reel playing (the inactive page's `stopAllAudio()` cuts the previous
    /// one); the `isCallActive` gate keeps the call's audio session intact.
    private func startActiveAudioIfNeeded() {
        guard shouldStartActiveMedia, let audioMedia else { return }
        let attachment = audioMedia.toMessageAttachment()
        let url = resolvedAudioUrl(for: audioMedia)
        // F6 — compare against the value the engine WILL store, not the raw url:
        // `playLocal` stores `URL.absoluteString` (normalized), so a raw `file://`
        // string never matches `currentUrl` and the guard would restart on every
        // re-render. Normalize the local case here so the idempotency holds.
        let localURL: URL? = url.hasPrefix("file://") ? URL(string: url) : nil
        let storedUrl = localURL?.absoluteString ?? url
        guard ReelMediaAutostart.shouldLoadAudio(currentUrl: audioPlayer.currentUrl, url: storedUrl) else { return }
        audioPlayer.attachmentId = attachment.id
        if let localURL {
            audioPlayer.playLocal(url: localURL)
        } else {
            audioPlayer.play(urlString: url)
        }
    }

    /// Prisme — for an audio reel, default to the viewer's preferred language if a
    /// translated audio (TTS) exists for it, so the right transcript/audio is
    /// applied automatically. No-op for text/image reels or when no TTS matches
    /// (the user can still tap a flag). Only sets when the viewer has not already
    /// chosen a language.
    private func autoSelectPreferredAudioLanguage() {
        guard selectedLanguage == nil, let audioMedia else { return }
        let preferred = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        let targets = audioMedia.translatedAudios.map(\.targetLanguage)
        if let match = targets.first(where: { code in
            preferred.contains { $0.lowercased() == code.lowercased() }
        }) {
            selectedLanguage = match
        }
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
        if let media = reel.primaryReelDisplayMedia {
            switch media.type {
            case .video:
                ReelVideoView(media: media, isActive: isActive, revealCompleted: revealCompleted)
            case .image:
                ReelImageView(reel: reel)
            case .audio:
                ReelAudioView(media: media, accentColor: accentColor, selectedLanguage: $selectedLanguage, player: audioPlayer)
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

    /// True when the signed-in user authored this reel — gates the private reach
    /// stats (impressions + views) shown only to the author.
    private var isAuthor: Bool {
        guard let me = AuthManager.shared.currentUser?.id else { return false }
        return me == reel.authorId
    }

    /// Username, then (AUTHOR ONLY) impressions then views, middle-dot separated:
    /// "@pseudo · 📊 1.2k · 👁 3.4k". Mirrors the feed reel card.
    @ViewBuilder
    private var authorMetaLine: some View {
        HStack(spacing: 5) {
            if let username = reel.authorUsername, !username.isEmpty {
                Text("@\(username)").font(.caption).foregroundColor(.white.opacity(0.7))
            }
            if isAuthor {
                if reel.authorUsername?.isEmpty == false { metaDot }
                statInline(icon: "chart.bar.fill", count: reel.impressionCount,
                           a11yLabel: String(localized: "feed.reel.impressions", defaultValue: "Impressions", bundle: .main))
                metaDot
                statInline(icon: "eye.fill", count: reel.postOpenCount,
                           a11yLabel: String(localized: "feed.reel.views", defaultValue: "Vues", bundle: .main))
            }
        }
    }

    private var metaDot: some View {
        Text("·").font(.caption).foregroundColor(.white.opacity(0.55))
    }

    private func statInline(icon: String, count: Int, a11yLabel: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon).font(MeeshyFont.relative(10, weight: .semibold))
            Text(ReelActionButton.compact(count)).font(.caption2.weight(.medium))
        }
        .foregroundColor(.white.opacity(0.85))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(a11yLabel)
        .accessibilityValue("\(count)")
    }

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
                        authorMetaLine
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "reels.author.profile", defaultValue: "Profil de l'auteur", bundle: .main))
            }

            // Audio reels show the post caption only when it adds something
            // beyond the transcript hero; text/image reels always show it.
            // Collapsed: 3 lines + tap to expand. Expanded: a height-bounded
            // ScrollView so a long caption stays fully readable AND scrollable
            // instead of overflowing off the top of the screen (the previous
            // `lineLimit(nil)` + `fixedSize` grew unbounded and clipped).
            if audioMedia == nil, !displayedDescription.isEmpty {
                if descriptionExpanded {
                    ScrollView(.vertical, showsIndicators: true) {
                        Text(displayedDescription)
                            .font(.subheadline)
                            .foregroundColor(.white)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 240)
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: 0.2)) { descriptionExpanded.toggle() }
                    }
                } else {
                    Text(displayedDescription)
                        .font(.subheadline)
                        .foregroundColor(.white)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .onTapGesture {
                            withAnimation(.easeInOut(duration: 0.2)) { descriptionExpanded.toggle() }
                        }
                }
            }

            // Prisme Linguistique — meta row mirroring the message-bubble footer:
            // timestamp, then the translate toggle, then the available-language
            // flag pills (tap a flag to read that language; the active one is
            // underlined). Inline next to the date, as in conversation bubbles.
            // For an AUDIO reel the flags switch the AUDIO (transcript + TTS) —
            // the original transcription language + every translated-audio target
            // language — instead of the post-body text. For text/image reels they
            // switch the post-body translation.
            ReelMetaRow(
                timestamp: RelativeTimeFormatter.shortString(for: reel.timestamp),
                originalLanguage: metaOriginalLanguage,
                translationLanguages: metaTranslationLanguages,
                selectedLanguage: selectedLanguage,
                onSelectLanguage: { code in
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedLanguage = (selectedLanguage?.lowercased() == code.lowercased()) ? nil : code
                    }
                }
            )
        }
        .shadow(color: .black.opacity(0.4), radius: 4, y: 1)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Action rail

    private var actionRail: some View {
        ReelActionRail(
            viewModel: viewModel,
            reel: reel,
            onComment: onComment,
            onShare: onShare
        )
    }
}

// MARK: - Action Rail (reactive — observes the view-model so the like / bookmark
// / comment counters update the instant they change)

private struct ReelActionRail: View {
    @ObservedObject var viewModel: ReelsViewModel
    let reel: FeedPost
    var onComment: () -> Void
    var onShare: () -> Void

    var body: some View {
        VStack(spacing: 22) {
            let isLiked = viewModel.isLiked(reel.id)
            ReelActionButton(
                systemName: isLiked ? "heart.fill" : "heart",
                outline: "heart",
                tint: isLiked ? MeeshyColors.error : .white,
                count: viewModel.likeCount(reel),
                participated: isLiked,
                accentHex: reel.authorColor,
                action: { viewModel.toggleLike(reel) }
            )
            .accessibilityLabel(String(localized: "reels.action.like", defaultValue: "J'aime", bundle: .main))

            // Vues/impressions : désormais privées (auteur-only) dans la ligne meta
            // sous le nom — plus de compteur de vues public ici.

            ReelActionButton(
                systemName: "bubble.right.fill",
                tint: .white,
                count: viewModel.commentCount(reel),
                action: onComment
            )
            .accessibilityLabel(String(localized: "reels.action.comment", defaultValue: "Commenter", bundle: .main))

            let isBookmarked = viewModel.isBookmarked(reel.id)
            ReelActionButton(
                systemName: isBookmarked ? "bookmark.fill" : "bookmark",
                outline: "bookmark",
                tint: isBookmarked ? MeeshyColors.warning : .white,
                count: viewModel.bookmarkCount(reel),
                participated: isBookmarked,
                accentHex: reel.authorColor,
                action: { viewModel.toggleBookmark(reel) }
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
    /// Outline variant overlaid in the accent colour when `participated` — an
    /// accent BORDER on the glyph (not a circle). Nil = no participation border.
    var outline: String? = nil
    let tint: Color
    let count: Int?
    var participated: Bool = false
    var accentHex: String = ""
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 5) {
                ZStack {
                    // Glyphes du rail d'actions (like/comment/bookmark/share) : taille figée pour
                    // la cohérence de la colonne fixe width:48 (doctrine 86i) ; le bouton porte le libellé
                    Image(systemName: systemName)
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundColor(tint)
                    if participated, let outline {
                        Image(systemName: outline)
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundColor(Color(hex: accentHex))
                    }
                }
                .shadow(color: .black.opacity(0.35), radius: 3, y: 1)
                if let count, count > 0 {
                    Text(Self.compact(count))
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(.white)
                        .shadow(color: .black.opacity(0.35), radius: 2)
                }
            }
            .frame(width: 48)
            // Élargit la zone sensible autour du glyph + compteur. La pile
            // d'actions flotte au-dessus du `mediaLayer` qui porte le tap
            // play/pause (`handleContentTap`) : sans cette extension, un tap qui
            // manquait le glyph de quelques pixels traversait jusqu'au média et
            // togglait la lecture au lieu d'activer le bouton (bug user
            // 2026-06-28). `contentShape(Rectangle())` rend tout le rectangle
            // élargi (padding inclus) sensible, et le padding vertical comble les
            // gaps entre les boutons du rail.
            .padding(.vertical, 6)
            .padding(.horizontal, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    fileprivate static func compact(_ value: Int) -> String {
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
                // Translation flags only (the translate toggle is disabled for now):
                // tap a flag to read that language; the active one is underlined.
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
                // Blurred ambient fill behind the `.fit` poster/video so the WHOLE
                // reel is visible (letterboxed), never cropped and never black
                // bars — mirrors the `.fit` image carousel (`ReelImageBackdrop`).
                ReelImageBackdrop(media: media).equatable()

                ReelPoster(thumbHash: media.thumbHash, url: media.thumbnailUrl ?? media.url, color: media.thumbnailColor, contentMode: .fit).equatable()

                // Tap-to-pause is handled by the page-level tap zone (ReelPageView),
                // so this surface stays gesture-free to avoid swallowing scrub/rail
                // touches.
                if isActive, ready, isShowingThis, let player = manager.player {
                    ReelVideoSurface(player: player, videoGravity: .resizeAspect)
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

    private func drive(ready: Bool) {
        // Défense en profondeur call-aware (miroir de `ReelFeedVideoSurface.drive`) :
        // ne jamais (re)lancer un réel pendant un appel — la session audio appartient
        // à l'appel. La mise en pause immédiate au démarrage d'un appel est gérée par
        // l'abonnement `CallManager.$callState` dans `ReelsPlayerView`.
        guard isActive, ready, !MediaSessionCoordinator.shared.isCallActive else { return }
        if manager.activeURL != attachment.fileUrl {
            manager.attachmentId = media.id
            manager.load(urlString: attachment.fileUrl)
        }
        // Le viewer plein écran joue TOUJOURS avec le son. `isMuted` est une
        // préférence GLOBALE de session qui survit à `pause()`/`stop()` et que la
        // surface de fond du feed (`ReelFeedVideoSurface`) force à `true` de façon
        // inconditionnelle. À l'entrée depuis le feed sur la MÊME url, le
        // court-circuit `activeURL == fileUrl` ci-dessus saute `load()`, donc le
        // démutage DOIT être inconditionnel ici (miroir exact du feed qui mute
        // inconditionnellement) — sinon le 1er réel joue muet.
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

    func makeUIView(context: Context) -> ReelPlayerLayerView {
        let view = ReelPlayerLayerView()
        // Transparent (was black): under `.resizeAspect` the letterbox bars must
        // reveal the blurred backdrop behind the surface, not a black band.
        view.backgroundColor = .clear
        view.playerLayer.player = player
        view.playerLayer.videoGravity = videoGravity
        return view
    }

    func updateUIView(_ view: ReelPlayerLayerView, context: Context) {
        if view.playerLayer.player !== player {
            view.playerLayer.player = player
        }
        if view.playerLayer.videoGravity != videoGravity {
            view.playerLayer.videoGravity = videoGravity
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
    override static var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

// MARK: - Reel Media Layout

/// Pure classification of a reel's media into the surface that should render it.
/// App-side: it encodes the product decision of HOW a reel composes its media
/// (single video, image carousel, rich audio, or images + independent audio),
/// derived solely from the post's media. `resolve` is total and order-preserving.
///
/// Not yet wired into `mediaLayer` (which still shows `primaryReelMedia`): it is
/// the tested foundation for the deferred images+audio mixed-media composition.
enum ReelMediaLayout: Equatable {
    /// No playable/visual media (documents / locations only, or empty).
    case empty
    /// A single video drives the reel — video wins over every other kind.
    case video(FeedMedia)
    /// One or more images, no audio: a full-screen image carousel.
    case images([FeedMedia])
    /// One or more audios, no images and no video: the rich audio surface.
    case audioOnly([FeedMedia])
    /// Images (full-screen carousel background) with one or more audios.
    case imagesWithAudio(images: [FeedMedia], audios: [FeedMedia])

    /// Classifies `media` into a layout. Video has top priority; otherwise the
    /// presence of images and/or audios decides. Documents/locations are ignored
    /// (never a reel surface), so a post carrying only those resolves to `.empty`.
    static func resolve(media: [FeedMedia]) -> ReelMediaLayout {
        if let video = media.first(where: { $0.type == .video }) { return .video(video) }
        let images = media.filter { $0.type == .image }
        let audios = media.filter { $0.type == .audio }
        switch (images.isEmpty, audios.isEmpty) {
        case (true, true): return .empty
        case (false, true): return .images(images)
        case (true, false): return .audioOnly(audios)
        case (false, false): return .imagesWithAudio(images: images, audios: audios)
        }
    }

    static func == (lhs: ReelMediaLayout, rhs: ReelMediaLayout) -> Bool {
        switch (lhs, rhs) {
        case (.empty, .empty):
            return true
        case let (.video(a), .video(b)):
            return a.id == b.id
        case let (.images(a), .images(b)):
            return a.map(\.id) == b.map(\.id)
        case let (.audioOnly(a), .audioOnly(b)):
            return a.map(\.id) == b.map(\.id)
        case let (.imagesWithAudio(ai, aa), .imagesWithAudio(bi, ba)):
            return ai.map(\.id) == bi.map(\.id) && aa.map(\.id) == ba.map(\.id)
        default:
            return false
        }
    }
}

// MARK: - Reel Image Carousel

/// Image reel: a single image, or a horizontal page-snapping carousel of images
/// (orthogonal to the vertical reel paging) with dots.
///
/// Mirrors the proven `ConversationMediaGalleryView` composition to fix three
/// carousel defects: ONE `.ignoresSafeArea()` at the pager level (never per
/// cell), each page pinned to the EXACT viewport so the paging stride equals the
/// page width (no half-shown image), and the visible index seeded SYNCHRONOUSLY
/// at init (the first image is present from the first frame — not set in
/// `.onAppear`, which raced `scrollPosition(id:)` and could open scrolled past
/// the first image).
private struct ReelImageView: View {
    let reel: FeedPost
    private let images: [FeedMedia]
    @State private var currentImageId: String?

    init(reel: FeedPost) {
        self.reel = reel
        // Repost-aware: a republished reel's images live on the reposted reel.
        let imgs = reel.reelDisplayMedia.filter { $0.type == .image }
        self.images = imgs
        _currentImageId = State(initialValue: imgs.first?.id)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            if images.count <= 1 {
                if let media = images.first {
                    ReelImageCell(media: media)
                } else {
                    Color.black
                }
            } else {
                AdaptiveHorizontalPager(items: images, currentPageID: $currentImageId, fillVertical: true) { _, media in
                    ReelImageCell(media: media)
                }
                dots
                    .padding(.bottom, 150)
            }
        }
        .ignoresSafeArea()
    }

    private var dots: some View {
        HStack(spacing: 6) {
            ForEach(images) { media in
                Circle()
                    .fill(Color.white.opacity(media.id == currentImageId ? 0.95 : 0.4))
                    .frame(width: 6, height: 6)
            }
        }
        // Decorative dots → expose the position to VoiceOver ("2 / 5") instead of
        // announcing each anonymous circle.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "reels.carousel.image", defaultValue: "Image", bundle: .main))
        .accessibilityValue("\((images.firstIndex { $0.id == currentImageId } ?? 0) + 1) / \(images.count)")
    }
}

/// One carousel page: the whole image, centred (`.fit`), over a blurred ambient
/// backdrop of itself. A ~9:16 image fills the screen (its `.fit` foreground
/// covers the backdrop); any other ratio shows the WHOLE image centred over the
/// blurred backdrop — never black bars, never a cropped/off-centre image.
///
/// The page is already sized to the viewport by the pager (one
/// `.ignoresSafeArea()` + `fillVertical`), so the image is fit/filled with a
/// plain `.frame(maxWidth/maxHeight: .infinity)` — no per-cell `GeometryReader`
/// (which under the iOS 16 `TabView` fallback can report `.zero` on the first
/// pass). Mirrors `ConversationMediaGalleryView` / `ReelPoster`.
private struct ReelImageCell: View {
    let media: FeedMedia

    /// Explicit ratio from the media dimensions so `.fit` actually constrains the
    /// frame (ProgressiveCachedImage has no intrinsic ratio at first render — its
    /// placeholder is `Color.clear` — so a `.aspectRatio(contentMode:)` alone
    /// established a full-screen frame and the loaded image then stretched/filled
    /// it). With an explicit ratio the whole image shows, letterboxed over the
    /// blurred backdrop. Falls back to 9:16 when dimensions are missing.
    private var mediaAspect: CGFloat {
        guard let w = media.width, let h = media.height, w > 0, h > 0 else { return 9.0 / 16.0 }
        return CGFloat(w) / CGFloat(h)
    }

    var body: some View {
        GeometryReader { geo in
            // Exact fitted size from the media ratio — bulletproof: the image is
            // framed to its computed fit box (≤ viewport in both axes), so it can
            // NEVER overflow the viewport. The blurred backdrop fills behind.
            let fit = fittedSize(in: geo.size)
            ZStack {
                ReelImageBackdrop(media: media).equatable()

                ProgressiveCachedImage(
                    thumbHash: media.thumbHash,
                    thumbnailUrl: media.thumbnailUrl ?? media.url,
                    fullUrl: media.url ?? media.thumbnailUrl,
                    autoLoad: true
                ) {
                    Color.clear
                }
                .frame(width: fit.width, height: fit.height)
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
        }
    }

    /// Largest box with `mediaAspect` that fits inside `container` (letterbox).
    /// Guards a zero container (first layout pass) by returning it unchanged.
    private func fittedSize(in container: CGSize) -> CGSize {
        guard container.width > 0, container.height > 0 else { return container }
        let containerAspect = container.width / container.height
        if mediaAspect > containerAspect {
            return CGSize(width: container.width, height: container.width / mediaAspect)
        } else {
            return CGSize(width: container.height * mediaAspect, height: container.height)
        }
    }
}

/// Ambient blurred fill behind a `.fit` carousel image — the media's small
/// thumbnail (or its thumbHash when there is no thumbnail) scaled to fill,
/// blurred and slightly dimmed. NEVER loads the full image (`fullUrl: nil`): a
/// 28pt blur hides the low resolution, and the full image is already fetched by
/// the `.fit` foreground — loading it twice would double the fullscreen network
/// + bitmap cost. Falls back to the media's tint colour.
private struct ReelImageBackdrop: View, Equatable {
    let media: FeedMedia

    /// Equatable so `.equatable()` memoizes the expensive 28pt blur across the
    /// parent's 10 Hz playback-time re-renders. The backdrop depends only on the
    /// media identity + the thumbnail inputs it actually reads, so SwiftUI reuses
    /// the rasterized blur as long as those are unchanged (the real GPU heat win).
    static func == (lhs: ReelImageBackdrop, rhs: ReelImageBackdrop) -> Bool {
        lhs.media.id == rhs.media.id
            && lhs.media.thumbHash == rhs.media.thumbHash
            && lhs.media.thumbnailUrl == rhs.media.thumbnailUrl
            && lhs.media.thumbnailColor == rhs.media.thumbnailColor
    }

    var body: some View {
        ProgressiveCachedImage(
            thumbHash: media.thumbHash,
            thumbnailUrl: media.thumbnailUrl,
            fullUrl: nil,
            autoLoad: true
        ) {
            Color(hex: media.thumbnailColor)
        }
        .aspectRatio(contentMode: .fill)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .scaleEffect(1.15)
        .blur(radius: 28)
        .clipped()
        .overlay(Color.black.opacity(0.22))
    }
}

// MARK: - Reel Audio (media layer — immersive transcript hero)

/// The media layer of an audio reel: the TRANSCRIPTION is the hero, rendered
/// large and centered like spoken words over a dark accent-tinted canvas. The
/// play/scrub control and the language-flag strip are CHROME (owned by
/// `ReelPageView`, on top of this layer) — keeping them out of the media layer
/// is what makes them tappable and lets the immersive long-press hide them while
/// the transcript (the content) stays. The transcript follows `selectedLanguage`
/// (a binding shared with the chrome flag strip + audio control) so a flag tap
/// swaps the displayed text in lockstep with the audio that plays.
private struct ReelAudioView: View {
    let media: FeedMedia
    let accentColor: String
    /// Shared with the chrome: a flag tap (or the audio control's language
    /// switch) updates this and the hero transcript re-resolves. `nil` = original.
    @Binding var selectedLanguage: String?
    /// Same engine the `ReelAudioControl` plays/scrubs (injected as its
    /// `externalPlayer`). Observed here so the karaoke highlight + auto-scroll
    /// track the live playback position.
    @ObservedObject var player: AudioPlaybackManager

    /// Timed segments for the currently-explored language. Reuses the SDK's pure
    /// resolver so the hero matches exactly what the player plays.
    private var displaySegments: [TranscriptionDisplaySegment] {
        let token = selectedLanguage ?? "orig"
        return AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: token,
            transcription: media.transcription,
            translatedAudios: media.translatedAudios
        )
    }

    var body: some View {
        ZStack {
            // Dark immersive canvas tinted with the reel accent — matches the
            // video/image reels' dark aesthetic rather than a bright gradient.
            LinearGradient(
                colors: [
                    Color(hex: accentColor).opacity(0.55),
                    .black,
                    Color(hex: accentColor).opacity(0.35)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            // Subtle large waveform watermark behind the transcript.
            // Glyphe décoratif ≥40pt : figé (doctrine 74i/86i) + masqué VoiceOver
            Image(systemName: "waveform")
                .font(.system(size: 220, weight: .semibold))
                .foregroundColor(.white.opacity(0.05))
                .allowsHitTesting(false)
                .accessibilityHidden(true)

            heroLayer
        }
    }

    @ViewBuilder
    private var heroLayer: some View {
        if displaySegments.isEmpty {
            // No transcript yet — keep a prominent waveform glyph as the hero so
            // the screen never reads as empty.
            // Glyphe héros décoratif ≥40pt : figé (doctrine 74i/86i) + masqué VoiceOver
            Image(systemName: "waveform")
                .font(.system(size: 84, weight: .semibold))
                .foregroundColor(.white.opacity(0.92))
                .shadow(color: .black.opacity(0.35), radius: 10)
                .accessibilityHidden(true)
        } else {
            // Karaoke transcript: the active segment ([startTime, endTime) of the
            // live `player.currentTime`) is highlighted + auto-scrolled to centre.
            // Smaller, scrollable text (font 14, own ScrollView) replaces the
            // former single 27pt joined block. `onSeek` lets a tap jump playback.
            MediaTranscriptionView(
                segments: displaySegments,
                currentTime: player.currentTime,
                accentColor: accentColor,
                maxHeight: 360,
                isPlaying: player.isPlaying,
                progress: player.progress,
                fontSize: 22,
                onSeek: { time in player.seekToTime(time) }
            )
            .padding(.horizontal, 20)
            // Clear the bottom chrome (control + flags + author + rail).
            .padding(.bottom, 200)
            // Cross-fade when the language (and thus the segments) changes.
            .id(selectedLanguage ?? "orig")
            .transition(.opacity)
        }
    }
}

// MARK: - Reel Audio Control (chrome layer — play/scrub for an audio reel)

/// The audio play/scrub control for an audio reel, rendered in the CHROME layer
/// (on top of the transcript hero) so it stays tappable and fades with the rest
/// of the chrome in immersive mode. Reuses `AudioPlayerView` in its compact form
/// — which hides the player's own transcription card + language pills, so the
/// reel's hero transcript and `ReelMetaRow` flag strip own those, app-side, with
/// no duplication. `selectedLanguage` is shared with the flag strip + the hero,
/// so switching a flag plays that language's translated audio (when a TTS variant
/// exists) AND swaps the transcript text — mirroring the message-bubble UX.
private struct ReelAudioControl: View {
    let media: FeedMedia
    @Binding var selectedLanguage: String?
    /// Shared engine (owned by `ReelPageView`) so the hero transcript
    /// (`ReelAudioView` → `MediaTranscriptionView`) tracks the SAME playback.
    let player: AudioPlaybackManager

    private var attachment: MeeshyMessageAttachment { media.toMessageAttachment() }

    var body: some View {
        AudioAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: media.thumbnailColor,
                translatedAudios: media.translatedAudios,
                externalLanguage: $selectedLanguage,
                availability: availability,
                onDownload: onDownload,
                externalPlayer: player
            )
        }
    }
}

// MARK: - Reel Poster

/// Edge-to-edge progressive image used as the video poster. Falls back to a
/// tinted fill while loading. (Image reels now use `ReelImageCell`, which fits
/// the image over a blurred backdrop rather than cropping it full-bleed.)
/// `internal` (not `private`) so the feed-card surface (`ReelFeedVideoSurface`)
/// can reuse it as the muted-video poster.
struct ReelPoster: View, Equatable {
    let thumbHash: String?
    let url: String?
    let color: String
    /// `.fill` (default) crops edge-to-edge for the feed card. The fullscreen
    /// viewer passes `.fit` so the poster matches the `.resizeAspect` video it
    /// sits under — same framing during the poster→first-frame handoff.
    var contentMode: ContentMode = .fill

    var body: some View {
        ProgressiveCachedImage(
            thumbHash: thumbHash,
            thumbnailUrl: url,
            fullUrl: url,
            autoLoad: true
        ) {
            Color(hex: color).shimmer()
        }
        .aspectRatio(contentMode: contentMode)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .ignoresSafeArea()
    }
}
