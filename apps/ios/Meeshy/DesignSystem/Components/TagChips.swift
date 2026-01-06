//
//  TagChips.swift
//  Meeshy
//
//  Shared tag and category chip components
//  Used in conversation list and conversation header
//

import SwiftUI

// MARK: - Tag Color Palette

/// A palette of 50+ distinct colors for tags
private let tagColorPalette: [Color] = {
    var colors: [Color] = []

    // Generate 50 colors using HSB color space for good distribution
    // Using different hues with varying saturation and brightness
    let hueSteps = 25
    for i in 0..<hueSteps {
        let hue = Double(i) / Double(hueSteps)
        // Saturated version
        colors.append(Color(hue: hue, saturation: 0.7, brightness: 0.85))
        // Slightly different saturation/brightness for variety
        colors.append(Color(hue: hue, saturation: 0.6, brightness: 0.75))
    }

    return colors
}()

// MARK: - Colored Tag Chip

/// A colored tag chip with consistent color based on tag name
struct ColoredTagChip: View {
    let tag: String
    var size: TagChipSize = .small

    // Generate consistent color from tag string using 50+ color palette
    private var tagColor: Color {
        let hash = abs(tag.hashValue)
        return tagColorPalette[hash % tagColorPalette.count]
    }

    var body: some View {
        Text(tag)
            .font(.system(size: size.fontSize, weight: .medium))
            .foregroundColor(.white)
            .padding(.horizontal, size.horizontalPadding)
            .padding(.vertical, size.verticalPadding)
            .background(Capsule().fill(tagColor))
    }
}

// MARK: - Category Chip

/// A gray category chip with optional icon
struct CategoryChip: View {
    let name: String
    let icon: String?
    var size: TagChipSize = .medium

    init(category: ConversationCategory, size: TagChipSize = .medium) {
        self.name = category.name
        self.icon = category.icon
        self.size = size
    }

    init(name: String, icon: String? = nil, size: TagChipSize = .medium) {
        self.name = name
        self.icon = icon
        self.size = size
    }

    var body: some View {
        HStack(spacing: 4) {
            if let icon = icon {
                Image(systemName: icon)
                    .font(.system(size: size.iconSize))
            }
            Text(name)
                .font(.system(size: size.fontSize, weight: .medium))
        }
        .foregroundColor(.secondary)
        .padding(.horizontal, size.horizontalPadding)
        .padding(.vertical, size.verticalPadding)
        .background(Capsule().fill(Color(.systemGray5)))
    }
}

// MARK: - Tag Chip Size

enum TagChipSize {
    case small      // For conversation list rows
    case medium     // For conversation header
    case large      // For detail views

    var fontSize: CGFloat {
        switch self {
        case .small: return 9
        case .medium: return 11
        case .large: return 13
        }
    }

    var iconSize: CGFloat {
        switch self {
        case .small: return 8
        case .medium: return 10
        case .large: return 12
        }
    }

    var horizontalPadding: CGFloat {
        switch self {
        case .small: return 5
        case .medium: return 10
        case .large: return 12
        }
    }

    var verticalPadding: CGFloat {
        switch self {
        case .small: return 2
        case .medium: return 5
        case .large: return 6
        }
    }
}

// MARK: - Scrollable Tag Tab (Emoji Picker Style)

/// A tag tab styled like emoji picker category tabs - for horizontal scrollable tag bars
struct ScrollableTagTab: View {
    let tag: String
    var isSelected: Bool = false
    var onTap: (() -> Void)?

    // Generate consistent color from tag string
    private var tagColor: Color {
        let hash = abs(tag.hashValue)
        return tagColorPalette[hash % tagColorPalette.count]
    }

    var body: some View {
        Button(action: {
            let impact = UIImpactFeedbackGenerator(style: .light)
            impact.impactOccurred()
            onTap?()
        }) {
            HStack(spacing: 3) {
                // Color indicator dot
                Circle()
                    .fill(tagColor)
                    .frame(width: 6, height: 6)

                Text(tag)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .foregroundColor(isSelected ? .white : .primary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isSelected ? tagColor : Color(.systemGray6))
            )
        }
        .buttonStyle(PlainButtonStyle())
        .fixedSize(horizontal: true, vertical: false)
    }
}

// MARK: - Scrollable Category Tab (Emoji Picker Style)

/// A category tab styled like emoji picker category tabs - for horizontal scrollable bars
struct ScrollableCategoryTab: View {
    let name: String
    let icon: String?
    var isSelected: Bool = false
    var onTap: (() -> Void)?

    init(category: ConversationCategory, isSelected: Bool = false, onTap: (() -> Void)? = nil) {
        self.name = category.name
        self.icon = category.icon
        self.isSelected = isSelected
        self.onTap = onTap
    }

    init(name: String, icon: String? = nil, isSelected: Bool = false, onTap: (() -> Void)? = nil) {
        self.name = name
        self.icon = icon
        self.isSelected = isSelected
        self.onTap = onTap
    }

    var body: some View {
        Button(action: {
            let impact = UIImpactFeedbackGenerator(style: .light)
            impact.impactOccurred()
            onTap?()
        }) {
            HStack(spacing: 3) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 10, weight: .medium))
                }
                Text(name)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .foregroundColor(isSelected ? .white : .secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isSelected ? Color.blue : Color(.systemGray6))
            )
        }
        .buttonStyle(PlainButtonStyle())
        .fixedSize(horizontal: true, vertical: false)
    }
}

// MARK: - Conversation Header Tags Bar

/// Horizontal scrollable tags bar for conversation header - styled like emoji picker tabs
struct ConversationHeaderTagsBar: View {
    let category: ConversationCategory?
    let tags: [String]
    var selectedTag: String?
    var onCategoryTap: (() -> Void)?
    var onTagTap: ((String) -> Void)?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                // Category tab (first position)
                if let category = category {
                    ScrollableCategoryTab(
                        category: category,
                        isSelected: false,
                        onTap: onCategoryTap
                    )
                }

                // Tag tabs
                ForEach(tags, id: \.self) { tag in
                    ScrollableTagTab(
                        tag: tag,
                        isSelected: selectedTag == tag,
                        onTap: { onTagTap?(tag) }
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
        .scrollDisabled(false)
        .fixedSize(horizontal: false, vertical: true)
        .background(Color(.systemGray6).opacity(0.5))
    }
}

// MARK: - Previews

#Preview("Colored Tags") {
    HStack {
        ColoredTagChip(tag: "Work", size: .small)
        ColoredTagChip(tag: "Family", size: .medium)
        ColoredTagChip(tag: "Friends", size: .large)
    }
    .padding()
}

#Preview("Category Chips") {
    HStack {
        CategoryChip(name: "Personnel", icon: "person.fill", size: .small)
        CategoryChip(name: "Travail", icon: "briefcase.fill", size: .medium)
        CategoryChip(name: "Famille", icon: "house.fill", size: .large)
    }
    .padding()
}

#Preview("Scrollable Tab Style") {
    VStack(spacing: 16) {
        // Individual tabs
        HStack(spacing: 6) {
            ScrollableCategoryTab(name: "Personnel", icon: "person.fill")
            ScrollableTagTab(tag: "Work")
            ScrollableTagTab(tag: "Important", isSelected: true)
            ScrollableTagTab(tag: "Family")
        }
        .padding()

        // Full header bar
        ConversationHeaderTagsBar(
            category: ConversationCategory(id: "1", name: "Travail", icon: "briefcase.fill"),
            tags: ["Urgent", "Projet A", "Budget", "Marketing", "RH"],
            selectedTag: "Projet A"
        )
    }
}
