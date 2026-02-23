import SwiftUI
import AVFoundation
import Combine
import MeeshySDK

// MARK: - Attachment Status Body

private struct AttachmentStatusBody: Encodable {
    let action: String
    let playPositionMs: Int
    let durationMs: Int
    let complete: Bool
}

// MARK: - Audio Playback Manager

@MainActor
public class AudioPlaybackManager: NSObject, ObservableObject {
    @Published public var isPlaying = false
    @Published public var progress: Double = 0
    @Published public var currentTime: TimeInterval = 0
    @Published public var duration: TimeInterval = 0
    @Published public var speed: PlaybackSpeed = .x1_0
    @Published public var isLoading = false

    public var onPlaybackFinished: (() -> Void)?
    public var attachmentId: String?

    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var loadTask: Task<Void, Never>?
    private(set) var currentUrl: String?
    private var listenStartTime: Date?

    public override init() {
        super.init()
        PlaybackCoordinator.shared.register(self)
    }

    // MARK: - Play from remote URL (through cache)
    public func play(urlString: String) {
        PlaybackCoordinator.shared.willStartPlaying(audio: self)
        resetState()
        guard !urlString.isEmpty else { return }
        currentUrl = urlString
        isLoading = true

        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch { }

        loadTask = Task {
            do {
                let data = try await MediaCacheManager.shared.data(for: resolved)
                guard !Task.isCancelled else { return }
                playData(data)
            } catch {
                isLoading = false
            }
        }
    }

    // MARK: - Play from local file
    public func playLocal(url: URL) {
        PlaybackCoordinator.shared.willStartPlaying(audio: self)
        resetState()
        currentUrl = url.absoluteString
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
            let data = try Data(contentsOf: url)
            playData(data)
        } catch { }
    }

    private func playData(_ data: Data) {
        do {
            player = try AVAudioPlayer(data: data)
            player?.delegate = self
            player?.enableRate = true
            player?.rate = Float(speed.rawValue)
            player?.prepareToPlay()
            duration = player?.duration ?? 0
            player?.play()
            isPlaying = true
            isLoading = false
            listenStartTime = Date()
            startProgressTimer()
        } catch {
            isLoading = false
        }
    }

    // MARK: - Controls
    private func resetState() {
        player?.stop()
        player = nil
        timer?.invalidate()
        timer = nil
        isPlaying = false
        progress = 0
        currentTime = 0
        loadTask?.cancel()
        loadTask = nil
    }

    public func stop() {
        resetState()
        currentUrl = nil
    }

    public func togglePlayPause() {
        guard let player = player else { return }
        if player.isPlaying {
            player.pause()
            isPlaying = false
            timer?.invalidate()
            reportListenProgress(complete: false)
        } else {
            PlaybackCoordinator.shared.willStartPlaying(audio: self)
            player.rate = Float(speed.rawValue)
            player.play()
            isPlaying = true
            listenStartTime = listenStartTime ?? Date()
            startProgressTimer()
        }
    }

    public func seek(to fraction: Double) {
        guard let player = player else { return }
        let target = fraction * player.duration
        player.currentTime = target
        currentTime = target
        progress = fraction
    }

    public func seekToTime(_ time: Double) {
        guard let player = player, player.duration > 0 else { return }
        let fraction = time / player.duration
        seek(to: min(1, max(0, fraction)))
    }

    public func cycleSpeed() {
        speed = speed.next()
        player?.rate = Float(speed.rawValue)
        HapticFeedback.light()
    }

    // MARK: - Playback Finished (called by delegate)
    private func handlePlaybackFinished() {
        let finishedUrl = currentUrl
        reportListenProgress(complete: true)
        timer?.invalidate()
        timer = nil
        player = nil
        isPlaying = false
        progress = 0
        currentTime = 0
        listenStartTime = nil
        onPlaybackFinished?()
        if let url = finishedUrl {
            Self.triggerAutoplayNext(afterUrl: url)
        }
        currentUrl = nil
    }

    // MARK: - Listen Progress Reporting
    private func reportListenProgress(complete: Bool) {
        guard let attId = attachmentId else { return }
        let positionMs = Int(currentTime * 1000)
        let durationMs: Int = {
            guard let start = listenStartTime else { return 0 }
            return Int(Date().timeIntervalSince(start) * 1000)
        }()

        Task {
            let body = AttachmentStatusBody(
                action: "listened",
                playPositionMs: positionMs,
                durationMs: durationMs,
                complete: complete
            )
            let _: APIResponse<[String: String]> = try await APIClient.shared.post(
                endpoint: "/attachments/\(attId)/status",
                body: body
            )
        }
    }

    // MARK: - Timer
    private func startProgressTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self, let player = self.player else { return }
                if player.isPlaying {
                    self.currentTime = player.currentTime
                    self.progress = player.duration > 0 ? player.currentTime / player.duration : 0
                }
            }
        }
    }

    deinit {
        timer?.invalidate()
        loadTask?.cancel()
    }

    @MainActor func unregisterFromCoordinator() {
        PlaybackCoordinator.shared.unregister(self)
    }

    // MARK: - Autoplay Registry (static)
    private static var autoplayRegistry: [(url: String, play: () -> Void)] = []

    public static func registerAutoplay(url: String, play: @escaping () -> Void) {
        autoplayRegistry.removeAll { $0.url == url }
        autoplayRegistry.append((url: url, play: play))
    }

    public static func unregisterAutoplay(url: String) {
        autoplayRegistry.removeAll { $0.url == url }
    }

    private static func triggerAutoplayNext(afterUrl: String) {
        guard let idx = autoplayRegistry.firstIndex(where: { $0.url == afterUrl }) else { return }
        let next = idx + 1
        guard next < autoplayRegistry.count else { return }
        autoplayRegistry[next].play()
    }
}

