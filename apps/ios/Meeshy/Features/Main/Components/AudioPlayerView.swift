import SwiftUI
import AVFoundation
import Combine
import MeeshySDK

// ============================================================================
// MARK: - Enhanced Audio Player Manager
// ============================================================================

@MainActor
class AudioPlaybackManager: ObservableObject {
    @Published var isPlaying = false
    @Published var progress: Double = 0 // 0–1
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var speed: PlaybackSpeed = .x1_0
    @Published var isLoading = false

    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var loadTask: Task<Void, Never>?

    // MARK: - Play from remote URL (through cache)
    func play(urlString: String) {
        stop()
        guard !urlString.isEmpty else { return }
        isLoading = true

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch { }

        loadTask = Task {
            do {
                let data = try await MediaCacheManager.shared.data(for: urlString)
                guard !Task.isCancelled else { return }
                playData(data)
            } catch {
                isLoading = false
            }
        }
    }

    // MARK: - Play from local file
    func playLocal(url: URL) {
        stop()
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
            player?.enableRate = true
            player?.rate = Float(speed.rawValue)
            player?.prepareToPlay()
            duration = player?.duration ?? 0
            player?.play()
            isPlaying = true
            isLoading = false
            startProgressTimer()
        } catch {
            isLoading = false
        }
    }

    // MARK: - Controls
    func stop() {
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

    func togglePlayPause() {
        guard let player = player else { return }
        if player.isPlaying {
            player.pause()
            isPlaying = false
            timer?.invalidate()
        } else {
            player.rate = Float(speed.rawValue)
            player.play()
            isPlaying = true
            startProgressTimer()
        }
    }

    func seek(to fraction: Double) {
        guard let player = player else { return }
        let target = fraction * player.duration
        player.currentTime = target
        currentTime = target
        progress = fraction
    }

    func seekToTime(_ time: Double) {
        guard let player = player, player.duration > 0 else { return }
        let fraction = time / player.duration
        seek(to: min(1, max(0, fraction)))
    }

    func cycleSpeed() {
        speed = speed.next()
        player?.rate = Float(speed.rawValue)
        HapticFeedback.light()
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
                    if self.progress >= 1.0 { self.stop() }
                }
            }
        }
    }

    deinit {
        timer?.invalidate()
        loadTask?.cancel()
    }
}

// ============================================================================
// MARK: - Audio Player View
// ============================================================================
///
/// Reusable audio player that adapts to context:
///  - `.messageBubble` — Compact waveform, play/pause, speed, optional transcription
///  - `.composerAttachment` — Editable, with delete, edit, generate transcription
///  - `.feedPost` — Full width, language selector, social actions
///  - `.storyOverlay` — Dark style, minimal chrome
///  - `.fullscreen` — All controls expanded
///
struct AudioPlayerView: View {
    let attachment: MessageAttachment
    let context: MediaPlayerContext

    // Theme / accent
    var accentColor: String = "08D9D6"

    // Transcription (if available)
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []

    // Actions
    var onRequestTranscription: (() -> Void)? = nil
    var onDelete: (() -> Void)? = nil
    var onEdit: (() -> Void)? = nil

    // State
    @StateObject private var player = AudioPlaybackManager()
    @ObservedObject private var theme = ThemeManager.shared
    @State private var showTranscription = false
    @State private var selectedAudioLanguage: String = "orig"

    private var isDark: Bool { theme.mode.isDark || context.isImmersive }
    private var accent: Color { Color(hex: accentColor) }

    private var displaySegments: [TranscriptionDisplaySegment] {
        guard let t = transcription else { return [] }
        return TranscriptionDisplaySegment.buildFrom(t)
    }

    private var estimatedDuration: TimeInterval {
        if player.duration > 0 { return player.duration }
        return Double(attachment.duration ?? 0) / 1000.0
    }

    // MARK: - Body
    var body: some View {
        VStack(spacing: 0) {
            mainPlayer

            // Transcription panel (expandable)
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

            // Language selector row (for feed / fullscreen with translated audios)
            if !translatedAudios.isEmpty && !context.isCompact {
                languageSelector
                    .padding(.top, 6)
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showTranscription)
    }

    // MARK: - Main Player
    private var mainPlayer: some View {
        HStack(spacing: context.isCompact ? 8 : 10) {
            // Play/Pause
            playButton

            // Waveform + time
            VStack(alignment: .leading, spacing: context.isCompact ? 3 : 4) {
                waveformProgress
                timeRow
            }

            // Speed control (tap to cycle)
            speedButton

            // Transcription button
            transcriptionButton

            // Context-specific trailing actions
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
                .onChanged { value in
                    // Scrub
                }
        )
    }

    // MARK: - Time Row
    private var timeRow: some View {
        HStack {
            Text(formatMediaDuration(player.currentTime))
                .font(.system(size: context.isCompact ? 9 : 10, weight: .semibold, design: .monospaced))
                .foregroundColor(isDark ? .white.opacity(0.5) : .black.opacity(0.4))

            Spacer()

            Text(formatMediaDuration(estimatedDuration))
                .font(.system(size: context.isCompact ? 9 : 10, weight: .semibold, design: .monospaced))
                .foregroundColor(isDark ? .white.opacity(0.3) : .black.opacity(0.25))
        }
    }

    // MARK: - Speed Button
    private var speedButton: some View {
        Button { player.cycleSpeed() } label: {
            Text(player.speed.label)
                .font(.system(size: context.isCompact ? 10 : 11, weight: .heavy, design: .monospaced))
                .foregroundColor(player.speed == .x1_0
                    ? (isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                    : accent)
                .padding(.horizontal, 5)
                .padding(.vertical, 3)
                .background(
                    RoundedRectangle(cornerRadius: 5)
                        .fill(player.speed == .x1_0
                              ? (isDark ? Color.white.opacity(0.07) : Color.black.opacity(0.04))
                              : accent.opacity(0.12))
                )
        }
    }

    // MARK: - Transcription Button
    @ViewBuilder
    private var transcriptionButton: some View {
        if transcription != nil || onRequestTranscription != nil {
            Button {
                if transcription != nil {
                    withAnimation { showTranscription.toggle() }
                } else {
                    onRequestTranscription?()
                }
                HapticFeedback.light()
            } label: {
                Image(systemName: transcription != nil
                      ? (showTranscription ? "text.badge.checkmark" : "text.bubble")
                      : "text.badge.plus")
                    .font(.system(size: context.isCompact ? 13 : 14, weight: .medium))
                    .foregroundColor(showTranscription ? accent : (isDark ? .white.opacity(0.45) : .black.opacity(0.35)))
                    .frame(width: context.isCompact ? 26 : 30, height: context.isCompact ? 26 : 30)
            }
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
                audioLanguagePill(flag: "🔊", code: "orig", label: "Original",
                                  isSelected: selectedAudioLanguage == "orig")

                ForEach(translatedAudios, id: \.id) { audio in
                    let lang = LanguageOption.defaults.first(where: { $0.code == audio.targetLanguage })
                    audioLanguagePill(
                        flag: lang?.flag ?? "🌐",
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
            // Switch audio source if needed
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
