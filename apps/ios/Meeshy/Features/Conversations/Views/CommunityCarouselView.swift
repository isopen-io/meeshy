//
//  CommunityCarouselView.swift
//  Meeshy
//
//  Modern explore tiles for filtering conversations
//  Features: Colorful gradients, icons, keyboard-aware positioning
//

import SwiftUI

// MARK: - Filter Types

enum CommunityFilterType: Equatable, Hashable {
    case all
    case archived
    case reacted
    case community(String) // communityId
}

struct CommunityCardData: Identifiable, Hashable {
    let id: String
    let type: CommunityFilterType
    let title: String
    let image: String?
    let memberCount: Int?
    let conversationCount: Int
    let communityId: String?
}

// MARK: - Modern Explore Tiles View

struct CommunityCarouselView: View {
    let cards: [CommunityCardData]
    let selectedFilter: CommunityFilterType
    let onSelect: (CommunityFilterType) -> Void
    var onRefresh: (() async -> Void)? = nil

    var body: some View {
        VStack(spacing: 8) {
            // Quick Filter Tiles (All, Favorites, Archives) - Compact horizontal layout
            HStack(spacing: 8) {
                CompactFilterTile(
                    title: "Toutes",
                    icon: "bubble.left.and.bubble.right.fill",
                    gradient: [Color(hex: "667eea") ?? .purple, Color(hex: "764ba2") ?? .indigo],
                    count: totalConversationCount,
                    isSelected: selectedFilter == .all
                ) {
                    onSelect(.all)
                }

                CompactFilterTile(
                    title: "Favoris",
                    icon: "heart.fill",
                    gradient: [Color(hex: "f093fb") ?? .pink, Color(hex: "f5576c") ?? .red],
                    count: reactedCount,
                    isSelected: selectedFilter == .reacted
                ) {
                    onSelect(.reacted)
                }

                CompactFilterTile(
                    title: "Archives",
                    icon: "archivebox.fill",
                    gradient: [Color(hex: "4facfe") ?? .blue, Color(hex: "00f2fe") ?? .cyan],
                    count: archivedCount,
                    isSelected: selectedFilter == .archived
                ) {
                    onSelect(.archived)
                }
            }
            .padding(.horizontal, 12)

            // Community Cards (horizontal scroll) - Compact
            // Uses HorizontalOnlyScrollView to prevent vertical bounce when embedded in vertical scroll
            if !communityCards.isEmpty {
                HorizontalOnlyScrollView(height: 60) {
                    HStack(spacing: 8) {
                        ForEach(communityCards) { card in
                            CompactCommunityCard(
                                card: card,
                                isSelected: isSelected(card)
                            ) {
                                onSelect(card.type)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                }
                .frame(height: 60) // Explicit frame for proper SwiftUI layout
            }
        }
        .padding(.vertical, 6)
    }

    // MARK: - Computed Properties

    private var totalConversationCount: Int {
        cards.first(where: { $0.type == .all })?.conversationCount ?? 0
    }

    private var reactedCount: Int {
        cards.first(where: { $0.type == .reacted })?.conversationCount ?? 0
    }

    private var archivedCount: Int {
        cards.first(where: { $0.type == .archived })?.conversationCount ?? 0
    }

    private var communityCards: [CommunityCardData] {
        cards.filter {
            if case .community = $0.type { return true }
            return false
        }
    }

    private func isSelected(_ card: CommunityCardData) -> Bool {
        switch (selectedFilter, card.type) {
        case (.all, .all): return true
        case (.archived, .archived): return true
        case (.reacted, .reacted): return true
        case (.community(let id1), .community(let id2)): return id1 == id2
        default: return false
        }
    }
}

// MARK: - Community Explore Tile (Quick Filter)

struct CommunityExploreTile: View {
    let title: String
    let icon: String
    let gradient: [Color]
    let count: Int
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 6) {
                // Icon with gradient background
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: gradient,
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 44, height: 44)
                        .shadow(color: gradient[0].opacity(0.4), radius: 8, x: 0, y: 4)

                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                }

                // Title
                Text(title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.primary)

                // Count badge
                Text("\(count)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: gradient,
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                    )
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(.ultraThinMaterial)
                    .shadow(color: isSelected ? gradient[0].opacity(0.3) : Color.black.opacity(0.05),
                            radius: isSelected ? 8 : 4,
                            x: 0,
                            y: isSelected ? 4 : 2)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(
                        isSelected ?
                            LinearGradient(colors: gradient, startPoint: .topLeading, endPoint: .bottomTrailing) :
                            LinearGradient(colors: [Color.clear], startPoint: .top, endPoint: .bottom),
                        lineWidth: 2
                    )
            )
            .scaleEffect(isSelected ? 1.02 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isSelected)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Community Card (Horizontal Scroll)

struct CommunityCard: View {
    let card: CommunityCardData
    let isSelected: Bool
    let onTap: () -> Void

