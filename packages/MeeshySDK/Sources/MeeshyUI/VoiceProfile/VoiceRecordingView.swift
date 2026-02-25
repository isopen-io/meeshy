import SwiftUI
import AVFoundation
import MeeshySDK

public struct VoiceRecordingView: View {
    let accentColor: String
    let minimumSamples: Int
    let minimumDurationSeconds: Int
    let onSamplesReady: (([Data]) -> Void)?

    @StateObject private var recorder = VoiceSampleRecorder()
    @State private var recordedSamples: [RecordedSample] = []

    public init(accentColor: String = "A855F7", minimumSamples: Int = 3,
                minimumDurationSeconds: Int = 10, onSamplesReady: (([Data]) -> Void)? = nil) {
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

            recordingControls

            samplesList

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
                Text("Lisez ce texte a voix haute")
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
                    Text(formattedDuration(recorder.currentDuration))
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
                            .frame(width: 60, height: 60)
                            .shadow(color: (recorder.isRecording ? Color(hex: "FF6B6B") : Color(hex: accentColor)).opacity(0.3), radius: 8, y: 2)

                        Image(systemName: recorder.isRecording ? "stop.fill" : "mic.fill")
                            .font(.system(size: 22, weight: .bold))
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
            ForEach(0..<20, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(Color(hex: accentColor).opacity(0.6))
                    .frame(width: 3, height: CGFloat.random(in: 8...30))
                    .animation(.easeInOut(duration: 0.3).delay(Double(i) * 0.05).repeatForever(autoreverses: true), value: recorder.isRecording)
            }
        }
        .frame(height: 30)
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
                Text("Creer le profil vocal")
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
        guard let result = recorder.stopRecording() else { return }
        guard result.duration >= Double(minimumDurationSeconds) else { return }
        recordedSamples.append(result)
    }

    private func formattedDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Recorded Sample

struct RecordedSample: Identifiable {
    let id = UUID()
    let duration: TimeInterval
    let data: Data?
    let url: URL?
}

// MARK: - Voice Sample Recorder

@MainActor
class VoiceSampleRecorder: ObservableObject {
    @Published var isRecording = false
    @Published var currentDuration: TimeInterval = 0

    private var audioRecorder: AVAudioRecorder?
    private var recordingURL: URL?
    private var timer: Timer?
    private var startTime: Date?

    func startRecording() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
        } catch {
            return
        }

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice_sample_\(UUID().uuidString).m4a")
        recordingURL = url

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: url, settings: settings)
            audioRecorder?.record()
            isRecording = true
            startTime = Date()
            currentDuration = 0

            timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                guard let self, let start = self.startTime else { return }
                Task { @MainActor in
                    self.currentDuration = Date().timeIntervalSince(start)
                }
            }
        } catch {
            return
        }
    }

    func stopRecording() -> RecordedSample? {
        audioRecorder?.stop()
        timer?.invalidate()
        timer = nil
        isRecording = false

        guard let url = recordingURL else { return nil }
        let duration = currentDuration
        let data = try? Data(contentsOf: url)

        currentDuration = 0
        startTime = nil

        return RecordedSample(duration: duration, data: data, url: url)
    }
}
