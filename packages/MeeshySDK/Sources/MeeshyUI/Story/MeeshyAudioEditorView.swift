import SwiftUI
import AVFoundation
import Speech
import MeeshySDK

// MARK: - Private Types

private struct TimedSegment: Identifiable {
    let id: Int
    let word: String
    let start: TimeInterval
    let end: TimeInterval
}

private enum TrimSide { case start, end }
private enum TxState { case idle, loading, done, failed }

// MARK: - Meeshy Audio Editor View

/// Éditeur audio plein écran réutilisable.
/// Waveform interactive, crop/trim, transcription mot-par-mot synchronisée, sélection de langue.
/// Callback : onConfirm(URL, [StoryVoiceTranscription], trimStart, trimEnd)
public struct MeeshyAudioEditorView: View {

    let url: URL
    var onConfirm: (URL, [StoryVoiceTranscription], TimeInterval, TimeInterval) -> Void
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

    // MARK: - Trim

    @State private var trimStart: TimeInterval = 0
    @State private var trimEnd: TimeInterval = 60
    @State private var activeTrimSide: TrimSide? = nil

    // MARK: - Transcription

    @State private var txState: TxState = .idle
    @State private var segments: [TimedSegment] = []
    @State private var fullText: String = ""
    @State private var recognitionTask: SFSpeechRecognitionTask?
    @State private var selectedLocale: Locale = Locale.current
    @State private var availableLocales: [Locale] = []

    // MARK: -

    public init(url: URL,
                onConfirm: @escaping (URL, [StoryVoiceTranscription], TimeInterval, TimeInterval) -> Void,
                onDismiss: @escaping () -> Void) {
        self.url = url
        self.onConfirm = onConfirm
        self.onDismiss = onDismiss
    }

    // MARK: - Body

    public var body: some View {
        ZStack {
            background

            VStack(spacing: 0) {
                header
                    .padding(.top, 12)
                    .padding(.bottom, 16)

                waveformSection

                Spacer(minLength: 10)

                trimSection
                    .padding(.horizontal, 20)
                    .padding(.bottom, 10)

                controls
                    .padding(.vertical, 10)

                transcriptionPanel
                    .padding(.bottom, 6)

                Spacer(minLength: 0)

                ctaButton
                    .padding(.horizontal, 20)
                    .padding(.bottom, 34)
            }
        }
        .onAppear { setup() }
        .onDisappear { teardown() }
        .statusBarHidden()
    }

    // MARK: - Background

    private var background: some View {
        ZStack {
            Color(hex: "07070E").ignoresSafeArea()
            LinearGradient(
                colors: [Color(hex: "FF2E63").opacity(0.05), Color.clear, Color(hex: "08D9D6").opacity(0.04)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ).ignoresSafeArea()
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

            VStack(spacing: 2) {
                Text("Éditeur audio")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                Text(shortFilename)
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.3))
                    .lineLimit(1)
            }

            Spacer()

            Circle().fill(Color.clear).frame(width: 38, height: 38)
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Waveform Section

    private var waveformSection: some View {
        VStack(spacing: 6) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    waveformBars(geo: geo)
                    trimMarkers(geo: geo)
                    playhead(geo: geo)
                }
                .contentShape(Rectangle())
                .gesture(scrubGesture(geo: geo))
            }
            .frame(height: 82)
            .padding(.horizontal, 20)

