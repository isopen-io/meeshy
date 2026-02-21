import SwiftUI
import MeeshySDK

// MARK: - MessageOverlayMenu

struct MessageOverlayMenu: View {
    let message: Message
    let contactColor: String
    let messageBubbleFrame: CGRect
    @Binding var isPresented: Bool
    var onReply: (() -> Void)?
    var onCopy: (() -> Void)?
    var onEdit: (() -> Void)?
    var onForward: (() -> Void)?
    var onDelete: (() -> Void)?
    var onPin: (() -> Void)?
    var onReact: ((String) -> Void)?
    var onShowInfo: (() -> Void)?
    var onAddReaction: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isVisible = false
    @State private var menuDragOffset: CGFloat = 0
    @State private var menuDragStartOffset: CGFloat = 0
    @State private var menuExpanded = false

    private let allQuickEmojis = [
        "\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F525}",
        "\u{1F62E}", "\u{1F622}", "\u{1F64F}", "\u{1F389}",
        "\u{1F60D}", "\u{1F921}", "\u{1F4AF}", "\u{1F44F}",
        "\u{1F62D}", "\u{1F913}", "\u{1F60E}", "\u{1F973}"
    ]

    private let compactMenuHeight: CGFloat = 180
    private let expandedMenuHeight: CGFloat = 280

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                dismissBackground

                emojiBar(in: geometry)
                    .opacity(isVisible ? 1 : 0)
                    .scaleEffect(isVisible ? 1 : 0.8, anchor: emojiBarAnchor)

