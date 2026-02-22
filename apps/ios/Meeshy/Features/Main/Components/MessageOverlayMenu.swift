import SwiftUI
import AVFoundation
import MeeshySDK

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
    var onReact: ((String) -> Void)?
    var onReport: ((String, String?) -> Void)?
    var onDelete: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isVisible = false

    private let previewCharLimit = 500

    var body: some View {
        GeometryReader { geometry in
            let panelHeight = geometry.size.height * 0.56 + geometry.safeAreaInsets.bottom
            let previewMaxH = geometry.size.height - panelHeight - geometry.safeAreaInsets.top - 16

            ZStack {
                dismissBackground

                VStack(spacing: 0) {
                    Spacer(minLength: geometry.safeAreaInsets.top + 8)

                    ScrollView(.vertical, showsIndicators: false) {
                        messagePreview
                    }
                    .frame(maxHeight: max(60, previewMaxH))
                    .opacity(isVisible ? 1 : 0)
                    .scaleEffect(isVisible ? 1.0 : 0.6)

                    Spacer(minLength: 8)

                    detailPanel(safeBottom: geometry.safeAreaInsets.bottom)
                        .frame(height: panelHeight)
                        .offset(y: isVisible ? 0 : panelHeight)
                }
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

    // MARK: - Message Preview (CENTER - enlarged)

    private var messagePreview: some View {
        VStack(alignment: message.isMe ? .trailing : .leading, spacing: 6) {
            if !message.isMe, let name = message.senderName {
                Text(name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(hex: message.senderColor ?? contactColor))
            }

            previewContent
        }
        .frame(maxWidth: UIScreen.main.bounds.width * 0.92)
        .padding(.horizontal, 8)
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

    // MARK: - Detail Panel (replaces compact action menu)

    private func detailPanel(safeBottom: CGFloat) -> some View {
        VStack(spacing: 0) {
            panelHandle

            MessageDetailSheet(
                message: message,
                contactColor: contactColor,
                conversationId: conversationId,
                initialTab: .views,
                canDelete: canDelete,
                actions: overlayActions,
                onDismissAction: { dismiss() },
                onReact: { emoji in onReact?(emoji) },
                onReport: { type, reason in onReport?(type, reason) },
                onDelete: { onDelete?() }
            )

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
    }

    private var panelHandle: some View {
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
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(accent)
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
                HStack(spacing: 8) {
                    Button { player.toggle(url: attachment.fileUrl) } label: {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(accent)
                    }
                    .buttonStyle(.plain)

                    Button { player.skip(seconds: -5) } label: {
                        Image(systemName: "gobackward.5")
                            .font(.system(size: 12, weight: .medium))
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

                    Button { player.skip(seconds: 5) } label: {
                        Image(systemName: "goforward.5")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                    .buttonStyle(.plain)

                    Text(player.timeLabel(totalDuration: attachment.duration))
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .monospacedDigit()

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
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 14, bottomTrailingRadius: 14, topTrailingRadius: 0)
                        .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                )
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .onDisappear { player.stop() }
    }
}

// MARK: - Overlay Audio Player (AVPlayer wrapper)

private class OverlayAudioPlayer: ObservableObject {
    @Published var isPlaying = false
    @Published var progress: Double = 0
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var playbackRate: Float = 1.0

    private var avPlayer: AVPlayer?
    private var timeObserver: Any?
    private var currentURL: String?

    func toggle(url: String) {
        if isPlaying {
            avPlayer?.pause()
            isPlaying = false
            return
        }

        if currentURL != url {
            stop()
            currentURL = url
            guard let playerURL = URL(string: url) else { return }
            let item = AVPlayerItem(url: playerURL)
            avPlayer = AVPlayer(playerItem: item)
            avPlayer?.rate = playbackRate
            setupTimeObserver()
            observeEnd(item: item)
        }

        avPlayer?.rate = playbackRate
        isPlaying = true
    }

    func stop() {
        avPlayer?.pause()
        if let obs = timeObserver { avPlayer?.removeTimeObserver(obs) }
        timeObserver = nil
        avPlayer = nil
        currentURL = nil
        isPlaying = false
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
            guard let self, let item = self.avPlayer?.currentItem else { return }
            let total = item.duration.seconds
            guard total.isFinite && total > 0 else { return }
            self.duration = total
            self.currentTime = time.seconds
            self.progress = time.seconds / total
        }
    }

    private func observeEnd(item: AVPlayerItem) {
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item, queue: .main
        ) { [weak self] _ in
            self?.isPlaying = false
            self?.progress = 0
            self?.currentTime = 0
            self?.avPlayer?.seek(to: .zero)
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
