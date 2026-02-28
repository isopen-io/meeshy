import SwiftUI
import AVFoundation
import Speech
import MeeshySDK

// MARK: - Timed Word Segment

private struct TimedSegment: Identifiable {
    let id: Int
    let word: String
    let start: TimeInterval
    let end: TimeInterval
}

// MARK: - Story Audio Editor View

/// Éditeur audio plein écran pour les stories.
/// Affiche la waveform interactive, les contrôles de lecture et la transcription mot-par-mot synchronisée.
/// Réutilisable depuis StoryAudioPanel (onglet Enregistrer) ou tout autre contexte audio story.
public struct StoryAudioEditorView: View {

    let url: URL
    var onConfirm: (URL, [StoryVoiceTranscription]) -> Void
    var onDismiss: () -> Void

    // MARK: - Player

    @State private var player: AVPlayer?
    @State private var timeObserver: Any?
    @State private var endObserver: NSObjectProtocol?
    @State private var currentTime: Double = 0
    @State private var totalDuration: Double = 1
    @State private var isPlaying = false
    @State private var playbackRate: Float = 1.0
    private let rates: [Float] = [0.75, 1.0, 1.25, 1.5, 2.0]

    // MARK: - Waveform

    @StateObject private var analyzer = AudioWaveformAnalyzer()
    @State private var isDragging = false
    @State private var dragProgress: Double = 0

    // MARK: - Transcription

    private enum TxState { case idle, loading, done, failed }
    @State private var txState: TxState = .idle
    @State private var segments: [TimedSegment] = []
    @State private var fullText: String = ""
    @State private var recognitionTask: SFSpeechRecognitionTask?

    // MARK: -

    public init(url: URL,
                onConfirm: @escaping (URL, [StoryVoiceTranscription]) -> Void,
                onDismiss: @escaping () -> Void) {
        self.url = url
        self.onConfirm = onConfirm
        self.onDismiss = onDismiss
    }

    // MARK: - Body

    public var body: some View {
        ZStack {
            backgroundGradient

            VStack(spacing: 0) {
                header
                    .padding(.top, 12)
                    .padding(.bottom, 20)

                waveformSection

                Spacer(minLength: 16)

                controls
                    .padding(.vertical, 12)

                transcriptionPanel
                    .padding(.bottom, 8)

                Spacer(minLength: 0)

                ctaButton
                    .padding(.horizontal, 20)
                    .padding(.bottom, 34)
            }
        }
        .onAppear { setupPlayer() }
        .onDisappear { teardown() }
        .statusBarHidden()
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        ZStack {
            Color(hex: "08080F").ignoresSafeArea()
            LinearGradient(
                colors: [Color(hex: "FF2E63").opacity(0.04), Color.clear, Color(hex: "08D9D6").opacity(0.03)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button { teardown(); onDismiss() } label: {
                ZStack {
                    Circle().fill(Color.white.opacity(0.07)).frame(width: 38, height: 38)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white.opacity(0.75))
                }
            }
            .buttonStyle(.plain)

            Spacer()

            VStack(spacing: 3) {
                Text("Éditeur audio")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                Text(shortFilename)
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.32))
                    .lineLimit(1)
            }

            Spacer()

            // Balance (invisible)
            Circle().fill(Color.clear).frame(width: 38, height: 38)
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Waveform

    private var waveformSection: some View {
        VStack(spacing: 8) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    waveformBars(geo: geo)
                    playhead(geo: geo)
                }
                .contentShape(Rectangle())
                .gesture(scrubGesture(geo: geo))
            }
            .frame(height: 90)
            .padding(.horizontal, 20)