    // Random gradient based on card id
    private var cardGradient: [Color] {
        let gradients: [[Color]] = [
            [Color(hex: "ff9a9e") ?? .pink, Color(hex: "fecfef") ?? .pink.opacity(0.5)],
            [Color(hex: "a18cd1") ?? .purple, Color(hex: "fbc2eb") ?? .pink],
            [Color(hex: "ffecd2") ?? .orange.opacity(0.5), Color(hex: "fcb69f") ?? .orange],
            [Color(hex: "84fab0") ?? .green, Color(hex: "8fd3f4") ?? .blue],
            [Color(hex: "cfd9df") ?? .gray, Color(hex: "e2ebf0") ?? .gray.opacity(0.5)],
            [Color(hex: "667eea") ?? .purple, Color(hex: "764ba2") ?? .indigo],
            [Color(hex: "f093fb") ?? .pink, Color(hex: "f5576c") ?? .red],
            [Color(hex: "4facfe") ?? .blue, Color(hex: "00f2fe") ?? .cyan],
        ]
        let index = abs(card.id.hashValue) % gradients.count
        return gradients[index]
    }

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .bottomLeading) {
                // Background
                if let image = card.image, let url = URL(string: image) {
                    CachedAsyncImage(url: url, cacheType: .thumbnail) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } placeholder: {
                        gradientBackground
                    }
                } else {
                    gradientBackground
                }

                // Overlay gradient for text readability
                LinearGradient(
                    colors: [.black.opacity(0.6), .black.opacity(0.2), .clear],
                    startPoint: .bottom,
                    endPoint: .top
                )

                // Content
                VStack(alignment: .leading, spacing: 4) {
                    Spacer()

                    Text(card.title)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    HStack(spacing: 8) {
                        // Conversation count
                        HStack(spacing: 3) {
                            Image(systemName: "bubble.left.fill")
                                .font(.system(size: 9))
                            Text("\(card.conversationCount)")
                                .font(.system(size: 10, weight: .medium))
                        }

                        // Member count
                        if let memberCount = card.memberCount {
                            HStack(spacing: 3) {
                                Image(systemName: "person.2.fill")
                                    .font(.system(size: 9))
                                Text("\(memberCount)")
                                    .font(.system(size: 10, weight: .medium))
                            }
                        }
                    }
                    .foregroundColor(.white.opacity(0.9))
                }
                .padding(10)

