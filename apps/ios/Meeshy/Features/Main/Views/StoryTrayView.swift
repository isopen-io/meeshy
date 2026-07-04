import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

private struct StoryPreviewAssets: Identifiable {
    let id = UUID()
    let slides: [StorySlide]
    let backgroundImages: [String: UIImage]
    let loadedImages: [String: UIImage]
    let videoURLs: [String: URL]
    let audioURLs: [String: URL]
}

struct StoryTrayView: View {
    @ObservedObject var viewModel: StoryViewModel
    /// Optionnel : surcharge de présentation. `nil` (défaut) → chemin canonique
    /// unique via `StoryViewerCoordinator` (`.fullScreenCover(item:)` au niveau
    /// root). Avant, chaque hôte (feeds iPad/iPhone) câblait son propre
    /// `.fullScreenCover(isPresented:)` + variable `selectedStoryUserId` séparée :
    /// SwiftUI évaluait le cover avec l'uid encore `nil` (capture périmée) → écran
    /// noir « story introuvable ». Le coordinator capture la requête atomiquement.
    var onViewStory: ((String) -> Void)? = nil
    var onAddStatus: (() -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    /// U1 — namespace zoom injecté par RootView (nil hors de ce sous-arbre
    /// ou < iOS 18 : les helpers sont no-op, transition historique).
    @Environment(\.zoomTransitionNamespace) private var zoomNamespace
    private var isDark: Bool { colorScheme == .dark }
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet du tray. La présence est rafraîchie lors des refreshs naturels.
    private var presenceManager: PresenceManager { PresenceManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    // Captured solely so we can re-inject them onto the `StoryViewerContainer`
    // / `StoryViewerView` fullScreenCovers below — those covers create a new
    // presentation hierarchy and the inner SharePickerView sheet would
    // otherwise crash on a missing `conversationListViewModel`.
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject private var storyViewerCoordinator: StoryViewerCoordinator
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var storyPreviewAssets: StoryPreviewAssets?

    var body: some View {
        VStack(spacing: 0) {
            // Cache-first: only show the skeleton row when the carousel
            // has no cached groups AND a load is in flight. Once any
            // story arrives (even from a stale cache) we drop straight
            // into the live scroll view so the row never jumps.
            if SkeletonVisibilityResolver.shouldShowSkeleton(
                isLoading: viewModel.isLoading,
                hasCachedData: !viewModel.storyGroups.isEmpty
            ) {
                SkeletonStoryTrayRow()
            } else {
                storyScrollView
            }
        }
        .frame(height: 120)
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                postsContent: { uid in AnyView(ProfileUserPostsList(
                    userId: uid,
                    onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                    onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
                )) }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .fullScreenCover(isPresented: $viewModel.showStoryComposer) {
            ZStack {
                StoryComposerView(
                    onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, originalLanguage, visibility, visibilityUserIds in
                        viewModel.publishStoryInBackground(
                            slides: slides,
                            slideImages: slideImages,
                            loadedImages: loadedImages,
                            loadedVideoURLs: loadedVideoURLs,
                            loadedAudioURLs: loadedAudioURLs,
                            originalLanguage: originalLanguage,
                            visibility: visibility,
                            visibilityUserIds: visibilityUserIds
                        )
                    },
                    onPreview: { slides, images, loadedImgs, videoURLs, audioURLs in
                        storyPreviewAssets = StoryPreviewAssets(
                            slides: slides,
                            backgroundImages: images,
                            loadedImages: loadedImgs,
                            videoURLs: videoURLs,
                            audioURLs: audioURLs
                        )
                    },
                    onDismiss: {
                        viewModel.showStoryComposer = false
                    }
                )
            }
            .fullScreenCover(item: $storyPreviewAssets, onDismiss: {
                NotificationCenter.default.post(name: .storyComposerUnmuteCanvas, object: nil)
            }) { assets in
                let items = assets.slides.map { $0.toPreviewStoryItem() }
                let group = StoryGroup(
                    id: "preview",
                    username: String(localized: "story.preview.username", defaultValue: "Aperçu", bundle: .main),
                    avatarColor: MeeshyColors.brandPrimaryHex,
                    stories: items
                )
                StoryViewerView(
                    viewModel: viewModel,
                    groups: [group],
                    currentGroupIndex: 0,
                    isPresented: Binding(
                        get: { storyPreviewAssets != nil },
                        set: { if !$0 { storyPreviewAssets = nil } }
                    ),
                    isPreviewMode: true,
                    preloadedImages: assets.loadedImages.merging(assets.backgroundImages) { fg, _ in fg },
                    preloadedVideoURLs: assets.videoURLs,
                    preloadedAudioURLs: assets.audioURLs
                )
                .environmentObject(router)
                .environmentObject(conversationListViewModel)
                .environmentObject(statusViewModel)
            }
        }
        .withStatusBubble()
    }

    // MARK: - Story Scroll View

    private var storyScrollView: some View {
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        // F5 — cap stagger to first 10 visible rings. Beyond that the
        // 0.05s × index delay becomes a multi-second "pop-in" parade
        // (50 rings = 2.5s) which feels like lag, not animation.
        // Late rings appear instantly when scrolled into view.
        let staggerCap = 10
        return ScrollView(.horizontal, showsIndicators: false) {
            // F5 — `LazyHStack` instead of `HStack` so off-screen rings
            // are not materialised. A heavy user with 50+ story groups
            // previously instantiated all 50 `MeeshyAvatar` instances at
            // tray load (~8-12MB) even when only 4-5 fit on screen.
            LazyHStack(spacing: 12) {
                myStoryButton
                    .bounceOnAppear(delay: 0)

                ForEach(Array(viewModel.storyGroups.filter { $0.id != currentUserId && !$0.isFullyExpired() }.enumerated()), id: \.element.id) { visibleIndex, group in
                    Group {
                        if visibleIndex < staggerCap {
                            storyRingCell(for: group)
                                .staggeredAppear(index: visibleIndex, baseDelay: 0.05)
                        } else {
                            storyRingCell(for: group)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - My Story Button (utilisateur connecté)

    private var myStoryButton: some View {
        MyStoryButton(
            viewModel: viewModel,
            onViewMyStory: {
                // Chemin de présentation unique : le coordinator (covers
                // RootView / iPadRootView) remplace l'ancien fullScreenCover
                // local — « ma story » est un contexte « personne précise ».
                storyViewerCoordinator.present(StoryViewerRequest(
                    id: AuthManager.shared.currentUser?.id ?? "",
                    singleGroup: true
                ))
            },
            onAddStatus: onAddStatus
        )
        // U1 inc.2 — « ma story » zoome aussi (id vide jamais matché → fallback).
        .zoomTransitionSource(id: AuthManager.shared.currentUser?.id ?? "", in: zoomNamespace)
    }

    // MARK: - Story Ring

    /// Full-size trail ring — thin wrapper over the shared `StoryRingCell` so
    /// the grande trail and the pinned mini-trail render an identical cell,
    /// only differing by `context` size.
    private func storyRingCell(for group: StoryGroup) -> some View {
        StoryRingCell(
            group: group,
            onViewStory: { presentStory(userId: group.id) },
            onShowProfile: { selectedProfileUser = .from(storyGroup: group) }
        )
        // U1 — source de la transition zoom : la bulle « devient » le viewer
        // (id = userId du groupe, apparié au sourceID du cover RootView).
        .zoomTransitionSource(id: group.id, in: zoomNamespace)
    }

    /// Chemin de présentation unique pour toute la trail (feeds + chats). Si un
    /// hôte fournit `onViewStory`, on le respecte ; sinon on passe par le
    /// coordinator — `.fullScreenCover(item:)` au root capture la requête sans
    /// race d'uid, éliminant l'écran noir « story introuvable » du chemin feeds.
    private func presentStory(userId: String) {
        if let onViewStory {
            onViewStory(userId)
        } else {
            storyViewerCoordinator.present(
                StoryViewerRequest(id: userId, startAtFirstUnviewed: true)
            )
        }
    }

}

// MARK: - Story Ring Cell (shared by grande + compact pinned trail)

/// One story group rendered as avatar ring + (optional) username, sharing the
/// exact same `MeeshyAvatar` atom across the full-size trail and the compact
/// pinned mini-trail. `context` drives the size (`.storyTray` 88pt vs
/// `.storyTrayCompact` 44pt); all proportional metrics derive from it.
struct StoryRingCell: View {
    let group: StoryGroup
    var context: AvatarContext = .storyTray
    var showsUsername: Bool = true
    let onViewStory: () -> Void
    let onShowProfile: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    private var presenceManager: PresenceManager { PresenceManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel

    private var isCompact: Bool { context.size <= 44 }

    var body: some View {
        VStack(spacing: isCompact ? 4 : 5) {
            ZStack {
                MeeshyAvatar(
                    name: group.username,
                    context: context,
                    accentColor: group.avatarColor,
                    avatarURL: latestStoryThumbnailURL(group),
                    storyState: group.hasUnviewed ? .unread : .read,
                    moodEmoji: statusViewModel.statusForUser(userId: group.id)?.moodEmoji,
                    presenceState: presenceManager.presenceState(for: group.id),
                    onMoodTap: statusViewModel.moodTapHandler(for: group.id),
                    contextMenuItems: [
                        AvatarContextMenuItem(label: "Voir les stories", icon: "play.circle.fill") {
                            onViewStory()
                        },
                        AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                            onShowProfile()
                        }
                    ]
                )

                // Story count dots (multiple stories indicator) — offset scales
                // with the avatar so it stays pinned to the bottom edge.
                if group.stories.count > 1 {
                    storyCountDots(count: group.stories.count, unviewed: group.hasUnviewed)
                        .offset(y: context.size * 0.318)
                }
            }

            if showsUsername {
                Text(group.username)
                    .font(MeeshyFont.relative(isCompact ? 9 : 10, weight: group.hasUnviewed ? .semibold : .medium))
                    .foregroundColor(group.hasUnviewed ? theme.textPrimary : theme.textMuted)
                    .lineLimit(1)
                    .frame(width: isCompact ? 56 : 96)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            HapticFeedback.medium()
            Logger.messages.info("[StoryRingCell] tap ring group.id=\(group.id, privacy: .public) username=\(group.username, privacy: .public)")
            onViewStory()
        }
    }
}

// MARK: - Story Count Dots (shared)

@ViewBuilder
fileprivate func storyCountDots(count: Int, unviewed: Bool) -> some View {
    HStack(spacing: 3) {
        ForEach(0..<min(count, 5), id: \.self) { _ in
            Circle()
                .fill(unviewed ? Color.white.opacity(0.85) : Color.white.opacity(0.25))
                .frame(width: 4, height: 4)
        }
        if count > 5 {
            Text("+")
                .font(MeeshyFont.relative(8, weight: .bold))
                .foregroundColor(.white.opacity(0.5))
        }
    }
    .accessibilityHidden(true)
}

// MARK: - Thumbnail Helper

/// URL de la miniature de la dernière story du groupe — user request
/// 2026-05-27 « dans la tray il faut mettre la vue miniature de la
/// dernière story du groupe ». `stories` est trié ascendant par
/// `createdAt` (cf. `FeedDataResponse.toStoryGroups`), donc `last` =
/// plus récente. Préfère `thumbnailUrl` (servi optimisé par le
/// gateway) au full `url` si dispo. Fallback sur l'avatar du profil
/// pour les stories text-only (pas de media). Helper fileprivate
/// pour pouvoir s'appeler depuis `MyStoryButton` aussi.
fileprivate func latestStoryThumbnailURL(_ group: StoryGroup) -> String? {
    guard let lastStory = group.stories.last else { return group.avatarURL }
    // Local-first: a composite cover rendered at publish (text + drawing + all
    // layers) wins over the server thumbnail (raw bg, no overlays). Synchronous
    // existence check — no actor hop, safe in the View body.
    let localCover = CacheCoordinator.thumbnailLocalFileURL(
        for: StoryCoverThumbnail.cacheKey(storyId: lastStory.id)
    )
    return StoryCoverThumbnail.preferredCoverURLString(
        localCover: localCover,
        serverThumbnailUrl: lastStory.media.first?.thumbnailUrl,
        mediaUrl: lastStory.media.first?.url,
        avatarURL: group.avatarURL
    )
}

// MARK: - My Story Button (extracted struct to avoid PAC issues with @ViewBuilder + @EnvironmentObject)

private struct MyStoryButton: View {
    let viewModel: StoryViewModel
    let onViewMyStory: () -> Void
    var onAddStatus: (() -> Void)?

    // Lecture directe sans @ObservedObject — leaf view rendue dans le tray,
    // évite que chaque changement de thème force un re-render du bouton.
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel

    var body: some View {
        let currentUser = AuthManager.shared.currentUser
        let userId = currentUser?.id ?? ""
        // Un groupe entièrement expiré est traité comme « pas de story » : on
        // affiche le bouton d'ajout, jamais un anneau dont le viewer se fermerait
        // aussitôt (`skipExpiredStoriesIfNeeded`). Cohérent avec le filtre du tray.
        let myGroup = viewModel.storyGroupForUser(userId: userId).flatMap { $0.isFullyExpired() ? nil : $0 }
        let hasMyStory = myGroup != nil
        let userName = currentUser?.displayName ?? currentUser?.username ?? "Moi"
        let accentColor = DynamicColorGenerator.colorForName(currentUser?.username ?? "")
        let storyState: StoryRingState = myGroup.map { $0.hasUnviewed ? .unread : .read } ?? .none
        let myMoodEmoji = statusViewModel.statusForUser(userId: userId)?.moodEmoji

        VStack(spacing: 5) {
            ZStack {
                MeeshyAvatar(
                    name: userName,
                    context: .storyTray,
                    accentColor: accentColor,
                    avatarURL: myGroup.flatMap { latestStoryThumbnailURL($0) } ?? currentUser?.avatar,
                    storyState: storyState,
                    moodEmoji: myMoodEmoji,
                    presenceState: .offline,
                    onTap: {
                        if hasMyStory {
                            onViewMyStory()
                        } else {
                            viewModel.showStoryComposer = true
                        }
                        HapticFeedback.medium()
                    },
                    onMoodTap: { _ in
                        onAddStatus?()
                        HapticFeedback.medium()
                    },
                    contextMenuItems: {
                        var items: [AvatarContextMenuItem] = []
                        if hasMyStory {
                            items.append(AvatarContextMenuItem(label: "Voir ma story", icon: "play.circle.fill") {
                                onViewMyStory()
                                HapticFeedback.medium()
                            })
                        }
                        items.append(AvatarContextMenuItem(label: "Ajouter une story", icon: "plus.circle.fill") {
                            guard viewModel.activeUpload == nil else { return }
                            viewModel.showStoryComposer = true
                            HapticFeedback.medium()
                        })
                        items.append(AvatarContextMenuItem(label: "Changer mon mood", icon: "face.smiling.inverse") {
                            onAddStatus?()
                            HapticFeedback.medium()
                        })
                        return items
                    }()
                )
                .overlay(alignment: .bottomTrailing) {
                    if myMoodEmoji == nil {
                        Button {
                            onAddStatus?()
                            HapticFeedback.medium()
                        } label: {
                            // user request 2026-05-28 — placeholder = x0.8 du
                            // bouton (+) (40pt) → 32pt frame, glyph à 0.65×
                            // pour garder la parité avec l'emoji mood animé
                            // (cf. MeeshyAvatar.badgeSize .storyTray).
                            // Emoji dans un cercle de dimension fixe 32×32 : figé (déborderait s'il scalait, doctrine 86i)
                            Text("\u{1F4AD}")
                                .font(.system(size: 20))
                                .frame(width: 32, height: 32)
                                .background(Circle().fill(theme.backgroundPrimary))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: "story.tray.a11y.changeMood", defaultValue: "Changer mon mood", bundle: .main))
                    }
                }
                .overlay(alignment: .topLeading) {
                    // Composer entry badge — discoverable affordance for adding
                    // a new story without going through long-press menu. Hidden
                    // during an active upload (the upload overlay already
                    // covers the avatar). The plus sign uses brand gradient
                    // matching the published `MeeshyColors.brandGradient`.
                    if viewModel.activeUpload == nil {
                        Button {
                            guard viewModel.activeUpload == nil else { return }
                            viewModel.showStoryComposer = true
                            HapticFeedback.medium()
                        } label: {
                            // x2 — user request 2026-05-27 « augmente le (+)
                            // d'ajouter une story ». Avant : font 11 / frame
                            // 20×20 / offset (-2,-2). Maintenant doublé pour
                            // matcher la taille trail (avatars passés à 88pt
                            // en ab691abaf).
                            // Glyphe dans un cercle de dimension fixe 40×40 : figé (déborderait s'il scalait, doctrine 86i) ; le bouton porte le libellé
                            Image(systemName: "plus")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundStyle(Color.white)
                                .frame(width: 40, height: 40)
                                .background(
                                    Circle()
                                        .fill(MeeshyColors.brandGradient)
                                        .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 3))
                                )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: "story.tray.addStory",
                                                   defaultValue: "Ajouter une story"))
                        .offset(x: -4, y: -4)
                    }
                }
                .overlay {
                    if let upload = viewModel.activeUpload {
                        StoryUploadOverlay(
                            upload: upload,
                            onRetry: { viewModel.retryUpload() },
                            onCancel: { viewModel.cancelUpload() }
                        )
                    }
                }

                // Story count dots (si plusieurs stories)
                if let group = myGroup, group.stories.count > 1 {
                    HStack(spacing: 3) {
                        ForEach(0..<min(group.stories.count, 5), id: \.self) { _ in
                            Circle()
                                .fill(group.hasUnviewed ? Color.white.opacity(0.85) : Color.white.opacity(0.25))
                                .frame(width: 4, height: 4)
                        }
                        if group.stories.count > 5 {
                            Text("+")
                                .font(MeeshyFont.relative(8, weight: .bold))
                                .foregroundColor(.white.opacity(0.5))
                        }
                    }
                    .offset(y: 28)
                    .accessibilityHidden(true)
                }
            }

            Text(String(localized: "story.tray.me", defaultValue: "Moi", bundle: .main))
                .font(MeeshyFont.relative(10, weight: .semibold))
                .foregroundColor(theme.textSecondary)
        }
        .accessibilityLabel(hasMyStory ? String(localized: "story.tray.a11y.myStory", defaultValue: "Ma story", bundle: .main) : String(localized: "story.tray.a11y.changeMood", defaultValue: "Changer mon mood", bundle: .main))
    }
}

// MARK: - Story Upload Overlay

private struct StoryUploadOverlay: View {
    let upload: StoryViewModel.StoryUploadState
    let onRetry: () -> Void
    let onCancel: () -> Void

    private var isFailed: Bool {
        if case .failed = upload.phase { return true }
        return false
    }

    var body: some View {
        ZStack {
            Image(uiImage: upload.thumbnailImage)
                .resizable()
                .scaledToFill()
                .frame(width: 44, height: 44)
                .clipShape(Circle())
                .opacity(0.2)

            Circle()
                .stroke(Color.white.opacity(0.1), lineWidth: 3)
                .frame(width: 50, height: 50)

            if isFailed {
                Circle()
                    .stroke(MeeshyColors.error, lineWidth: 3)
                    .frame(width: 50, height: 50)

                // Glyphe dans un cercle d'upload de dimension fixe 50×50 : figé (déborderait s'il scalait, doctrine 86i)
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
            } else {
                Circle()
                    .trim(from: 0, to: upload.progress)
                    .stroke(
                        MeeshyColors.brandGradient,
                        style: StrokeStyle(lineWidth: 3, lineCap: .round)
                    )
                    .frame(width: 50, height: 50)
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 0.3), value: upload.progress)

                // Texte dans un cercle d'upload de dimension fixe 50×50 : figé (déborderait s'il scalait, doctrine 86i)
                Text("\(Int(upload.progress * 100))%")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
            }
        }
        .onTapGesture {
            if isFailed { onRetry() }
        }
        .contextMenu {
            if isFailed {
                Button { onRetry() } label: {
                    Label(String(localized: "story.tray.retry", defaultValue: "Reessayer", bundle: .main), systemImage: "arrow.clockwise")
                }
                Button(role: .destructive) { onCancel() } label: {
                    Label(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), systemImage: "trash")
                }
            }
        }
    }
}

// MARK: - Pinned Mini Story Trail (revealed inside the collapsed header)

/// Compact story trail pinned *inside* the header, below the title + actions.
/// It fades/slides in as the full-size `StoryTrayView` scrolls up under the
/// header so the stories stay reachable without taking a full row. Per product
/// decision the connected user's avatar is replaced by a single leading "+"
/// (add a story); everyone else's rings render at half size
/// (`.storyTrayCompact`, 44pt) with the same design and horizontal scroll.
struct PinnedStoryTrailBand: View {
    /// U1 inc.2 — namespace zoom injecté par RootView (no-op < iOS 18/nil).
    @Environment(\.zoomTransitionNamespace) private var zoomNamespace
    @ObservedObject var viewModel: StoryViewModel
    /// Same negative scroll offset the `CollapsibleHeader` consumes (0 at rest,
    /// more negative as the content scrolls up).
    let scrollOffset: CGFloat
    /// Optionnel : surcharge de présentation. `nil` (défaut) → coordinator (cf.
    /// `StoryTrayView.onViewStory`), unifiant la mini-trail avec la grande trail.
    var onViewStory: ((String) -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var storyViewerCoordinator: StoryViewerCoordinator
    @State private var selectedProfileUser: ProfileSheetUser?

    // Layout-derived: the full trail (120pt + 8 top pad) sits under the 64pt
    // expanded header and is fully hidden behind the 44pt collapsed header after
    // ~148pt of scroll. Reveal the mini-trail over the last ~70pt of that travel.
    private static let revealStart: CGFloat = 78
    private static let revealEnd: CGFloat = 148
    private static let bandHeight: CGFloat = 80

    private var reveal: CGFloat {
        CollapsibleHeaderMetrics.pinnedAccessoryReveal(
            scrollOffset: scrollOffset,
            start: Self.revealStart,
            end: Self.revealEnd
        )
    }

    private var visibleGroups: [StoryGroup] {
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        return viewModel.storyGroups.filter { $0.id != currentUserId && !$0.isFullyExpired() }
    }

    var body: some View {
        let groups = visibleGroups
        // Occupy space only while revealing AND there is at least one peer story
        // to surface — otherwise the grande "+Moi" near the top already covers
        // adding a story, so a pinned band would be redundant.
        if reveal > 0.001 && !groups.isEmpty {
            band(groups: groups)
                .frame(height: Self.bandHeight * reveal, alignment: .top)
                .opacity(Double(reveal))
                .clipped()
                .allowsHitTesting(reveal > 0.6)
                .sheet(item: $selectedProfileUser) { user in
                    UserProfileSheet(
                        user: user,
                        moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                        onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                        postsContent: { uid in AnyView(ProfileUserPostsList(
                    userId: uid,
                    onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                    onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
                )) }
                    )
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                }
        }
    }

    private func band(groups: [StoryGroup]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 12) {
                addStoryButton
                ForEach(groups, id: \.id) { group in
                    StoryRingCell(
                        group: group,
                        context: .storyTrayCompact,
                        onViewStory: { presentStory(userId: group.id) },
                        onShowProfile: { selectedProfileUser = .from(storyGroup: group) }
                    )
                    // U1 inc.2 — la mini-trail épinglée zoome aussi.
                    .zoomTransitionSource(id: group.id, in: zoomNamespace)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 6)
        }
        // No own background — this view is injected as the `CollapsibleHeader`
        // accessory slot, so the header surface masks the content underneath.
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Même chemin de présentation que `StoryTrayView.presentStory` — unifie la
    /// mini-trail épinglée avec la grande trail via le coordinator par défaut.
    private func presentStory(userId: String) {
        if let onViewStory {
            onViewStory(userId)
        } else {
            storyViewerCoordinator.present(
                StoryViewerRequest(id: userId, startAtFirstUnviewed: true)
            )
        }
    }

    private var addStoryButton: some View {
        Button {
            guard viewModel.activeUpload == nil else { return }
            viewModel.showStoryComposer = true
            HapticFeedback.medium()
        } label: {
            // Glyphe dans un cercle de dimension fixe 44×44 : figé (déborderait s'il scalait, doctrine 86i) ; le bouton porte le libellé
            Image(systemName: "plus")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(MeeshyColors.brandGradient)
                        .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 2))
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "story.tray.addStory", defaultValue: "Ajouter une story"))
    }
}
