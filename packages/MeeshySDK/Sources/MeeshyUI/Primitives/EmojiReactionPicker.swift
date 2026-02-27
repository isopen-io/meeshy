import SwiftUI

public struct EmojiCategory: Identifiable {
    public var id: String { name }
    public let name: String
    public let icon: String
    public let emojis: [String]

    public init(name: String, icon: String, emojis: [String]) {
        self.name = name; self.icon = icon; self.emojis = emojis
    }

    public static let all: [EmojiCategory] = [
        EmojiCategory(name: "Reactions", icon: "🔥", emojis: [
            "❤️", "😂", "🔥", "👏", "😮", "😢", "🥰", "😍",
            "💯", "🙏", "🤣", "😭", "✨", "🎉", "💪", "👍",
            "😊", "💕", "🤩", "😘", "❤️‍🔥", "🥺", "😎", "👀",
            "🫶", "💖", "😅", "🤔", "🥳", "💀", "😏", "🙌",
        ]),
        EmojiCategory(name: "Visages", icon: "😀", emojis: [
            "😀", "😃", "😄", "😁", "😆", "🥹", "😊", "😇",
            "🙂", "😉", "😌", "😍", "🥰", "😘", "😗", "😙",
            "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗",
            "🤭", "🫢", "🫣", "🤫", "🤔", "🫡", "🤐", "🤨",
            "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬",
            "😮‍💨", "🤥", "🫨", "😌", "😔", "😪", "🤤", "😴",
            "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴",
            "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐",
        ]),
        EmojiCategory(name: "Gestes", icon: "👋", emojis: [
            "👍", "👎", "👏", "🙌", "🫶", "🙏", "💪", "✊",
            "👊", "🤛", "🤜", "🤝", "👋", "🤚", "🖐️", "✋",
            "🖖", "🫱", "🫲", "🫳", "🫴", "👌", "🤌", "🤏",
            "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉",
            "👆", "🖕", "👇", "☝️", "🫵", "👐", "🤲", "🦾",
        ]),
        EmojiCategory(name: "Coeurs", icon: "❤️", emojis: [
            "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
            "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓",
            "💗", "💖", "💘", "💝", "💟", "♥️", "🫀", "💋",
        ]),
        EmojiCategory(name: "Animaux", icon: "🐶", emojis: [
            "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼",
            "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵",
            "🙈", "🙉", "🙊", "🐔", "🐧", "🐦", "🐤", "🦄",
            "🐝", "🦋", "🐌", "🐙", "🦑", "🐠", "🐡", "🐬",
        ]),
        EmojiCategory(name: "Objets", icon: "🎁", emojis: [
            "🎁", "🎈", "🎉", "🎊", "🎂", "🍰", "🥂", "🍾",
            "🏆", "🥇", "🎯", "🎮", "🎲", "🎭", "🎬", "🎤",
            "🎧", "🎵", "🎶", "🎸", "🥁", "🎺", "🎨", "🖌️",
            "📸", "📱", "💻", "⌚", "💡", "🔮", "💎", "🪄",
        ]),
    ]
}

public struct EmojiReactionPicker: View {
    public var quickEmojis: [String]
    public enum Style { case dark, light }
    public var style: Style
    /// Scale factor applied to all sizes (default 1.0). Use < 1.0 for compact contexts.
    public var scale: CGFloat
    public var onReact: ((String) -> Void)?
    public var onDismiss: (() -> Void)?
    /// When nil, the "+" expand button is hidden.
    public var onExpandFullPicker: (() -> Void)?

    @State private var reactedEmoji: String?

    public init(
        quickEmojis: [String] = ["❤️", "😂", "😮", "🔥", "😢", "👏"],
        style: Style = .dark,
        scale: CGFloat = 1.0,
        onReact: ((String) -> Void)? = nil,
        onDismiss: (() -> Void)? = nil,
        onExpandFullPicker: (() -> Void)? = nil
    ) {
        self.quickEmojis = quickEmojis; self.style = style; self.scale = scale
        self.onReact = onReact; self.onDismiss = onDismiss
        self.onExpandFullPicker = onExpandFullPicker
    }

    public var body: some View {
        quickEmojiStrip
    }

