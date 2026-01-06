//
//  EmojiPickerSheet.swift
//  Meeshy
//
//  Emoji picker with frequently used emojis first
//  iOS 17+
//

import SwiftUI

struct EmojiPickerSheet: View {
    let quickReactions: [String]
    let onSelect: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @AppStorage("frequentEmojis") private var frequentEmojisData: Data = Data()

    // Emoji categories
    private let categories: [(name: String, icon: String, emojis: [String])] = [
        ("Smileys", "face.smiling", ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "☺️", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥"]),
        ("Gestes", "hand.raised", ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏"]),
        ("Coeurs", "heart", ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️"]),
        ("Objets", "star", ["⭐", "🌟", "✨", "💫", "🔥", "💥", "💯", "💢", "💤", "💨", "🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "🥈", "🥉", "⚽", "🏀", "🎮", "🎯", "🎸", "🎹"]),
        ("Nourriture", "fork.knife", ["🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🍕", "🍔", "🍟", "🌭", "🥪", "🌮", "🍦", "🍩", "🍪", "☕", "🍺", "🍷", "🥂"]),
        ("Nature", "leaf", ["🌸", "🌺", "🌻", "🌹", "🌷", "🌼", "🌱", "🌲", "🌳", "🌴", "🌵", "🍀", "🍁", "🍂", "🍃", "🌈", "☀️", "🌙", "⭐", "🌊", "🔥", "❄️", "🌪️"])
    ]

    private var frequentEmojis: [String] {
        (try? JSONDecoder().decode([String].self, from: frequentEmojisData)) ?? quickReactions
    }

    private var filteredCategories: [(name: String, icon: String, emojis: [String])] {
        if searchText.isEmpty {
            return categories
        }
        return categories.compactMap { category in
            let filtered = category.emojis.filter { $0.contains(searchText) }
            return filtered.isEmpty ? nil : (category.name, category.icon, filtered)
        }
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Search Bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)

                    TextField("Rechercher un emoji", text: $searchText)
                        .textFieldStyle(.plain)
                }
                .padding(10)
                .background(Color(.systemGray6))
                .cornerRadius(10)
                .padding()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        // Quick Reactions Section (3x3 grid)
                        if searchText.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                HStack {
                                    Image(systemName: "face.smiling")
                                        .foregroundColor(.secondary)
                                    Text("Reactions rapides")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.secondary)
                                }
                                .padding(.horizontal)

                                // 3x3 Grid of quick reactions
                                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 12) {
                                    ForEach(quickReactions.prefix(9), id: \.self) { emoji in
                                        EmojiButton(emoji: emoji, onSelect: selectEmoji, size: 44)
                                    }
                                }
                                .padding(.horizontal, 32)
                            }

                            Divider()
                                .padding(.vertical, 8)

                            // Frequently Used Section
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Image(systemName: "clock")
                                        .foregroundColor(.secondary)
                                    Text("Utilises recemment")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.secondary)
                                }
                                .padding(.horizontal)

                                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 8) {
                                    ForEach(frequentEmojis.prefix(16), id: \.self) { emoji in
                                        EmojiButton(emoji: emoji, onSelect: selectEmoji)
                                    }
                                }
                                .padding(.horizontal)
                            }

                            Divider()
                                .padding(.vertical, 8)
                        }

                        // Categories
                        ForEach(filteredCategories, id: \.name) { category in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Image(systemName: category.icon)
                                        .foregroundColor(.secondary)
                                    Text(category.name)
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.secondary)
                                }
                                .padding(.horizontal)

                                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 8) {
                                    ForEach(category.emojis, id: \.self) { emoji in
                                        EmojiButton(emoji: emoji, onSelect: selectEmoji)
                                    }
                                }
                                .padding(.horizontal)
                            }
                        }
                    }
                    .padding(.vertical)
                }
            }
            .navigationTitle("Reactions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
    }

    private func selectEmoji(_ emoji: String) {
        // Update frequent emojis
        var frequent = frequentEmojis
        frequent.removeAll { $0 == emoji }
        frequent.insert(emoji, at: 0)
        if frequent.count > 24 {
            frequent = Array(frequent.prefix(24))
        }
        frequentEmojisData = (try? JSONEncoder().encode(frequent)) ?? Data()

        onSelect(emoji)
    }
}

struct EmojiButton: View {
    let emoji: String
    let onSelect: (String) -> Void
    var size: CGFloat = 36

    var body: some View {
        Button(action: { onSelect(emoji) }) {
            Text(emoji)
                .font(size > 40 ? .largeTitle : .title2)
                .frame(width: size, height: size)
        }
    }
}

// MARK: - Reaction Users Sheet

struct ReactionUsersSheet: View {
    let emoji: String
    let reactions: [Reaction]

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            List {
                ForEach(reactions, id: \.id) { reaction in
                    HStack {
                        // Avatar placeholder
                        Circle()
                            .fill(Color.blue.opacity(0.2))
                            .frame(width: 40, height: 40)
                            .overlay(
                                Text("U")
                                    .font(.headline)
                                    .foregroundColor(.blue)
                            )

                        VStack(alignment: .leading) {
                            Text("Utilisateur") // TODO: Fetch user info
                                .font(.subheadline)
                                .fontWeight(.medium)

                            if let createdAt = reaction.createdAt {
                                Text(createdAt, style: .relative)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }

                        Spacer()

                        Text(emoji)
                            .font(.title2)
                    }
                }
            }
            .navigationTitle("\(emoji) Reactions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    EmojiPickerSheet(
        quickReactions: ["❤️", "👍", "😂", "😮", "😢", "🙏", "🔥", "👏", "🎉"],
        onSelect: { _ in }
    )
}
