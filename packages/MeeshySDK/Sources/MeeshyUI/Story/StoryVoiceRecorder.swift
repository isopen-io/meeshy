import SwiftUI
import AVFoundation
import MeeshySDK

// MARK: - Story Voice Recorder

/// Composant d'enregistrement vocal pour une story.
/// Maintien du bouton → enregistre. Relâcher → confirme.
/// Le fichier audio est sauvegardé localement et son URL retournée.
public struct StoryVoiceRecorder: View {
    public var onRecordComplete: (URL) -> Void

    @State private var isRecording = false
    @State private var recordingDuration: TimeInterval = 0
    @State private var recorder: AVAudioRecorder?
    @State private var durationTimer: Timer?
    @State private var wavePhase: CGFloat = 0
    @State private var waveTimer: Timer?
    @State private var errorMessage: String?

    private let maxDuration: TimeInterval = 60

    public init(onRecordComplete: @escaping (URL) -> Void) {
        self.onRecordComplete = onRecordComplete
    }

    public var body: some View {
        VStack(spacing: 20) {
            if let error = errorMessage {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "FF2E63"))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
            }

            waveformView
                .frame(height: 48)
                .padding(.horizontal, 20)
                .opacity(isRecording ? 1 : 0.3)

            Text(isRecording
                 ? String(format: "%.1fs / 60s", recordingDuration)
                 : "Maintenir pour enregistrer")
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundColor(isRecording ? Color(hex: "FF2E63") : .white.opacity(0.5))

            recordButton
        }
        .padding(.vertical, 16)
    }

    // MARK: - Waveform

    private var waveformView: some View {
        GeometryReader { geo in
            HStack(spacing: 3) {
                ForEach(0..<30, id: \.self) { i in
                    let phase = wavePhase + CGFloat(i) * 0.4
                    let height = isRecording
                        ? max(4, (sin(phase) * 0.5 + 0.5) * 36 + CGFloat.random(in: 0...8))
                        : 4
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(hex: "FF2E63").opacity(isRecording ? 0.9 : 0.4))
                        .frame(width: (geo.size.width - 87) / 30, height: height)
                        .animation(.easeInOut(duration: 0.08), value: height)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
    }

    // MARK: - Record Button

    private var recordButton: some View {
        ZStack {
            Circle()
                .fill(isRecording ? Color(hex: "FF2E63") : Color.white.opacity(0.12))
                .frame(width: 72, height: 72)
                .scaleEffect(isRecording ? 1.1 : 1.0)
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isRecording)

            Image(systemName: isRecording ? "stop.fill" : "mic.fill")
                .font(.system(size: 26, weight: .semibold))
                .foregroundColor(.white)
        }
        .shadow(color: isRecording ? Color(hex: "FF2E63").opacity(0.5) : .clear, radius: 16)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if !isRecording { startRecording() }
                }
                .onEnded { _ in
                    if isRecording { stopRecording() }
                }
        )
        .accessibilityLabel(isRecording ? "Arrêter l'enregistrement" : "Maintenir pour enregistrer")
    }

    // MARK: - Recording Logic

    private func startRecording() {
        guard !isRecording else { return }

        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
                guard granted else {
                    errorMessage = "Permission micro refusée"
                    return
                }
                beginRecording()
            }
        }
    }

    private func beginRecording() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.record, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            errorMessage = "Impossible d'activer le micro"
            return
        }

        let filename = "story_voice_\(UUID().uuidString).m4a"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder?.record()
            isRecording = true
            recordingDuration = 0
            errorMessage = nil
            HapticFeedback.medium()

            durationTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [self] _ in
                Task { @MainActor in
                    recordingDuration += 0.1
                    if recordingDuration >= maxDuration { stopRecording() }
                }
            }
            waveTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [self] _ in
                Task { @MainActor in wavePhase += 0.15 }
            }
        } catch {
            errorMessage = "Erreur lors de l'enregistrement"
        }
    }

    private func stopRecording() {
        guard isRecording, let recorder else { return }
        recorder.stop()
        self.recorder = nil
        durationTimer?.invalidate()
        durationTimer = nil
        waveTimer?.invalidate()
        waveTimer = nil
        isRecording = false
        HapticFeedback.success()

        let url = recorder.url
        if recordingDuration > 0.5 {
            onRecordComplete(url)
        }
        recordingDuration = 0
        wavePhase = 0
    }
}
