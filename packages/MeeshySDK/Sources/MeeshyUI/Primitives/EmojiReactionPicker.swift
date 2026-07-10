import SwiftUI

public struct EmojiCategory: Identifiable, Sendable {
    public var id: String { name }
    public let name: String
    public let icon: String
    public let emojis: [String]

    public init(name: String, icon: String, emojis: [String]) {
        self.name = name; self.icon = icon; self.emojis = emojis
    }

    public static let all: [EmojiCategory] = [
        EmojiCategory(name: String(localized: "emoji.category.reactions", defaultValue: "Reactions", bundle: .module), icon: "🔥", emojis: [
            "❤️", "😂", "🔥", "👏", "😮", "😢", "🥰", "😍",
            "💯", "🙏", "🤣", "😭", "✨", "🎉", "💪", "👍",
            "😊", "💕", "🤩", "😘", "❤️‍🔥", "🥺", "😎", "👀",
            "🫶", "💖", "😅", "🤔", "🥳", "💀", "😏", "🙌",
        ]),
        EmojiCategory(name: String(localized: "emoji.category.faces", defaultValue: "Visages", bundle: .module), icon: "😀", emojis: [
            "😀", "😃", "😄", "😁", "😆", "🥹", "😊", "😇",
            "🙂", "😉", "😌", "😍", "🥰", "😘", "😗", "😙",
            "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗",
            "🤭", "🫢", "🫣", "🤫", "🤔", "🫡", "🤐", "🤨",
            "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬",
            "😮‍💨", "🤥", "🫨", "😌", "😔", "😪", "🤤", "😴",
            "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴",
            "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐",
        ]),
        EmojiCategory(name: String(localized: "emoji.category.gestures", defaultValue: "Gestes", bundle: .module), icon: "👋", emojis: [
            "👍", "👎", "👏", "🙌", "🫶", "🙏", "💪", "✊",
            "👊", "🤛", "🤜", "🤝", "👋", "🤚", "🖐️", "✋",
            "🖖", "🫱", "🫲", "🫳", "🫴", "👌", "🤌", "🤏",
            "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉",
            "👆", "🖕", "👇", "☝️", "🫵", "👐", "🤲", "🦾",
        ]),
        EmojiCategory(name: String(localized: "emoji.category.hearts", defaultValue: "Coeurs", bundle: .module), icon: "❤️", emojis: [
            "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
            "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓",
            "💗", "💖", "💘", "💝", "💟", "♥️", "🫀", "💋",
        ]),
        EmojiCategory(name: String(localized: "emoji.category.animals", defaultValue: "Animaux", bundle: .module), icon: "🐶", emojis: [
            "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼",
            "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵",
            "🙈", "🙉", "🙊", "🐔", "🐧", "🐦", "🐤", "🦄",
            "🐝", "🦋", "🐌", "🐙", "🦑", "🐠", "🐡", "🐬",
        ]),
        EmojiCategory(name: String(localized: "emoji.category.objects", defaultValue: "Objets", bundle: .module), icon: "🎁", emojis: [
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
    /// When true, the emoji strip is wrapped in a horizontal ScrollView so callers can
    /// pass more emojis than fit on-screen and let the user swipe to access the rest.
    /// The capsule background is rendered around the visible viewport so the strip
    /// keeps its anchored "pill" look even with overflow content.
    public var scrollable: Bool
    public var onReact: ((String) -> Void)?
    public var onDismiss: (() -> Void)?
    /// When nil, the "+" expand button is hidden.
    public var onExpandFullPicker: (() -> Void)?

    @State private var reactedEmoji: String?
    /// Pilote l'entree en vague sinusoidale des tuiles : `false` au montage,
    /// passe a `true` dans `onAppear` ce qui declenche, tuile par tuile et
    /// avec un decalage croissant, la montee de chaque emoji.
    @State private var hasEntered = false

    public init(
        quickEmojis: [String] = ["❤️", "😂", "😮", "🔥", "😢", "👏"],
        style: Style = .dark,
        scale: CGFloat = 1.0,
        scrollable: Bool = false,
        onReact: ((String) -> Void)? = nil,
        onDismiss: (() -> Void)? = nil,
        onExpandFullPicker: (() -> Void)? = nil
    ) {
        self.quickEmojis = quickEmojis; self.style = style; self.scale = scale
        self.scrollable = scrollable
        self.onReact = onReact; self.onDismiss = onDismiss
        self.onExpandFullPicker = onExpandFullPicker
    }

    public var body: some View {
        Group {
            if scrollable {
                scrollableQuickEmojiStrip
            } else {
                quickEmojiStrip
            }
        }
        // Declenche l'entree en vague une seule fois, a l'ouverture de la
        // barre de quick-reaction. Chaque tuile lit `hasEntered` + son index
        // pour calculer son propre delai (cf. `WaveTileModifier`).
        .onAppear {
            guard !hasEntered else { return }
            hasEntered = true
        }
    }

    private var emojiList: some View {
        HStack(spacing: 6 * scale) {
            ForEach(Array(quickEmojis.enumerated()), id: \.element) { index, emoji in
                Button {
                    reactToEmoji(emoji)
                } label: {
                    Text(emoji)
                        .font(.system(size: (reactedEmoji == emoji ? 28 : 22) * scale))
                        .scaleEffect(reactedEmoji == emoji ? 1.3 : 1.0)
                        .animation(.spring(response: 0.25, dampingFraction: 0.5), value: reactedEmoji)
                }
                // Entree en vague sinusoidale : la tuile `index` apparait
                // apres celles a sa gauche, en suivant une courbe d'ease
                // ondulante (cf. `WaveTileModifier`).
                .modifier(WaveTileModifier(index: index, hasEntered: hasEntered))
            }
        }
    }

    @ViewBuilder
    private var expandButton: some View {
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
            // La tuile "+" cloture la vague — son index est place juste
            // apres le dernier emoji pour qu'elle arrive en derniere.
            .modifier(WaveTileModifier(index: quickEmojis.count, hasEntered: hasEntered))
        }
    }

    private var quickEmojiStrip: some View {
        HStack(spacing: 6 * scale) {
            emojiList
            expandButton
        }
        .padding(.horizontal, 10 * scale)
        .padding(.vertical, 6 * scale)
        .modifier(QuickReactionStripChrome(style: style))
    }

    private var scrollableQuickEmojiStrip: some View {
        // Layout : emojis dans un ScrollView horizontal qui occupe toute
        // la place restante, bouton "+" fige a droite hors du ScrollView
        // pour qu'il reste accessible meme apres avoir scrolle. Un fade
        // mask sur le bord droit du ScrollView indique visuellement qu'il
        // y a plus de contenu apres.
        HStack(spacing: 6 * scale) {
            ScrollView(.horizontal, showsIndicators: false) {
                emojiList
                    .padding(.vertical, 6 * scale)
                    .padding(.leading, 10 * scale)
                    .padding(.trailing, 4 * scale)
            }
            .mask(
                LinearGradient(
                    stops: [
                        .init(color: .black, location: 0),
                        .init(color: .black, location: 0.92),
                        .init(color: .black.opacity(0.0), location: 1.0)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )

            expandButton
                .padding(.trailing, 10 * scale)
        }
        .modifier(QuickReactionStripChrome(style: style))
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

// MARK: - Quick-reaction capsule chrome (Liquid Glass on iOS 26)

/// Floating chrome of the quick-reaction capsule (the pill behind the emoji
/// strip). On iOS 26 it renders real Liquid Glass via the shared `adaptiveGlass`
/// atom — the capsule samples whatever sits behind it (the message list, the
/// long-press scrim, a full-screen story), so it adapts to any backdrop without
/// the manual dark veil. Pre-iOS-26 keeps the exact style-driven material so the
/// forced-`.dark` contexts (e.g. the story sidebar in a light-mode system) stay
/// dark. The elevation shadow lives outside the glass — a floating-overlay cue,
/// as on `ContextActionMenu` / `FloatingCallPillView` (no-shadow flatten rule
/// excepted for floating chrome).
private struct QuickReactionStripChrome: ViewModifier {
    let style: EmojiReactionPicker.Style

    // Choix de STYLE runtime (glass vs chrome legacy piloté par `style`), pas
    // un déblocage d'API : le vrai `if #available` vit dans `adaptiveGlass`
    // (Compatibility/) — ici le flag `Platform` suffit et garde le gate
    // version unique au layer Compatibility, conformément à sa doc.
    @ViewBuilder
    func body(content: Content) -> some View {
        if Platform.isIOS26OrLater {
            content
                .adaptiveGlass(in: Capsule())
                .shadow(
                    color: .black.opacity(style == .dark ? 0.3 : 0.08),
                    radius: style == .dark ? 12 : 8,
                    y: style == .dark ? 4 : 2
                )
        } else {
            content.background(legacyBackground)
        }
    }

    @ViewBuilder
    private var legacyBackground: some View {
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

// MARK: - Sinusoidal wave entrance

/// Entree en vague sinusoidale d'une tuile d'emoji de la quick-reaction bar.
///
/// Quand la barre s'ouvre, `hasEntered` passe a `true` ; chaque tuile joue
/// alors son animation d'entree avec un delai proportionnel a son `index`
/// (~0.045s/tuile) — d'ou l'apparition en cascade gauche -> droite. La courbe
/// d'entree combine fade + montee verticale (la tuile arrive depuis le bas),
/// l'easing `.spring` rebondissant donnant l'ondulation "wave-like" propre a
/// chaque tuile au moment de se poser.
private struct WaveTileModifier: ViewModifier {
    let index: Int
    let hasEntered: Bool

    /// `t` va de 0 (tuile cachee, sous la ligne) a 1 (tuile posee).
    @State private var t: CGFloat = 0

    /// Delai d'entree : decalage croissant => effet de cascade sinusoidale.
    private var staggerDelay: Double { Double(index) * 0.045 }

    // La tuile arrive depuis ~16pt sous sa position finale.
    private var riseOffset: CGFloat { 16 * (1 - t) }

    // Demarre legerement reduite pour un "pop" a l'arrivee.
    private var entranceScale: CGFloat { 0.55 + 0.45 * t }

    func body(content: Content) -> some View {
        content
            .opacity(Double(t))
            .scaleEffect(entranceScale)
            .offset(y: riseOffset)
            .adaptiveOnChange(of: hasEntered) { _, entered in
                guard entered else { return }
                animateIn()
            }
            .onAppear {
                // Cas ou `hasEntered` est deja vrai au montage de la tuile
                // (recomposition) : on joue quand meme l'entree.
                guard hasEntered, t == 0 else { return }
                animateIn()
            }
    }

    private func animateIn() {
        // Ressort rebondissant declenche apres le delai de cascade : le
        // rebond de la tuile, decale d'une tuile a l'autre, dessine la
        // vague sinusoidale qui parcourt la barre de gauche a droite.
        withAnimation(
            .spring(response: 0.42, dampingFraction: 0.62)
                .delay(staggerDelay)
        ) {
            t = 1
        }
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
    /// Dernière hauteur du conteneur lue dans le `GeometryReader` du body.
    /// Captée ici parce que `sheetDragGesture` et `dismiss()` tournent en
    /// dehors du scope du `GeometryReader` (computed properties) et ont
    /// besoin de `maxHeight(for: containerHeight)` pour borner `sheetHeight`
    /// / `dragOffset` proprement sur iPhone comme iPad.
    @State private var containerHeight: CGFloat = 340

    private let minHeight: CGFloat = 340

    public init(style: Style = .dark, onReact: ((String) -> Void)? = nil, onDismiss: (() -> Void)? = nil) {
        self.style = style; self.onReact = onReact; self.onDismiss = onDismiss
    }

    private func maxHeight(for containerHeight: CGFloat) -> CGFloat {
        // On large screens (iPad) cap the picker to avoid towering above
        // the message it reacts to.
        min(containerHeight * 0.85, 620)
    }

    private func currentHeight(for containerHeight: CGFloat) -> CGFloat {
        min(max(sheetHeight - dragOffset, minHeight), maxHeight(for: containerHeight))
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
                .frame(height: currentHeight(for: geo.size.height))
                .frame(maxWidth: min(geo.size.width, 560))
                .background(sheetBackground)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .gesture(sheetDragGesture)
                .transition(.move(edge: .bottom))
            }
            .frame(maxWidth: .infinity)
            .onAppear { containerHeight = geo.size.height }
            .adaptiveOnChange(of: geo.size.height) { _, newValue in
                containerHeight = newValue
            }
        }
        .ignoresSafeArea()
    }

    private var dragHandle: some View {
        VStack(spacing: 8) {
            Capsule()
                .fill(style == .dark ? Color.white.opacity(0.3) : Color.gray.opacity(0.3))
                .frame(width: 36, height: 4).padding(.top, 10)
            Text(String(localized: "emoji.picker.title", defaultValue: "Reactions", bundle: .module))
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
                                    ? (style == .dark ? .white : MeeshyColors.brandPrimary)
                                    : (style == .dark ? .white.opacity(0.5) : .gray))
                        }
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(selectedCategory == index
                                    ? (style == .dark ? Color.white.opacity(0.15) : MeeshyColors.brandPrimary.opacity(0.12))
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
                    } else if dy < -80 || velocity < -300 { sheetHeight = maxHeight(for: containerHeight) }
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
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { dragOffset = maxHeight(for: containerHeight) }
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
                                        ? (style == .dark ? .white : MeeshyColors.brandPrimary)
                                        : (style == .dark ? .white.opacity(0.4) : .gray))
                            }
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(selectedCategory == index
                                        ? (style == .dark ? Color.white.opacity(0.15) : MeeshyColors.brandPrimary.opacity(0.12))
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