// MARK: - AVAudioPlayerDelegate
extension AudioPlaybackManager: AVAudioPlayerDelegate {
    nonisolated public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.handlePlaybackFinished()
        }
    }
}

// MARK: - Audio Player View

public struct AudioPlayerView: View {
    public let attachment: MeeshyMessageAttachment
    public let context: MediaPlayerContext

    public var accentColor: String = "08D9D6"
    public var transcription: MessageTranscription? = nil
    public var translatedAudios: [MessageTranslatedAudio] = []

    public var onRequestTranscription: (() -> Void)? = nil
    public var onDelete: (() -> Void)? = nil
    public var onEdit: (() -> Void)? = nil
    public var onPlayingChange: ((Bool) -> Void)? = nil

    @StateObject private var player = AudioPlaybackManager()
    @ObservedObject private var theme = ThemeManager.shared
    @State private var showTranscription = true
    @State private var selectedAudioLanguage: String = "orig"

    private var isDark: Bool { theme.mode.isDark || context.isImmersive }
    private var accent: Color { Color(hex: accentColor) }

    private var displaySegments: [TranscriptionDisplaySegment] {
        guard let t = transcription else { return [] }
        return TranscriptionDisplaySegment.buildFrom(t)
    }

    private var estimatedDuration: TimeInterval {
        let metadata = Double(attachment.duration ?? 0) / 1000.0
        if metadata > 0 { return metadata }
        return player.duration
    }

    public init(attachment: MeeshyMessageAttachment, context: MediaPlayerContext,
                accentColor: String = "08D9D6", transcription: MessageTranscription? = nil,
                translatedAudios: [MessageTranslatedAudio] = [],
                onRequestTranscription: (() -> Void)? = nil,
                onDelete: (() -> Void)? = nil, onEdit: (() -> Void)? = nil,
                onPlayingChange: ((Bool) -> Void)? = nil) {
        self.attachment = attachment; self.context = context; self.accentColor = accentColor
        self.transcription = transcription; self.translatedAudios = translatedAudios
        self.onRequestTranscription = onRequestTranscription
        self.onDelete = onDelete; self.onEdit = onEdit
        self.onPlayingChange = onPlayingChange
    }

