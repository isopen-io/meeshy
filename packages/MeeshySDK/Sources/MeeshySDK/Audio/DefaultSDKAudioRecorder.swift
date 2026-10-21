import AVFoundation
import Combine

// MARK: - Default SDK Audio Recorder

/// Default implementation of AudioRecordingProviding for use within the SDK.
/// When no external recorder is injected, views can fall back to this.
@MainActor
public final class DefaultSDKAudioRecorder: ObservableObject, AudioRecordingProviding, CallInterruptibleRecorder {
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
        didSet { teardown.update { $0.recorder = recorder } }
    }
    private var timer: Timer? {
        didSet { teardown.update { $0.timer = timer } }
    }
    private var levelHistory: [CGFloat] = []
    internal var settings: AudioRecordingSettings = .standard

    /// Ressources à libérer depuis le `deinit` (potentiellement off-main),
    /// synchronisées avec les props @MainActor via leurs `didSet`. Sans ce
    /// filet, un recorder lâché sans stop/cancel (sheet swipée mid-recording,
    /// instance `@ObservedObject` remplacée par une ré-évaluation du parent)
    /// laissait un Timer 20 Hz au run loop pour toujours, le micro actif et
    /// la session audio jamais rendue.
    private let teardown = TeardownBox(RecordingResources())

    public init() {}

    nonisolated deinit {
        teardown.update(RecordingResources.invalidateTimer)
        // `recorder` non-nil ⟺ mort mid-recording (stop/cancel posent nil) :
        // sémantique cancel — micro stoppé, fichier partiel jeté (dérivé de
        // `recorder.url`), session rendue (call-aware). Déporté sur une queue
        // utility : stop (finalisation fichier) + removeItem sont
        // bloquants, et ce dealloc arrive typiquement sur le main thread
        // pendant l'animation de dismiss de la sheet.
        guard teardown.read(\.isRecording) else { return }
        teardown.release(on: .global(qos: .utility), RecordingResources.releaseOffMain)
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

        // Source unique de session (call-aware, #11042) : pendant un appel VoIP
        // la reconfiguration est refusée — on n'enregistre pas par-dessus
        // RTCAudioSession. Les sons extérieurs s'arrêtent ; un son Meeshy qui
        // joue baisse, et remonte à la fin.
        guard MeeshyRecordingSession.shared.begin(.voiceMessage) else { return }

        // Second démarrage sans arrêt (double appui, relance après le prompt
        // micro) : arrêter l'enregistrement précédent et son minuteur 20 Hz,
        // sinon celui-ci reste au run loop jusqu'à la fin du processus.
        timer?.invalidate()
        timer = nil
        if let previous = recorder {
            previous.stop()
            FileManager.default.removeItemLogging(at: previous.url, context: "superseded recording")
            recorder = nil
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
            // Rendre la session activée juste au-dessus : sans cela le micro
            // reste réservé et l'indicateur orange allumé.
            recorder = nil
            MeeshyRecordingSession.shared.finish(handingBackSession: true)
            return
        }

        isRecording = true
        duration = 0
        levelHistory = Array(repeating: 0, count: 15)
        audioLevels = levelHistory
        RecorderCallGuard.shared.register(self)

        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.updateMetering() }
        }
    }

    /// Un appel commence : la CAPTURE s'arrête (micro rendu à l'appel, plus
    /// rien de l'appel n'entre dans le vocal), mais l'enregistrement reste
    /// « en cours » pour le composer : son interface, figée à la durée atteinte,
    /// garde ses gestes — envoyer ou joindre passent par `stopRecording()`, qui
    /// rend le fichier ; annuler le supprime. La session reste à l'appel.
    public func stopForCall() {
        guard isRecording, let recorder, recorder.isRecording else { return }
        timer?.invalidate()
        timer = nil
        recorder.stop()
    }

    @discardableResult
    public func stopRecording() -> URL? {
        timer?.invalidate()
        timer = nil
        recorder?.stop()
        isRecording = false

        // Le son Meeshy baissé remonte, et la session revient à la lecture ou
        // se rend (call-aware : rien ne bouge pendant un appel VoIP).
        MeeshyRecordingSession.shared.finish(handingBackSession: true)

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
        MeeshyRecordingSession.shared.finish(handingBackSession: true)
    }

    private func updateMetering() {
        guard let recorder, recorder.isRecording else { return }

        let current = recorder.currentTime
        duration = current

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

private struct RecordingResources {
    var timer: Timer?
    var recorder: AVAudioRecorder?

    var isRecording: Bool {
        recorder != nil
    }

    static func invalidateTimer(_ resources: inout RecordingResources) {
        resources.timer?.invalidate()
    }

    static func releaseOffMain(_ resources: RecordingResources) {
        guard let recorder = resources.recorder else { return }
        recorder.stop()
        try? FileManager.default.removeItem(at: recorder.url)
        DispatchQueue.main.async {
            MainActor.assumeIsolated { MeeshyRecordingSession.shared.finish(handingBackSession: true) }
        }
    }
}
