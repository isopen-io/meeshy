// MARK: - Extracted from ConversationView.swift
import SwiftUI
import UIKit
import Combine
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
    let messageDeliveryStatus: Message.DeliveryStatus
    var onShareFile: ((URL) -> Void)? = nil

    @StateObject private var downloader = AttachmentDownloader()
    private var accent: Color { Color(hex: accentColor) }

    /// Local optimistic media (a `file://` URL) and messages still in their
    /// optimistic phase (`.sending` / `.invisible`) are already on disk — a
    /// download badge must never appear for them. See Sprint 3 RC3.2.
    var hidesForLocalOrOptimisticMedia: Bool {
        attachment.fileUrl.hasPrefix("file://")
            || messageDeliveryStatus == .sending
            || messageDeliveryStatus == .invisible
    }

    /// Synchronous probe of the in-memory UIImage cache. For an image whose
    /// bytes are already resident (our own confirmed upload — pre-seeded by
    /// RC3.3 — or a previously decoded remote image) this resolves "cached"
    /// within the first render, so the download affordance never flashes over
    /// media we already hold. The async `checkCache` still covers disk-only
    /// hits and the audio / video stores.
    private var isImageAlreadyResident: Bool {
        guard attachment.type == .image else { return false }
        let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
        return DiskCacheStore.cachedImage(for: resolved) != nil
    }

    private var totalSizeText: String {
        if downloader.totalBytes > 0 { return AttachmentDownloader.fmt(downloader.totalBytes) }
        if attachment.fileSize > 0 { return AttachmentDownloader.fmt(Int64(attachment.fileSize)) }
        return ""
    }

    var body: some View {
        Group {
            if hidesForLocalOrOptimisticMedia || isImageAlreadyResident {
                EmptyView()
            } else if downloader.isCached {
                EmptyView()
            } else if downloader.isDownloading {
                downloadingBadge
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            } else {
                idleBadge
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.15), value: downloader.isCached)
        .animation(.easeInOut(duration: 0.15), value: downloader.isDownloading)
    }

    private var idleBadge: some View {
        Button {
            downloader.start(attachment: attachment, onShare: onShareFile)
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(.ultraThinMaterial)
                        .frame(width: 56, height: 56)
                    Circle()
                        .fill(accent.opacity(0.85))
                        .frame(width: 48, height: 48)
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(.white)
                }
                .shadow(color: .black.opacity(0.3), radius: 8, y: 4)

                if !totalSizeText.isEmpty {
                    Text(totalSizeText)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(.black.opacity(0.55)))
                }
            }
        }
        .task {
            await downloader.checkCache(attachment)
        }
        .task {
            guard !attachment.fileUrl.hasPrefix("file://") else { return }
            let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
            while !Task.isCancelled && !downloader.isCached {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                guard !Task.isCancelled else { break }
                let cached: Bool
                switch attachment.type {
                case .audio: cached = await CacheCoordinator.shared.audio.isCached(resolved)
                case .video: cached = await CacheCoordinator.shared.video.isCached(resolved)
                case .image: cached = await CacheCoordinator.shared.images.isCached(resolved)
                case .file, .location: cached = false
                }
                if cached {
                    downloader.isCached = true
                    break
                }
            }
        }
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

    /// Resolves whether the attachment's media is already available locally.
    /// Routes to the correct typed cache store via `attachment.type` and
    /// short-circuits on `file://` — local optimistic media is, by definition,
    /// already on disk and never needs a download badge. See Sprint 3 RC3.2.
    func checkCache(_ attachment: MessageAttachment) async {
        let urlString = attachment.fileUrl
        if urlString.hasPrefix("file://") {
            if FileManager.default.fileExists(atPath: URL(string: urlString)?.path ?? "") {
                isCached = true
            }
            return
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached: Bool
        switch attachment.type {
        case .audio: cached = await CacheCoordinator.shared.audio.isCached(resolved)
        case .video: cached = await CacheCoordinator.shared.video.isCached(resolved)
        case .image: cached = await CacheCoordinator.shared.images.isCached(resolved)
        case .file, .location: cached = false
        }
        if cached { isCached = true }
    }

    func start(attachment: MessageAttachment, onShare: ((URL) -> Void)?) {
        let fileUrl = attachment.fileUrl
        guard !fileUrl.isEmpty else { return }
        let isAudio = attachment.type == .audio
        let isImage = attachment.type == .image
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

                // Seed under the exact key the renderer resolves to, in the
                // store that matches the media type — a download triggered by
                // the badge must never need to re-fetch on the next render.
                let resolvedKey = MeeshyConfig.resolveMediaURL(fileUrl)?.absoluteString ?? fileUrl
                if isAudio {
                    await CacheCoordinator.shared.audio.store(data, for: resolvedKey)
                } else if isImage {
                    await CacheCoordinator.shared.images.store(data, for: resolvedKey)
                    if let image = UIImage(data: data) {
                        DiskCacheStore.cacheImageForPreview(image, key: resolvedKey)
                    }
                } else {
                    await CacheCoordinator.shared.video.store(data, for: resolvedKey)
                }

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
        .animation(.easeInOut(duration: 0.15), value: isCached)
        .task {
            let resolved = MeeshyConfig.resolveMediaURL(fileUrl)?.absoluteString ?? fileUrl
            while !Task.isCancelled && !isCached {
                let cached = await CacheCoordinator.shared.video.isCached(resolved)
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
struct AudioMediaView: View, Equatable {
    let attachment: MessageAttachment
    let message: Message
    let contactColor: String
    let visualAttachments: [MessageAttachment]
    let isDark: Bool
    let accentColor: String
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var textTranslations: [MessageTranslation] = []
    var allAudioItems: [ConversationViewModel.AudioItem] = []
    var mentionDisplayNames: [String: String] = [:]
    var onScrollToMessage: ((String) -> Void)?
    var onShareFile: ((URL) -> Void)?
    var onShowTranslationDetail: ((String) -> Void)?
    var onRequestTranslation: ((String, String) -> Void)?
    var activeAudioLanguageOverride: String? = nil
    /// Footer descriptor injected by `BubbleStandardLayout` for audio-only
    /// messages — rendered inside the audio widget. `AudioMediaView` folds the
    /// audio-language flags into it (see `audioFooter`), so the footer is a
    /// single unified `BubbleFooter` and is never duplicated below the bubble.
    var footerModel: BubbleFooterModel? = nil
    var footerActions: BubbleFooterActions = .none

    static func == (lhs: AudioMediaView, rhs: AudioMediaView) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.message.id == rhs.message.id
            && lhs.message.deliveryStatus == rhs.message.deliveryStatus
            && lhs.message.updatedAt == rhs.message.updatedAt
            && lhs.isDark == rhs.isDark
            && lhs.accentColor == rhs.accentColor
            && lhs.contactColor == rhs.contactColor
            && lhs.activeAudioLanguageOverride == rhs.activeAudioLanguageOverride
            && lhs.footerModel == rhs.footerModel
    }

    @State private var isCached = false
    @State private var isAudioPlaying = false
    @State private var showAudioFullscreen = false
    @State private var selectedAudioLangCode: String? = nil
    @StateObject private var downloader = AttachmentDownloader()

    /// Local optimistic audio (a `file://` URL) is on disk already — the player
    /// is playable on the very first render, with no placeholder flash and no
    /// cache poll. Server audio falls back to the `isCached` poll. RC3.2.
    private var isPlayable: Bool {
        isCached || attachment.fileUrl.hasPrefix("file://")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack {
                if isPlayable {
                    audioPlayer
                        .transition(.opacity)
                } else {
                    audioPlaceholder
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.25), value: isPlayable)
            .overlay(alignment: .topTrailing) {
                if !isPlayable, let dur = attachment.duration, dur > 0 {
                    audioDurationBadge(seconds: Double(dur) / 1000.0)
                        .padding(.trailing, 8)
                        .padding(.top, 6)
                }
            }
            // Download handled by audioPlaceholder's integrated play button

            if !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && visualAttachments.isEmpty {
                MessageTextRenderer.render(
                    message.content,
                    fontSize: 13,
                    color: isDark ? Color(hex: "818CF8").opacity(0.5) : Color(hex: "6366F1").opacity(0.4),
                    mentionColor: Color(hex: "818CF8"),
                    accentColor: Color(hex: contactColor),
                    mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                )
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 4)
                .padding(.top, 2)
                .tint(Color(hex: contactColor))
            }
        }
        .fullScreenCover(isPresented: $showAudioFullscreen) {
            AudioFullscreenView(
                allAudioItems: allAudioItems,
                startAttachmentId: attachment.id,
                contactColor: contactColor,
                mentionDisplayNames: mentionDisplayNames,
                onDismissToMessage: onScrollToMessage
            )
        }
        .onChange(of: activeAudioLanguageOverride) { _, newLang in
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                selectedAudioLangCode = newLang
            }
        }
        .task {
            // Local optimistic audio (file:// URL) is already on disk — render
            // the player straight away, no cache poll. See Sprint 3 RC3.2.
            if attachment.fileUrl.hasPrefix("file://") {
                isCached = true
                return
            }
            let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
            while !Task.isCancelled && !isCached {
                let cached = await CacheCoordinator.shared.audio.isCached(resolved)
                if cached {
                    isCached = true
                    break
                }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    /// The audio widget carries a bottom slot only when a footer was injected
    /// (audio-only messages). Without this gate `AudioPlayerView` would draw
    /// an empty divider strip under the player for audio-with-caption.
    private var hasPlayerBottomContent: Bool {
        footerModel != nil
    }

    /// The final footer for the audio widget: the injected base model with
    /// the audio-language flags folded in, and `onFlagTap` wired to the audio
    /// language switch. One unified `BubbleFooter` — no separate flag row.
    private var audioFooter: (BubbleFooterModel, BubbleFooterActions)? {
        guard var model = footerModel else { return nil }
        var actions = footerActions
        if !translatedAudios.isEmpty {
            let origCode = message.originalLanguage.lowercased()
            var codes = [origCode]
            for audio in translatedAudios {
                let code = audio.targetLanguage.lowercased()
                if code != origCode, !codes.contains(code) { codes.append(code) }
            }
            let active = (selectedAudioLangCode ?? origCode).lowercased()
            model.flags = codes.map { FooterFlag(code: $0, isActive: $0 == active) }
            model.showsTranslate = onShowTranslationDetail != nil
            actions.onFlagTap = { code in
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    selectedAudioLangCode = (code == origCode) ? nil : code
                }
                HapticFeedback.light()
            }
            if let detail = onShowTranslationDetail {
                let messageId = message.id
                actions.onTranslate = { detail(messageId) }
            }
        }
        return (model, actions)
    }

    /// The playable audio widget. The bottom slot is only wired in when there
    /// is content for it, so `AudioPlayerView` keeps `bottomSlot` nil and
    /// skips the divider strip otherwise.
    @ViewBuilder
    private var audioPlayer: some View {
        if hasPlayerBottomContent {
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: { showAudioFullscreen = true },
                onPlayingChange: { playing in
                    withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
                },
                externalLanguage: $selectedAudioLangCode
            ) {
                playerBottomContent
            }
        } else {
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: { showAudioFullscreen = true },
                onPlayingChange: { playing in
                    withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
                },
                externalLanguage: $selectedAudioLangCode
            )
        }
    }

    /// Footer rendered inside the audio widget (`AudioPlayerView.bottomContent`):
    /// a single unified `BubbleFooter` — audio-language flags + translate on
    /// the leading edge, timestamp + delivery pinned trailing.
    @ViewBuilder
    private var playerBottomContent: some View {
        if let (model, actions) = audioFooter {
            BubbleFooter(model: model, actions: actions, style: .row, isDark: isDark)
                .equatable()
        }
    }

    private var audioPlaceholder: some View {
        let accent = Color(hex: contactColor)

        return VStack(spacing: 0) {
            HStack(spacing: 8) {
                // Play circle — triggers download
                Button {
                    HapticFeedback.medium()
                    downloader.start(attachment: attachment, onShare: nil)
                } label: {
                    ZStack {
                        Circle()
                            .fill(accent.opacity(downloader.isDownloading ? 0.5 : 0.3))
                            .frame(width: 34, height: 34)
                        if downloader.isDownloading {
                            ProgressView().tint(.white).scaleEffect(0.7)
                        } else {
                            Image(systemName: "play.fill")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.white.opacity(0.6))
                                .offset(x: 1)
                        }
                    }
                }
                .disabled(downloader.isDownloading)

                // Static waveform placeholder (deterministic heights)
                waveformPlaceholder(accent: accent)

                // Surface the download weight (KB / MB) so the user knows the
                // cost before tapping play to fetch the audio. See Sprint 3.
                if attachment.fileSize > 0 {
                    Text(AttachmentDownloader.fmt(Int64(attachment.fileSize)))
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(accent.opacity(0.65))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)

            // The footer lives inside the placeholder card too, so an
            // uncached (server) audio still shows its sender + timestamp +
            // delivery state before the download completes.
            if let (model, actions) = audioFooter {
                Divider()
                    .background(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06))
                BubbleFooter(model: model, actions: actions, style: .row, isDark: isDark)
                    .equatable()
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(isDark ? accent.opacity(0.15) : accent.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(accent.opacity(isDark ? 0.25 : 0.15), lineWidth: 1)
                )
        )
    }

    private func waveformPlaceholder(accent: Color) -> some View {
        HStack(spacing: 2) {
            ForEach(0..<25, id: \.self) { i in
                let seed = Double(i * 7 + 3)
                let h = CGFloat(max(6, min(22, 8.0 + sin(seed) * 5 + cos(seed * 0.5) * 4)))
                RoundedRectangle(cornerRadius: 2)
                    .fill(accent.opacity(0.2))
                    .frame(width: 2, height: h)
            }
        }
        .frame(height: 26)
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func audioDurationBadge(seconds: TimeInterval) -> some View {
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
            .onDisappear {
                withTransaction(Transaction(animation: nil)) {
                    barHeight = minHeight
                }
            }
            .onChange(of: isRecording) { _, recording in
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
