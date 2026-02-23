// MARK: - Extracted from ConversationView.swift
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Share Sheet
struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Download Badge View (3 states: idle → downloading → cached)
struct DownloadBadgeView: View {
    let attachment: MessageAttachment
    let accentColor: String
    var onShareFile: ((URL) -> Void)? = nil

    @StateObject private var downloader = AttachmentDownloader()
    private var accent: Color { Color(hex: accentColor) }

    private var totalSizeText: String {
        if downloader.totalBytes > 0 { return AttachmentDownloader.fmt(downloader.totalBytes) }
        if attachment.fileSize > 0 { return AttachmentDownloader.fmt(Int64(attachment.fileSize)) }
        return ""
    }

    var body: some View {
        Group {
            if downloader.isCached {
                EmptyView()
            } else if downloader.isDownloading {
                downloadingBadge
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            } else {
                idleBadge
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: downloader.isCached)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: downloader.isDownloading)
    }

    private var idleBadge: some View {
        Button {
            downloader.start(attachment: attachment, onShare: onShareFile)
        } label: {
            HStack(spacing: 3) {
                if !totalSizeText.isEmpty {
                    Text(totalSizeText)
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundColor(.white)
                }
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 16))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, accent.opacity(0.85))
            }
            .padding(.horizontal, 5)
            .padding(.vertical, 3)
            .background(Capsule().fill(.black.opacity(0.5)))
        }
        .padding(4)
        .task { await downloader.checkCache(attachment.fileUrl) }
    }

    private var downloadingBadge: some View {
        Button { downloader.cancel() } label: {
            VStack(spacing: 2) {
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.15), lineWidth: 2.5)
                    Circle()
                        .trim(from: 0, to: downloader.progress)
                        .stroke(accent, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 0.2), value: downloader.progress)

                    if downloader.progress > 0 {
                        Text("\(Int(downloader.progress * 100))")
                            .font(.system(size: 7, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                    } else {
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Color.white)
                            .frame(width: 7, height: 7)
                    }
                }
                .frame(width: 24, height: 24)

                Text("\(AttachmentDownloader.fmt(downloader.downloadedBytes))/\(totalSizeText)")
                    .font(.system(size: 7, weight: .medium, design: .monospaced))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }
            .padding(5)
            .background(RoundedRectangle(cornerRadius: 8).fill(.black.opacity(0.6)))
        }
        .padding(4)
    }
}

// MARK: - Attachment Downloader (real byte-level progress via URLSession.bytes)
@MainActor
final class AttachmentDownloader: ObservableObject {
    @Published var isCached = false
    @Published var isDownloading = false
    @Published var downloadedBytes: Int64 = 0
    @Published var totalBytes: Int64 = 0

    var progress: Double {
        guard totalBytes > 0 else { return 0 }
        return min(Double(downloadedBytes) / Double(totalBytes), 1.0)
    }

    private var downloadTask: Task<Void, Never>?

    func checkCache(_ urlString: String) async {
        let cached = await MediaCacheManager.shared.isCached(urlString)
        if cached { isCached = true }
    }

