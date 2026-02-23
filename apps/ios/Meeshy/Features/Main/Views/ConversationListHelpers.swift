import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from ConversationListView.swift

// MARK: - Section Header View
struct SectionHeaderView: View {
    let section: ConversationSection
    let count: Int
    let isExpanded: Bool
    var isDropTarget: Bool = false
    let onToggle: () -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isTapped = false

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) {
                isTapped = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                isTapped = false
            }
            onToggle()
        }) {
            HStack(spacing: 10) {
                // Section icon with glow
                ZStack {
                    // Glow ring behind icon
                    Circle()
                        .fill(Color(hex: section.color).opacity(isExpanded ? 0.15 : 0))
                        .frame(width: 40, height: 40)
                        .blur(radius: 4)
                        .animation(.easeInOut(duration: 0.4), value: isExpanded)

                    Circle()
                        .fill(Color(hex: section.color).opacity(isDropTarget ? 0.5 : (theme.mode.isDark ? 0.25 : 0.18)))
                        .frame(width: 32, height: 32)
                        .scaleEffect(isDropTarget ? 1.15 : (isTapped ? 1.2 : 1.0))

                    Image(systemName: section.icon)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Color(hex: section.color))
                        .scaleEffect(isTapped ? 1.15 : 1.0)
                }
                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: isTapped)

                // Section name
                Text(section.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(isDropTarget ? Color(hex: section.color) : theme.textPrimary)

                // Count badge
                Text("\(count)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(hex: section.color))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        Capsule()
                            .fill(Color(hex: section.color).opacity(isDropTarget ? 0.4 : (theme.mode.isDark ? 0.2 : 0.15)))
                    )
                    .scaleEffect(isTapped ? 1.1 : 1.0)
                    .animation(.spring(response: 0.25, dampingFraction: 0.6), value: isTapped)

                Spacer()

                // Drop indicator when dragging over
                if isDropTarget {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(Color(hex: section.color))
                        .transition(.scale.combined(with: .opacity))
                }

                // Expand/collapse chevron with rotation animation
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color(hex: section.color))
                    .opacity(isDropTarget ? 0.5 : 1)
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))
                    .animation(.spring(response: 0.3, dampingFraction: 0.65), value: isExpanded)
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isDropTarget ? Color(hex: section.color).opacity(theme.mode.isDark ? 0.15 : 0.1) : (isExpanded ? Color(hex: section.color).opacity(0.04) : Color.clear))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(
                                isDropTarget ? Color(hex: section.color).opacity(0.5) : Color.clear,
                                lineWidth: 2
                            )
                            .animation(.easeInOut(duration: 0.3), value: isDropTarget)
                    )
            )
            .contentShape(Rectangle())
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isDropTarget)
            .animation(.easeInOut(duration: 0.3), value: isExpanded)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Conversation Preview View (for hard press)
struct ConversationPreviewView: View {
    let conversation: Conversation

    @ObservedObject private var theme = ThemeManager.shared
    @State private var messages: [Message] = []
    @State private var isLoading = true

    private var accentColor: String { conversation.accentColor }
    private var secondaryColor: String { conversation.colorPalette.secondary }

    private func loadRecentMessages() async {
        do {
            let response = try await MessageService.shared.list(
                conversationId: conversation.id,
                offset: 0,
                limit: 4,
                includeReplies: false
            )
            let userId = AuthManager.shared.currentUser?.id ?? ""
            messages = response.data.reversed().map { $0.toMessage(currentUserId: userId) }
        } catch {
            // Silent fail — preview is best-effort
        }
        isLoading = false
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header with avatar and name
            HStack(spacing: 12) {
                // Avatar
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 44, height: 44)
                        .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 6, y: 3)

