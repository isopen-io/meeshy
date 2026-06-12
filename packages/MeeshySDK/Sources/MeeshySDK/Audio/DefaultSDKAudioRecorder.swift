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

    public private(set) var recordedFileURL: URL? {
        didSet { cleanupHandle.recordedFileURL = recordedFileURL }
    }

    private var recorder: AVAudioRecorder? {
        didSet { cleanupHandle.recorder = recorder }
    }
    private var timer: Timer? {
        didSet { cleanupHandle.timer = timer }
    }
    private var levelHistory: [CGFloat] = []
    internal var settings: AudioRecordingSettings = .standard

    /// Handles thread-safe à libérer depuis le `deinit` (potentiellement
    /// off-main) — même pattern que `AudioPlaybackManager.CleanupHandle`.
    /// Synchronisés avec les props @MainActor via leurs `didSet`. Sans ce
    /// filet, un recorder lâché sans stop/cancel (sheet swipée mid-recording,
    /// instance `@ObservedObject` remplacée par une ré-évaluation du parent)
    /// laissait un Timer 20 Hz au run loop pour toujours, le micro actif et
    /// la session audio jamais rendue.
    private final class CleanupHandle {
        nonisolated(unsafe) var timer: Timer?
        nonisolated(unsafe) var recorder: AVAudioRecorder?
        nonisolated(unsafe) var recordedFileURL: URL?
    }
    private let cleanupHandle = CleanupHandle()

    public init() {}

    deinit {
        cleanupHandle.timer?.invalidate()
        // `recorder` non-nil ⟺ mort mid-recording (stop/cancel posent nil) :
        // sémantique cancel — on stoppe le micro, jette le fichier partiel et
        // rend la session (call-aware, no-op pendant un appel VoIP).
        guard let recorder = cleanupHandle.recorder else { return }
        recorder.stop()
        if let url = cleanupHandle.recordedFileURL {
            try? FileManager.default.removeItem(at: url)
        }
        MediaSessionCoordinator.shared.deactivatePlaybackSync()
    }

    public func configure(with settings: AudioRecordingSettings) {
        self.settings = settings
    }

    public func startRecording() {
        // Source unique de session (call-aware) : pendant un appel VoIP la
        // reconfiguration est refusée — on n'enregistre pas par-dessus
        // RTCAudioSession (l'ancien chemin direct AVAudioSession cassait
        // l'uplink micro de l'appel).
        guard MediaSessionCoordinator.shared.activateRecordingSync() else { return }

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
