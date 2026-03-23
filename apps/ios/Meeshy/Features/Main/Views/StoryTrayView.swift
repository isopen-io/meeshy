import SwiftUI
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

    @ObservedObject private var theme = ThemeManager.shared
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet du tray. La présence est rafraîchie lors des refreshs naturels.
    private var presenceManager: PresenceManager { PresenceManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var showOwnStoryViewer = false
    @State private var storyPreviewAssets: StoryPreviewAssets?

    var body: some View {
        VStack(spacing: 0) {
            if viewModel.isLoading && viewModel.storyGroups.isEmpty {
                shimmerPlaceholder
            } else {
                storyScrollView
            }
        }
        .frame(height: 72)
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
                    onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs in
                        viewModel.publishStoryInBackground(
                            slides: slides,
                            slideImages: slideImages,
                            loadedImages: loadedImages,
                            loadedVideoURLs: loadedVideoURLs
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
                    username: "Aperçu",
                    avatarColor: "FF2E63",
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
            }
        }
        .fullScreenCover(isPresented: $showOwnStoryViewer) {
            if let myGroup = viewModel.storyGroupForUser(userId: AuthManager.shared.currentUser?.id ?? "") {
                StoryViewerView(
                    viewModel: viewModel,
                    groups: [myGroup],
                    currentGroupIndex: 0,
                    isPresented: $showOwnStoryViewer
                )
            }
        }
        .withStatusBubble()
    }

    // MARK: - Story Scroll View

    private var storyScrollView: some View {
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                myStoryButton
                    .bounceOnAppear(delay: 0)

                ForEach(Array(viewModel.storyGroups.filter { $0.id != currentUserId }.enumerated()), id: \.element.id) { visibleIndex, group in
                    storyRing(group: group, userId: group.id)
                        .staggeredAppear(index: visibleIndex, baseDelay: 0.05)
                        .onTapGesture {
                            HapticFeedback.medium()
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
            showOwnStoryViewer: $showOwnStoryViewer,
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
                    avatarURL: group.avatarURL,
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
                .foregroundColor(group.hasUnviewed ? .white : theme.textMuted)
                .lineLimit(1)
                .frame(width: 56)
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

    // MARK: - Shimmer Placeholder

    private var shimmerPlaceholder: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(0..<6, id: \.self) { _ in
                    VStack(spacing: 4) {
                        Circle()
                            .fill(Color.white.opacity(0.06))
                            .frame(width: 44, height: 44)
                            .overlay(
                                Circle()
                                    .stroke(Color.white.opacity(0.08), lineWidth: 2)
                                    .frame(width: 50, height: 50)
                            )
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.white.opacity(0.06))
                            .frame(width: 36, height: 7)
                    }
                    .shimmer()
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }
}

// MARK: - My Story Button (extracted struct to avoid PAC issues with @ViewBuilder + @EnvironmentObject)

private struct MyStoryButton: View {
    let viewModel: StoryViewModel
    @Binding var showOwnStoryViewer: Bool
    var onAddStatus: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var statusViewModel: StatusViewModel

    var body: some View {
        let currentUser = AuthManager.shared.currentUser
        let userId = currentUser?.id ?? ""
        let myGroup = viewModel.storyGroupForUser(userId: userId)
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
                    avatarURL: currentUser?.avatar,
                    storyState: storyState,
                    moodEmoji: myMoodEmoji,
                    presenceState: .offline,
                    onTap: {
                        if hasMyStory {
                            showOwnStoryViewer = true
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
                                showOwnStoryViewer = true
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
                            Text("\u{1F4AD}")
                                .font(.system(size: 14))
                                .frame(width: 20, height: 20)
                                .background(Circle().fill(theme.backgroundPrimary))
                        }
                        .buttonStyle(.plain)
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

            Text("Moi")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.white.opacity(0.8))
        }
        .accessibilityLabel(hasMyStory ? "Ma story" : "Changer mon mood")
    }
}

// MARK: - Story Upload Overlay

private struct StoryUploadOverlay: View {
    let upload: StoryUploadState
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
                    Label("Reessayer", systemImage: "arrow.clockwise")
                }
                Button(role: .destructive) { onCancel() } label: {
                    Label("Annuler", systemImage: "trash")
                }
            }
        }
    }
}