                compactActionMenu(in: geometry)
                    .offset(y: isVisible ? menuDragOffset : geometry.size.height)
            }
        }
        .ignoresSafeArea()
        .onAppear {
            HapticFeedback.medium()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                isVisible = true
            }
        }
    }

    // MARK: - Emoji Bar Anchor

    private var emojiBarAnchor: UnitPoint {
        message.isMe ? .bottomTrailing : .bottomLeading
    }

    // MARK: - Dismiss Background

    private var dismissBackground: some View {
        Color.black
            .opacity(isVisible ? 0.5 : 0)
            .background(.ultraThinMaterial.opacity(isVisible ? 1 : 0))
            .animation(.easeOut(duration: 0.25), value: isVisible)
            .onTapGesture { dismiss() }
    }

    // MARK: - Emoji Bar

    private func emojiBar(in geometry: GeometryProxy) -> some View {
        let safeTop: CGFloat = geometry.safeAreaInsets.top
        let emojiBarHeight: CGFloat = 44
        let spacing: CGFloat = 8

        let rawY: CGFloat
        if message.isMe {
            rawY = messageBubbleFrame.minY - emojiBarHeight - spacing
        } else {
            rawY = messageBubbleFrame.minY - emojiBarHeight - spacing
        }

        let clampedY = max(safeTop + 8, min(rawY, geometry.size.height - emojiBarHeight - 8))

        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(allQuickEmojis, id: \.self) { emoji in
                    Button {
                        dismissThen { onReact?(emoji) }
                    } label: {
                        Text(emoji)
                            .font(.system(size: 28))
                    }
                    .buttonStyle(EmojiButtonStyle())
                }

                Button {
                    dismissThen { onAddReaction?() }
                } label: {
                    ZStack {
                        Circle()
                            .fill(theme.mode.isDark ? Color.white.opacity(0.15) : Color.gray.opacity(0.15))
                            .frame(width: 34, height: 34)
                        Image(systemName: "plus")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(theme.mode.isDark ? .white.opacity(0.7) : .gray)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        .frame(height: emojiBarHeight)
        .frame(maxWidth: min(geometry.size.width - 32, 320))
        .background(emojiBarBackground)
        .position(
            x: message.isMe
                ? geometry.size.width - (min(geometry.size.width - 32, 320) / 2) - 16
                : (min(geometry.size.width - 32, 320) / 2) + 16,
            y: clampedY + emojiBarHeight / 2
        )
    }

    private var emojiBarBackground: some View {
        Capsule()
            .fill(.ultraThinMaterial)
            .overlay(
                Capsule()
                    .fill(theme.mode.isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.6))
            )
            .overlay(
                Capsule()
                    .stroke(
                        theme.mode.isDark
                            ? Color.white.opacity(0.15)
                            : Color.black.opacity(0.06),
                        lineWidth: 0.5
                    )
            )
            .shadow(color: .black.opacity(0.25), radius: 16, y: 6)
    }

    // MARK: - Compact Action Menu (Bottom)

    private func compactActionMenu(in geometry: GeometryProxy) -> some View {
        let safeBottom = geometry.safeAreaInsets.bottom
        let actions = availableActions
        let currentHeight = menuExpanded ? expandedMenuHeight : compactMenuHeight

        return VStack(spacing: 0) {
            dragHandle
                .gesture(menuDragGesture)

            ScrollView(showsIndicators: false) {
                actionGrid(actions: actions)
                    .padding(.horizontal, 16)
            }
            .frame(maxHeight: currentHeight - 44 - safeBottom)

            Spacer(minLength: 0)
        }
        .frame(height: currentHeight + safeBottom)
        .background(menuBackground(in: geometry))
        .frame(maxWidth: .infinity)
        .position(
            x: geometry.size.width / 2,
            y: geometry.size.height - (currentHeight + safeBottom) / 2
        )
    }

    private var dragHandle: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(theme.textMuted.opacity(0.4))
                .frame(width: 36, height: 4)
                .padding(.vertical, 10)
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                menuExpanded.toggle()
            }
            HapticFeedback.light()
        }
    }

    private func actionGrid(actions: [OverlayAction]) -> some View {
        let columns = [
            GridItem(.flexible(), spacing: 10),
            GridItem(.flexible(), spacing: 10),
            GridItem(.flexible(), spacing: 10)
        ]

        return LazyVGrid(columns: columns, spacing: 10) {
            ForEach(actions) { action in
                actionButton(action)
            }
        }
        .padding(.bottom, 16)
    }

    private func actionButton(_ action: OverlayAction) -> some View {
        Button {
            dismissThen { action.handler() }
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(Color(hex: action.color).opacity(theme.mode.isDark ? 0.2 : 0.12))
                        .frame(width: 44, height: 44)
                    Image(systemName: action.icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Color(hex: action.color))
                }
                Text(action.label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, minHeight: 72)
            .contentShape(Rectangle())
        }
        .buttonStyle(ActionButtonStyle())
    }

    private func menuBackground(in geometry: GeometryProxy) -> some View {
        UnevenRoundedRectangle(
            topLeadingRadius: 20,
            bottomLeadingRadius: 0,
            bottomTrailingRadius: 0,
            topTrailingRadius: 20
        )
        .fill(.ultraThinMaterial)
        .overlay(
            UnevenRoundedRectangle(
                topLeadingRadius: 20,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 20
            )
            .fill(theme.mode.isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.7))
        )
        .overlay(
            UnevenRoundedRectangle(
                topLeadingRadius: 20,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 20
            )
            .stroke(
                theme.mode.isDark
                    ? Color.white.opacity(0.12)
                    : Color.black.opacity(0.06),
                lineWidth: 0.5
            )
        )
        .shadow(color: .black.opacity(0.2), radius: 20, y: -4)
    }

    // MARK: - Drag Gesture

    private var menuDragGesture: some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                let translation = value.translation.height
                if translation < -30 && !menuExpanded {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
                        menuExpanded = true
                    }
                    HapticFeedback.light()
                } else if translation > 30 && menuExpanded {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
                        menuExpanded = false
                    }
                    HapticFeedback.light()
                } else if translation > 60 && !menuExpanded {
                    dismiss()
                }
            }
    }

    // MARK: - Available Actions

    private var availableActions: [OverlayAction] {
        var actions: [OverlayAction] = []

        actions.append(OverlayAction(
            id: "reply",
            icon: "arrowshape.turn.up.left.fill",
            label: "Repondre",
            color: "4ECDC4",
            handler: { onReply?() }
        ))

        let hasTextContent = !message.content.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines).isEmpty
        if hasTextContent {
            actions.append(OverlayAction(
                id: "copy",
                icon: "doc.on.doc.fill",
                label: "Copier",
                color: "9B59B6",
                handler: { onCopy?() }
            ))
        }

        actions.append(OverlayAction(
            id: "forward",
            icon: "arrowshape.turn.up.forward.fill",
            label: "Transferer",
            color: "F8B500",
            handler: { onForward?() }
        ))

        actions.append(OverlayAction(
            id: "pin",
            icon: message.pinnedAt != nil ? "pin.slash.fill" : "pin.fill",
            label: message.pinnedAt != nil ? "Desepingler" : "Epingler",
            color: "3498DB",
            handler: { onPin?() }
        ))

        actions.append(OverlayAction(
            id: "info",
            icon: "info.circle.fill",
            label: "Infos",
            color: "45B7D1",
            handler: { onShowInfo?() }
        ))

        if message.isMe {
            if hasTextContent {
                actions.append(OverlayAction(
                    id: "edit",
                    icon: "pencil",
                    label: "Modifier",
                    color: "F8B500",
                    handler: { onEdit?() }
                ))
            }

            actions.append(OverlayAction(
                id: "delete",
                icon: "trash.fill",
                label: "Supprimer",
                color: "FF6B6B",
                handler: { onDelete?() }
            ))
        }

        return actions
    }

    // MARK: - Dismiss

    private func dismiss() {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            isPresented = false
        }
    }

    private func dismissThen(_ action: @escaping () -> Void) {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            isPresented = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                action()
            }
        }
    }
}

// MARK: - Overlay Action Model

private struct OverlayAction: Identifiable {
    let id: String
    let icon: String
    let label: String
    let color: String
    let handler: () -> Void
}

// MARK: - Emoji Button Style

private struct EmojiButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 1.35 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.5), value: configuration.isPressed)
    }
}

// MARK: - Action Button Style

private struct ActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1.0)
            .opacity(configuration.isPressed ? 0.7 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
