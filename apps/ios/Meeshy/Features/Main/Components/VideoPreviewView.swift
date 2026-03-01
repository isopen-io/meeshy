import SwiftUI
import AVKit
import Speech
import MeeshyUI

// MARK: - Transcription State

private enum TranscriptionState {
    case idle, loading, done, failed
}

// MARK: - Center Play/Pause Flash

private struct PlayPauseFlash: View {
    let isPlaying: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(.black.opacity(0.4))
                .frame(width: 72, height: 72)
            Circle()
                .stroke(.white.opacity(0.12), lineWidth: 1)
                .frame(width: 72, height: 72)
            Image(systemName: isPlaying ? "play.fill" : "pause.fill")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(.white)
                .offset(x: isPlaying ? 2 : 0) // optical centering for play icon
        }
    }
}

// MARK: - Video Preview View

struct VideoPreviewView: View {
    let url: URL
    let onAccept: () -> Void
    @Environment(\.dismiss) private var dismiss

    // Player state
    @State private var player: AVPlayer?
    @State private var timeObserver: Any?
    @State private var loopObserver: NSObjectProtocol?
    @State private var isPlaying = true
    @State private var isMuted = false
    @State private var currentTime: Double = 0
    @State private var totalDuration: Double = 1
    @State private var durationText = "0:00"

    // Controls visibility
    @State private var controlsVisible = true
    @State private var hideTask: Task<Void, Never>?

    // Transcription
    @State private var transcriptionState: TranscriptionState = .idle
    @State private var transcription: String = ""
    @State private var showTranscription = false
    @State private var recognitionTask: SFSpeechRecognitionTask?

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.ignoresSafeArea()

            // Video — native transport controls suppressed
            if let player {
                VideoPlayer(player: player)
                    .ignoresSafeArea()
                    .disabled(true)
            }

            // Tap capture layer
            Color.clear
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { handleTap() }

            // Bottom gradient scrim
            LinearGradient(
                colors: [.clear, .black.opacity(0.9)],
                startPoint: UnitPoint(x: 0.5, y: 0.3),
                endPoint: .bottom
            )
            .ignoresSafeArea()
            .allowsHitTesting(false)

