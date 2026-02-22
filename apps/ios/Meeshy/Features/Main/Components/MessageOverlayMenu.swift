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

    @State private var quickViewHeight: CGFloat = 200
    @State private var quickViewDragOffset: CGFloat = 0

    private let quickViewMinHeight: CGFloat = 50
    private let quickViewDefaultHeight: CGFloat = 200
    private let quickViewMaxHeight: CGFloat = 350

    private let compactMenuHeight: CGFloat = 180
    private let expandedMenuHeight: CGFloat = 280

    private let allQuickEmojis = [
        "\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F525}",
        "\u{1F62E}", "\u{1F622}", "\u{1F64F}", "\u{1F389}",
        "\u{1F60D}", "\u{1F921}", "\u{1F4AF}", "\u{1F44F}",
        "\u{1F62D}", "\u{1F913}", "\u{1F60E}", "\u{1F973}"
    ]

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                dismissBackground

                VStack(spacing: 0) {
                    quickViewArea(in: geometry)
                        .opacity(isVisible ? 1 : 0)
                        .offset(y: isVisible ? 0 : -100)

                    Spacer(minLength: 12)

                    messagePreview
                        .opacity(isVisible ? 1 : 0)
                        .scaleEffect(isVisible ? 0.95 : 0.5)

                    Spacer(minLength: 12)

                    compactActionMenu(in: geometry)
                        .offset(y: isVisible ? 0 : 300)
                }
                .padding(.top, geometry.safeAreaInsets.top + 8)
                .padding(.bottom, geometry.safeAreaInsets.bottom)
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

    // MARK: - Dismiss Background

    private var dismissBackground: some View {
        Color.black
            .opacity(isVisible ? 0.5 : 0)
            .background(.ultraThinMaterial.opacity(isVisible ? 1 : 0))
            .animation(.easeOut(duration: 0.25), value: isVisible)
            .onTapGesture { dismiss() }
    }

    // MARK: - Quick View Area (TOP)

    @ViewBuilder
    private func quickViewArea(in geometry: GeometryProxy) -> some View {
        let effectiveHeight = max(quickViewMinHeight, quickViewHeight + quickViewDragOffset)
        let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 6)

        VStack(spacing: 0) {
            ScrollView(showsIndicators: false) {
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(allQuickEmojis, id: \.self) { emoji in
                        Button {
                            dismissThen { onReact?(emoji) }
                        } label: {
                            Text(emoji)
                                .font(.system(size: 28))
                                .frame(maxWidth: .infinity, minHeight: 42)
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
                        .frame(maxWidth: .infinity, minHeight: 42)
                    }
                    .buttonStyle(EmojiButtonStyle())
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 8)
            }

            quickViewDragHandle
        }
        .frame(height: effectiveHeight)
        .frame(maxWidth: .infinity)
        .background(quickViewBackground)
        .padding(.horizontal, 12)
    }

    private var quickViewDragHandle: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(theme.textMuted.opacity(0.4))
                .frame(width: 36, height: 4)
                .padding(.vertical, 8)
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 28)
        .contentShape(Rectangle())
        .gesture(quickViewDragGesture)
        .onTapGesture {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                if quickViewHeight <= quickViewMinHeight {
                    quickViewHeight = quickViewDefaultHeight
                } else if quickViewHeight < quickViewMaxHeight {
                    quickViewHeight = quickViewMaxHeight
                } else {
                    quickViewHeight = quickViewDefaultHeight
                }
            }
            HapticFeedback.light()
        }
    }

    private var quickViewDragGesture: some Gesture {
        DragGesture(minimumDistance: 5)
            .onChanged { value in
                quickViewDragOffset = value.translation.height
            }
            .onEnded { value in
                let projected = quickViewHeight + value.predictedEndTranslation.height
                let midLow = (quickViewMinHeight + quickViewDefaultHeight) / 2
                let midHigh = (quickViewDefaultHeight + quickViewMaxHeight) / 2
                let target: CGFloat
                if projected < midLow {
                    target = quickViewMinHeight
                } else if projected < midHigh {
                    target = quickViewDefaultHeight
                } else {
                    target = quickViewMaxHeight
                }
                withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                    quickViewHeight = target
                    quickViewDragOffset = 0
                }
                HapticFeedback.light()
            }
    }

    private var quickViewBackground: some View {
        UnevenRoundedRectangle(
            topLeadingRadius: 0,
            bottomLeadingRadius: 20,
            bottomTrailingRadius: 20,
            topTrailingRadius: 0
        )
        .fill(.ultraThinMaterial)
        .overlay(
            UnevenRoundedRectangle(
                topLeadingRadius: 0,
                bottomLeadingRadius: 20,
                bottomTrailingRadius: 20,
                topTrailingRadius: 0
            )
            .fill(theme.mode.isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.6))
        )
        .overlay(
            UnevenRoundedRectangle(
                topLeadingRadius: 0,
                bottomLeadingRadius: 20,
                bottomTrailingRadius: 20,
                topTrailingRadius: 0
            )
            .stroke(
                theme.mode.isDark
                    ? Color.white.opacity(0.15)
                    : Color.black.opacity(0.06),
                lineWidth: 0.5
            )
        )
        .shadow(color: .black.opacity(0.2), radius: 12, y: 4)
    }

    // MARK: - Message Preview (CENTER)

    private var messagePreview: some View {
        VStack(alignment: message.isMe ? .trailing : .leading, spacing: 6) {
            if !message.isMe, let name = message.senderName {
                Text(name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color(hex: message.senderColor ?? contactColor))
            }

            previewContent
        }
        .frame(maxWidth: UIScreen.main.bounds.width * 0.85)
        .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
    }

    @ViewBuilder
    private var previewContent: some View {
        let hasText = !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let images = message.attachments.filter { $0.mimeType.hasPrefix("image/") }
        let videos = message.attachments.filter { $0.mimeType.hasPrefix("video/") }
        let audios = message.attachments.filter { $0.mimeType.hasPrefix("audio/") }
        let files = message.attachments.filter {
            !$0.mimeType.hasPrefix("image/") &&
            !$0.mimeType.hasPrefix("video/") &&
            !$0.mimeType.hasPrefix("audio/")
        }

        VStack(alignment: message.isMe ? .trailing : .leading, spacing: 8) {
            if !images.isEmpty {
                previewImageGrid(images)
            }

            if !videos.isEmpty {
                previewVideoThumbnails(videos)
            }

            if hasText {
                previewTextBubble
            }

            if !audios.isEmpty {
                ForEach(audios) { audio in
                    previewAudioRow(audio)
                }
            }

            if !files.isEmpty {
                ForEach(files) { file in
                    previewFileRow(file)
                }
            }
        }
    }

    // MARK: - Preview Text Bubble

    private var previewTextBubble: some View {
        let accent = Color(hex: contactColor)
        let isDark = theme.mode.isDark

        return Text(message.content)
            .font(.system(size: 15))
            .foregroundColor(message.isMe ? .white : theme.textPrimary)
            .lineLimit(8)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 18)
                    .fill(
                        message.isMe ?
                        LinearGradient(
                            colors: [accent, accent.opacity(0.8)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ) :
                        LinearGradient(
                            colors: [
                                accent.opacity(isDark ? 0.35 : 0.25),
                                accent.opacity(isDark ? 0.2 : 0.15)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            )
    }

    // MARK: - Preview Image Grid

    @ViewBuilder
    private func previewImageGrid(_ images: [MessageAttachment]) -> some View {
        let maxPreview = Array(images.prefix(4))
        let count = maxPreview.count

        Group {
            if count == 1 {
                previewSingleImage(maxPreview[0])
            } else if count == 2 {
                HStack(spacing: 3) {
                    previewSingleImage(maxPreview[0])
                    previewSingleImage(maxPreview[1])
                }
            } else if count == 3 {
                HStack(spacing: 3) {
                    previewSingleImage(maxPreview[0])
                        .frame(maxHeight: 160)
                    VStack(spacing: 3) {
                        previewSingleImage(maxPreview[1])
                        previewSingleImage(maxPreview[2])
                    }
                }
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3)], spacing: 3) {
                    ForEach(maxPreview) { img in
                        previewSingleImage(img)
                            .frame(height: 100)
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func previewSingleImage(_ attachment: MessageAttachment) -> some View {
        let url = attachment.thumbnailUrl ?? attachment.fileUrl
        return CachedAsyncImage(url: url) {
            Color(hex: attachment.thumbnailColor).opacity(0.3)
        }
        .aspectRatio(contentMode: .fill)
        .frame(maxWidth: .infinity, minHeight: 80, maxHeight: 200)
        .clipped()
    }

    // MARK: - Preview Video Thumbnails

    @ViewBuilder
    private func previewVideoThumbnails(_ videos: [MessageAttachment]) -> some View {
        ForEach(videos) { video in
            let thumbUrl = video.thumbnailUrl ?? video.fileUrl
            ZStack {
                CachedAsyncImage(url: thumbUrl) {
                    Color(hex: contactColor).opacity(0.2)
                }
                .aspectRatio(16/9, contentMode: .fill)
                .frame(maxWidth: .infinity, maxHeight: 180)
                .clipped()

                Circle()
                    .fill(.black.opacity(0.5))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Image(systemName: "play.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                            .offset(x: 2)
                    )
            }
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    // MARK: - Preview Audio Row

    private func previewAudioRow(_ attachment: MessageAttachment) -> some View {
        let accent = Color(hex: contactColor)
        let duration = attachment.duration.map { formatDuration($0) } ?? "--:--"

        return HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(accent.opacity(0.2))
                    .frame(width: 36, height: 36)
                Image(systemName: "waveform")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(accent)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.originalName.isEmpty ? "Audio" : attachment.originalName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                Text(duration)
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
        )
    }

    // MARK: - Preview File Row

    private func previewFileRow(_ attachment: MessageAttachment) -> some View {
        let accent = Color(hex: contactColor)

        return HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(accent.opacity(0.15))
                    .frame(width: 36, height: 36)
                Image(systemName: "doc.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(accent)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.originalName.isEmpty ? attachment.fileName : attachment.originalName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                Text(formatFileSize(attachment.fileSize))
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
        )
    }

    // MARK: - Compact Action Menu (BOTTOM)

    @ViewBuilder
    private func compactActionMenu(in geometry: GeometryProxy) -> some View {
        let actions = availableActions
        let currentHeight = menuExpanded ? expandedMenuHeight : compactMenuHeight

        VStack(spacing: 0) {
            dragHandle
                .gesture(menuDragGesture)

            ScrollView(showsIndicators: false) {
                actionGrid(actions: actions)
                    .padding(.horizontal, 16)
            }
            .frame(maxHeight: currentHeight - 44)

            cancelButton

            Spacer(minLength: 0)
        }
        .frame(height: currentHeight + 56)
        .background(menuBackground)
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: 20,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 20
            )
        )
        .padding(.horizontal, 0)
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
        .padding(.bottom, 8)
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

    private var cancelButton: some View {
        VStack(spacing: 0) {
            Divider()
                .padding(.horizontal, 16)

            Button { dismiss() } label: {
                Text("Annuler")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
    }

    private var menuBackground: some View {
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

    // MARK: - Helpers

    private func formatDuration(_ seconds: Int) -> String {
        let mins = seconds / 60
        let secs = seconds % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func formatFileSize(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        let kb = Double(bytes) / 1024
        if kb < 1024 { return String(format: "%.1f KB", kb) }
        let mb = kb / 1024
        return String(format: "%.1f MB", mb)
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