    private var quickEmojiStrip: some View {
        HStack(spacing: 6 * scale) {
            ForEach(quickEmojis, id: \.self) { emoji in
                Button {
                    reactToEmoji(emoji)
                } label: {
                    Text(emoji)
                        .font(.system(size: (reactedEmoji == emoji ? 28 : 22) * scale))
                        .scaleEffect(reactedEmoji == emoji ? 1.3 : 1.0)
                        .animation(.spring(response: 0.25, dampingFraction: 0.5), value: reactedEmoji)
                }
            }
            if let onExpandFullPicker {
                Button {
                    HapticFeedback.light()
                    onExpandFullPicker()
                } label: {
                    ZStack {
                        Circle()
                            .fill(style == .dark ? Color.white.opacity(0.15) : Color.gray.opacity(0.15))
                            .frame(width: 32 * scale, height: 32 * scale)
                        Image(systemName: "plus")
                            .font(.system(size: 14 * scale, weight: .bold))
                            .foregroundColor(style == .dark ? .white.opacity(0.8) : .gray)
                    }
                }
            }
        }
        .padding(.horizontal, 10 * scale)
        .padding(.vertical, 6 * scale)
        .background(stripBackground)
    }

    private var stripBackground: some View {
        Group {
            if style == .dark {
                Capsule().fill(.ultraThinMaterial)
                    .overlay(Capsule().fill(Color.black.opacity(0.2)))
                    .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 0.5))
                    .shadow(color: .black.opacity(0.3), radius: 12, y: 4)
            } else {
                Capsule().fill(.regularMaterial)
                    .overlay(Capsule().stroke(Color.gray.opacity(0.15), lineWidth: 0.5))
                    .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
            }
        }
    }

    private func reactToEmoji(_ emoji: String) {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) { reactedEmoji = emoji }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation { reactedEmoji = nil }
        }
        onReact?(emoji)
    }
}

public struct EmojiFullPickerSheet: View {
    public enum Style { case dark, light }
    public var style: Style
    public var onReact: ((String) -> Void)?
    public var onDismiss: (() -> Void)?

    @State private var selectedCategory = 0
    @State private var reactedEmoji: String?
    @State private var sheetHeight: CGFloat = 340
    @State private var dragOffset: CGFloat = 0

    private let minHeight: CGFloat = 340
    private let maxHeight: CGFloat = UIScreen.main.bounds.height * 0.85

    public init(style: Style = .dark, onReact: ((String) -> Void)? = nil, onDismiss: (() -> Void)? = nil) {
        self.style = style; self.onReact = onReact; self.onDismiss = onDismiss
    }

    private var currentHeight: CGFloat {
        min(max(sheetHeight - dragOffset, minHeight), maxHeight)
    }

