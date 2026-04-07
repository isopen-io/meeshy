import SwiftUI
import AVFoundation
import MeeshySDK

// MARK: - Story Voice Recorder

/// Recording component for stories.
/// Uses injected AudioRecordingProviding for actual recording logic.
/// Hold-to-record or tap-to-toggle. Large controls at the bottom.
public struct StoryVoiceRecorder<Recorder: AudioRecordingProviding>: View {
    public var onRecordComplete: (URL) -> Void

    @ObservedObject private var recorder: Recorder
    @State private var wavePhase: CGFloat = 0
    @State private var phaseTimer: Timer?
    @State private var errorMessage: String?

    private let maxDuration: TimeInterval = 60

    public init(recorder: Recorder, onRecordComplete: @escaping (URL) -> Void) {
        self.recorder = recorder
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

            Spacer()

            waveformView
                .frame(height: 56)
                .padding(.horizontal, 20)
                .opacity(recorder.isRecording ? 1 : 0.3)

            Text(recorder.isRecording
                 ? String(format: "%.1fs / 60s", recorder.duration)
                 : String(localized: "story.voiceRecorder.holdToRecord", defaultValue: "Appuyez pour enregistrer", bundle: .module))
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundColor(recorder.isRecording ? Color(hex: "FF2E63") : .white.opacity(0.5))

            Spacer()

            // Controls always at the bottom
            HStack(spacing: 32) {
                if recorder.isRecording {
                    // Cancel
                    Button {
                        recorder.cancelRecording()
                        stopPhaseTimer()
                        HapticFeedback.light()
                    } label: {
                        ZStack {
                            Circle()
                                .fill(Color.white.opacity(0.08))
                                .frame(width: 50, height: 50)
                            Image(systemName: "xmark")
                                .font(.system(size: 18, weight: .medium))
                                .foregroundColor(.white.opacity(0.7))
                        }
                    }
                }

                recordButton

                if recorder.isRecording {
                    // Spacer for symmetry
                    Circle()
                        .fill(Color.clear)
                        .frame(width: 50, height: 50)
                }
            }
            .padding(.bottom, 16)
        }
        .padding(.vertical, 16)
        .onDisappear {
            stopPhaseTimer()
        }
    }

    // MARK: - Waveform

    private var waveformView: some View {
        HStack(spacing: 3) {
            ForEach(0..<15, id: \.self) { i in
                let level: CGFloat = i < recorder.audioLevels.count ? recorder.audioLevels[i] : 0
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(Color(hex: "FF2E63").opacity(recorder.isRecording ? 0.9 : 0.4))
                    .frame(width: 5, height: recorder.isRecording ? max(6, 6 + 40 * level) : 6)
                    .animation(.spring(response: 0.08, dampingFraction: 0.6), value: level)
            }
        }
    }

    // MARK: - Record Button

    private var recordButton: some View {
        ZStack {
            Circle()
                .fill(recorder.isRecording ? Color(hex: "FF2E63") : Color.white.opacity(0.12))
                .frame(width: 72, height: 72)
                .scaleEffect(recorder.isRecording ? 1.1 : 1.0)
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: recorder.isRecording)

            Image(systemName: recorder.isRecording ? "stop.fill" : "mic.fill")
                .font(.system(size: 26, weight: .semibold))
                .foregroundColor(.white)
        }
        .shadow(color: recorder.isRecording ? Color(hex: "FF2E63").opacity(0.5) : .clear, radius: 16)
        .onTapGesture {
            if recorder.isRecording {
                stopRecording()
            } else {
                startRecording()
            }
        }
        .accessibilityLabel(recorder.isRecording
            ? String(localized: "story.voiceRecorder.stop", defaultValue: "Arr\u{00EA}ter l'enregistrement", bundle: .module)
            : String(localized: "story.voiceRecorder.start", defaultValue: "Enregistrer", bundle: .module))
    }

    // MARK: - Recording Logic

    private func startRecording() {
        guard !recorder.isRecording else { return }

        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
                guard granted else {
                    errorMessage = String(localized: "audio.recorder.micDenied", defaultValue: "Permission micro refus\u{00E9}e", bundle: .module)
                    return
                }
                errorMessage = nil
                recorder.startRecording()
                HapticFeedback.medium()

                phaseTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
                    Task { @MainActor in
                        if recorder.duration >= maxDuration {
                            stopRecording()
                        }
                    }
                }
            }
        }
    }

    private func stopRecording() {
        guard recorder.isRecording else { return }
        guard let url = recorder.stopRecording() else { return }
        stopPhaseTimer()
        HapticFeedback.success()

        if recorder.duration > 0.5 || true {
            onRecordComplete(url)
        }
    }

    private func stopPhaseTimer() {
        phaseTimer?.invalidate()
        phaseTimer = nil
    }
}

// MARK: - Backward-compatible convenience init (uses DefaultSDKAudioRecorder)

extension StoryVoiceRecorder where Recorder == DefaultSDKAudioRecorder {
    public init(onRecordComplete: @escaping (URL) -> Void) {
        self.init(recorder: DefaultSDKAudioRecorder(), onRecordComplete: onRecordComplete)
    }
}