    func start(attachment: MessageAttachment, onShare: ((URL) -> Void)?) {
        let fileUrl = attachment.fileUrl
        guard !fileUrl.isEmpty else { return }
        isDownloading = true
        downloadedBytes = 0
        totalBytes = Int64(attachment.fileSize)
        HapticFeedback.light()

        downloadTask = Task.detached { [weak self] in
            do {
                guard let url = MeeshyConfig.resolveMediaURL(fileUrl) else { throw URLError(.badURL) }

                let (asyncBytes, response) = try await URLSession.shared.bytes(from: url)

                guard let http = response as? HTTPURLResponse,
                      (200...299).contains(http.statusCode) else {
                    throw URLError(.badServerResponse)
                }

                let expectedLength = http.expectedContentLength
                if expectedLength > 0 {
                    await MainActor.run { [weak self] in self?.totalBytes = expectedLength }
                }

                var data = Data()
                if expectedLength > 0 {
                    data.reserveCapacity(Int(expectedLength))
                }

                var buffer = [UInt8]()
                buffer.reserveCapacity(16384)

                for try await byte in asyncBytes {
                    guard !Task.isCancelled else { return }
                    buffer.append(byte)

                    if buffer.count >= 16384 {
                        data.append(contentsOf: buffer)
                        buffer.removeAll(keepingCapacity: true)
                        let current = Int64(data.count)
                        await MainActor.run { [weak self] in self?.downloadedBytes = current }
                    }
                }

                guard !Task.isCancelled else { return }

                if !buffer.isEmpty {
                    data.append(contentsOf: buffer)
                }

                await MediaCacheManager.shared.store(data, for: fileUrl)

                let finalSize = Int64(data.count)
                await MainActor.run { [weak self] in
                    self?.downloadedBytes = finalSize
                    self?.totalBytes = finalSize
                    self?.isDownloading = false
                    self?.isCached = true
                    HapticFeedback.success()
                }
            } catch {
                guard !Task.isCancelled else { return }
                await MainActor.run { [weak self] in
                    self?.isDownloading = false
                    HapticFeedback.error()
                }
            }
        }
    }

    func cancel() {
        downloadTask?.cancel()
        downloadTask = nil
        isDownloading = false
        downloadedBytes = 0
        HapticFeedback.light()
    }

    static func fmt(_ bytes: Int64) -> String {
        let kb = Double(bytes) / 1024
        if kb < 1 { return "\(bytes)B" }
        if kb < 1024 { return String(format: "%.0fKB", kb) }
        return String(format: "%.1fMB", kb / 1024)
    }
}

// MARK: - Cached Play Icon (active when media is locally cached, polls until available)
struct CachedPlayIcon: View {
    let fileUrl: String
    @State private var isCached = false