            if controlsVisible {
                controlsOverlay
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: controlsVisible)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: showTranscription)
        .onAppear { setup() }
        .onDisappear { teardown() }
    }

    // MARK: - Controls Overlay

    private var controlsOverlay: some View {
        ZStack(alignment: .bottom) {
            // Center indicator
            PlayPauseFlash(isPlaying: isPlaying)

            // Top bar
            VStack {
                topBar
                Spacer()
            }
            .ignoresSafeArea(edges: .top)

            // Bottom stack
            VStack(spacing: 0) {
                if showTranscription {
                    transcriptionPanel
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                scrubber
                    .padding(.horizontal, 20)
                    .padding(.bottom, 10)
                actions
                    .padding(.horizontal, 18)
                    .padding(.bottom, 36)
            }
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack(spacing: 10) {
            // Dismiss
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(.black.opacity(0.55), in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.1), lineWidth: 0.5))
            }

            Spacer()

            // Duration
            Text(durationText)
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundStyle(.white.opacity(0.85))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(.black.opacity(0.55), in: Capsule())

            // Mute
            Button {
                isMuted.toggle()
                player?.isMuted = isMuted
                HapticFeedback.light()
                rescheduleHide()
            } label: {
                Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(isMuted ? Color(hex: "08D9D6") : .white)
                    .frame(width: 38, height: 38)
                    .background(
                        isMuted
                            ? Color(hex: "08D9D6").opacity(0.18)
                            : Color.black.opacity(0.55),
                        in: Circle()
                    )
                    .overlay(Circle().stroke(.white.opacity(0.1), lineWidth: 0.5))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 52)
        .padding(.bottom, 10)
    }

    // MARK: - Scrubber

    private var scrubber: some View {
        VStack(spacing: 5) {
            GeometryReader { geo in
                let progress = totalDuration > 0 ? min(1, max(0, currentTime / totalDuration)) : 0
                let w = geo.size.width

                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.2)).frame(height: 3)

                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: "FF2E63"), Color(hex: "08D9D6")],
                                startPoint: .leading,
                                endPoint: UnitPoint(x: progress, y: 0.5)
                            )
                        )
                        .frame(width: w * progress, height: 3)

                    Circle()
                        .fill(.white)
                        .frame(width: 14, height: 14)
                        .shadow(color: Color(hex: "FF2E63").opacity(0.5), radius: 4)
                        .offset(x: w * progress - 7)
                }
                .frame(height: 22, alignment: .center)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { val in
                            let pct = max(0, min(1, val.location.x / w))
                            currentTime = pct * totalDuration
                            player?.seek(to: CMTime(seconds: currentTime, preferredTimescale: 600))
                            rescheduleHide()
                        }
                )
            }
            .frame(height: 22)

            HStack {
                Text(formatTime(currentTime))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.45))
                Spacer()
                Text(durationText)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.45))
            }
        }
    }

    // MARK: - Transcription Panel

    private var transcriptionPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                Circle()
                    .fill(Color(hex: "08D9D6").opacity(0.2))
                    .frame(width: 26, height: 26)
                    .overlay(
                        Image(systemName: "waveform")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Color(hex: "08D9D6"))
                    )
                Text("Transcription")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
                Button { withAnimation { showTranscription = false } } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white.opacity(0.4))
                        .frame(width: 24, height: 24)
                }
            }

            Rectangle().fill(.white.opacity(0.08)).frame(height: 0.5)

            switch transcriptionState {
            case .idle:
                EmptyView()
            case .loading:
                HStack(spacing: 10) {
                    ProgressView()
                        .tint(Color(hex: "08D9D6"))
                        .scaleEffect(0.85)
                    Text("Analyse de l'audio…")
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.55))
                }
                .padding(.vertical, 2)
            case .done:
                ScrollView(.vertical, showsIndicators: false) {
                    Text(transcription.isEmpty ? "Aucun audio détecté." : transcription)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(.white.opacity(0.88))
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 110)
            case .failed:
                HStack(spacing: 7) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(Color(hex: "FF453A"))
                    Text("Transcription indisponible.")
                        .font(.system(size: 13))
                        .foregroundStyle(Color(hex: "FF453A").opacity(0.9))
                }
            }
        }
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color(hex: "08D9D6").opacity(0.15), lineWidth: 0.5)
                )
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    // MARK: - Actions

    private var actions: some View {
        HStack(spacing: 10) {
            // Transcription button
            Button { handleTranscriptionTap() } label: {
                HStack(spacing: 7) {
                    if case .loading = transcriptionState {
                        ProgressView()
                            .tint(Color(hex: "08D9D6"))
                            .scaleEffect(0.72)
                    } else {
                        Image(systemName: transcriptionIcon)
                            .font(.system(size: 13, weight: .semibold))
                    }
                    Text(transcriptionLabel)
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundStyle(transcriptionAccentColor)
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                .background {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(.black.opacity(0.5))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(transcriptionAccentColor.opacity(0.25), lineWidth: 0.5)
                        )
                }
            }
            .disabled(isTranscribing)

            // Accept
            Button {
                onAccept()
                HapticFeedback.success()
                dismiss()
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                    Text("Utiliser")
                        .font(.system(size: 15, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .shadow(color: Color(hex: "FF2E63").opacity(0.45), radius: 10, y: 4)
                }
            }
        }
    }

    // MARK: - Computed

    private var isTranscribing: Bool {
        if case .loading = transcriptionState { return true }
        return false
    }

    private var transcriptionAccentColor: Color {
        switch transcriptionState {
        case .failed: return Color(hex: "FF453A")
        default: return Color(hex: "08D9D6")
        }
    }

    private var transcriptionIcon: String {
        switch transcriptionState {
        case .idle:    return "waveform"
        case .loading: return "waveform"
        case .done:    return showTranscription ? "eye.slash" : "eye"
        case .failed:  return "arrow.clockwise"
        }
    }

    private var transcriptionLabel: String {
        switch transcriptionState {
        case .idle:    return "Transcrire"
        case .loading: return "…"
        case .done:    return showTranscription ? "Masquer" : "Voir"
        case .failed:  return "Réessayer"
        }
    }

    // MARK: - Player setup

    private func setup() {
        let avPlayer = AVPlayer(url: url)
        player = avPlayer
        avPlayer.isMuted = isMuted
        avPlayer.play()
        loadTotalDuration()
        addTimeObserver(avPlayer)
        addLoopObserver(avPlayer)
        scheduleHide()
    }

    private func teardown() {
        hideTask?.cancel()
        recognitionTask?.cancel()
        if let obs = timeObserver { player?.removeTimeObserver(obs) }
        if let obs = loopObserver { NotificationCenter.default.removeObserver(obs) }
        player?.pause()
        player = nil
    }

    private func addTimeObserver(_ avPlayer: AVPlayer) {
        let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
        timeObserver = avPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { time in
            currentTime = time.seconds
        }
    }

    private func addLoopObserver(_ avPlayer: AVPlayer) {
        loopObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: avPlayer.currentItem,
            queue: .main
        ) { _ in
            avPlayer.seek(to: .zero)
            avPlayer.play()
        }
    }

    private func loadTotalDuration() {
        Task {
            let asset = AVURLAsset(url: url)
            if let dur = try? await asset.load(.duration) {
                let s = CMTimeGetSeconds(dur)
                await MainActor.run {
                    totalDuration = max(1, s)
                    durationText = formatTime(s)
                }
            }
        }
    }

    // MARK: - Interaction

    private func handleTap() {
        if isPlaying {
            player?.pause()
            isPlaying = false
            hideTask?.cancel()
            withAnimation { controlsVisible = true }
        } else {
            player?.play()
            isPlaying = true
            scheduleHide()
            withAnimation { controlsVisible = true }
        }
        HapticFeedback.light()
    }

    private func scheduleHide() {
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(2.5))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                withAnimation(.easeInOut(duration: 0.2)) {
                    controlsVisible = false
                }
            }
        }
    }

    private func rescheduleHide() {
        scheduleHide()
    }

    // MARK: - Transcription (Apple Speech framework)

    private func handleTranscriptionTap() {
        switch transcriptionState {
        case .idle, .failed: startTranscription()
        case .done: withAnimation { showTranscription.toggle() }
        case .loading: break
        }
        rescheduleHide()
    }

    private func startTranscription() {
        transcriptionState = .loading
        withAnimation { showTranscription = true }

        Task {
            // 1. Request authorization
            let status = await withCheckedContinuation { (continuation: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
                SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
            }
            guard status == .authorized else {
                await MainActor.run { transcriptionState = .failed }
                return
            }

            // 2. Build recognizer
            guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
                await MainActor.run { transcriptionState = .failed }
                return
            }

            // 3. Run recognition task
            let request = SFSpeechURLRecognitionRequest(url: url)
            request.shouldReportPartialResults = false

            do {
                let text = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
                    var resumed = false
                    let task = recognizer.recognitionTask(with: request) { result, error in
                        guard !resumed else { return }
                        if let error {
                            resumed = true
                            continuation.resume(throwing: error)
                        } else if let result, result.isFinal {
                            resumed = true
                            continuation.resume(returning: result.bestTranscription.formattedString)
                        }
                    }
                    recognitionTask = task
                }
                await MainActor.run {
                    transcription = text
                    transcriptionState = .done
                }
            } catch {
                await MainActor.run { transcriptionState = .failed }
            }
        }
    }

    // MARK: - Helpers

    private func formatTime(_ s: Double) -> String {
        let seconds = max(0, s)
        let m = Int(seconds) / 60
        let sec = Int(seconds) % 60
        return String(format: "%d:%02d", m, sec)
    }
}
