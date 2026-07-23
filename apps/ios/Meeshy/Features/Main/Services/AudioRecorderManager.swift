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

    private var recorder: AVAudioRecorder? {
        didSet { cleanupHandle.recorder = recorder }
    }
    private var timer: Timer? {
        didSet { cleanupHandle.timer = timer }
    }
    private var levelHistory: [CGFloat] = []
    private var settings: AudioRecordingSettings = .standard
    private var onMaxDurationReached: (() -> Void)?

    /// Handles thread-safe à libérer depuis le `deinit` (potentiellement
    /// off-main) — pattern `AudioPlaybackManager.CleanupHandle`. Concerne les
    /// instances NON partagées (ex. `AudioPostComposerView`) lâchées
    /// mid-recording par un swipe-down de sheet : sans ce filet le Timer
    /// 20 Hz restait au run loop, le micro actif et la session jamais rendue.
    private final class CleanupHandle: @unchecked Sendable {
        nonisolated(unsafe) var timer: Timer?
        nonisolated(unsafe) var recorder: AVAudioRecorder?
    }
    private let cleanupHandle = CleanupHandle()

    deinit {
        cleanupHandle.timer?.invalidate()
        // `recorder` non-nil ⟺ mort mid-recording : sémantique cancel
        // (fichier partiel dérivé de `recorder.url`). Déporté sur une queue
        // utility : stop/removeItem/setActive sont bloquants et ce dealloc
        // arrive sur le main thread pendant l'animation de dismiss.
        // `deactivatePlaybackSync` est call-aware (no-op pendant un appel).
        guard cleanupHandle.recorder != nil else { return }
        let handle = cleanupHandle
        DispatchQueue.global(qos: .utility).async {
            guard let recorder = handle.recorder else { return }
            recorder.stop()
            try? FileManager.default.removeItem(at: recorder.url)
            MediaSessionCoordinator.shared.deactivatePlaybackSync()
        }
    }

    func configure(settings: AudioRecordingSettings, onMaxDurationReached: (() -> Void)? = nil) {
        self.settings = settings
        self.onMaxDurationReached = onMaxDurationReached
    }

    /// `AudioRecordingProviding` requires `configure(with:)` (commit 2a9188974,
    /// security/maxDuration caps). On garde la surface étendue
    /// `configure(settings:onMaxDurationReached:)` pour les callers app qui
    /// branchent un callback ; cette méthode-shim sert simplement la conformité
    /// au protocole côté SDK (callers SDK qui veulent juste configurer les
    /// paramètres d'enregistrement sans observer la duration max).
    func configure(with settings: AudioRecordingSettings) {
        configure(settings: settings, onMaxDurationReached: nil)
    }

    func startRecording() {
        // Audit P1-10 — refuse to start a voice-message recording while a
        // VoIP call is active: AVAudioRecorder activation overrides the
        // call's audio session and silences the WebRTC microphone path.
        if CallManager.shared.callState.isActive {
            return
        }

        // Garde micro — point UNIQUE pour les cinq surfaces qui appellent ce
        // recorder (message vocal, commentaire post, commentaire story, post
        // audio, canvas story). Sans elle, `setCategory`/`setActive` déclenchent
        // le prompt TCC de façon asynchrone pendant que `record()` tourne déjà :
        // le tout premier enregistrement de l'utilisateur partait muet, sans
        // aucun signal. Chemin nominal (permission déjà accordée) : test
        // synchrone, aucune latence ajoutée.
        guard hasMicrophonePermission() else { return }

        let session = AVAudioSession.sharedInstance()
        do {
            // Audit P1-10 — `.voiceChat` enables the system EC/AGC/NS chain
            // that `.default` skips (better captured speech for voice
            // messages). Drop `.allowBluetoothA2DP`: A2DP is output-only and
            // forces the OS to flap to HFP for the mic, producing the same
            // ~200ms audio glitches that PERF-010 removed from the call path.
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
            try session.setActive(true)
        } catch {
            return
        }

        // A3 — from here on, the session is active. Any failure path MUST
        // deactivate it to avoid leaking the microphone indicator + battery
        // drain (previously the AVAudioRecorder init failure left the
        // session active indefinitely).
        let fileName = "voice_\(Int(Date().timeIntervalSince1970)).\(settings.codec.fileExtension)"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

        do {
            // Dictionnaire dérivé du codec via la source unique du SDK
            // (`AudioRecordingSettings.avRecorderSettings`) — le défaut `.aac`
            // reproduit l'ancien dictionnaire AAC/M4A à l'identique.
            recorder = try AVAudioRecorder(url: url, settings: settings.avRecorderSettings)
            recorder?.isMeteringEnabled = true
            recorder?.record()
            recordedFileURL = url
        } catch {
            // A3 — rollback the AVAudioSession we just activated so the OS
            // releases the microphone hardware and turns off the indicator.
            deactivateAudioSessionAfterFailure()
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

    /// Tranche la permission micro AVANT toute activation de session.
    ///
    /// - déjà accordée → `true` immédiatement, chemin synchrone inchangé ;
    /// - jamais demandée → `false` maintenant, mais la demande part et
    ///   `startRecording()` est relancé si l'utilisateur accepte. Les vues
    ///   observent `@Published isRecording`, donc ce démarrage différé est
    ///   transparent pour elles ;
    /// - refus définitif → `false` + toast actionnable (le système ne
    ///   ré-afficherait plus jamais son prompt).
    private func hasMicrophonePermission() -> Bool {
        let state = MediaPermissionState.microphone
        if state.isUsable { return true }

        Task { @MainActor [weak self] in
            guard await MediaPermissionCoordinator.ensureMicrophone() else { return }
            self?.startRecording()
        }
        return false
    }

    /// A3 — central deactivation helper. Exposed `internal` for tests; not
    /// called from anywhere except the failure path of `startRecording`.
    /// Idempotent: safe to call when no session is active (the OS returns
    /// the no-op status silently).
    internal func deactivateAudioSessionAfterFailure() {
        // Only deactivate when no VoIP call is active — we never want to
        // tear down a session owned by the WebRTC stack.
        guard !CallManager.shared.callState.isActive else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    @discardableResult
    func stopRecording() -> URL? {
        timer?.invalidate()
        timer = nil
        recorder?.stop()
        isRecording = false

        // Call-aware (L3) : même garde que `cancelRecording` — un stop
        // mid-appel VoIP démontait sinon la session possédée par WebRTC.
        if !CallManager.shared.callState.isActive {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }

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

        // Audit P2-iOS-4 — deactivate the AVAudioSession so the mic indicator
        // turns off. Without this, cancelling a voice message left the
        // session active indefinitely (drained battery + kept mic icon on).
        if !CallManager.shared.callState.isActive {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
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
            // Sans callback, personne ne stoppe l'enregistrement au cap —
            // aligné sur `DefaultSDKAudioRecorder` qui se stoppe lui-même.
            if let onMaxDurationReached {
                onMaxDurationReached()
            } else {
                stopRecording()
            }
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