            HStack {
                Text(formatTime(currentTime))
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundColor(Color(hex: "FF2E63"))
                Spacer()
                Text(formatTime(totalDuration))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.white.opacity(0.25))
            }
            .padding(.horizontal, 24)
        }
    }

    @ViewBuilder
    private func waveformBars(geo: GeometryProxy) -> some View {
        let samples = analyzer.samples.isEmpty
            ? Array(repeating: Float(0.2), count: 80)
            : analyzer.samples
        let n = samples.count
        let gap: CGFloat = 2
        let barW = (geo.size.width - gap * CGFloat(n - 1)) / CGFloat(n)
        let progress = isDragging ? dragProgress : liveProgress
        let tS = totalDuration > 0 ? trimStart / totalDuration : 0
        let tE = totalDuration > 0 ? trimEnd / totalDuration : 1

        HStack(alignment: .center, spacing: gap) {
            ForEach(0..<n, id: \.self) { i in
                let p = Double(i) / Double(n)
                let inTrim = p >= tS && p < tE
                let h = max(3, CGFloat(samples[i]) * geo.size.height * 0.9)
                let color: Color = !inTrim
                    ? Color.white.opacity(0.06)
                    : (p < progress ? Color(hex: "FF2E63") : Color.white.opacity(0.22))
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(color)
                    .frame(width: barW, height: h)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }

    private func trimMarkers(geo: GeometryProxy) -> some View {
        let sx = totalDuration > 0 ? CGFloat(trimStart / totalDuration) * geo.size.width : 0
        let ex = totalDuration > 0 ? CGFloat(trimEnd / totalDuration) * geo.size.width : geo.size.width
        return ZStack(alignment: .leading) {
            Rectangle().fill(Color(hex: "FF2E63").opacity(0.7)).frame(width: 2, height: geo.size.height).offset(x: sx)
            Rectangle().fill(Color(hex: "08D9D6").opacity(0.7)).frame(width: 2, height: geo.size.height).offset(x: max(0, ex - 2))
        }
    }

    private func playhead(geo: GeometryProxy) -> some View {
        let x = (isDragging ? dragProgress : liveProgress) * geo.size.width
        return ZStack(alignment: .top) {
            Rectangle().fill(Color.white).frame(width: 2, height: geo.size.height)
            Circle().fill(Color.white).frame(width: 10, height: 10).offset(y: -4)
        }
        .offset(x: CGFloat(x) - 1)
        .shadow(color: .white.opacity(0.5), radius: 5)
        .animation(isDragging ? nil : .linear(duration: 0.05), value: x)
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

    // MARK: - Trim Section

    private var trimSection: some View {
        VStack(spacing: 6) {
            GeometryReader { geo in
                let w = geo.size.width
                let sx = totalDuration > 0 ? CGFloat(trimStart / totalDuration) * w : 0
                let ex = totalDuration > 0 ? CGFloat(trimEnd / totalDuration) * w : w

                ZStack(alignment: .leading) {
                    // Track
                    Capsule()
                        .fill(Color.white.opacity(0.08))
                        .frame(height: 4)
                        .offset(y: 9)

                    // Active region
                    RoundedRectangle(cornerRadius: 2)
                        .fill(LinearGradient(
                            colors: [Color(hex: "FF2E63"), Color(hex: "08D9D6")],
                            startPoint: .leading, endPoint: .trailing
                        ))
                        .frame(width: max(0, ex - sx), height: 4)
                        .offset(x: sx, y: 9)

                    // Left handle — 44pt touch target (Apple HIG)
                    ZStack {
                        Color.clear.frame(width: 44, height: 44)
                        Rectangle().fill(Color(hex: "FF2E63")).frame(width: 3, height: 22)
                        Circle().fill(Color(hex: "FF2E63")).frame(width: 13, height: 13).offset(y: 12)
                    }
                    .contentShape(Rectangle())
                    .position(x: sx, y: 9)

                    // Right handle — 44pt touch target (Apple HIG)
                    ZStack {
                        Color.clear.frame(width: 44, height: 44)
                        Rectangle().fill(Color(hex: "08D9D6")).frame(width: 3, height: 22)
                        Circle().fill(Color(hex: "08D9D6")).frame(width: 13, height: 13).offset(y: 12)
                    }
                    .contentShape(Rectangle())
                    .position(x: ex, y: 9)
                }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { v in
                            if activeTrimSide == nil {
                                let curSx = totalDuration > 0 ? CGFloat(trimStart / totalDuration) * w : 0
                                let curEx = totalDuration > 0 ? CGFloat(trimEnd / totalDuration) * w : w
                                activeTrimSide = abs(v.location.x - curSx) <= abs(v.location.x - curEx) ? .start : .end
                            }
                            let t = max(0, min(1, v.location.x / w)) * totalDuration
                            switch activeTrimSide {
                            case .start: trimStart = min(max(0, t), trimEnd - 0.5)
                            case .end:   trimEnd   = max(min(totalDuration, t), trimStart + 0.5)
                            case nil:    break
                            }
                        }
                        .onEnded { _ in activeTrimSide = nil }
                )
            }
            .frame(height: 26)

            // Trim info row
            HStack {
                Text(formatTime(trimStart))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(Color(hex: "FF2E63").opacity(0.8))
                Spacer()
                Text("\(formatTime(trimEnd - trimStart)) sélectionné")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(.white.opacity(0.35))
                Spacer()
                Text(formatTime(trimEnd))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(Color(hex: "08D9D6").opacity(0.8))
            }
        }
    }

    // MARK: - Controls

    private var controls: some View {
        VStack(spacing: 12) {
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
                                colors: [Color(hex: "FF2E63"), Color(hex: "B5179E")],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            ))
                            .frame(width: 62, height: 62)
                            .shadow(color: Color(hex: "FF2E63").opacity(0.45), radius: 14)
                        Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundColor(.white)
                            .offset(x: isPlaying ? 0 : 2)
                    }
                    .scaleEffect(isPlaying ? 1.0 : 0.95)
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

            HStack(spacing: 5) {
                ForEach(rates, id: \.self) { r in
                    Button {
                        playbackRate = r
                        if isPlaying { player?.rate = r }
                        HapticFeedback.light()
                    } label: {
                        Text(rateLabel(r))
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundColor(playbackRate == r ? Color(hex: "08D9D6") : .white.opacity(0.32))
                            .padding(.horizontal, 9).padding(.vertical, 5)
                            .background(
                                RoundedRectangle(cornerRadius: 7)
                                    .fill(playbackRate == r ? Color(hex: "08D9D6").opacity(0.1) : Color.clear)
                                    .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(
                                        playbackRate == r ? Color(hex: "08D9D6").opacity(0.35) : Color.white.opacity(0.07),
                                        lineWidth: 1
                                    ))
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
                .frame(height: 96)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.white.opacity(0.04))
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.white.opacity(0.07), lineWidth: 1))
                )
                .padding(.horizontal, 20)
        }
    }

    private var txHeader: some View {
        HStack(spacing: 6) {
            Image(systemName: "waveform.and.mic")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color(hex: "08D9D6"))
            Text("Transcription")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white)

            Spacer()

            // Language picker — réutilise LanguageDisplay du SDK
            if !availableLocales.isEmpty {
                Menu {
                    ForEach(availableLocales, id: \.identifier) { locale in
                        Button { selectedLocale = locale } label: {
                            let display = languageDisplay(for: locale)
                            Text("\(display.flag) \(display.name)")
                        }
                    }
                } label: {
                    let display = languageDisplay(for: selectedLocale)
                    HStack(spacing: 4) {
                        Text(display.flag)
                        Text(display.name)
                            .font(.system(size: 11, weight: .medium))
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 8))
                    }
                    .foregroundColor(.white.opacity(0.65))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Capsule().fill(Color.white.opacity(0.08)))
                }
                .buttonStyle(.plain)
            }

            if txState != .loading {
                Button { startTranscription() } label: {
                    HStack(spacing: 4) {
                        Image(systemName: txState == .idle ? "waveform" : "arrow.clockwise")
                            .font(.system(size: 11, weight: .medium))
                        Text(txState == .idle ? "Transcrire" : "Retranscrire")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(Color(hex: "08D9D6"))
                    .padding(.horizontal, 10).padding(.vertical, 5)
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
                Image(systemName: "text.bubble").font(.system(size: 22)).foregroundColor(.white.opacity(0.14))
                Text("Appuyez sur « Transcrire »")
                    .font(.system(size: 12)).foregroundColor(.white.opacity(0.24))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .loading:
            VStack(spacing: 10) {
                ProgressView().tint(Color(hex: "08D9D6"))
                Text("Transcription en cours…")
                    .font(.system(size: 12)).foregroundColor(.white.opacity(0.36))
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
                    .font(.system(size: 20)).foregroundColor(Color(hex: "FF2E63").opacity(0.5))
                Text("Transcription impossible")
                    .font(.system(size: 12)).foregroundColor(.white.opacity(0.28))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var highlightedText: AttributedString {
        var result = AttributedString(fullText)
        result.foregroundColor = Color.white.opacity(0.7)
        if let cur = segments.first(where: { currentTime >= $0.start && currentTime < $0.end }),
           let range = result.range(of: cur.word) {
            result[range].foregroundColor = Color(hex: "FF2E63")
            result[range].font = .system(size: 13, weight: .semibold)
        }
        return result
    }

    // MARK: - CTA Button

    private var ctaButton: some View {
        Button {
            let tx: [StoryVoiceTranscription] = fullText.isEmpty ? [] : [
                StoryVoiceTranscription(
                    language: selectedLocale.language.languageCode?.identifier ?? "fr",
                    content: fullText
                )
            ]
            teardown()
            onConfirm(url, tx, trimStart, trimEnd)
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

    private func setup() {
        // Available locales — languages recognized by SFSpeechRecognizer that have LanguageDisplay entries
        let supported = SFSpeechRecognizer.supportedLocales()
        let sorted = supported
            .filter { loc in
                let code = loc.language.languageCode?.identifier ?? ""
                return LanguageDisplay.from(code: code) != nil
            }
            .sorted { $0.identifier < $1.identifier }
        availableLocales = sorted

        // Default to device locale if available, otherwise fr
        let deviceCode = Locale.current.language.languageCode?.identifier ?? "fr"
        selectedLocale = sorted.first { $0.language.languageCode?.identifier == deviceCode }
            ?? sorted.first { $0.language.languageCode?.identifier == "fr" }
            ?? Locale(identifier: "fr-FR")

        // Player
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        player = p

        Task {
            guard let dur = try? await item.asset.load(.duration), dur.isNumeric else { return }
            let d = max(1, dur.seconds)
            await MainActor.run {
                totalDuration = d
                trimEnd = d
            }
        }

        let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
        timeObserver = p.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [self] t in
            guard !isDragging else { return }
            currentTime = t.seconds
            // Loop within trim region
            if t.seconds >= trimEnd {
                player?.seek(to: CMTime(seconds: trimStart, preferredTimescale: 600))
            }
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: item, queue: .main
        ) { _ in
            player?.seek(to: CMTime(seconds: trimStart, preferredTimescale: 600))
            isPlaying = false
        }

        Task.detached(priority: .userInitiated) {
            if let data = try? Data(contentsOf: url) {
                await analyzer.analyze(data: data, barCount: 100)
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
        recognitionTask?.cancel()
        recognitionTask = nil
    }

    // MARK: - Playback

    private func togglePlay() {
        guard let p = player else { return }
        if isPlaying {
            p.pause(); isPlaying = false
        } else {
            if currentTime < trimStart || currentTime >= trimEnd {
                p.seek(to: CMTime(seconds: trimStart, preferredTimescale: 600))
            }
            p.rate = playbackRate; p.play(); isPlaying = true
        }
        HapticFeedback.light()
    }

    private func skip(by secs: Double) {
        let t = max(trimStart, min(trimEnd, currentTime + secs))
        player?.seek(to: CMTime(seconds: t, preferredTimescale: 600))
        currentTime = t
    }

    /// Exporte le segment audio [start, end] dans un fichier temporaire pour la transcription.
    private func exportTrimmedSegment(start: TimeInterval, end: TimeInterval) async throws -> URL {
        let asset = AVAsset(url: url)
        guard let exportSession = AVAssetExportSession(
            asset: asset, presetName: AVAssetExportPresetAppleM4A
        ) else {
            throw NSError(domain: "MeeshyAudioEditor", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Export session unavailable"])
        }
        let outURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("trim_tx_\(UUID().uuidString).m4a")
        exportSession.outputURL = outURL
        exportSession.outputFileType = .m4a
        exportSession.timeRange = CMTimeRange(
            start: CMTime(seconds: start, preferredTimescale: 600),
            end:   CMTime(seconds: end,   preferredTimescale: 600)
        )
        await exportSession.export()
        guard exportSession.status == .completed else {
            throw exportSession.error ?? NSError(domain: "MeeshyAudioEditor", code: 2,
                                                  userInfo: nil)
        }
        return outURL
    }

    // MARK: - Transcription

    private func startTranscription() {
        txState = .loading
        recognitionTask?.cancel(); recognitionTask = nil
        let locale = selectedLocale
        Task {
            let auth = await withCheckedContinuation { cont in
                SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0) }
            }
            guard auth == .authorized else { await MainActor.run { txState = .failed }; return }
            let recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer()
            guard let recognizer, recognizer.isAvailable else {
                await MainActor.run { txState = .failed }; return
            }
            // Exporter uniquement le segment trimé pour la transcription
            let transcribeURL: URL
            do {
                transcribeURL = try await exportTrimmedSegment(start: trimStart, end: trimEnd)
            } catch {
                await MainActor.run { txState = .failed }
                return
            }
            let request = SFSpeechURLRecognitionRequest(url: transcribeURL)
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

    private func formatTime(_ t: Double) -> String {
        let s = max(0, t)
        return String(format: "%d:%02d", Int(s) / 60, Int(s) % 60)
    }

    private func rateLabel(_ r: Float) -> String {
        r == 1.0 ? "1×" : String(format: "%.2g×", r)
    }

    /// Utilise LanguageDisplay du SDK pour flag + name
    private func languageDisplay(for locale: Locale) -> (flag: String, name: String) {
        let code = locale.language.languageCode?.identifier ?? ""
        if let d = LanguageDisplay.from(code: code) {
            return (d.flag, d.name)
        }
        let name = locale.localizedString(forIdentifier: locale.identifier) ?? locale.identifier
        return ("🌐", name)
    }
}
