import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Audio Post Composer

struct AudioPostComposerView: View {
    let onPublish: (URL, String, MobileTranscriptionPayload?) -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var audioRecorder = AudioRecorderManager()
    @State private var transcription: OnDeviceTranscription?
    @State private var isTranscribing = false
    @State private var transcriptionError: String?
    @State private var recordedURL: URL?
    @State private var recordedDuration: TimeInterval = 0
    @State private var phase: ComposerPhase = .idle
    @Environment(\.dismiss) private var dismiss

    // MARK: - Phase

    private enum ComposerPhase {
        case idle
        case recording
        case transcribing
        case preview
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                VStack(spacing: 32) {
                    Spacer()

                    recordingSection

                    if let error = transcriptionError {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundColor(MeeshyColors.error)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }

                    if phase == .preview, let transcription {
                        transcriptionPreview(transcription)
                    }

                    Spacer()

                    actionBar
                }
                .padding(.bottom, 32)
            }
            .navigationTitle(String(localized: "Post audio", defaultValue: "Post audio"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(String(localized: "Annuler", defaultValue: "Annuler")) {
                        audioRecorder.cancelRecording()
                        dismiss()
                    }
                    .foregroundColor(theme.textSecondary)
                }
            }
        }
    }

    // MARK: - Recording Section

    private var recordingSection: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [MeeshyColors.error.opacity(0.15), MeeshyColors.error.opacity(0.05)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 140, height: 140)

                if audioRecorder.isRecording {
                    WaveformView(levels: audioRecorder.audioLevels)
                        .frame(width: 100, height: 60)
                } else if phase == .transcribing {
                    ProgressView()
                        .tint(MeeshyColors.error)
                        .scaleEffect(1.4)
                } else {
                    Image(systemName: phase == .preview ? "checkmark.circle.fill" : "mic.fill")
                        .font(.system(size: 48))
                        .foregroundColor(
                            phase == .preview
                                ? MeeshyColors.success
                                : MeeshyColors.error
                        )
                }
            }

            if audioRecorder.isRecording || phase == .preview {
                Text(formattedDuration)
                    .font(.system(size: 32, weight: .light, design: .monospaced))
                    .foregroundColor(theme.textPrimary)
            } else if phase == .transcribing {
                Text(String(localized: "Transcription en cours...", defaultValue: "Transcription en cours..."))
                    .font(.system(size: 15))
                    .foregroundColor(theme.textSecondary)
            } else {
                Text(String(localized: "Appuyez pour enregistrer", defaultValue: "Appuyez pour enregistrer"))
                    .font(.system(size: 15))
                    .foregroundColor(theme.textSecondary)
            }
        }
    }

    // MARK: - Transcription Preview

    private func transcriptionPreview(_ t: OnDeviceTranscription) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "text.bubble.fill")
                    .font(.system(size: 13))
                    .foregroundColor(MeeshyColors.indigo300)
                Text(String(localized: "Transcription", defaultValue: "Transcription"))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo300)
                Spacer()
                Text(t.language)
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
            }

            Text(t.text.isEmpty
                 ? String(localized: "Aucune transcription disponible.", defaultValue: "Aucune transcription disponible.")
                 : t.text)
                .font(.system(size: 15))
                .foregroundColor(theme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: "A5B4FC"))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(MeeshyColors.indigo300.opacity(0.25), lineWidth: 1)
                )
        )
        .padding(.horizontal, 24)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: - Action Bar

    private var actionBar: some View {
        HStack(spacing: 24) {
            if phase == .preview {
                Button(action: resetToIdle) {
                    Label(
                        String(localized: "Refaire", defaultValue: "Refaire"),
                        systemImage: "arrow.counterclockwise"
                    )
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                }

                Spacer()

                Button(action: publish) {
                    Text(String(localized: "Publier", defaultValue: "Publier"))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 32)
                        .padding(.vertical, 14)
                        .background(
                            Capsule()
                                .fill(MeeshyColors.brandGradient)
                                .shadow(color: MeeshyColors.indigo500.opacity(0.4), radius: 12, y: 4)
                        )
                }
            } else {
                Spacer()

                Button(action: toggleRecording) {
                    ZStack {
                        Circle()
                            .fill(
                                audioRecorder.isRecording
                                    ? Color.red
                                    : MeeshyColors.error
                            )
                            .frame(width: 72, height: 72)
                            .shadow(color: MeeshyColors.error.opacity(0.5), radius: 16, y: 6)

                        if audioRecorder.isRecording {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(.white)
                                .frame(width: 24, height: 24)
                        } else {
                            Image(systemName: "mic.fill")
                                .font(.system(size: 28))
                                .foregroundColor(.white)
                        }
                    }
                }
                .accessibilityLabel(
                    audioRecorder.isRecording
                        ? String(localized: "Arreter l'enregistrement", defaultValue: "Arr\u{00EA}ter l'enregistrement")
                        : String(localized: "Demarrer l'enregistrement", defaultValue: "D\u{00E9}marrer l'enregistrement")
                )
                .disabled(phase == .transcribing)

                Spacer()
            }
        }
        .padding(.horizontal, 32)
        .animation(.spring(response: 0.4, dampingFraction: 0.75), value: phase)
    }

    // MARK: - Helpers

    private var formattedDuration: String {
        let d = audioRecorder.isRecording ? audioRecorder.duration : recordedDuration
        let minutes = Int(d) / 60
        let seconds = Int(d) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private func toggleRecording() {
        if audioRecorder.isRecording {
            stopAndTranscribe()
        } else {
            startRecording()
        }
    }

    private func startRecording() {
        transcription = nil
        transcriptionError = nil
        recordedURL = nil
        phase = .recording
        audioRecorder.startRecording()
        HapticFeedback.medium()
    }

    private func stopAndTranscribe() {
        recordedDuration = audioRecorder.duration
        guard let url = audioRecorder.stopRecording() else {
            phase = .idle
            return
        }
        recordedURL = url
        phase = .transcribing
        HapticFeedback.light()

        Task {
            do {
                let deviceLocale = Locale.current
                let result = try await EdgeTranscriptionService.shared.transcribe(
                    audioURL: url,
                    locale: deviceLocale
                )
                await MainActor.run {
                    transcription = result
                    transcriptionError = nil
                    phase = .preview
                }
            } catch {
                await MainActor.run {
                    transcriptionError = String(
                        localized: "Transcription indisponible",
                        defaultValue: "Transcription indisponible : \(error.localizedDescription)"
                    )
                    phase = .preview
                }
            }
        }
    }

    private func resetToIdle() {
        audioRecorder.cancelRecording()
        if let url = recordedURL {
            try? FileManager.default.removeItem(at: url)
        }
        recordedURL = nil
        transcription = nil
        transcriptionError = nil
        phase = .idle
    }

    private func publish() {
        guard let url = recordedURL else { return }
        let payload = transcription.map { buildPayload($0) }
        onPublish(url, "audio/mp4", payload)
    }

    private func buildPayload(_ t: OnDeviceTranscription) -> MobileTranscriptionPayload {
        let segments = t.segments.map { seg in
            MobileTranscriptionSegment(
                text: seg.text,
                start: seg.timestamp,
                end: seg.timestamp + seg.duration
            )
        }
        return MobileTranscriptionPayload(
            text: t.text,
            language: t.language,
            confidence: t.confidence,
            segments: segments
        )
    }
}

// MARK: - Waveform View

private struct WaveformView: View {
    let levels: [CGFloat]

    var body: some View {
        HStack(alignment: .center, spacing: 3) {
            ForEach(levels.indices, id: \.self) { i in
                Capsule()
                    .fill(MeeshyColors.error)
                    .frame(width: 4, height: max(4, levels[i] * 56))
                    .animation(.easeInOut(duration: 0.08), value: levels[i])
            }
        }
    }
}
