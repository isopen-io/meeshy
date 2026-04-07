import SwiftUI
import AVFoundation
import MeeshySDK

public struct VoiceRecordingView<Recorder: AudioRecordingProviding>: View {
    let accentColor: String
    let minimumSamples: Int
    let minimumDurationSeconds: Int
    let onSamplesReady: (([Data]) -> Void)?

    @ObservedObject private var recorder: Recorder
    @State private var recordedSamples: [RecordedSample] = []

    public init(recorder: Recorder, accentColor: String = "A855F7", minimumSamples: Int = 3,
                minimumDurationSeconds: Int = 10, onSamplesReady: (([Data]) -> Void)? = nil) {
        self.recorder = recorder
        self.accentColor = accentColor
        self.minimumSamples = minimumSamples
        self.minimumDurationSeconds = minimumDurationSeconds
        self.onSamplesReady = onSamplesReady
    }

    private let sampleTexts = [
        "Bonjour, je m'appelle et j'utilise Meeshy pour communiquer avec mes amis dans le monde entier.",
        "La traduction vocale en temps reel permet de briser les barrieres linguistiques facilement.",
        "J'aime partager des moments importants avec les personnes qui comptent pour moi.",
        "La technologie nous rapproche les uns des autres, peu importe la distance.",
        "Chaque jour est une nouvelle opportunite de decouvrir et d'apprendre quelque chose de nouveau.",
    ]

    public var body: some View {
        VStack(spacing: 16) {
            sampleTextCard

            samplesList

            Spacer()

            // Controls always at the bottom
            recordingControls

            if recordedSamples.count >= minimumSamples {
                submitButton
            }
        }
        .padding(.horizontal, 20)
    }

    // MARK: - Sample Text

    private var sampleTextCard: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: "text.quote")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
                Text(String(localized: "voiceProfile.recording.readAloud", defaultValue: "Lisez ce texte a voix haute", bundle: .module))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(recordedSamples.count + 1)/\(minimumSamples)")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(Color(hex: accentColor))
            }

            Text(sampleTexts[min(recordedSamples.count, sampleTexts.count - 1)])
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.primary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(hex: accentColor).opacity(0.06))
                )
        }
    }

    // MARK: - Recording Controls

    private var recordingControls: some View {
        VStack(spacing: 12) {
            if recorder.isRecording {
                waveformIndicator
            }

            HStack(spacing: 20) {
                if recorder.isRecording {
                    Text(formattedDuration(recorder.duration))
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(Color(hex: "FF6B6B"))

                    Spacer()
                }

                Button {
                    if recorder.isRecording {
                        stopRecording()
                    } else {
                        startRecording()
                    }
                } label: {
                    ZStack {
                        Circle()
                            .fill(recorder.isRecording ? Color(hex: "FF6B6B") : Color(hex: accentColor))
                            .frame(width: 64, height: 64)
                            .shadow(color: (recorder.isRecording ? Color(hex: "FF6B6B") : Color(hex: accentColor)).opacity(0.3), radius: 8, y: 2)

                        Image(systemName: recorder.isRecording ? "stop.fill" : "mic.fill")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(.white)
                    }
                }

                if recorder.isRecording {
                    Spacer()

                    Text("min \(minimumDurationSeconds)s")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Waveform

    private var waveformIndicator: some View {
        HStack(spacing: 3) {
            ForEach(0..<15, id: \.self) { i in
                let level: CGFloat = i < recorder.audioLevels.count ? recorder.audioLevels[i] : 0
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color(hex: accentColor).opacity(0.6))
                    .frame(width: 4, height: max(8, 8 + 30 * level))
                    .animation(.spring(response: 0.08, dampingFraction: 0.6), value: level)
            }
        }
        .frame(height: 38)
    }

    // MARK: - Samples List

    private var samplesList: some View {
        VStack(spacing: 6) {
            ForEach(Array(recordedSamples.enumerated()), id: \.element.id) { index, sample in
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(Color(hex: "2ECC71"))

                    Text("Echantillon \(index + 1)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.primary)

                    Spacer()

                    Text(formattedDuration(sample.duration))
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(.secondary)

                    Button {
                        recordedSamples.remove(at: index)
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundColor(Color(hex: "FF6B6B").opacity(0.7))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(.systemBackground))
                )
            }
        }
    }

    // MARK: - Submit

    private var submitButton: some View {
        Button {
            let data = recordedSamples.compactMap { $0.data }
            onSamplesReady?(data)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "arrow.right.circle.fill")
                    .font(.system(size: 16, weight: .semibold))
                Text(String(localized: "voiceProfile.recording.createProfile", defaultValue: "Creer le profil vocal", bundle: .module))
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(hex: accentColor))
            )
        }
    }

    // MARK: - Helpers

    private func startRecording() {
        recorder.startRecording()
    }

    private func stopRecording() {
        let capturedDuration = recorder.duration
        guard let url = recorder.stopRecording() else { return }
        guard capturedDuration >= Double(minimumDurationSeconds) else { return }
        let data = try? Data(contentsOf: url)
        recordedSamples.append(RecordedSample(duration: capturedDuration, data: data, url: url))
    }

    private func formattedDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Backward-compatible convenience init

extension VoiceRecordingView where Recorder == DefaultSDKAudioRecorder {
    public init(accentColor: String = "A855F7", minimumSamples: Int = 3,
                minimumDurationSeconds: Int = 10, onSamplesReady: (([Data]) -> Void)? = nil) {
        self.init(
            recorder: DefaultSDKAudioRecorder(),
            accentColor: accentColor,
            minimumSamples: minimumSamples,
            minimumDurationSeconds: minimumDurationSeconds,
            onSamplesReady: onSamplesReady
        )
    }
}

// MARK: - Recorded Sample

struct RecordedSample: Identifiable {
    let id = UUID()
    let duration: TimeInterval
    let data: Data?
    let url: URL?
}
