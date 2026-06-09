import AVFoundation
import Combine

// MARK: - Default SDK Audio Recorder

/// Default implementation of AudioRecordingProviding for use within the SDK.
/// When no external recorder is injected, views can fall back to this.
@MainActor
public final class DefaultSDKAudioRecorder: ObservableObject, AudioRecordingProviding {
    @Published public var isRecording = false
    @Published public var duration: TimeInterval = 0
    @Published public var audioLevels: [CGFloat] = Array(repeating: 0, count: 15)

    public private(set) var recordedFileURL: URL?

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var levelHistory: [CGFloat] = []
    internal var settings: AudioRecordingSettings = .standard

    public init() {}

    public func configure(with settings: AudioRecordingSettings) {
        self.settings = settings
    }

    public func startRecording() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
            try session.setActive(true)
        } catch {
            return
        }

        let fileName = "voice_\(Int(Date().timeIntervalSince1970)).\(settings.codec.fileExtension)"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

        // Settings dictionary is derived from the codec (E4). Default `.aac`
        // produces the historical AAC/M4A dictionary unchanged.
        let settingsDictionary = settings.avRecorderSettings

        do {
            recorder = try AVAudioRecorder(url: url, settings: settingsDictionary)
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
    public func stopRecording() -> URL? {
        timer?.invalidate()
        timer = nil
        recorder?.stop()
        isRecording = false

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        let url = recordedFileURL
        recorder = nil
        return url
    }

    public func cancelRecording() {
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

    private func updateMetering() {
        guard let recorder, recorder.isRecording else { return }

        let current = recorder.currentTime
        duration = current

        if let maxDuration = settings.maxDuration, current >= maxDuration {
            stopRecording()
            return
        }

        recorder.updateMeters()

        let power = recorder.averagePower(forChannel: 0)
        let minDb: Float = -50
        let clamped = max(power, minDb)
        let normalized = CGFloat((clamped - minDb) / (0 - minDb))

        levelHistory.append(normalized)
        if levelHistory.count > 15 {
            levelHistory.removeFirst(levelHistory.count - 15)
        }
        audioLevels = levelHistory
    }
}