    var body: some View {
        Group {
            if isCached {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(.white, Color.black.opacity(0.4))
                    .shadow(color: .black.opacity(0.4), radius: 4, y: 2)
                    .transition(.scale(scale: 0.5).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.7), value: isCached)
        .task {
            while !Task.isCancelled && !isCached {
                let cached = await MediaCacheManager.shared.isCached(fileUrl)
                if cached {
                    isCached = true
                    break
                }
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
        }
    }
}

// MARK: - Audio Media View (shows placeholder until cached, then full player)
struct AudioMediaView: View {
    let attachment: MessageAttachment
    let message: Message
    let contactColor: String
    let visualAttachments: [MessageAttachment]
    @ObservedObject var theme: ThemeManager
    var onShareFile: ((URL) -> Void)?

    @State private var isCached = false
    @State private var isAudioPlaying = false

    private var timeString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: message.createdAt)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack {
                if isCached {
                    AudioPlayerView(
                        attachment: attachment,
                        context: .messageBubble,
                        accentColor: contactColor,
                        onPlayingChange: { playing in
                            withAnimation(.easeInOut(duration: 0.2)) {
                                isAudioPlaying = playing
                            }
                        }
                    )
                    .transition(.opacity)
                } else {
                    audioPlaceholder
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.25), value: isCached)
            .overlay(alignment: .topTrailing) {
                if !isCached, let dur = attachment.duration, dur > 0 {
                    audioDurationBadge(seconds: Double(dur) / 1000.0)
                        .padding(.trailing, 8)
                        .padding(.top, 6)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if !isAudioPlaying {
                    audioTimestampOverlay
                        .padding(.trailing, 8)
                        .padding(.bottom, 6)
                        .transition(.opacity)
                }
            }
            .overlay(alignment: .bottom) {
                DownloadBadgeView(
                    attachment: attachment,
                    accentColor: contactColor,
                    onShareFile: onShareFile
                )
                .padding(.bottom, 6)
            }

            if !message.content.isEmpty && visualAttachments.isEmpty {
                Text(message.content)
                    .font(.system(size: 13))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(3)
                    .padding(.leading, 4)
                    .padding(.top, 2)
            }
        }
        .task {
            while !Task.isCancelled && !isCached {
                let cached = await MediaCacheManager.shared.isCached(attachment.fileUrl)
                if cached {
                    isCached = true
                    break
                }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    private var audioTimestampOverlay: some View {
        let isDark = theme.mode.isDark
        return HStack(spacing: 3) {
            Text(timeString)
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.5))

            if message.isMe {
                audioDeliveryCheckmark(isDark: isDark)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(
            Capsule()
                .fill(isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.6))
        )
    }

    @ViewBuilder
    private func audioDeliveryCheckmark(isDark: Bool) -> some View {
        let metaColor: Color = isDark ? .white.opacity(0.7) : .black.opacity(0.5)
        switch message.deliveryStatus {
        case .sending:
            Image(systemName: "clock")
                .font(.system(size: 9))
                .foregroundColor(metaColor)
        case .sent:
            Image(systemName: "checkmark")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(metaColor)
        case .delivered:
            ZStack(alignment: .leading) {
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .semibold))
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .semibold))
                    .offset(x: 3)
            }
            .foregroundColor(metaColor)
            .frame(width: 14)
        case .read:
            ZStack(alignment: .leading) {
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .semibold))
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .semibold))
                    .offset(x: 3)
            }
            .foregroundColor(MeeshyColors.readReceipt)
            .frame(width: 14)
        case .failed:
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(MeeshyColors.coral)
        }
    }

    private var audioPlaceholder: some View {
        let accent = Color(hex: contactColor)
        let isDark = theme.mode.isDark

        return HStack(spacing: 8) {
            // Disabled play circle
            ZStack {
                Circle()
                    .fill(accent.opacity(0.3))
                    .frame(width: 34, height: 34)
                Image(systemName: "play.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white.opacity(0.3))
                    .offset(x: 1)
            }

            // Static waveform placeholder
            HStack(spacing: 2) {
                ForEach(0..<25, id: \.self) { i in
                    let height = CGFloat.random(in: 6...22)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(accent.opacity(0.2))
                        .frame(width: 2, height: height)
                }
            }
            .frame(height: 26)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(isDark ? accent.opacity(0.15) : accent.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(accent.opacity(isDark ? 0.25 : 0.15), lineWidth: 1)
                )
        )
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func audioDurationBadge(seconds: TimeInterval) -> some View {
        let isDark = theme.mode.isDark
        return Text(formatDuration(seconds))
            .font(.system(size: 9, weight: .semibold, design: .monospaced))
            .foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.5))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(
                Capsule()
                    .fill(isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.6))
            )
    }
}

// MARK: - Animated Waveform Bar
struct AnimatedWaveformBar: View {
    let index: Int
    let isRecording: Bool
    @State private var barHeight: CGFloat = 8

    private let minHeight: CGFloat = 6
    private let maxHeight: CGFloat = 26

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(
                LinearGradient(
                    colors: [Color.white.opacity(0.9), Color.white.opacity(0.5)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 3, height: barHeight)
            .onAppear {
                guard isRecording else { return }
                startAnimating()
            }
            .onChange(of: isRecording) { recording in
                if recording {
                    startAnimating()
                } else {
                    withAnimation(.easeOut(duration: 0.3)) {
                        barHeight = minHeight
                    }
                }
            }
    }

    private func startAnimating() {
        let randomDuration = Double.random(in: 0.3...0.6)
        let randomDelay = Double(index) * 0.04
        withAnimation(
            .easeInOut(duration: randomDuration)
                .repeatForever(autoreverses: true)
                .delay(randomDelay)
        ) {
            barHeight = CGFloat.random(in: (minHeight + 4)...maxHeight)
        }
    }
}

// MARK: - Audio Level Bar (real microphone levels)
struct AudioLevelBar: View {
    let level: CGFloat // 0-1 normalized
    let isRecording: Bool

    private let minHeight: CGFloat = 6
    private let maxHeight: CGFloat = 26

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(
                LinearGradient(
                    colors: [Color.white.opacity(0.9), Color.white.opacity(0.5)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 3, height: isRecording ? minHeight + (maxHeight - minHeight) * level : minHeight)
            .animation(.spring(response: 0.08, dampingFraction: 0.6), value: level)
    }
}
