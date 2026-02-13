import SwiftUI

struct StoryTrayView: View {
    @ObservedObject var viewModel: StoryViewModel
    var onViewStory: (Int) -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @State private var addButtonPulse = false

    var body: some View {
        VStack(spacing: 0) {
            if viewModel.isLoading && viewModel.storyGroups.isEmpty {
                shimmerPlaceholder
            } else {
                storyScrollView
            }
        }
        .frame(height: 100)
    }

    // MARK: - Story Scroll View

    private var storyScrollView: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                // "+" Add story button
                addStoryButton
                    .bounceOnAppear(delay: 0)

                // Story rings
                ForEach(Array(viewModel.storyGroups.enumerated()), id: \.element.id) { index, group in
                    storyRing(group: group, index: index)
                        .staggeredAppear(index: index, baseDelay: 0.06)
                        .onTapGesture {
                            HapticFeedback.light()
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
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "FF2E63"), Color(hex: "08D9D6")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 60, height: 60)
                    .shadow(
                        color: Color(hex: "FF2E63").opacity(addButtonPulse ? 0.5 : 0.3),
                        radius: addButtonPulse ? 12 : 8,
                        y: 4
                    )

                Image(systemName: "plus")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.white)
            }
            .scaleEffect(addButtonPulse ? 1.05 : 1.0)
            .onAppear {
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                    addButtonPulse = true
                }
            }

            Text("Story")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
    }

    // MARK: - Story Ring

    private func storyRing(group: StoryGroup, index: Int) -> some View {
        VStack(spacing: 6) {
            ZStack {
                // Outer ring
                Circle()
                    .stroke(
                        group.hasUnviewed ?
                            MeeshyColors.avatarRingGradient :
                            LinearGradient(colors: [Color.gray.opacity(0.3), Color.gray.opacity(0.3)], startPoint: .top, endPoint: .bottom),
                        lineWidth: 2.5
                    )
                    .frame(width: 64, height: 64)

                // Avatar circle
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(hex: group.avatarColor),
                                Color(hex: group.avatarColor).opacity(0.7)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 56, height: 56)
                    .overlay(
                        Text(String(group.username.prefix(1)).uppercased())
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white)
                    )
            }

            Text(group.username)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
                .frame(width: 64)
        }
    }

    // MARK: - Shimmer Placeholder

    private var shimmerPlaceholder: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(0..<6, id: \.self) { _ in
                    VStack(spacing: 6) {
                        Circle()
                            .fill(Color.gray.opacity(0.2))
                            .frame(width: 60, height: 60)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.gray.opacity(0.15))
                            .frame(width: 40, height: 8)
                    }
                    .shimmer()
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }
}