                // Selection indicator
                if isSelected {
                    VStack {
                        HStack {
                            Spacer()
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 18))
                                .foregroundColor(.white)
                                .background(
                                    Circle()
                                        .fill(Color.green)
                                        .frame(width: 20, height: 20)
                                )
                                .padding(8)
                        }
                        Spacer()
                    }
                }
            }
            .frame(width: 130, height: 90)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(isSelected ? Color.white : Color.clear, lineWidth: 2)
            )
            .shadow(color: isSelected ? cardGradient[0].opacity(0.4) : Color.black.opacity(0.1),
                    radius: isSelected ? 8 : 4,
                    x: 0,
                    y: isSelected ? 4 : 2)
            .scaleEffect(isSelected ? 1.03 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isSelected)
        }
        .buttonStyle(PlainButtonStyle())
    }

    private var gradientBackground: some View {
        LinearGradient(
            colors: cardGradient,
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// MARK: - Compact Filter Tile (Reduced size, transparent background)

struct CompactFilterTile: View {
    let title: String
    let icon: String
    let gradient: [Color]
    let count: Int
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                // Icon with gradient background
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: gradient,
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 28, height: 28)

                    Image(systemName: icon)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                }

                // Title + Count
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.primary)

                    Text("\(count)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(gradient[0])
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(.ultraThinMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(
                        isSelected ? gradient[0] : Color.clear,
                        lineWidth: isSelected ? 2 : 0
                    )
            )
            .shadow(color: Color.black.opacity(0.08), radius: 4, x: 0, y: 2)
            .scaleEffect(isSelected ? 1.02 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isSelected)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Compact Community Card (Reduced size)

struct CompactCommunityCard: View {
    let card: CommunityCardData
    let isSelected: Bool
    let onTap: () -> Void

    // Random gradient based on card id
    private var cardGradient: [Color] {
        let gradients: [[Color]] = [
            [Color(hex: "ff9a9e") ?? .pink, Color(hex: "fecfef") ?? .pink.opacity(0.5)],
            [Color(hex: "a18cd1") ?? .purple, Color(hex: "fbc2eb") ?? .pink],
            [Color(hex: "ffecd2") ?? .orange.opacity(0.5), Color(hex: "fcb69f") ?? .orange],
            [Color(hex: "84fab0") ?? .green, Color(hex: "8fd3f4") ?? .blue],
            [Color(hex: "667eea") ?? .purple, Color(hex: "764ba2") ?? .indigo],
            [Color(hex: "f093fb") ?? .pink, Color(hex: "f5576c") ?? .red],
            [Color(hex: "4facfe") ?? .blue, Color(hex: "00f2fe") ?? .cyan],
        ]
        let index = abs(card.id.hashValue) % gradients.count
        return gradients[index]
    }

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .bottomLeading) {
                // Background
                if let image = card.image, let url = URL(string: image) {
                    CachedAsyncImage(url: url, cacheType: .thumbnail) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } placeholder: {
                        gradientBackground
                    }
                } else {
                    gradientBackground
                }

                // Overlay gradient for text readability
                LinearGradient(
                    colors: [.black.opacity(0.5), .clear],
                    startPoint: .bottom,
                    endPoint: .top
                )

                // Content
                VStack(alignment: .leading, spacing: 2) {
                    Spacer()

                    Text(card.title)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    HStack(spacing: 4) {
                        Image(systemName: "bubble.left.fill")
                            .font(.system(size: 8))
                        Text("\(card.conversationCount)")
                            .font(.system(size: 9, weight: .medium))
                    }
                    .foregroundColor(.white.opacity(0.9))
                }
                .padding(6)

                // Selection indicator
                if isSelected {
                    VStack {
                        HStack {
                            Spacer()
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 14))
                                .foregroundColor(.white)
                                .background(Circle().fill(Color.green).frame(width: 16, height: 16))
                                .padding(4)
                        }
                        Spacer()
                    }
                }
            }
            .frame(width: 90, height: 60)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isSelected ? Color.white : Color.clear, lineWidth: 1.5)
            )
            .shadow(color: Color.black.opacity(0.1), radius: 3, x: 0, y: 2)
            .scaleEffect(isSelected ? 1.03 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isSelected)
        }
        .buttonStyle(PlainButtonStyle())
    }

    private var gradientBackground: some View {
        LinearGradient(
            colors: cardGradient,
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// Note: Color(hex:) extension is defined in SettingsManager.swift
