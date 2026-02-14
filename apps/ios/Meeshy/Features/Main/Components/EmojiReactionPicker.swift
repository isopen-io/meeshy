import SwiftUI

// ============================================================================
// MARK: - Emoji Data
// ============================================================================

struct EmojiCategory: Identifiable {
    var id: String { name }
    let name: String
    let icon: String
    let emojis: [String]

    /// First category = most used reaction emojis (ordered by global frequency)
    static let all: [EmojiCategory] = [
        EmojiCategory(name: "Réactions", icon: "🔥", emojis: [
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

// ============================================================================
// MARK: - EmojiReactionPicker (reusable)
// ============================================================================

/// Reusable emoji reaction picker.
///
/// **Quick mode**: horizontal strip with frequent emojis + (+) button.
/// **Full mode**: bottom sheet, full width, draggable to expand/collapse.
///
/// Works for stories, messages, posts, conversations.
struct EmojiReactionPicker: View {

    // MARK: - Configuration

    var quickEmojis: [String] = ["❤️", "😂", "😮", "🔥", "😢", "👏"]

    enum Style { case dark, light }
    var style: Style = .dark

    // MARK: - Callbacks

    var onReact: ((String) -> Void)? = nil
    var onDismiss: (() -> Void)? = nil
    var onExpandFullPicker: (() -> Void)? = nil

    // MARK: - State

    @State private var reactedEmoji: String?

    var body: some View {
        quickEmojiStrip
    }

    // ========================================================================
    // MARK: - Quick Strip (inline, horizontal)
    // ========================================================================

    private var quickEmojiStrip: some View {
        HStack(spacing: 6) {
            ForEach(quickEmojis, id: \.self) { emoji in
                Button {
                    reactToEmoji(emoji)
                } label: {
                    Text(emoji)
                        .font(.system(size: reactedEmoji == emoji ? 28 : 22))
                        .scaleEffect(reactedEmoji == emoji ? 1.3 : 1.0)
                        .animation(.spring(response: 0.25, dampingFraction: 0.5), value: reactedEmoji)
                }
            }

            // (+) button → opens full sheet via callback
            Button {
                HapticFeedback.light()
                onExpandFullPicker?()
            } label: {
                ZStack {
                    Circle()
                        .fill(style == .dark ? Color.white.opacity(0.15) : Color.gray.opacity(0.15))
                        .frame(width: 32, height: 32)
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(style == .dark ? .white.opacity(0.8) : .gray)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(stripBackground)
    }

    private var stripBackground: some View {
        Group {
            if style == .dark {
                Capsule()
                    .fill(.ultraThinMaterial)
                    .overlay(Capsule().fill(Color.black.opacity(0.2)))
                    .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 0.5))
                    .shadow(color: .black.opacity(0.3), radius: 12, y: 4)
            } else {
                Capsule()
                    .fill(.regularMaterial)
                    .overlay(Capsule().stroke(Color.gray.opacity(0.15), lineWidth: 0.5))
                    .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
            }
        }
    }

    private func reactToEmoji(_ emoji: String) {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
            reactedEmoji = emoji
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation { reactedEmoji = nil }
        }
        onReact?(emoji)
    }
}

// ============================================================================
// MARK: - EmojiFullPickerSheet (bottom sheet, full width, expandable)
// ============================================================================

/// Full-screen emoji picker that slides from the bottom.
/// Can be expanded by dragging up, collapsed by dragging down.
/// Use as an overlay on the parent view.
struct EmojiFullPickerSheet: View {

    enum Style { case dark, light }
    var style: Style = .dark

    var onReact: ((String) -> Void)? = nil
    var onDismiss: (() -> Void)? = nil

    @State private var selectedCategory = 0
    @State private var reactedEmoji: String?
    @State private var sheetHeight: CGFloat = 340
    @State private var dragOffset: CGFloat = 0

    private let minHeight: CGFloat = 340
    private let maxHeight: CGFloat = UIScreen.main.bounds.height * 0.85

    private var currentHeight: CGFloat {
        min(max(sheetHeight - dragOffset, minHeight), maxHeight)
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                // Dimmed background — tap to dismiss
                Color.black.opacity(0.4)
                    .ignoresSafeArea()
                    .onTapGesture { dismiss() }

                // Sheet content
                VStack(spacing: 0) {
                    // Drag handle
                    dragHandle

                    // Category tabs
                    categoryTabs

                    // Emoji grid
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

    // MARK: - Drag Handle

    private var dragHandle: some View {
        VStack(spacing: 8) {
            Capsule()
                .fill(style == .dark ? Color.white.opacity(0.3) : Color.gray.opacity(0.3))
                .frame(width: 36, height: 4)
                .padding(.top, 10)

            // Title
            Text("Réactions")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(style == .dark ? .white.opacity(0.8) : .primary)
                .padding(.bottom, 4)
        }
    }

    // MARK: - Category Tabs

    private var categoryTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 2) {
                ForEach(Array(EmojiCategory.all.enumerated()), id: \.element.id) { index, category in
                    Button {
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                            selectedCategory = index
                        }
                    } label: {
                        VStack(spacing: 2) {
                            Text(category.icon)
                                .font(.system(size: 20))
                            Text(category.name)
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(
                                    selectedCategory == index
                                    ? (style == .dark ? .white : Color(hex: "08D9D6"))
                                    : (style == .dark ? .white.opacity(0.5) : .gray)
                                )
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(
                                    selectedCategory == index
                                    ? (style == .dark ? Color.white.opacity(0.15) : Color(hex: "08D9D6").opacity(0.12))
                                    : Color.clear
                                )
                        )
                    }
                }
            }
            .padding(.horizontal, 12)
        }
        .padding(.bottom, 6)
    }

    // MARK: - Emoji Grid

    private var emojiGrid: some View {
        let category = EmojiCategory.all[selectedCategory]

        return ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 8), spacing: 10) {
                ForEach(category.emojis, id: \.self) { emoji in
                    Button {
                        selectEmoji(emoji)
                    } label: {
                        Text(emoji)
                            .font(.system(size: 30))
                            .frame(maxWidth: .infinity)
                            .scaleEffect(reactedEmoji == emoji ? 1.35 : 1.0)
                            .animation(.spring(response: 0.2, dampingFraction: 0.5), value: reactedEmoji)
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Sheet Background

    private var sheetBackground: some View {
        Group {
            if style == .dark {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .fill(Color.black.opacity(0.45))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color.white.opacity(0.1), lineWidth: 0.5)
                    )
            } else {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(.regularMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color.gray.opacity(0.1), lineWidth: 0.5)
                    )
                    .shadow(color: .black.opacity(0.15), radius: 20, y: -5)
            }
        }
    }

    // MARK: - Drag Gesture

    private var sheetDragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                dragOffset = value.translation.height
            }
            .onEnded { value in
                let dy = value.translation.height
                let velocity = value.predictedEndTranslation.height

                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    if dy > 100 || velocity > 300 {
                        // Swipe down → collapse or dismiss
                        if sheetHeight > minHeight + 50 {
                            sheetHeight = minHeight
                        } else {
                            dismiss()
                            return
                        }
                    } else if dy < -80 || velocity < -300 {
                        // Swipe up → expand
                        sheetHeight = maxHeight
                    }
                    dragOffset = 0
                }
            }
    }

    // MARK: - Logic

    private func selectEmoji(_ emoji: String) {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
            reactedEmoji = emoji
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation { reactedEmoji = nil }
        }
        onReact?(emoji)
    }

    private func dismiss() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            dragOffset = maxHeight
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            onDismiss?()
        }
    }
}