    public var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                Color.black.opacity(0.4).ignoresSafeArea().onTapGesture { dismiss() }
                VStack(spacing: 0) {
                    dragHandle
                    categoryTabs
                    emojiGrid
                }
                .frame(height: currentHeight)
                .frame(maxWidth: .infinity)
                .background(sheetBackground)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .gesture(sheetDragGesture)
                .transition(.move(edge: .bottom))
            }
        }
        .ignoresSafeArea()
    }

    private var dragHandle: some View {
        VStack(spacing: 8) {
            Capsule()
                .fill(style == .dark ? Color.white.opacity(0.3) : Color.gray.opacity(0.3))
                .frame(width: 36, height: 4).padding(.top, 10)
            Text("Reactions")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(style == .dark ? .white.opacity(0.8) : .primary)
                .padding(.bottom, 4)
        }
    }

    private var categoryTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 2) {
                ForEach(Array(EmojiCategory.all.enumerated()), id: \.element.id) { index, category in
                    Button {
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) { selectedCategory = index }
                    } label: {
                        VStack(spacing: 2) {
                            Text(category.icon).font(.system(size: 20))
                            Text(category.name)
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(selectedCategory == index
                                    ? (style == .dark ? .white : Color(hex: "08D9D6"))
                                    : (style == .dark ? .white.opacity(0.5) : .gray))
                        }
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(selectedCategory == index
                                    ? (style == .dark ? Color.white.opacity(0.15) : Color(hex: "08D9D6").opacity(0.12))
                                    : Color.clear)
                        )
                    }
                }
            }.padding(.horizontal, 12)
        }.padding(.bottom, 6)
    }

    private var emojiGrid: some View {
        let category = EmojiCategory.all[selectedCategory]
        return ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 8), spacing: 10) {
                ForEach(category.emojis, id: \.self) { emoji in
                    Button { selectEmoji(emoji) } label: {
                        Text(emoji).font(.system(size: 30)).frame(maxWidth: .infinity)
                            .scaleEffect(reactedEmoji == emoji ? 1.35 : 1.0)
                            .animation(.spring(response: 0.2, dampingFraction: 0.5), value: reactedEmoji)
                    }
                }
            }.padding(.horizontal, 10).padding(.vertical, 8)
        }
    }

    private var sheetBackground: some View {
        Group {
            if style == .dark {
                RoundedRectangle(cornerRadius: 24, style: .continuous).fill(.ultraThinMaterial)
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color.black.opacity(0.45)))
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 0.5))
            } else {
                RoundedRectangle(cornerRadius: 24, style: .continuous).fill(.regularMaterial)
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.gray.opacity(0.1), lineWidth: 0.5))
                    .shadow(color: .black.opacity(0.15), radius: 20, y: -5)
            }
        }
    }

    private var sheetDragGesture: some Gesture {
        DragGesture()
            .onChanged { value in dragOffset = value.translation.height }
            .onEnded { value in
                let dy = value.translation.height
                let velocity = value.predictedEndTranslation.height
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    if dy > 100 || velocity > 300 {
                        if sheetHeight > minHeight + 50 { sheetHeight = minHeight }
                        else { dismiss(); return }
                    } else if dy < -80 || velocity < -300 { sheetHeight = maxHeight }
                    dragOffset = 0
                }
            }
    }

    private func selectEmoji(_ emoji: String) {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) { reactedEmoji = emoji }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { withAnimation { reactedEmoji = nil } }
        onReact?(emoji)
    }

    private func dismiss() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { dragOffset = maxHeight }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { onDismiss?() }
    }
}

public struct EmojiKeyboardPanel: View {
    public enum Style { case dark, light }
    public var style: Style
    public var onSelect: ((String) -> Void)?

    @State private var selectedCategory = 0
    @State private var tappedEmoji: String?

    public init(style: Style = .dark, onSelect: ((String) -> Void)? = nil) {
        self.style = style; self.onSelect = onSelect
    }

    public var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(style == .dark ? Color.white.opacity(0.1) : Color.gray.opacity(0.15)).frame(height: 0.5)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 2) {
                    ForEach(Array(EmojiCategory.all.enumerated()), id: \.element.id) { index, category in
                        Button {
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) { selectedCategory = index }
                        } label: {
                            VStack(spacing: 2) {
                                Text(category.icon).font(.system(size: 20))
                                Text(category.name)
                                    .font(.system(size: 9, weight: .medium))
                                    .foregroundColor(selectedCategory == index
                                        ? (style == .dark ? .white : Color(hex: "08D9D6"))
                                        : (style == .dark ? .white.opacity(0.4) : .gray))
                            }
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(selectedCategory == index
                                        ? (style == .dark ? Color.white.opacity(0.15) : Color(hex: "08D9D6").opacity(0.12))
                                        : Color.clear)
                            )
                        }
                    }
                }.padding(.horizontal, 12)
            }.padding(.vertical, 6)
            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 8), spacing: 8) {
                    ForEach(EmojiCategory.all[selectedCategory].emojis, id: \.self) { emoji in
                        Button {
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.2, dampingFraction: 0.5)) { tappedEmoji = emoji }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { withAnimation { tappedEmoji = nil } }
                            onSelect?(emoji)
                        } label: {
                            Text(emoji).font(.system(size: 28)).frame(maxWidth: .infinity)
                                .scaleEffect(tappedEmoji == emoji ? 1.3 : 1.0)
                                .animation(.spring(response: 0.2, dampingFraction: 0.5), value: tappedEmoji)
                        }
                    }
                }.padding(.horizontal, 10).padding(.vertical, 4)
            }
        }
        .background(Group {
            if style == .dark {
                Rectangle().fill(.ultraThinMaterial).overlay(Rectangle().fill(Color.black.opacity(0.5)))
            } else {
                Rectangle().fill(.regularMaterial)
            }
        })
    }
}