            HStack {
                Text(formatTime(currentTime))
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundColor(Color(hex: "FF2E63"))
                Spacer()
                Text(formatTime(totalDuration))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.white.opacity(0.28))
            }
            .padding(.horizontal, 24)
        }
    }

    @ViewBuilder
    private func waveformBars(geo: GeometryProxy) -> some View {
        let samples = analyzer.samples.isEmpty
            ? Array(repeating: Float(0.22), count: 80)
            : analyzer.samples
        let n = samples.count
        let gap: CGFloat = 2
        let barW = (geo.size.width - gap * CGFloat(n - 1)) / CGFloat(n)
        let progress = isDragging ? dragProgress : liveProgress

        HStack(alignment: .center, spacing: gap) {
            ForEach(0..<n, id: \.self) { i in
                let barProg = Double(i) / Double(n)
                let sample = CGFloat(samples[i])
                let maxH = geo.size.height * 0.92
                let h = max(3, sample * maxH)
                let played = barProg < progress

                RoundedRectangle(cornerRadius: 1.5)
                    .fill(played ? Color(hex: "FF2E63") : Color.white.opacity(0.12))
                    .frame(width: barW, height: h)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }

    private func playhead(geo: GeometryProxy) -> some View {
        let progress = isDragging ? dragProgress : liveProgress
        let x = CGFloat(progress) * geo.size.width
        return ZStack(alignment: .top) {
            Rectangle()
                .fill(Color.white)
                .frame(width: 2, height: geo.size.height)
            Circle()
                .fill(Color.white)
                .frame(width: 10, height: 10)
                .offset(y: -4)
        }
        .offset(x: x - 1)
        .shadow(color: .white.opacity(0.6), radius: 5)
        .animation(isDragging ? nil : .linear(duration: 0.05), value: progress)
    }

    private func scrubGesture(geo: GeometryProxy) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { v in
                isDragging = true
                dragProgress = max(0, min(1, v.location.x / geo.size.width))
                player?.pause()
            }
            .onEnded { v in
                let p = max(0, min(1, v.location.x / geo.size.width))
                let t = p * totalDuration
                player?.seek(to: CMTime(seconds: t, preferredTimescale: 600))
                currentTime = t
                isDragging = false
                if isPlaying { player?.play() }
            }
    }

    // MARK: - Controls

    private var controls: some View {
        VStack(spacing: 16) {
            // Play/Pause + skip
            HStack(spacing: 36) {
                Button { skip(by: -5) } label: {
                    Image(systemName: "gobackward.5")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(.white.opacity(0.65))
                }
                .buttonStyle(.plain)

                Button { togglePlay() } label: {
                    ZStack {
                        Circle()
                            .fill(LinearGradient(
                                colors: [Color(hex: "FF2E63"), Color(hex: "C02080")],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            ))
                            .frame(width: 64, height: 64)
                            .shadow(color: Color(hex: "FF2E63").opacity(0.45), radius: 16)
                        Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 25, weight: .semibold))
                            .foregroundColor(.white)
                            .offset(x: isPlaying ? 0 : 2)
                    }
                    .scaleEffect(isPlaying ? 1.0 : 0.94)
                    .animation(.spring(response: 0.2, dampingFraction: 0.65), value: isPlaying)
                }
                .buttonStyle(.plain)

                Button { skip(by: 5) } label: {
                    Image(systemName: "goforward.5")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(.white.opacity(0.65))
                }
                .buttonStyle(.plain)
            }

            // Speed selector
            HStack(spacing: 5) {
                ForEach(rates, id: \.self) { r in
                    Button {
                        playbackRate = r
                        if isPlaying { player?.rate = r }
                        HapticFeedback.light()
                    } label: {
                        Text(rateLabel(r))
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundColor(playbackRate == r ? Color(hex: "08D9D6") : .white.opacity(0.33))
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(
                                RoundedRectangle(cornerRadius: 7)
                                    .fill(playbackRate == r ? Color(hex: "08D9D6").opacity(0.1) : Color.clear)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 7)
                                            .strokeBorder(
                                                playbackRate == r
                                                    ? Color(hex: "08D9D6").opacity(0.35)
                                                    : Color.white.opacity(0.07),
                                                lineWidth: 1
                                            )
                                    )
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Transcription Panel

    private var transcriptionPanel: some View {
        VStack(spacing: 0) {
            txHeader
                .padding(.horizontal, 20)
                .padding(.bottom, 8)

            txBody
                .frame(maxWidth: .infinity)
                .frame(height: 108)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.white.opacity(0.04))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .strokeBorder(Color.white.opacity(0.07), lineWidth: 1)
                        )
                )
                .padding(.horizontal, 20)
        }
    }

    private var txHeader: some View {
        HStack(spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: "waveform.and.mic")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "08D9D6"))
                Text("Transcription")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
            }
            Spacer()
            if txState != .loading {
                Button { startTranscription() } label: {
                    HStack(spacing: 4) {
                        Image(systemName: txState == .idle ? "waveform" : "arrow.clockwise")
                            .font(.system(size: 11, weight: .medium))
                        Text(txState == .idle ? "Transcrire" : "Retranscrire")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(Color(hex: "08D9D6"))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        Capsule()
                            .fill(Color(hex: "08D9D6").opacity(0.07))
                            .overlay(Capsule().strokeBorder(Color(hex: "08D9D6").opacity(0.2), lineWidth: 1))
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private var txBody: some View {
        switch txState {
        case .idle:
            VStack(spacing: 8) {
                Image(systemName: "text.bubble")
                    .font(.system(size: 22))
                    .foregroundColor(.white.opacity(0.15))
                Text("Appuyez sur « Transcrire »")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.25))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .loading:
            VStack(spacing: 10) {
                ProgressView().tint(Color(hex: "08D9D6"))
                Text("Transcription en cours…")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.38))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .done:
            ScrollView(.vertical, showsIndicators: false) {
                Text(highlightedText)
                    .font(.system(size: 13))
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
            }

        case .failed:
            VStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(Color(hex: "FF2E63").opacity(0.55))
                Text("Transcription impossible")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.3))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // Texte avec le mot courant surligné en rose, synchronisé à la lecture
    private var highlightedText: AttributedString {
        var result = AttributedString(fullText)
        result.foregroundColor = Color.white.opacity(0.7)
        if let current = segments.first(where: { currentTime >= $0.start && currentTime < $0.end }),
           let range = result.range(of: current.word) {
            result[range].foregroundColor = Color(hex: "FF2E63")
            result[range].font = .system(size: 13, weight: .semibold)
        }
        return result
    }

    // MARK: - CTA Button

    private var ctaButton: some View {
        Button {
            let tx: [StoryVoiceTranscription] = fullText.isEmpty ? [] : [
                StoryVoiceTranscription(language: localeId, content: fullText)
            ]
            teardown()
            onConfirm(url, tx)
        } label: {
            Text("Utiliser cet enregistrement")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(
                    LinearGradient(
                        colors: [Color(hex: "FF2E63"), Color(hex: "08D9D6")],
                        startPoint: .leading, endPoint: .trailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .shadow(color: Color(hex: "FF2E63").opacity(0.3), radius: 14)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Setup / Teardown

    private func setupPlayer() {
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        player = p

        Task {
            guard let dur = try? await item.asset.load(.duration), dur.isNumeric else { return }
            await MainActor.run { totalDuration = max(1, dur.seconds) }
        }

        let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
        timeObserver = p.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [self] t in
            guard !isDragging else { return }
            currentTime = t.seconds
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: item, queue: .main
        ) { _ in
            player?.seek(to: .zero)
            isPlaying = false
        }

        if let data = try? Data(contentsOf: url) {
            analyzer.analyze(data: data, barCount: 100)
        }
    }

    private func teardown() {
        if let obs = timeObserver, let p = player { p.removeTimeObserver(obs) }
        timeObserver = nil
        if let obs = endObserver { NotificationCenter.default.removeObserver(obs) }
        endObserver = nil
        player?.pause()
        player = nil
        recognitionTask?.cancel()
        recognitionTask = nil
    }

    // MARK: - Playback Actions

    private func togglePlay() {
        guard let p = player else { return }
        if isPlaying {
            p.pause()
            isPlaying = false
        } else {
            if currentTime >= totalDuration - 0.05 { p.seek(to: .zero) }
            p.rate = playbackRate
            p.play()
            isPlaying = true
        }
        HapticFeedback.light()
    }

    private func skip(by secs: Double) {
        let t = max(0, min(totalDuration, currentTime + secs))
        player?.seek(to: CMTime(seconds: t, preferredTimescale: 600))
        currentTime = t
    }

    // MARK: - Transcription

    private func startTranscription() {
        txState = .loading
        recognitionTask?.cancel()
        recognitionTask = nil
        Task {
            let auth = await withCheckedContinuation { cont in
                SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0) }
            }
            guard auth == .authorized else {
                await MainActor.run { txState = .failed }
                return
            }
            let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer()
            guard let recognizer, recognizer.isAvailable else {
                await MainActor.run { txState = .failed }
                return
            }
            let request = SFSpeechURLRecognitionRequest(url: url)
            request.shouldReportPartialResults = false
            do {
                let result: SFSpeechRecognitionResult = try await withCheckedThrowingContinuation { cont in
                    var done = false
                    recognitionTask = recognizer.recognitionTask(with: request) { res, err in
                        guard !done else { return }
                        if let err { done = true; cont.resume(throwing: err) }
                        else if let res, res.isFinal { done = true; cont.resume(returning: res) }
                    }
                }
                let segs = result.bestTranscription.segments.enumerated().map { (i, s) in
                    TimedSegment(id: i, word: s.substring, start: s.timestamp, end: s.timestamp + s.duration)
                }
                await MainActor.run {
                    segments = segs
                    fullText = result.bestTranscription.formattedString
                    txState = .done
                }
            } catch {
                await MainActor.run { txState = .failed }
            }
        }
    }

    // MARK: - Helpers

    private var liveProgress: Double {
        totalDuration > 0 ? currentTime / totalDuration : 0
    }

    private var shortFilename: String {
        url.deletingPathExtension().lastPathComponent
            .replacingOccurrences(of: "story_voice_", with: "rec_")
            .prefix(24).description
    }

    private var localeId: String {
        SFSpeechRecognizer(locale: Locale.current)?.locale.identifier ?? "fr-FR"
    }

    private func formatTime(_ t: Double) -> String {
        let s = max(0, t)
        return String(format: "%d:%02d", Int(s) / 60, Int(s) % 60)
    }

    private func rateLabel(_ r: Float) -> String {
        r == 1.0 ? "1×" : String(format: "%.2g×", r)
    }
}
