//
//  ReactionsDetailView.swift
//  Meeshy
//
//  Reactions detail with emoji picker and user list
//  iOS 16+
//

import SwiftUI

// MARK: - Reactions Detail View

struct ReactionsDetailView: View {
    let config: ReactionsConfig

    @State private var selectedCategory: EmojiGridCategory = .recent
    @State private var searchText: String = ""
    @State private var showExistingReactions = false

    private var totalReactionsCount: Int {
        config.reactions.reduce(0) { $0 + $1.users.count }
    }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 8)

    var body: some View {
        VStack(spacing: 0) {
            // Header with toggle
            headerView

            // Category tabs (horizontal scrollable)
            categoryTabs

            Divider()

            // Content area
            if showExistingReactions {
                existingReactionsView
            } else {
                emojiPickerView
            }
        }
    }

    // MARK: - Header View

    private var headerView: some View {
        HStack {
            Text(showExistingReactions ? "Réactions" : "Ajouter une réaction")
                .font(.system(size: 16, weight: .semibold))

            Spacer()

            // Toggle button
            if totalReactionsCount > 0 {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showExistingReactions.toggle()
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: showExistingReactions ? "plus.circle" : "list.bullet")
                            .font(.system(size: 14))
                        Text(showExistingReactions ? "Ajouter" : "Voir (\(totalReactionsCount))")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.blue)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.blue.opacity(0.1))
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    // MARK: - Category Tabs

    private var categoryTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                // Recent tab (always shown first, selected by default)
                ReactionCategoryTab(
                    category: .recent,
                    isSelected: selectedCategory == .recent,
                    badge: config.recentEmojis.isEmpty ? nil : config.recentEmojis.count
                ) {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedCategory = .recent
                    }
                }

                // Popular tab
                ReactionCategoryTab(
                    category: nil,
                    customIcon: "star.fill",
                    customLabel: "Populaires",
                    isSelected: selectedCategory == .smileys && searchText == "popular"
                ) {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedCategory = .smileys
                        searchText = "popular"
                    }
                }

                // Other categories
                ForEach(EmojiGridCategory.allCases.filter { $0 != .recent }) { category in
                    ReactionCategoryTab(
                        category: category,
                        isSelected: selectedCategory == category && searchText != "popular"
                    ) {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            selectedCategory = category
                            searchText = ""
                        }
                    }
                }
            }
            .padding(.horizontal, 12)
        }
        .padding(.vertical, 6)
    }

    // MARK: - Emoji Picker View

    private var emojiPickerView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                // Popular emojis section (always at top)
                if searchText != "popular" && selectedCategory == .recent {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Populaires sur Meeshy")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 4)

                        LazyVGrid(columns: columns, spacing: 4) {
                            ForEach(config.popularEmojis.prefix(8), id: \.self) { emoji in
                                ReactionEmojiButton(emoji: emoji) {
                                    config.onSelectEmoji(emoji)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                }

                // Main emoji grid
                LazyVGrid(columns: columns, spacing: 4) {
                    ForEach(emojisToDisplay, id: \.self) { emoji in
                        ReactionEmojiButton(emoji: emoji) {
                            config.onSelectEmoji(emoji)
                        }
                    }
                }
                .padding(.horizontal, 12)

                // Empty state for recent
                if selectedCategory == .recent && config.recentEmojis.isEmpty {
                    emptyRecentState
                }
            }
            .padding(.vertical, 8)
        }
    }

    // MARK: - Existing Reactions View

    private var existingReactionsView: some View {
        VStack(spacing: 0) {
            // Emoji filter tabs for existing reactions
            if !config.reactions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(config.reactions, id: \.emoji) { reaction in
                            ExistingReactionTab(
                                emoji: reaction.emoji,
                                count: reaction.users.count
                            )
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.vertical, 8)
            }

            Divider()

            // Users list
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(allReactionUsers.indices, id: \.self) { index in
                        UserReactionRow(
                            emoji: allReactionUsers[index].emoji,
                            userInfo: allReactionUsers[index].user,
                            onTap: {
                                config.onUserTap(allReactionUsers[index].user.id)
                            }
                        )
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
        }
    }

    // MARK: - Empty State

    private var emptyRecentState: some View {
        VStack(spacing: 12) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 32))
                .foregroundColor(.secondary.opacity(0.5))

            Text("Aucun emoji récent")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.secondary)

            Text("Vos emojis récemment utilisés apparaîtront ici")
                .font(.system(size: 12))
                .foregroundColor(.secondary.opacity(0.7))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    // MARK: - Computed Properties

    private var emojisToDisplay: [String] {
        if searchText == "popular" {
            return config.popularEmojis
        }

        if selectedCategory == .recent {
            return config.recentEmojis
        }

        return selectedCategory.emojis
    }

    private var allReactionUsers: [(emoji: String, user: ReactionUserInfo)] {
        config.reactions.flatMap { reaction in
            reaction.users.map { (emoji: reaction.emoji, user: $0) }
        }
    }
}

