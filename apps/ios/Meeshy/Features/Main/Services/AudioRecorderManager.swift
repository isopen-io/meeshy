import AVFoundation
import Combine
import MeeshySDK

@MainActor
final class AudioRecorderManager: ObservableObject, AudioRecordingProviding {
    static let shared = AudioRecorderManager()

    @Published var isRecording = false
    @Published var duration: TimeInterval = 0
    @Published var audioLevels: [CGFloat] = Array(repeating: 0, count: 15)

    private(set) var recordedFileURL: URL?

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var levelHistory: [CGFloat] = []
    private var settings: AudioRecordingSettings = .standard
    private var onMaxDurationReached: (() -> Void)?

    func configure(settings: AudioRecordingSettings, onMaxDurationReached: (() -> Void)? = nil) {
        self.settings = settings
        self.onMaxDurationReached = onMaxDurationReached
    }

    func startRecording() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
            try session.setActive(true)
        } catch {
            return
        }

        let fileName = "voice_\(Int(Date().timeIntervalSince1970)).m4a"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

        let recSettings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: settings.sampleRate,
            AVNumberOfChannelsKey: settings.numberOfChannels,
            AVEncoderBitRateKey: settings.bitRate,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue
        ]

        do {
            recorder = try AVAudioRecorder(url: url, settings: recSettings)
            recorder?.isMeteringEnabled = true
            recorder?.record()
            recordedFileURL = url
        } catch {
            return
        }

        isRecording = true
        duration = 0
        levelHistory = Array(repeating: 0, count: 15)
        audioLevels = levelHistory

        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.updateMetering() }
        }
    }

    @discardableResult
    func stopRecording() -> URL? {
        timer?.invalidate()
        timer = nil
        recorder?.stop()
        isRecording = false

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        let url = recordedFileURL
        recorder = nil
        return url
    }

    func cancelRecording() {
        timer?.invalidate()
        timer = nil
        recorder?.stop()
        isRecording = false

        if let url = recordedFileURL {
            try? FileManager.default.removeItem(at: url)
        }
        recordedFileURL = nil
        recorder = nil
        duration = 0
        audioLevels = Array(repeating: 0, count: 15)
    }

    func result() -> AudioRecordingResult? {
        guard let url = recordedFileURL, duration >= settings.minimumDuration else { return nil }
        let data = try? Data(contentsOf: url)
        return AudioRecordingResult(url: url, duration: duration, data: data)
    }

    private func updateMetering() {
        guard let recorder, recorder.isRecording else { return }

        duration = recorder.currentTime
        recorder.updateMeters()

        if let maxDuration = settings.maxDuration, duration >= maxDuration {
            onMaxDurationReached?()
            return
        }

        let power = recorder.averagePower(forChannel: 0)
        let normalized = normalizeLevel(power)

        levelHistory.append(normalized)
        if levelHistory.count > 15 {
            levelHistory.removeFirst(levelHistory.count - 15)
        }

        audioLevels = levelHistory
    }

    private func normalizeLevel(_ power: Float) -> CGFloat {
        let minDb: Float = -50
        let clamped = max(power, minDb)
        let normalized = (clamped - minDb) / (0 - minDb)
        return CGFloat(normalized)
    }
}
