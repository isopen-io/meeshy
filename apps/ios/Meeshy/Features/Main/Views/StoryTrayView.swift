import SwiftUI
import MeeshySDK
import MeeshyUI

struct StoryTrayView: View {
    @ObservedObject var viewModel: StoryViewModel
    var onViewStory: (Int) -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var presenceManager = PresenceManager.shared
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @State private var addButtonGlow = false
    @State private var selectedProfileUser: ProfileSheetUser?

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
                onPublish: { effects, content, image in
                    Task {
                        await viewModel.publishStory(effects: effects, content: content, image: image)
                    }
                },
                onDismiss: {
                    viewModel.showStoryComposer = false
                }
            )
        }
        .withStatusBubble()
    }

    // MARK: - Story Scroll View

    private var storyScrollView: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                addStoryButton
                    .bounceOnAppear(delay: 0)

                ForEach(Array(viewModel.storyGroups.enumerated()), id: \.element.id) { index, group in
                    storyRing(group: group, index: index)
                        .staggeredAppear(index: index, baseDelay: 0.05)
                        .onTapGesture {
                            HapticFeedback.medium()
                            onViewStory(index)
                        }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Add Story Button

    private var addStoryButton: some View {
        Button {
            viewModel.showStoryComposer = true
            HapticFeedback.medium()
        } label: {
            VStack(spacing: 5) {
                ZStack {
                    // Radial ambient glow
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [Color(hex: "FF2E63").opacity(0.3), Color.clear],
                                center: .center,
                                startRadius: 22,
                                endRadius: 44
                            )
                        )
                        .frame(width: 84, height: 84)
                        .opacity(addButtonGlow ? 1 : 0.4)

                    // Main gradient circle
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: "FF2E63"), Color(hex: "E94057"), Color(hex: "08D9D6")],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 62, height: 62)
                        .shadow(color: Color(hex: "FF2E63").opacity(0.45), radius: 12, y: 4)

                    Image(systemName: "camera.fill")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(.white)
                        .shadow(color: .black.opacity(0.2), radius: 2, y: 1)
                }
                .scaleEffect(addButtonGlow ? 1.04 : 1.0)
                .onAppear {
                    withAnimation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true)) {
                        addButtonGlow = true
                    }
                }

                Text("Story")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
            }
        }
        .accessibilityLabel("Create new story")
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
