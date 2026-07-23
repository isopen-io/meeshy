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
    /// Passe à `true` quand un `startRecording()` a été refusé faute de
    /// permission micro. Les vues SDK-UI demandent la permission elles-mêmes en
    /// amont (et rendent leur propre message) ; ce drapeau sert de signal aux
    /// hôtes qui appellent le recorder sans passer par ces vues.
    @Published public private(set) var permissionDenied = false

    public private(set) var recordedFileURL: URL?

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
    /// la session audio jamais rendue. `@unchecked Sendable` : champs mutés
    /// uniquement depuis MainActor, lus une fois par le deinit/cleanup.
    private final class CleanupHandle: @unchecked Sendable {
        nonisolated(unsafe) var timer: Timer?
        nonisolated(unsafe) var recorder: AVAudioRecorder?
    }
    private let cleanupHandle = CleanupHandle()

    public init() {}

    deinit {
        cleanupHandle.timer?.invalidate()
        // `recorder` non-nil ⟺ mort mid-recording (stop/cancel posent nil) :
        // sémantique cancel — micro stoppé, fichier partiel jeté (dérivé de
        // `recorder.url`), session rendue (call-aware). Déporté sur une queue
        // utility : stop (finalisation fichier) + removeItem + setActive sont
        // bloquants, et ce dealloc arrive typiquement sur le main thread
        // pendant l'animation de dismiss de la sheet.
        guard cleanupHandle.recorder != nil else { return }
        let handle = cleanupHandle
        DispatchQueue.global(qos: .utility).async {
            guard let recorder = handle.recorder else { return }
            recorder.stop()
            try? FileManager.default.removeItem(at: recorder.url)
            MediaSessionCoordinator.shared.deactivatePlaybackSync()
        }
    }

    public func configure(with settings: AudioRecordingSettings) {
        self.settings = settings
    }

    public func startRecording() {
        // Filet micro : activer la session avant que TCC ait tranché déclenche
        // le prompt système de façon asynchrone pendant que `record()` tourne
        // déjà — l'enregistrement démarre alors muet. On tranche AVANT.
        // Chemin nominal (déjà autorisé) : test synchrone, zéro latence ajoutée.
        let permission = MediaPermissionState.microphone
        guard permission.isUsable else {
            guard permission.canPrompt else {
                permissionDenied = true
                return
            }
            Task { @MainActor [weak self] in
                let resolved = await DevicePermissions.requestMicrophone()
                guard let self else { return }
                guard resolved.isUsable else {
                    self.permissionDenied = true
                    return
                }
                self.startRecording()
            }
            return
        }
        permissionDenied = false

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

        // Call-aware (L3) : un `setActive(false)` direct pendant un appel VoIP
        // démontait la session possédée par RTCAudioSession. Le coordinator
        // no-op dans ce cas.
        MediaSessionCoordinator.shared.deactivatePlaybackSync()

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
        // Symétrique de stopRecording : sans cette désactivation, un cancel
        // explicite (X, onDisappear) laissait la session `.playAndRecord`
        // active — micro indiqué, audio des autres apps interrompu.
        MediaSessionCoordinator.shared.deactivatePlaybackSync()
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
