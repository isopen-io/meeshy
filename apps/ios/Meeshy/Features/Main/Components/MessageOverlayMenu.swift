import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

// MARK: - MessageOverlayMenu

struct MessageOverlayMenu: View {
    let message: Message
    let contactColor: String
    let conversationId: String
    let messageBubbleFrame: CGRect
    @Binding var isPresented: Bool
    var canDelete: Bool = false
    var onReply: (() -> Void)?
    var onCopy: (() -> Void)?
    var onEdit: (() -> Void)?
    var onPin: (() -> Void)?
    var textTranslations: [MessageTranslation] = []
    var onSelectTranslation: ((MessageTranslation?) -> Void)? = nil
    var onRequestTranslation: ((String, String) -> Void)? = nil
    var onReact: ((String) -> Void)?
    var onReport: ((String, String?) -> Void)?
    var onDelete: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isVisible = false
    @State private var dragOffset: CGFloat = 0
    @State private var forceTab: DetailTab? = nil

    private let previewCharLimit = 500
    private let defaultEmojis = ["😂", "❤️", "👍", "😮", "😢", "🔥", "🎉", "💯", "🥰", "😎", "🙏", "💀", "🤣", "✨", "👏"]

    // Panel takes ~56% of screen, but grid shows 2.5 rows (scrollable)
    private let gridVisibleHeight: CGFloat = 175