                    Text(String(conversation.name.prefix(1)))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                }

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(conversation.name)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)

                        if conversation.isPinned {
                            Image(systemName: "pin.fill")
                                .font(.system(size: 9))
                                .foregroundColor(MeeshyColors.coral)
                        }

                        if conversation.isMuted {
                            Image(systemName: "bell.slash.fill")
                                .font(.system(size: 9))
                                .foregroundColor(theme.textMuted)
                        }
                    }

                    HStack(spacing: 6) {
                        if conversation.type != .direct {
                            HStack(spacing: 3) {
                                Image(systemName: conversation.type == .group ? "person.2.fill" : "person.3.fill")
                                    .font(.system(size: 9))
                                Text("\(conversation.memberCount) membres")
                                    .font(.system(size: 11, weight: .medium))
                            }
                            .foregroundColor(Color(hex: accentColor))
                        } else {
                            Circle()
                                .fill(Color(hex: "2ECC71"))
                                .frame(width: 8, height: 8)
                            Text("En ligne")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(Color(hex: "2ECC71"))
                        }
                    }
                }

                Spacer()

                if conversation.unreadCount > 0 {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 26, height: 26)

                        Text("\(min(conversation.unreadCount, 99))")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
            }
            .padding(14)
            .background(
                theme.surfaceGradient(tint: accentColor)
                    .overlay(
                        Rectangle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: accentColor).opacity(0.1), Color.clear],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )
                    )
            )

            // Recent messages preview (up to 4 most recent, real bubbles)
            VStack(spacing: 0) {
                Spacer(minLength: 0)

                if isLoading {
                    VStack(spacing: 6) {
                        ForEach(0..<4, id: \.self) { i in
                            HStack {
                                if i % 2 == 0 { Spacer(minLength: 40) }
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(theme.textMuted.opacity(0.1))
                                    .frame(width: CGFloat.random(in: 100...180), height: 28)
                                if i % 2 != 0 { Spacer(minLength: 40) }
                            }
                            .padding(.horizontal, 8)
                        }
                    }
                    .padding(.bottom, 8)
                } else if messages.isEmpty {
                    VStack(spacing: 6) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 22))
                            .foregroundColor(theme.textMuted.opacity(0.3))
                        Text("Aucun message")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 10)
                } else {
                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(spacing: 0) {
                            ForEach(messages) { msg in
                                ThemedMessageBubble(
                                    message: msg,
                                    contactColor: accentColor,
                                    showAvatar: !msg.isMe
                                )
                                .allowsHitTesting(false)
                            }
                        }
                        .padding(.horizontal, 4)
                        .padding(.vertical, 8)
                    }
                }
            }
            .frame(minHeight: 100, maxHeight: 260)
            .background(previewBackground)
        }
        .frame(width: 320)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(
                    LinearGradient(
                        colors: [Color(hex: accentColor).opacity(0.5), Color(hex: secondaryColor).opacity(0.3)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
        .shadow(color: Color(hex: accentColor).opacity(0.3), radius: 20, y: 10)
        .task {
            await loadRecentMessages()
        }
    }

    private var previewBackground: some View {
        ZStack {
            theme.backgroundGradient

            // Accent colored orbs (smaller for preview)
            Circle()
                .fill(Color(hex: accentColor).opacity(theme.mode.isDark ? 0.1 : 0.06))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: 80, y: -80)

            Circle()
                .fill(Color(hex: secondaryColor).opacity(theme.mode.isDark ? 0.08 : 0.05))
                .frame(width: 150, height: 150)
                .blur(radius: 50)
                .offset(x: -60, y: 100)
        }
    }
}