    // MARK: - Body
    public var body: some View {
        VStack(spacing: 0) {
            mainPlayer

            if showTranscription, !displaySegments.isEmpty {
                MediaTranscriptionView(
                    segments: displaySegments,
                    currentTime: player.currentTime,
                    accentColor: accentColor,
                    maxHeight: context.isCompact ? 150 : 250,
                    onSeek: { time in player.seekToTime(time) }
                )
                .padding(.top, 4)
                .padding(.horizontal, context.isCompact ? 0 : 4)
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            transcriptionRequestButton

            if !translatedAudios.isEmpty && !context.isCompact {
                languageSelector
                    .padding(.top, 6)
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showTranscription)
        .onAppear {
            player.attachmentId = attachment.id
            AudioPlaybackManager.registerAutoplay(url: attachment.fileUrl) { [player] in
                player.play(urlString: attachment.fileUrl)
            }
        }
        .onDisappear {
            AudioPlaybackManager.unregisterAutoplay(url: attachment.fileUrl)
            player.unregisterFromCoordinator()
        }
        .onChange(of: player.isPlaying) { playing in
            onPlayingChange?(playing)
        }
    }

    // MARK: - Main Player
    private var mainPlayer: some View {
        HStack(spacing: context.isCompact ? 8 : 10) {
            playButton
            VStack(alignment: .leading, spacing: context.isCompact ? 3 : 4) {
                waveformProgress
                timeRow
            }
            percentageView
            contextActions
        }
        .padding(.horizontal, context.isCompact ? 10 : 14)
        .padding(.vertical, context.isCompact ? 8 : 12)
        .background(playerBackground)
    }

    // MARK: - Play Button
    private var playButton: some View {
        Button {
            if player.isPlaying || player.progress > 0 {
                player.togglePlayPause()
            } else {
                player.play(urlString: attachment.fileUrl)
            }
            HapticFeedback.light()
        } label: {
            let size: CGFloat = context.isCompact ? 34 : 40
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [accent, accent.opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: size, height: size)
                    .shadow(color: accent.opacity(0.3), radius: 6, y: 2)

                if player.isLoading {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.6)
                } else {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: context.isCompact ? 13 : 15, weight: .bold))
                        .foregroundColor(.white)
                        .offset(x: player.isPlaying ? 0 : 1)
                }
            }
        }
    }

    // MARK: - Waveform Progress
    private var waveformProgress: some View {
        GeometryReader { geo in
            let barCount = context.isCompact ? 25 : 35
            let spacing: CGFloat = 2
            let totalSpacing = spacing * CGFloat(barCount - 1)
            let barWidth = max(2, (geo.size.width - totalSpacing) / CGFloat(barCount))

            HStack(spacing: spacing) {
                ForEach(0..<barCount, id: \.self) { i in
                    let fraction = Double(i) / Double(barCount)
                    let isPlayed = fraction <= player.progress
                    let h = waveformHeight(index: i, total: barCount)

                    RoundedRectangle(cornerRadius: 1)
                        .fill(isPlayed ? accent : (isDark ? Color.white.opacity(0.18) : Color.black.opacity(0.1)))
                        .frame(width: barWidth, height: h)
                }
            }
            .frame(height: 22, alignment: .center)
        }
        .frame(height: 22)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in }
        )
    }

    // MARK: - Time Row
    private var timeRow: some View {
        HStack(spacing: 0) {
            Text(formatMediaDuration(player.currentTime))
                .font(.system(size: context.isCompact ? 9 : 10, weight: .semibold, design: .monospaced))
                .foregroundColor(isDark ? .white.opacity(0.5) : .black.opacity(0.4))

            Button { player.cycleSpeed() } label: {
                Text(player.speed.label)
                    .font(.system(size: context.isCompact ? 9 : 10, weight: .bold, design: .monospaced))
                    .foregroundColor(player.speed == .x1_0
                        ? (isDark ? .white.opacity(0.35) : .black.opacity(0.25))
                        : accent)
            }
            .padding(.leading, 4)

            Spacer()

            Text(formatMediaDuration(estimatedDuration))
                .font(.system(size: context.isCompact ? 9 : 10, weight: .semibold, design: .monospaced))
                .foregroundColor(isDark ? .white.opacity(0.3) : .black.opacity(0.25))
        }
    }

    // MARK: - Percentage View
    private var percentageView: some View {
        let pct = Int(player.progress * 100)
        return Text("\(pct)%")
            .font(.system(size: context.isCompact ? 10 : 12, weight: .heavy, design: .monospaced))
            .foregroundColor(pct == 0
                ? (isDark ? .white.opacity(0.35) : .black.opacity(0.25))
                : accent)
            .frame(minWidth: context.isCompact ? 32 : 38)
            .contentTransition(.numericText())
            .animation(.easeInOut(duration: 0.15), value: pct)
    }

    // MARK: - Transcription Request Button (bottom bar)
    @ViewBuilder
    private var transcriptionRequestButton: some View {
        if transcription != nil {
            Button {
                withAnimation { showTranscription.toggle() }
                HapticFeedback.light()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: showTranscription ? "text.badge.checkmark" : "text.bubble")
                        .font(.system(size: 10, weight: .medium))
                    Text(showTranscription ? "Masquer" : "Transcription")
                        .font(.system(size: 10, weight: .medium))
                }
                .foregroundColor(showTranscription ? accent : (isDark ? .white.opacity(0.45) : .black.opacity(0.35)))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(showTranscription ? accent.opacity(0.12) : (isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.03)))
                )
            }
            .padding(.top, 6)
        } else if let onRequest = onRequestTranscription {
            Button {
                onRequest()
                HapticFeedback.light()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "text.badge.plus")
                        .font(.system(size: 10, weight: .medium))
                    Text("Transcrire")
                        .font(.system(size: 10, weight: .medium))
                }
                .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.03))
                )
            }
            .padding(.top, 6)
        }
    }

    // MARK: - Context Actions
    @ViewBuilder
    private var contextActions: some View {
        if context == .composerAttachment {
            HStack(spacing: 4) {
                if let onEdit = onEdit {
                    Button { onEdit() } label: {
                        Image(systemName: "waveform.and.magnifyingglass")
                            .font(.system(size: 12))
                            .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                            .frame(width: 26, height: 26)
                    }
                }
                if let onDelete = onDelete {
                    Button { onDelete() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 15))
                            .foregroundColor(Color(hex: "FF6B6B"))
                    }
                }
            }
        }
    }

    // MARK: - Language Selector
    private var languageSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                audioLanguagePill(flag: "\u{1F50A}", code: "orig", label: "Original",
                                  isSelected: selectedAudioLanguage == "orig")

                ForEach(translatedAudios, id: \.id) { audio in
                    let lang = DetectedLanguage.find(code: audio.targetLanguage)
                    audioLanguagePill(
                        flag: lang?.flag ?? "\u{1F310}",
                        code: audio.targetLanguage,
                        label: lang?.name ?? audio.targetLanguage,
                        isSelected: selectedAudioLanguage == audio.targetLanguage
                    )
                }
            }
            .padding(.horizontal, 8)
        }
    }

    private func audioLanguagePill(flag: String, code: String, label: String, isSelected: Bool) -> some View {
        Button {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                selectedAudioLanguage = code
            }
            if code != "orig", let translated = translatedAudios.first(where: { $0.targetLanguage == code }) {
                player.play(urlString: translated.url)
            }
            HapticFeedback.light()
        } label: {
            HStack(spacing: 3) {
                Text(flag).font(.system(size: 12))
                Text(label).font(.system(size: 10, weight: isSelected ? .bold : .medium))
            }
            .foregroundColor(isSelected ? .white : (isDark ? .white.opacity(0.55) : .black.opacity(0.45)))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(isSelected ? accent : (isDark ? Color.white.opacity(0.07) : Color.black.opacity(0.04))))
        }
    }

    // MARK: - Helpers
    private var playerBackground: some View {
        RoundedRectangle(cornerRadius: context.cornerRadius)
            .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
            .overlay(
                RoundedRectangle(cornerRadius: context.cornerRadius)
                    .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05), lineWidth: 0.5)
            )
    }

    private func waveformHeight(index: Int, total: Int) -> CGFloat {
        let seed = Double(index * 7 + 3)
        let base = 4.0 + sin(seed) * 5 + cos(seed * 0.5) * 3.5
        return CGFloat(max(3, min(18, base)))
    }
}
