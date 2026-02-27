import SwiftUI
import MeeshySDK

// MARK: - Sticker Picker View

public struct StickerPickerView: View {
    public var onStickerSelected: (String) -> Void

    @State private var selectedCategory: StickerCategory = .smileys
    @State private var searchText = ""

    public init(onStickerSelected: @escaping (String) -> Void) {
        self.onStickerSelected = onStickerSelected
    }

    private var filteredEmojis: [String] {
        guard !searchText.isEmpty else { return selectedCategory.emojis }
        let all = StickerCategory.allCases.flatMap(\.emojis)
        return all.filter { $0.unicodeScalars.contains { scalar in
            String(scalar).localizedCaseInsensitiveContains(searchText)
        }}
    }

    public var body: some View {
        VStack(spacing: 0) {
            categoryTabs
            emojiGrid
        }
        .background(Color.black.opacity(0.5))
        .cornerRadius(20, corners: [.topLeft, .topRight])
    }

    // MARK: - Category Tabs

    private var categoryTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(StickerCategory.allCases, id: \.self) { category in
                    Button {
                        withAnimation(.spring(response: 0.25)) { selectedCategory = category }
                        HapticFeedback.light()
                    } label: {
                        Text(category.icon)
                            .font(.system(size: 22))
                            .frame(width: 40, height: 36)
                            .background(
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(selectedCategory == category ? Color.white.opacity(0.2) : Color.clear)
                            )
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Emoji Grid

    private var emojiGrid: some View {
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 8) {
                ForEach(filteredEmojis, id: \.self) { emoji in
                    Button {
                        onStickerSelected(emoji)
                        HapticFeedback.medium()
                    } label: {
                        Text(emoji)
                            .font(.system(size: 30))
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Sticker \(emoji)")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .frame(maxHeight: 260)
    }
}

// MARK: - Sticker Category

public enum StickerCategory: String, CaseIterable {
    case smileys, animals, food, activities, travel, objects, symbols, flags

    public var icon: String {
        switch self {
        case .smileys: return "\u{1F600}"
        case .animals: return "\u{1F43E}"
        case .food: return "\u{1F354}"
        case .activities: return "\u{26BD}"
        case .travel: return "\u{2708}\u{FE0F}"
        case .objects: return "\u{1F4A1}"
        case .symbols: return "\u{2764}\u{FE0F}"
        case .flags: return "\u{1F3F3}\u{FE0F}"
        }
    }

    public var emojis: [String] {
        switch self {
        case .smileys:
            return ["\u{1F600}", "\u{1F602}", "\u{1F60D}", "\u{1F60E}", "\u{1F61C}", "\u{1F60A}", "\u{1F609}",
                    "\u{1F622}", "\u{1F621}", "\u{1F633}", "\u{1F914}", "\u{1F92F}", "\u{1F970}", "\u{1F973}",
                    "\u{1F60B}", "\u{1F92D}", "\u{1F971}", "\u{1F976}", "\u{1F975}", "\u{1F47B}", "\u{1F4A9}"]
        case .animals:
            return ["\u{1F436}", "\u{1F431}", "\u{1F43B}", "\u{1F98A}", "\u{1F981}", "\u{1F42F}", "\u{1F984}",
                    "\u{1F40D}", "\u{1F41D}", "\u{1F98B}", "\u{1F427}", "\u{1F989}", "\u{1F99C}", "\u{1F433}"]
        case .food:
            return ["\u{1F355}", "\u{1F354}", "\u{1F32E}", "\u{1F363}", "\u{1F370}", "\u{1F369}", "\u{1F366}",
                    "\u{2615}", "\u{1F377}", "\u{1F37A}", "\u{1F353}", "\u{1F34E}", "\u{1F34C}", "\u{1F951}"]
        case .activities:
            return ["\u{26BD}", "\u{1F3C0}", "\u{1F3C8}", "\u{26BE}", "\u{1F3BE}", "\u{1F3B1}", "\u{1F3AE}",
                    "\u{1F3B5}", "\u{1F3B8}", "\u{1F3A4}", "\u{1F3AC}", "\u{1F3A8}", "\u{1F3AD}", "\u{1F3AA}"]
        case .travel:
            return ["\u{2708}\u{FE0F}", "\u{1F680}", "\u{1F3D6}\u{FE0F}", "\u{1F3D4}\u{FE0F}", "\u{1F30D}", "\u{1F5FC}", "\u{1F3E0}",
                    "\u{1F697}", "\u{1F6B2}", "\u{1F6F3}\u{FE0F}", "\u{26F2}", "\u{1F3A2}", "\u{26FA}", "\u{1F30C}"]
        case .objects:
            return ["\u{1F4A1}", "\u{1F4F7}", "\u{1F4F1}", "\u{1F4BB}", "\u{2328}\u{FE0F}", "\u{1F3A7}", "\u{1F50D}",
                    "\u{1F4DA}", "\u{270F}\u{FE0F}", "\u{1F4E6}", "\u{1F513}", "\u{2699}\u{FE0F}", "\u{1F4CE}", "\u{2702}\u{FE0F}"]
        case .symbols:
            return ["\u{2764}\u{FE0F}", "\u{1F525}", "\u{2B50}", "\u{1F4AF}", "\u{26A1}", "\u{1F31F}", "\u{1F4A5}",
                    "\u{2728}", "\u{1F308}", "\u{1F389}", "\u{1F388}", "\u{1F381}", "\u{1F3C6}", "\u{1F48E}"]
        case .flags:
            return ["\u{1F1EB}\u{1F1F7}", "\u{1F1FA}\u{1F1F8}", "\u{1F1EC}\u{1F1E7}", "\u{1F1EA}\u{1F1F8}", "\u{1F1E9}\u{1F1EA}", "\u{1F1EE}\u{1F1F9}", "\u{1F1EF}\u{1F1F5}",
                    "\u{1F1E7}\u{1F1F7}", "\u{1F1E8}\u{1F1E6}", "\u{1F1E6}\u{1F1FA}", "\u{1F1F0}\u{1F1F7}", "\u{1F1F2}\u{1F1FD}", "\u{1F1EE}\u{1F1F3}", "\u{1F1F7}\u{1F1FA}"]
        }
    }
}