// MARK: - Reaction Category Tab

private struct ReactionCategoryTab: View {
    let category: EmojiGridCategory?
    var customIcon: String?
    var customLabel: String?
    let isSelected: Bool
    var badge: Int?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: customIcon ?? category?.icon ?? "circle")
                    .font(.system(size: 12, weight: .medium))

                if let count = badge {
                    Text("\(count)")
                        .font(.system(size: 10, weight: .semibold))
                }
            }
            .foregroundColor(isSelected ? .white : .primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? Color.blue : Color(.systemGray6))
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Reaction Emoji Button

private struct ReactionEmojiButton: View {
    let emoji: String
    let action: () -> Void

    var body: some View {
        Button(action: {
            let impact = UIImpactFeedbackGenerator(style: .light)
            impact.impactOccurred()
            action()
        }) {
            Text(emoji)
                .font(.system(size: 28))
                .frame(width: 40, height: 40)
        }
        .buttonStyle(ReactionEmojiButtonStyle())
    }
}

// MARK: - Button Style

private struct ReactionEmojiButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 1.3 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

// MARK: - Existing Reaction Tab

private struct ExistingReactionTab: View {
    let emoji: String
    let count: Int

    var body: some View {
        HStack(spacing: 4) {
            Text(emoji)
                .font(.system(size: 18))

            Text("\(count)")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color(.systemGray6))
        .cornerRadius(16)
    }
}

// MARK: - User Reaction Row

private struct UserReactionRow: View {
    let emoji: String
    let userInfo: ReactionUserInfo
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Avatar
                if let avatar = userInfo.avatar, !avatar.isEmpty {
                    CachedAsyncImage(urlString: avatar, cacheType: .avatar) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        userInitialAvatar
                    }
                    .frame(width: 32, height: 32)
                    .clipShape(Circle())
                } else {
                    userInitialAvatar
                }

                // User name
                Text(userInfo.name)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.primary)

                Spacer()

                // Emoji
                Text(emoji)
                    .font(.system(size: 20))
            }
            .padding(.vertical, 6)
        }
        .buttonStyle(PlainButtonStyle())
    }

    private var userInitialAvatar: some View {
        Circle()
            .fill(Color.blue.opacity(0.2))
            .frame(width: 32, height: 32)
            .overlay(
                Text(String(userInfo.name.prefix(1)).uppercased())
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.blue)
            )
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color.gray.opacity(0.1).ignoresSafeArea()

        ReactionsDetailView(config: .init(
            reactions: [
                ("❤️", [
                    ReactionUserInfo(id: "1", name: "Marie", avatar: nil),
                    ReactionUserInfo(id: "2", name: "Julie", avatar: nil),
                    ReactionUserInfo(id: "3", name: "Sophie", avatar: nil)
                ]),
                ("👍", [
                    ReactionUserInfo(id: "4", name: "Pierre", avatar: nil),
                    ReactionUserInfo(id: "5", name: "Marc", avatar: nil)
                ]),
                ("😂", [
                    ReactionUserInfo(id: "6", name: "Emma", avatar: nil)
                ])
            ],
            recentEmojis: ["🔥", "💯", "✨", "🎉", "💪", "🙌"],
            popularEmojis: ["❤️", "👍", "😂", "🔥", "😮", "🙏", "👏", "😢"],
            onSelectEmoji: { emoji in
                print("Selected emoji: \(emoji)")
            },
            onUserTap: { userId in
                print("Tapped user: \(userId)")
            }
        ))
        .frame(height: 280)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemBackground))
                .shadow(radius: 5)
        )
        .padding()
    }
}