// MARK: - Themed Community Card
struct ThemedCommunityCard: View {
    let community: Community
    @ObservedObject private var theme = ThemeManager.shared
    @State private var isPressed = false

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Gradient background
            LinearGradient(
                colors: [
                    Color(hex: community.color),
                    Color(hex: community.color).opacity(0.85)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Banner emoji
            Text(community.emoji)
                .font(.system(size: 36))
                .offset(x: 70, y: -20)
                .opacity(1.0)
                .rotationEffect(.degrees(isPressed ? -10 : 0))
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isPressed)

            // Dark overlay for text readability
            LinearGradient(
                colors: [.clear, .clear, Color.black.opacity(0.7)],
                startPoint: .top,
                endPoint: .bottom
            )

            // Content
            VStack(alignment: .leading, spacing: 3) {
                Text(community.name)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(3)
                    .minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 6) {
                    HStack(spacing: 2) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 8))
                        Text(formatCount(community.memberCount))
                            .font(.system(size: 9, weight: .semibold))
                    }
                    HStack(spacing: 2) {
                        Image(systemName: "bubble.left.fill")
                            .font(.system(size: 8))
                        Text(formatCount(community.conversationCount))
                            .font(.system(size: 9, weight: .semibold))
                    }
                }
                .foregroundColor(.white.opacity(0.9))
            }
            .padding(8)
        }
        .frame(width: 130, height: 110)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .scaleEffect(isPressed ? 0.95 : 1)
        .onTapGesture {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                isPressed = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                    isPressed = false
                }
            }
            HapticFeedback.light()
        }
    }

    private func formatCount(_ count: Int) -> String {
        if count >= 1000000 {
            return String(format: "%.1fM", Double(count) / 1000000.0)
        } else if count >= 1000 {
            return String(format: "%.1fk", Double(count) / 1000.0)
        }
        return "\(count)"
    }
}

// MARK: - Themed Filter Chip
struct ThemedFilterChip: View {
    let title: String
    let color: String
    let isSelected: Bool
    let action: () -> Void

    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            action()
        }) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(isSelected ? .white : Color(hex: color))
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .background(
                    Capsule()
                        .fill(
                            isSelected ?
                            AnyShapeStyle(LinearGradient(colors: [Color(hex: color), Color(hex: color).opacity(0.85)], startPoint: .leading, endPoint: .trailing)) :
                            AnyShapeStyle(Color(hex: color).opacity(theme.mode.isDark ? 0.4 : 0.3))
                        )
                        .overlay(
                            Capsule()
                                .stroke(Color(hex: color).opacity(isSelected ? 0 : 0.7), lineWidth: 1)
                        )
                )
        }
        .scaleEffect(isSelected ? 1.05 : 1)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isSelected)
    }
}

// MARK: - Tag Chip Component
struct TagChip: View {
    let tag: ConversationTag
    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        Text(tag.name)
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(Color(hex: tag.color))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                Capsule()
                    .fill(Color(hex: tag.color).opacity(theme.mode.isDark ? 0.25 : 0.18))
                    .overlay(
                        Capsule()
                            .stroke(Color(hex: tag.color).opacity(0.4), lineWidth: 0.5)
                    )
            )
    }
}

// MARK: - Legacy Support
struct SemanticColors {
    static let vibrantPalette: [String] = [
        "FF6B6B", "4ECDC4", "45B7D1", "96CEB4", "FFEAA7",
        "DDA0DD", "98D8C8", "F7DC6F", "BB8FCE", "85C1E9",
        "F8B500", "00CED1", "FF7F50", "9B59B6", "1ABC9C",
        "E74C3C", "3498DB", "2ECC71", "F39C12", "E91E63"
    ]

    static func colorForName(_ name: String) -> String {
        DynamicColorGenerator.colorForName(name)
    }
}

// Legacy aliases
struct ColorfulConversationRow: View {
    let conversation: Conversation
    var hasUnread: Bool = false
    var availableWidth: CGFloat = 200

    var body: some View {
        ThemedConversationRow(conversation: conversation, availableWidth: availableWidth)
    }
}

struct CommunityCard: View {
    let community: Community

    var body: some View {
        ThemedCommunityCard(community: community)
    }
}

struct ColorfulFilterChip: View {
    let title: String
    let color: String
    let isSelected: Bool

    var body: some View {
        ThemedFilterChip(title: title, color: color, isSelected: isSelected) {}
    }
}

struct ConversationRow: View {
    let conversation: Conversation
    var hasUnread: Bool = false

    var body: some View {
        ThemedConversationRow(conversation: conversation)
    }
}

struct CategoryPill: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        ThemedFilterChip(title: title, color: "4ECDC4", isSelected: isSelected, action: action)
    }
}

struct FilterChip: View {
    let title: String
    let isSelected: Bool

    var body: some View {
        ThemedFilterChip(title: title, color: "4ECDC4", isSelected: isSelected) {}
    }
}
