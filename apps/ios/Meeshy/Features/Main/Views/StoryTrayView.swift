import SwiftUI
import MeeshySDK
import MeeshyUI

struct StoryTrayView: View {
    @ObservedObject var viewModel: StoryViewModel
    var onViewStory: (Int) -> Void

    @ObservedObject private var theme = ThemeManager.shared
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet du tray. La présence est rafraîchie lors des refreshs naturels.
    private var presenceManager: PresenceManager { PresenceManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var showStatusComposer = false
    @State private var previewSlides: [StorySlide] = []
    @State private var previewImages: [String: UIImage] = [:]
    @State private var showStoryPreview = false

    var body: some View {
        VStack(spacing: 0) {
            if viewModel.isLoading && viewModel.storyGroups.isEmpty {
                shimmerPlaceholder
            } else {
                storyScrollView
            }
        }
        .frame(height: 108)
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
            StoryComposerView(
                onPublishSlide: { slide, image in
                    try await viewModel.publishStorySingle(
                        effects: slide.effects,
                        content: slide.content,
                        image: image
                    )
                },
                onPreview: { slides, images in
                    previewSlides = slides
                    previewImages = images
                    showStoryPreview = true
                },
                onDismiss: {
                    viewModel.showStoryComposer = false
                }
            )
        }
        .fullScreenCover(isPresented: $showStoryPreview) {
            let items = previewSlides.map { $0.toPreviewStoryItem() }
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
                isPresented: $showStoryPreview,
                isPreviewMode: true
            )
        }
        .sheet(isPresented: $showStatusComposer) {
            StatusComposerView(viewModel: statusViewModel)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
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
                    let originalIndex = viewModel.groupIndex(forUserId: group.id) ?? visibleIndex
                    storyRing(group: group, index: originalIndex)
                        .staggeredAppear(index: visibleIndex, baseDelay: 0.05)
                        .onTapGesture {
                            HapticFeedback.medium()
                            onViewStory(originalIndex)
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
            onViewStory: onViewStory,
            showStatusComposer: $showStatusComposer
        )
    }

    // MARK: - Story Ring

    private func storyRing(group: StoryGroup, index: Int) -> some View {
        VStack(spacing: 5) {
            ZStack {
                MeeshyAvatar(
                    name: group.username,
                    mode: .storyTray,
                    accentColor: group.avatarColor,
                    avatarURL: group.avatarURL,
                    storyState: group.hasUnviewed ? .unread : .read,
                    moodEmoji: statusViewModel.statusForUser(userId: group.id)?.moodEmoji,
                    presenceState: presenceManager.presenceState(for: group.id),
                    onMoodTap: statusViewModel.moodTapHandler(for: group.id),
                    contextMenuItems: [
                        AvatarContextMenuItem(label: "Voir les stories", icon: "play.circle.fill") {
                            onViewStory(index)
                        },
                        AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                            selectedProfileUser = .from(storyGroup: group)
                        }
                    ]
                )

                // Story count dots (multiple stories indicator)
                if group.stories.count > 1 {
                    storyCountDots(count: group.stories.count, unviewed: group.hasUnviewed)
                        .offset(y: 38)
                }
            }

            Text(group.username)
                .font(.system(size: 11, weight: group.hasUnviewed ? .semibold : .medium))
                .foregroundColor(group.hasUnviewed ? .white : theme.textMuted)
                .lineLimit(1)
                .frame(width: 68)
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
                    VStack(spacing: 5) {
                        Circle()
                            .fill(Color.white.opacity(0.06))
                            .frame(width: 62, height: 62)
                            .overlay(
                                Circle()
                                    .stroke(Color.white.opacity(0.08), lineWidth: 2)
                                    .frame(width: 68, height: 68)
                            )
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.white.opacity(0.06))
                            .frame(width: 42, height: 8)
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
    let onViewStory: (Int) -> Void
    @Binding var showStatusComposer: Bool

    @EnvironmentObject private var statusViewModel: StatusViewModel
    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        let currentUser = AuthManager.shared.currentUser
        let userId = currentUser?.id ?? ""
        let myGroup = viewModel.storyGroupForUser(userId: userId)
        let myGroupIndex = viewModel.groupIndex(forUserId: userId)
        let hasMyStory = myGroup != nil
        let userName = currentUser?.displayName ?? currentUser?.username ?? "Moi"
        let accentColor = DynamicColorGenerator.colorForName(currentUser?.username ?? "")
        let storyState: StoryRingState = myGroup.map { $0.hasUnviewed ? .unread : .read } ?? .none
        let myMoodEmoji = statusViewModel.statusForUser(userId: userId)?.moodEmoji ?? "💭"

        VStack(spacing: 5) {
            ZStack {
                MeeshyAvatar(
                    name: userName,
                    mode: .storyTray,
                    accentColor: accentColor,
                    avatarURL: currentUser?.avatar,
                    storyState: storyState,
                    presenceState: .offline,
                    onTap: {
                        viewModel.showStoryComposer = true
                        HapticFeedback.medium()
                    },
                    contextMenuItems: hasMyStory ? [
                        AvatarContextMenuItem(label: "Voir ma story", icon: "play.circle.fill") {
                            if let idx = myGroupIndex { onViewStory(idx) }
                            HapticFeedback.medium()
                        }
                    ] : nil
                )
                .overlay(alignment: .bottomTrailing) {
                    // 💭 status badge — remplace le dot de présence (inutile pour soi-même)
                    Button {
                        HapticFeedback.light()
                        showStatusComposer = true
                    } label: {
                        Text(myMoodEmoji)
                            .font(.system(size: 14))
                            .frame(width: 24, height: 24)
                            .background(Circle().fill(theme.backgroundPrimary.opacity(0.9)))
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
                    .offset(y: 38)
                }
            }

            Text("Moi")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white.opacity(0.8))
        }
        .accessibilityLabel(hasMyStory ? "Ma story" : "Créer une story")
    }
}
