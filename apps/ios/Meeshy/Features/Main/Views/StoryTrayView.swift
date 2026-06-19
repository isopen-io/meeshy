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
    var onViewStory: (String) -> Void
    var onAddStatus: (() -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
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
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? "")
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .fullScreenCover(isPresented: $viewModel.showStoryComposer) {
            ZStack {
                StoryComposerView(
                    onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, originalLanguage, visibility in
                        viewModel.publishStoryInBackground(
                            slides: slides,
                            slideImages: slideImages,
                            loadedImages: loadedImages,
                            loadedVideoURLs: loadedVideoURLs,
                            loadedAudioURLs: loadedAudioURLs,
                            originalLanguage: originalLanguage,
                            visibility: visibility
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
                            storyRing(group: group, userId: group.id)
                                .staggeredAppear(index: visibleIndex, baseDelay: 0.05)
                        } else {
                            storyRing(group: group, userId: group.id)
                        }
                    }
                    .onTapGesture {
                        HapticFeedback.medium()
                        Logger.messages.info("[StoryTrayView] tap ring group.id=\(group.id, privacy: .public) username=\(group.username, privacy: .public)")
                        onViewStory(group.id)
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
    }

    // MARK: - Story Ring

    private func storyRing(group: StoryGroup, userId: String) -> some View {
        VStack(spacing: 5) {
            ZStack {
                MeeshyAvatar(
                    name: group.username,
                    context: .storyTray,
                    accentColor: group.avatarColor,
                    avatarURL: latestStoryThumbnailURL(group),
                    storyState: group.hasUnviewed ? .unread : .read,
                    moodEmoji: statusViewModel.statusForUser(userId: group.id)?.moodEmoji,
                    presenceState: presenceManager.presenceState(for: group.id),
                    onMoodTap: statusViewModel.moodTapHandler(for: group.id),
                    contextMenuItems: [
                        AvatarContextMenuItem(label: "Voir les stories", icon: "play.circle.fill") {
                            onViewStory(userId)
                        },
                        AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                            selectedProfileUser = .from(storyGroup: group)
                        }
                    ]
                )

                // Story count dots (multiple stories indicator)
                if group.stories.count > 1 {
                    storyCountDots(count: group.stories.count, unviewed: group.hasUnviewed)
                        .offset(y: 28)
                }
            }

            Text(group.username)
                .font(.system(size: 10, weight: group.hasUnviewed ? .semibold : .medium))
                .foregroundColor(group.hasUnviewed ? theme.textPrimary : theme.textMuted)
                .lineLimit(1)
                .frame(width: 96)
        }
    }

    // MARK: - Story Count Dots

    private func storyCountDots(count: Int, unviewed: Bool) -> some View {
        HStack(spacing: 3) {
            ForEach(0..<min(count, 5), id: \.self) { _ in
                Circle()
                    .fill(unviewed ? Color.white.opacity(0.85) : Color.white.opacity(0.25))
                    .frame(width: 4, height: 4)
            }
            if count > 5 {
                Text("+")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(.white.opacity(0.5))
            }
        }
    }

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
                            Text("\u{1F4AD}")
                                .font(.system(size: 20))
                                .frame(width: 32, height: 32)
                                .background(Circle().fill(theme.backgroundPrimary))
                        }
                        .buttonStyle(.plain)
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
                                .font(.system(size: 8, weight: .bold))
                                .foregroundColor(.white.opacity(0.5))
                        }
                    }
                    .offset(y: 28)
                }
            }

            Text(String(localized: "story.tray.me", defaultValue: "Moi", bundle: .main))
                .font(.system(size: 10, weight: .semibold))
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
