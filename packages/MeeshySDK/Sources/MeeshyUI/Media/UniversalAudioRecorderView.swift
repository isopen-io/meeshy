import SwiftUI
import AVFoundation
import MeeshySDK

// MARK: - Universal Audio Recorder View

/// Unified full-screen audio recorder for messages, stories, and posts.
/// Features:
/// - Large record button at the bottom
/// - Real-time waveform visualization
/// - Duration display with optional max limit
/// - After recording: preview with waveform + edit/accept controls at bottom
/// - Launches MeeshyAudioEditorView for trim/transcription
///
/// Usage: Present as fullScreenCover or sheet.
public struct UniversalAudioRecorderView<Recorder: AudioRecordingProviding>: View {

    let context: MediaPreviewContext
    let accentColor: String
    let settings: AudioRecordingSettings
    let onComplete: (URL, [StoryVoiceTranscription], TimeInterval, TimeInterval) -> Void
    let onCancel: () -> Void

    @ObservedObject private var recorder: Recorder
    @ObservedObject private var theme: ThemeManager = .shared

    @State private var recordedURL: URL?
    @State private var showEditor = false
    @State private var showPreview = false
    @State private var wavePhase: CGFloat = 0
    @State private var phaseTimer: Timer?

    public init(
        recorder: Recorder,
        context: MediaPreviewContext,
        accentColor: String = MeeshyColors.brandPrimaryHex,
        settings: AudioRecordingSettings = .standard,
        onComplete: @escaping (URL, [StoryVoiceTranscription], TimeInterval, TimeInterval) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.recorder = recorder
        self.context = context
        self.accentColor = accentColor
        self.settings = settings
        self.onComplete = onComplete
        self.onCancel = onCancel
    }

    public var body: some View {
        ZStack {
            background

            VStack(spacing: 0) {
                header
                    .padding(.top, 12)

                Spacer()

                centerContent

                Spacer()

                bottomControls
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
            }
        }
        .onDisappear {
            phaseTimer?.invalidate()
            phaseTimer = nil
        }
        .fullScreenCover(isPresented: $showPreview) {
            if let url = recordedURL {
                MeeshyAudioPreviewView(
                    url: url,
                    context: context,
                    accentColor: accentColor,
                    onAccept: { editedURL, transcriptions, trimStart, trimEnd in
                        showPreview = false
                        onComplete(editedURL, transcriptions, trimStart, trimEnd)
                    },
                    onCancel: {
                        showPreview = false
                        recordedURL = nil
                    }
                )
            }
        }
    }

    // MARK: - Background

    private var background: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()
            LinearGradient(
                colors: [Color(hex: accentColor).opacity(0.06), Color.clear],
                startPoint: .top, endPoint: .bottom
            ).ignoresSafeArea()
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button { onCancel() } label: {
                ZStack {
                    Circle().fill(Color.white.opacity(0.07)).frame(width: 38, height: 38)
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white.opacity(0.75))
                }
            }
            .buttonStyle(.plain)

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
                Capsule().fill(Color(hex: accentColor).opacity(0.12))
            )

            Spacer()

            Circle().fill(Color.clear).frame(width: 38, height: 38)
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Center Content

    private var centerContent: some View {
        VStack(spacing: 24) {
            if recorder.isRecording {
                liveWaveform
                    .frame(height: 80)
                    .padding(.horizontal, 32)

                durationDisplay
            } else {
                idlePrompt
            }

            if let maxDur = settings.maxDuration {
                Text("\(Int(maxDur))s max")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.3))
            }
        }
    }

    private var liveWaveform: some View {
        HStack(spacing: 3) {
            ForEach(0..<15, id: \.self) { i in
                let level: CGFloat = i < recorder.audioLevels.count ? recorder.audioLevels[i] : 0
                RoundedRectangle(cornerRadius: 3)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.6)],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
                    .frame(width: 6, height: recorder.isRecording ? 12 + 60 * level : 8)
                    .animation(.spring(response: 0.08, dampingFraction: 0.6), value: level)
            }
        }
    }

    private var durationDisplay: some View {
        VStack(spacing: 4) {
            Text(formatDuration(recorder.duration))
                .font(.system(size: 48, weight: .light, design: .monospaced))
                .foregroundColor(.white)
                .contentTransition(.numericText())

            HStack(spacing: 6) {
                Circle()
                    .fill(Color(hex: "EF4444"))
                    .frame(width: 8, height: 8)
                    .opacity(recorder.duration.truncatingRemainder(dividingBy: 1) < 0.5 ? 1 : 0.3)

                Text(String(localized: "audio.recorder.recording", defaultValue: "Enregistrement", bundle: .module))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Color(hex: "EF4444"))
            }
        }
    }

    private var idlePrompt: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Color(hex: accentColor).opacity(0.08))
                    .frame(width: 100, height: 100)
                Image(systemName: "mic.fill")
                    .font(.system(size: 36, weight: .medium))
                    .foregroundColor(Color(hex: accentColor).opacity(0.5))
            }

            Text(String(localized: "audio.recorder.tapToRecord", defaultValue: "Appuyez pour enregistrer", bundle: .module))
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.white.opacity(0.4))
        }
    }

    // MARK: - Bottom Controls (always at the bottom)

    private var bottomControls: some View {
        VStack(spacing: 20) {
            if recorder.isRecording {
                recordingControls
            } else {
                idleControls
            }
        }
    }

    private var recordingControls: some View {
        HStack(spacing: 40) {
            // Cancel
            Button {
                recorder.cancelRecording()
                HapticFeedback.light()
            } label: {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.08))
                        .frame(width: 56, height: 56)
                    Image(systemName: "trash.fill")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(Color(hex: "EF4444"))
                }
            }
            .buttonStyle(.plain)

            // Stop (large)
            Button {
                handleStopRecording()
            } label: {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: "EF4444"), Color(hex: "DC2626")],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 80, height: 80)
                        .shadow(color: Color(hex: "EF4444").opacity(0.4), radius: 16)

                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.white)
                        .frame(width: 28, height: 28)
                }
                .scaleEffect(recorder.duration.truncatingRemainder(dividingBy: 1) < 0.5 ? 1.05 : 1.0)
                .animation(.easeInOut(duration: 0.5), value: recorder.duration)
            }
            .buttonStyle(.plain)

            // Spacer for symmetry
            Circle()
                .fill(Color.clear)
                .frame(width: 56, height: 56)
        }
    }

    private var idleControls: some View {
        VStack(spacing: 16) {
            // Record button (large)
            Button {
                handleStartRecording()
            } label: {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: accentColor), Color(hex: "4338CA")],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 80, height: 80)
                        .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 16)

                    Image(systemName: "mic.fill")
                        .font(.system(size: 30, weight: .semibold))
                        .foregroundColor(.white)
                }
            }
            .buttonStyle(.plain)

            Text(String(localized: "audio.recorder.record", defaultValue: "Enregistrer", bundle: .module))
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.white.opacity(0.4))
        }
    }

    // MARK: - Actions

    private func handleStartRecording() {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
                guard granted else { return }
                recorder.startRecording()
                HapticFeedback.medium()
            }
        }
    }

    private func handleStopRecording() {
        let capturedDuration = recorder.duration
        guard let url = recorder.stopRecording() else { return }
        guard capturedDuration >= settings.minimumDuration else { return }
        recordedURL = url
        showPreview = true
        HapticFeedback.success()
    }

    // MARK: - Helpers

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
