import SwiftUI
import AVFoundation
import MeeshySDK

// MARK: - Meeshy Audio Preview View

public struct MeeshyAudioPreviewView: View {
    let url: URL
    let context: MediaPreviewContext
    let accentColor: String
    let onAccept: (URL, [StoryVoiceTranscription], TimeInterval, TimeInterval) -> Void
    let onCancel: (() -> Void)?

    @Environment(\.dismiss) private var dismiss

    @State private var player: AVPlayer?
    @State private var timeObserver: Any?
    @State private var endObserver: NSObjectProtocol?
    @State private var isPlaying = false
    @State private var currentTime: Double = 0
    @State private var totalDuration: Double = 1
    @State private var showEditor = false

    @StateObject private var analyzer = AudioWaveformAnalyzer()

    // Stored from editor callback
    @State private var editedTranscriptions: [StoryVoiceTranscription] = []
    @State private var editedTrimStart: TimeInterval = 0
    @State private var editedTrimEnd: TimeInterval = 0
    @State private var hasBeenEdited = false

    private var accentGradient: LinearGradient {
        LinearGradient(
            colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.85)],
            startPoint: .leading, endPoint: .trailing
        )
    }

    public init(
        url: URL,
        context: MediaPreviewContext,
        accentColor: String = MeeshyColors.brandPrimaryHex,
        onAccept: @escaping (URL, [StoryVoiceTranscription], TimeInterval, TimeInterval) -> Void,
        onCancel: (() -> Void)? = nil
    ) {
        self.url = url
        self.context = context
        self.accentColor = accentColor
        self.onAccept = onAccept
        self.onCancel = onCancel
    }

    public var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                navigationBar
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                Spacer()

                contextPreview

                Spacer()

                bottomActions
                    .padding(.horizontal, 20)
                    .padding(.bottom, 34)
            }
        }
        .onAppear { setup() }
        .onDisappear { teardown() }
        .fullScreenCover(isPresented: $showEditor) {
            MeeshyAudioEditorView(
                url: url,
                accentColor: accentColor,
                onConfirm: { editedURL, transcriptions, trimStart, trimEnd in
                    editedTranscriptions = transcriptions
                    editedTrimStart = trimStart
                    editedTrimEnd = trimEnd
                    hasBeenEdited = true
                    showEditor = false
                },
                onDismiss: {
                    showEditor = false
                },
                onCancel: {
                    showEditor = false
                }
            )
        }
    }

    // MARK: - Navigation Bar

    private var navigationBar: some View {
        HStack {
            Button {
                onCancel?()
                dismiss()
            } label: {
                Text(String(localized: "media.audio.cancel", defaultValue: "Annuler", bundle: .module))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(.white.opacity(0.2)))
            }

            Spacer()

            HStack(spacing: 6) {
                Image(systemName: context.contextIcon)
                    .font(.system(size: 12, weight: .semibold))
                Text(context.contextLabel)
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundColor(Color(hex: accentColor))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(Color(hex: accentColor).opacity(0.15))
            )

            Spacer()

            Button {
                acceptAudio()
            } label: {
                Text("OK")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(
                        Capsule()
                            .fill(accentGradient)
                    )
            }
        }
    }

    // MARK: - Context Preview

    @ViewBuilder
    private var contextPreview: some View {
        switch context {
        case .story:
            storyAudioPreview

        case .post:
            postAudioPreview
                .padding(.horizontal, 16)

        case .message:
            messageAudioPreview

        case .avatar, .banner:
            storyAudioPreview
        }
    }

    private var storyAudioPreview: some View {
        VStack(spacing: 24) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: accentColor).opacity(0.3), Color(hex: accentColor).opacity(0.1)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 120, height: 120)

                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundColor(.white)
                    .offset(x: isPlaying ? 0 : 2)
            }
            .onTapGesture { togglePlay() }

            waveformView
                .frame(height: 60)
                .padding(.horizontal, 40)

            Text(formatTime(currentTime) + " / " + formatTime(totalDuration))
                .font(.system(size: 14, weight: .medium, design: .monospaced))
                .foregroundColor(.white.opacity(0.6))
        }
    }

    private var postAudioPreview: some View {
        HStack(spacing: 14) {
            Button { togglePlay() } label: {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.85)],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 48, height: 48)
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                        .offset(x: isPlaying ? 0 : 2)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                waveformView
                    .frame(height: 32)

                Text(formatTime(currentTime) + " / " + formatTime(totalDuration))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.white.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(.white.opacity(0.1), lineWidth: 0.5)
                )
        )
    }

    private var messageAudioPreview: some View {
        HStack(spacing: 10) {
            Button { togglePlay() } label: {
                ZStack {
                    Circle()
                        .fill(Color(hex: accentColor))
                        .frame(width: 36, height: 36)
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .offset(x: isPlaying ? 0 : 1)
                }
            }

            waveformView
                .frame(height: 24)
                .frame(maxWidth: 160)

            Text(formatTime(currentTime))
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.white.opacity(0.4))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(.white.opacity(0.08))
        )
    }

    private var waveformView: some View {
        GeometryReader { geo in
            let samples = analyzer.samples.isEmpty
                ? Array(repeating: Float(0.2), count: 40)
                : analyzer.samples
            let n = samples.count
            let gap: CGFloat = 2
            let barW = max(1, (geo.size.width - gap * CGFloat(n - 1)) / CGFloat(n))
            let progress = totalDuration > 0 ? currentTime / totalDuration : 0

            HStack(alignment: .center, spacing: gap) {
                ForEach(0..<n, id: \.self) { i in
                    let p = Double(i) / Double(n)
                    let h = max(3, CGFloat(samples[i]) * geo.size.height * 0.9)
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(p < progress ? Color(hex: accentColor) : Color.white.opacity(0.22))
                        .frame(width: barW, height: h)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
    }

    // MARK: - Bottom Actions

    private var bottomActions: some View {
        HStack(spacing: 16) {
            Button {
                showEditor = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "pencil")
                        .font(.system(size: 14, weight: .semibold))
                    Text(String(localized: "media.audio.edit", defaultValue: "\u{00C9}diter", bundle: .module))
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(.white.opacity(0.12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(.white.opacity(0.15), lineWidth: 0.5)
                        )
                )
            }

            Button {
                acceptAudio()
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                    Text(String(localized: "media.audio.use", defaultValue: "Utiliser", bundle: .module))
                        .font(.system(size: 15, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(accentGradient)
                        .shadow(color: Color(hex: accentColor).opacity(0.45), radius: 10, y: 4)
                )
            }
        }
    }

    // MARK: - Player

    private func setup() {
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        player = p

        Task {
            guard let dur = try? await item.asset.load(.duration), dur.isNumeric else { return }
            let d = max(1, dur.seconds)
            await MainActor.run {
                totalDuration = d
                editedTrimEnd = d
            }
        }

        let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
        timeObserver = p.addPeriodicTimeObserver(forInterval: interval, queue: .main) { t in
            Task { @MainActor in currentTime = t.seconds }
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: item, queue: .main
        ) { _ in
            p.seek(to: .zero)
            Task { @MainActor in isPlaying = false }
        }

        Task.detached(priority: .userInitiated) {
            if let data = try? Data(contentsOf: url) {
                await analyzer.analyze(data: data, barCount: 60)
            }
        }
    }

    private func teardown() {
        if let obs = timeObserver, let p = player { p.removeTimeObserver(obs) }
        timeObserver = nil
        if let obs = endObserver { NotificationCenter.default.removeObserver(obs) }
        endObserver = nil
        player?.pause()
        player = nil
    }

    private func togglePlay() {
        guard let p = player else { return }
        if isPlaying {
            p.pause()
            isPlaying = false
        } else {
            p.play()
            isPlaying = true
        }
        HapticFeedback.light()
    }

    private func acceptAudio() {
        let trimStart = hasBeenEdited ? editedTrimStart : 0
        let trimEnd = hasBeenEdited ? editedTrimEnd : totalDuration
        onAccept(url, editedTranscriptions, trimStart, trimEnd)
        HapticFeedback.success()
        dismiss()
    }

    private func formatTime(_ t: Double) -> String {
        let s = max(0, t)
        return String(format: "%d:%02d", Int(s) / 60, Int(s) % 60)
    }
}