// ============================================================================
// MARK: - EmojiKeyboardPanel (inline keyboard replacement)
// ============================================================================

/// Inline emoji panel that replaces the system keyboard.
/// Sits below the composer bar, same height as the keyboard.
/// Used for inserting emojis into text (NOT for sending reactions).
struct EmojiKeyboardPanel: View {

    enum Style { case dark, light }
    var style: Style = .dark

    var onSelect: ((String) -> Void)? = nil

    @State private var selectedCategory = 0
    @State private var tappedEmoji: String?

    var body: some View {
        VStack(spacing: 0) {
            // Top separator
            Rectangle()
                .fill(style == .dark ? Color.white.opacity(0.1) : Color.gray.opacity(0.15))
                .frame(height: 0.5)

            // Category tabs
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 2) {
                    ForEach(Array(EmojiCategory.all.enumerated()), id: \.element.id) { index, category in
                        Button {
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                                selectedCategory = index
                            }
                        } label: {
                            VStack(spacing: 2) {
                                Text(category.icon)
                                    .font(.system(size: 20))
                                Text(category.name)
                                    .font(.system(size: 9, weight: .medium))
                                    .foregroundColor(
                                        selectedCategory == index
                                        ? (style == .dark ? .white : Color(hex: "08D9D6"))
                                        : (style == .dark ? .white.opacity(0.4) : .gray)
                                    )
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(
                                        selectedCategory == index
                                        ? (style == .dark ? Color.white.opacity(0.15) : Color(hex: "08D9D6").opacity(0.12))
                                        : Color.clear
                                    )
                            )
                        }
                    }
                }
                .padding(.horizontal, 12)
            }
            .padding(.vertical, 6)

            // Emoji grid
            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 8), spacing: 8) {
                    ForEach(EmojiCategory.all[selectedCategory].emojis, id: \.self) { emoji in
                        Button {
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.2, dampingFraction: 0.5)) {
                                tappedEmoji = emoji
                            }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                                withAnimation { tappedEmoji = nil }
                            }
                            onSelect?(emoji)
                        } label: {
                            Text(emoji)
                                .font(.system(size: 28))
                                .frame(maxWidth: .infinity)
                                .scaleEffect(tappedEmoji == emoji ? 1.3 : 1.0)
                                .animation(.spring(response: 0.2, dampingFraction: 0.5), value: tappedEmoji)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
            }
        }
        .background(panelBackground)
    }

    private var panelBackground: some View {
        Group {
            if style == .dark {
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .overlay(Rectangle().fill(Color.black.opacity(0.5)))
            } else {
                Rectangle()
                    .fill(.regularMaterial)
            }
        }
    }
}