    var body: some View {
        GeometryReader { geometry in
            let safeTop = geometry.safeAreaInsets.top
            let safeBottom = geometry.safeAreaInsets.bottom
            let screenH = geometry.size.height
            let panelBaseHeight = gridVisibleHeight + safeBottom + 60

            // Drag range: 0 = collapsed (normal), negative = expanded (pull up)
            let maxExpandUp = -(screenH - panelBaseHeight - safeTop - 20)
            let clampedDrag = min(0, max(maxExpandUp, dragOffset))
            let panelHeight = panelBaseHeight - clampedDrag

            ZStack {
                dismissBackground

                VStack(spacing: 0) {
                    // Tappable area above content — fills remaining space, dismisses on tap
                    Color.clear
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .contentShape(Rectangle())
                        .onTapGesture { dismiss() }

                    // Message preview tight above emoji bar
                    HStack {
                        if message.isMe { Spacer(minLength: 16) }
                        messagePreview
                        if !message.isMe { Spacer(minLength: 16) }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 4)
                    .opacity(isVisible ? 1 : 0)

                    // Emoji quick bar
                    HStack {
                        if message.isMe { Spacer() }
                        emojiQuickBar
                        if !message.isMe { Spacer() }
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 2)
                    .opacity(isVisible ? 1 : 0)

                    // Detail panel with drag handle
                    detailPanel(safeBottom: safeBottom)
                        .frame(height: panelHeight)
                        .offset(y: isVisible ? 0 : panelBaseHeight)
                }
            }
        }
        .ignoresSafeArea()
        .onAppear {
            HapticFeedback.medium()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                isVisible = true
                dragOffset = -400
            }
        }
    }

    // MARK: - Emoji Quick Bar (5 visible + scroll, (+) always pinned)

    private var emojiQuickBar: some View {
        let topEmojis = EmojiUsageTracker.topEmojis(count: 15, defaults: defaultEmojis)

        return HStack(spacing: 4) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 3) {
                    ForEach(topEmojis, id: \.self) { emoji in
                        emojiQuickButton(emoji: emoji)
                    }
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
            }
            .frame(maxWidth: 5 * 30 + 4 * 3 + 12) // 5 emojis visible width

            emojiPlusButton
        }
        .frame(height: 38)
        .padding(.horizontal, 4)
        .background(emojiBarBackground)
    }

    private func emojiQuickButton(emoji: String) -> some View {
        Button {
            EmojiUsageTracker.recordUsage(emoji: emoji)
            onReact?(emoji)
            dismiss()
        } label: {
            Text(emoji)
                .font(.system(size: 18))
        }
        .buttonStyle(.plain)
        .frame(width: 30, height: 30)
        .contentShape(Circle())
    }

    private var emojiPlusButton: some View {
        let accent = Color(hex: contactColor)
        let isDark = theme.mode.isDark
        return Button {
            HapticFeedback.light()
            forceTab = .react
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(accent)
        }
        .buttonStyle(.plain)
        .frame(width: 30, height: 30)
        .background(
            Circle()
                .fill(accent.opacity(isDark ? 0.15 : 0.1))
                .overlay(Circle().stroke(accent.opacity(0.25), lineWidth: 0.5))
        )
        .contentShape(Circle())
    }

    private var emojiBarBackground: some View {
        let isDark = theme.mode.isDark
        return Capsule()
            .fill(.ultraThinMaterial)
            .overlay(Capsule().fill(isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.6)))
            .overlay(Capsule().stroke(isDark ? Color.white.opacity(0.15) : Color.black.opacity(0.08), lineWidth: 0.5))
            .shadow(color: .black.opacity(0.15), radius: 8, y: 3)
    }

    // MARK: - Dismiss Background (vibrant with bubble form distinction)

    private var dismissBackground: some View {
        ZStack {
            Rectangle()
                .fill(.ultraThinMaterial)
                .opacity(isVisible ? 1 : 0)
            Color.black
                .opacity(isVisible ? 0.35 : 0)
        }
        .animation(.easeOut(duration: 0.25), value: isVisible)
        .onTapGesture { dismiss() }
    }

    // MARK: - Message Preview (aligned left/right)

    private var messagePreview: some View {
        VStack(alignment: message.isMe ? .trailing : .leading, spacing: 6) {
            previewSenderHeader

            previewContent
        }
        .frame(maxWidth: UIScreen.main.bounds.width * 0.85)
        .padding(.horizontal, 8)
        .shadow(color: .black.opacity(0.2), radius: 16, y: 6)
    }

    private var previewSenderHeader: some View {
        let isMe = message.isMe
        let name = isMe ? "Moi" : (message.senderName ?? "?")
        let color = isMe ? contactColor : (message.senderColor ?? contactColor)

        return HStack(spacing: 6) {
            if !isMe {
                MeeshyAvatar(
                    name: name,
                    mode: .custom(22),
                    accentColor: color,
                    avatarURL: message.senderAvatarURL
                )
            }

            Text(name)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Color(hex: color))

            Text("·")
                .font(.system(size: 13))
                .foregroundColor(theme.textMuted)

            Text(formatExactDate(message.createdAt))
                .font(.system(size: 12))
                .foregroundColor(theme.textMuted)
        }
    }

    private func formatExactDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            formatter.dateFormat = "HH:mm"
        } else if calendar.isDateInYesterday(date) {
            formatter.dateFormat = "'Hier' HH:mm"
        } else {
            formatter.dateFormat = "dd MMM yyyy HH:mm"
        }
        return formatter.string(from: date)
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
                ForEach(videos) { video in
                    PreviewVideoPlayer(attachment: video, contactColor: contactColor)
                }
            }

            if hasText {
                previewTextBubble
            }

            if !audios.isEmpty {
                ForEach(audios) { audio in
                    PreviewAudioPlayer(attachment: audio, contactColor: contactColor)
                }
            }

            if !files.isEmpty {
                ForEach(files) { file in
                    previewFileRow(file)
                }
            }
        }
    }

    // MARK: - Preview Text Bubble (~500 chars)

    private var previewTextBubble: some View {
        let accent = Color(hex: contactColor)
        let isDark = theme.mode.isDark
        let truncated = message.content.count > previewCharLimit
            ? String(message.content.prefix(previewCharLimit)) + "..."
            : message.content

        return Text(truncated)
            .font(.system(size: 15))
            .foregroundColor(message.isMe ? .white : theme.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
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

    // MARK: - Detail Panel (scrollable grid, 2.5 rows visible)

    private func detailPanel(safeBottom: CGFloat) -> some View {
        VStack(spacing: 0) {
            panelDragHandle

            // Scrollable grid showing ~2.5 rows
            ScrollView(.vertical, showsIndicators: false) {
                MessageDetailSheet(
                    message: message,
                    contactColor: contactColor,
                    conversationId: conversationId,
                    initialTab: .language,
                    canDelete: canDelete,
                    actions: overlayActions,
                    textTranslations: textTranslations,
                    onSelectTranslation: onSelectTranslation,
                    onRequestTranslation: onRequestTranslation,
                    onDismissAction: { dismiss() },
                    onReact: { emoji in onReact?(emoji) },
                    onReport: { type, reason in onReport?(type, reason) },
                    onDelete: { onDelete?() },
                    externalTabSelection: $forceTab
                )
            }

            Spacer(minLength: safeBottom)
        }
        .background(panelBackground)
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: 20,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 20
            )
        )
        .gesture(panelDragGesture)
    }

    private var panelDragHandle: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(theme.textMuted.opacity(0.4))
                .frame(width: 36, height: 4)
                .padding(.top, 10)
                .padding(.bottom, 4)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
    }

    private var panelDragGesture: some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                withAnimation(.interactiveSpring()) {
                    dragOffset = value.translation.height
                }
            }
            .onEnded { value in
                let velocity = value.predictedEndTranslation.height - value.translation.height
                withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                    if value.translation.height < -80 || velocity < -200 {
                        // Expanded: pull up to max
                        dragOffset = -400
                    } else if value.translation.height > 80 || velocity > 200 {
                        // Collapsed: push down to normal
                        dragOffset = 0
                    } else {
                        // Snap back
                        dragOffset = dragOffset < -100 ? -400 : 0
                    }
                }
            }
    }

    private var panelBackground: some View {
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

    // MARK: - Quick Actions for Grid

    private var overlayActions: [MessageAction] {
        var actions: [MessageAction] = []
        let hasText = !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        actions.append(MessageAction(
            id: "reply", icon: "arrowshape.turn.up.left.fill",
            label: "Repondre", color: "4ECDC4",
            handler: { dismissThen { onReply?() } }
        ))

        if hasText {
            actions.append(MessageAction(
                id: "copy", icon: "doc.on.doc.fill",
                label: "Copier", color: "9B59B6",
                handler: { dismissThen { onCopy?() } }
            ))
        }

        actions.append(MessageAction(
            id: "pin",
            icon: message.pinnedAt != nil ? "pin.slash.fill" : "pin.fill",
            label: message.pinnedAt != nil ? "Desepingler" : "Epingler",
            color: "3498DB",
            handler: { dismissThen { onPin?() } }
        ))

        if message.isMe && hasText {
            actions.append(MessageAction(
                id: "edit", icon: "pencil",
                label: "Modifier", color: "F8B500",
                handler: { dismissThen { onEdit?() } }
            ))
        }

        return actions
    }

    // MARK: - Helpers

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

// MARK: - Preview Audio Player (interactive)

private struct PreviewAudioPlayer: View {
    let attachment: MessageAttachment
    let contactColor: String

    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var player = OverlayAudioPlayer()

    private var accent: Color { Color(hex: contactColor) }

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                Button { player.toggle(url: attachment.fileUrl) } label: {
                    ZStack {
                        Circle()
                            .fill(accent.opacity(0.2))
                            .frame(width: 40, height: 40)
                        if player.isLoading {
                            ProgressView()
                                .tint(accent)
                                .scaleEffect(0.6)
                        } else {
                            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(accent)
                        }
                    }
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 2) {
                    Text(attachment.originalName.isEmpty ? "Audio" : attachment.originalName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Text(player.timeLabel(totalDuration: attachment.duration))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .monospacedDigit()
                }

                Spacer()

                Menu {
                    ForEach([0.5, 0.75, 1.0, 1.25, 1.5, 2.0], id: \.self) { rate in
                        Button {
                            player.setRate(Float(rate))
                        } label: {
                            HStack {
                                Text(rate == 1.0 ? "Normal" : "\(String(format: "%.2g", rate))x")
                                if abs(Double(player.playbackRate) - rate) < 0.01 {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    Text("\(String(format: "%.2g", player.playbackRate))x")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(accent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(accent.opacity(0.12)))
                }
            }

            HStack(spacing: 8) {
                Button { player.skip(seconds: -5) } label: {
                    Image(systemName: "gobackward.5")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)

                Slider(
                    value: Binding(
                        get: { player.progress },
                        set: { player.seek(to: $0) }
                    ),
                    in: 0...1
                )
                .tint(accent)

                // Pourcentage d'avancement
                Text("\(player.percentInt)%")
                    .font(.system(size: 11, weight: .heavy, design: .monospaced))
                    .foregroundColor(player.percentInt == 0 ? theme.textMuted : accent)
                    .frame(minWidth: 36)
                    .contentTransition(.numericText())
                    .animation(.easeInOut(duration: 0.15), value: player.percentInt)

                Button { player.skip(seconds: 5) } label: {
                    Image(systemName: "goforward.5")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
        )
        .onDisappear { player.stop() }
    }
}

// MARK: - Preview Video Player (interactive)

private struct PreviewVideoPlayer: View {
    let attachment: MessageAttachment
    let contactColor: String

    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var player = OverlayAudioPlayer()
    @State private var showThumbnail = true

    private var accent: Color { Color(hex: contactColor) }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                let thumbUrl = attachment.thumbnailUrl ?? attachment.fileUrl
                CachedAsyncImage(url: thumbUrl) {
                    Color(hex: contactColor).opacity(0.2)
                }
                .aspectRatio(16/9, contentMode: .fill)
                .frame(maxWidth: .infinity, maxHeight: 200)
                .clipped()

                if showThumbnail {
                    Button {
                        showThumbnail = false
                        player.toggle(url: attachment.fileUrl)
                    } label: {
                        Circle()
                            .fill(.black.opacity(0.5))
                            .frame(width: 52, height: 52)
                            .overlay(
                                Image(systemName: "play.fill")
                                    .font(.system(size: 20))
                                    .foregroundColor(.white)
                                    .offset(x: 2)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 14))

            if !showThumbnail {
                videoControls
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .onDisappear { player.stop() }
    }

    private var videoControls: some View {
        VStack(spacing: 4) {
            Slider(
                value: Binding(
                    get: { player.progress },
                    set: { player.seek(to: $0) }
                ),
                in: 0...1
            )
            .tint(accent)

            HStack(spacing: 8) {
                Button { player.toggle(url: attachment.fileUrl) } label: {
                    if player.isLoading {
                        ProgressView()
                            .tint(accent)
                            .scaleEffect(0.5)
                            .frame(width: 14, height: 14)
                    } else {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(accent)
                    }
                }
                .buttonStyle(.plain)

                Button { player.skip(seconds: -5) } label: {
                    Image(systemName: "gobackward.5")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)

                Text("\(player.percentInt)%")
                    .font(.system(size: 10, weight: .heavy, design: .monospaced))
                    .foregroundColor(player.percentInt == 0 ? theme.textMuted : accent)
                    .frame(minWidth: 32)
                    .contentTransition(.numericText())
                    .animation(.easeInOut(duration: 0.15), value: player.percentInt)

                Button { player.skip(seconds: 5) } label: {
                    Image(systemName: "goforward.5")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)

                Spacer()

                Text(player.timeLabel(totalDuration: attachment.duration))
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .monospacedDigit()

                speedMenu
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 14, bottomTrailingRadius: 14, topTrailingRadius: 0)
                .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
        )
    }

    private var speedMenu: some View {
        Menu {
            ForEach([0.5, 0.75, 1.0, 1.25, 1.5, 2.0], id: \.self) { rate in
                Button {
                    player.setRate(Float(rate))
                } label: {
                    HStack {
                        Text(rate == 1.0 ? "Normal" : "\(String(format: "%.2g", rate))x")
                        if abs(Double(player.playbackRate) - rate) < 0.01 {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            Text("\(String(format: "%.2g", player.playbackRate))x")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(accent)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Capsule().fill(accent.opacity(0.12)))
        }
    }
}

// MARK: - Overlay Audio Player (AVPlayer wrapper with PlaybackCoordinator integration)

@MainActor
private class OverlayAudioPlayer: ObservableObject {
    @Published var isPlaying = false
    @Published var progress: Double = 0
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var playbackRate: Float = 1.0
    @Published var isLoading = false

    private var avPlayer: AVPlayer?
    private var timeObserver: Any?
    private var statusObservation: NSKeyValueObservation?
    private var currentURL: String?

    var percentInt: Int { Int(progress * 100) }

    func toggle(url: String) {
        if isPlaying {
            avPlayer?.pause()
            isPlaying = false
            return
        }

        if currentURL != url {
            stop()
            currentURL = url
            guard let resolved = MeeshyConfig.resolveMediaURL(url) else { return }
            isLoading = true
            let item = AVPlayerItem(url: resolved)
            avPlayer = AVPlayer(playerItem: item)

            statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    if item.status == .readyToPlay {
                        self.isLoading = false
                        self.avPlayer?.rate = self.playbackRate
                        self.isPlaying = true
                    } else if item.status == .failed {
                        self.isLoading = false
                    }
                }
            }

            setupTimeObserver()
            observeEnd(item: item)
            return
        }

        avPlayer?.rate = playbackRate
        isPlaying = true
    }

    func stop() {
        avPlayer?.pause()
        if let obs = timeObserver { avPlayer?.removeTimeObserver(obs) }
        timeObserver = nil
        statusObservation?.invalidate()
        statusObservation = nil
        avPlayer = nil
        currentURL = nil
        isPlaying = false
        isLoading = false
        progress = 0
        currentTime = 0
        duration = 0
    }

    func seek(to fraction: Double) {
        guard let player = avPlayer, let item = player.currentItem else { return }
        let total = item.duration.seconds
        guard total.isFinite && total > 0 else { return }
        let target = CMTime(seconds: fraction * total, preferredTimescale: 600)
        player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero)
        progress = fraction
        currentTime = fraction * total
    }

    func skip(seconds: Double) {
        guard let player = avPlayer else { return }
        let current = player.currentTime().seconds
        let total = player.currentItem?.duration.seconds ?? 0
        guard total.isFinite && total > 0 else { return }
        let newTime = max(0, min(total, current + seconds))
        player.seek(to: CMTime(seconds: newTime, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        currentTime = newTime
        progress = newTime / total
    }

    func setRate(_ rate: Float) {
        playbackRate = rate
        if isPlaying {
            avPlayer?.rate = rate
        }
    }

    func timeLabel(totalDuration: Int?) -> String {
        let current = formatTime(currentTime)
        let total = formatTime(duration > 0 ? duration : Double(totalDuration ?? 0))
        return "\(current) / \(total)"
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        guard seconds.isFinite && seconds >= 0 else { return "0:00" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func setupTimeObserver() {
        let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
        timeObserver = avPlayer?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor [weak self] in
                guard let self, let item = self.avPlayer?.currentItem else { return }
                let total = item.duration.seconds
                guard total.isFinite && total > 0 else { return }
                self.duration = total
                self.currentTime = time.seconds
                self.progress = time.seconds / total
            }
        }
    }

    private func observeEnd(item: AVPlayerItem) {
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item, queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.isPlaying = false
                self?.progress = 0
                self?.currentTime = 0
                self?.avPlayer?.seek(to: .zero)
            }
        }
    }

    deinit {
        if let obs = timeObserver { avPlayer?.removeTimeObserver(obs) }
        NotificationCenter.default.removeObserver(self)
    }
}

// MARK: - Emoji Usage Tracker

struct EmojiUsageTracker {
    private static let key = "com.meeshy.emojiUsageCount"

    static func recordUsage(emoji: String) {
        var counts = getCounts()
        counts[emoji, default: 0] += 1
        UserDefaults.standard.set(counts, forKey: key)
    }

    static func sortedEmojis(from emojis: [String]) -> [String] {
        let counts = getCounts()
        if counts.isEmpty { return emojis }
        return emojis.sorted { (counts[$0] ?? 0) > (counts[$1] ?? 0) }
    }

    static func topEmojis(count: Int, defaults: [String]) -> [String] {
        let counts = getCounts()
        let trackedSorted = counts.sorted { $0.value > $1.value }.map(\.key)

        var result: [String] = []
        for emoji in trackedSorted where result.count < count {
            result.append(emoji)
        }
        for emoji in defaults where result.count < count && !result.contains(emoji) {
            result.append(emoji)
        }
        return result
    }

    private static func getCounts() -> [String: Int] {
        UserDefaults.standard.dictionary(forKey: key) as? [String: Int] ?? [:]
    }
}
