import AVFoundation
import Combine
import MeeshySDK
import os
import QuartzCore

@MainActor
final class AudioRecorderManager: ObservableObject, AudioRecordingProviding, CallInterruptibleRecorder {
    static let shared = AudioRecorderManager()

    @Published var isRecording = false
    @Published var duration: TimeInterval = 0
    @Published var audioLevels: [CGFloat] = Array(repeating: 0, count: 15)

    private(set) var recordedFileURL: URL?

    private var recorder: AVAudioRecorder? {
        didSet { teardown.update { $0.recorder = recorder } }
    }
    private var displayLink: CADisplayLink? {
        didSet { teardown.update { $0.displayLink = displayLink } }
    }
    private var levelHistory: [CGFloat] = []
    private var settings: AudioRecordingSettings = .standard
    private var onMaxDurationReached: (() -> Void)?
    private let recordingSession: MeeshyRecordingSession = .shared

    /// Ressources à libérer depuis le `deinit` (potentiellement off-main).
    /// Concerne les instances NON partagées (ex. `AudioPostComposerView`)
    /// lâchées mid-recording par un swipe-down de sheet : sans ce filet le
    /// lien d'affichage restait au run loop, le micro actif et la session
    /// jamais rendue.
    private let teardown = TeardownBox(RecordingResources())

    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {
        teardown.update(RecordingResources.invalidateDisplayLink)
        // `recorder` non-nil ⟺ mort mid-recording : sémantique cancel
        // (fichier partiel dérivé de `recorder.url`). Déporté sur une queue
        // utility : stop/removeItem sont bloquants et ce dealloc arrive sur le
        // main thread pendant l'animation de dismiss. La fin de
        // l'enregistrement (son Meeshy remonté, session rendue, call-aware)
        // revient au main.
        guard teardown.read(\.isRecording) else { return }
        teardown.release(on: .global(qos: .utility), RecordingResources.releaseOffMain)
    }

    func configure(settings: AudioRecordingSettings, onMaxDurationReached: (() -> Void)? = nil) {
        self.settings = settings
        self.onMaxDurationReached = onMaxDurationReached
    }

    /// Shim de conformité à `AudioRecordingProviding`.
    ///
    /// La surface étendue `configure(settings:onMaxDurationReached:)` survit
    /// pour les appelants app qui branchent encore un callback, mais celui-ci
    /// n'est plus jamais déclenché : l'enregistrement n'a plus de plafond de
    /// durée (directive produit 2026-07-26).
    func configure(with settings: AudioRecordingSettings) {
        configure(settings: settings, onMaxDurationReached: nil)
    }

    func startRecording() {
        // Audit P1-10 — refuse to start a voice-message recording while a
        // VoIP call is active: AVAudioRecorder activation overrides the
        // call's audio session and silences the WebRTC microphone path.
        if CallManagerHost.shared.isCallActiveForAudioGuard {
            return
        }
        // Un second démarrage pendant une prise écrasait l'`AVAudioRecorder` en
        // cours sans l'arrêter : son fichier restait orphelin dans `tmp`, et le
        // micro tenu par une instance que plus rien ne référençait.
        guard !isRecording else { return }

        // Garde micro — point UNIQUE pour les cinq surfaces qui appellent ce
        // recorder (message vocal, commentaire post, commentaire story, post
        // audio, canvas story). Sans elle, `setCategory`/`setActive` déclenchent
        // le prompt TCC de façon asynchrone pendant que `record()` tourne déjà :
        // le tout premier enregistrement de l'utilisateur partait muet, sans
        // aucun signal. Chemin nominal (permission déjà accordée) : test
        // synchrone, aucune latence ajoutée.
        guard hasMicrophonePermission() else { return }

        // La session de `RecordingSessionLaw` (#11042) : les sons extérieurs
        // s'arrêtent, un son Meeshy qui joue (PiP, vocal, extrait) BAISSE sans
        // s'arrêter et remonte à la fin. Seul un vocal sans son Meeshy garde
        // `.voiceChat` (audit P1-10) : son traitement de la voix rendrait le
        // son Meeshy inaudible au lieu de le baisser.
        guard recordingSession.begin(.voiceMessage) else { return }

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
        RecorderCallGuard.shared.register(self)

        // Un second démarrage sans arrêt entre les deux laissait l'ancien lien tourner
        // jusqu'à la fin du processus. Le niveau suit l'écran, plafonné à 30 Hz ;
        // en arrière-plan le lien ne tire plus, l'îlot relève lui-même le niveau.
        displayLink?.invalidate()
        let link = WeakDisplayLinkTarget.makeLink(frameRateRange: .meter) { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.updateMetering()
        }
        link.add(to: .main, forMode: .common)
        displayLink = link
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

        // Deux taps pendant l'invite système lançaient deux demandes, puis deux
        // démarrages à l'accord : une seule demande en vol à la fois.
        guard !awaitsMicrophonePermission else { return false }
        awaitsMicrophonePermission = true
        Task { @MainActor [weak self] in
            let granted = await MediaPermissionCoordinator.ensureMicrophone()
            self?.awaitsMicrophonePermission = false
            guard granted else { return }
            self?.startRecording()
        }
        return false
    }

    /// Une demande de permission micro est en vol (voir `hasMicrophonePermission`).
    private(set) var awaitsMicrophonePermission = false

    /// A3 — central deactivation helper. Exposed `internal` for tests; not
    /// called from anywhere except the failure path of `startRecording`.
    /// Idempotent: safe to call when no session is active (the OS returns
    /// the no-op status silently).
    internal func deactivateAudioSessionAfterFailure() {
        // Call-aware : la session d'un appel VoIP n'est jamais rendue d'ici.
        endRecordingSession()
    }

    /// Un appel commence : la CAPTURE s'arrête (micro rendu à l'appel, plus
    /// rien de l'appel n'entre dans le vocal), mais l'enregistrement reste
    /// « en cours » pour le composer : son interface, figée à la durée atteinte,
    /// garde ses gestes — envoyer ou joindre passent par `stopRecording()`, qui
    /// rend le fichier ; annuler le supprime. La session reste à l'appel.
    func stopForCall() {
        guard isRecording, let recorder, recorder.isRecording else { return }
        displayLink?.invalidate()
        displayLink = nil
        duration = recorder.currentTime
        recorder.stop()
    }

    @discardableResult
    func stopRecording() -> URL? {
        displayLink?.invalidate()
        displayLink = nil
        // Le lien ne tire pas en arrière-plan : la durée se relève à l'arrêt,
        // sinon un vocal arrêté depuis l'îlot gardait celle du dernier écran.
        if let recorder, recorder.isRecording { duration = recorder.currentTime }
        recorder?.stop()
        isRecording = false

        endRecordingSession()

        let url = recordedFileURL
        recorder = nil
        return url
    }

    func cancelRecording() {
        displayLink?.invalidate()
        displayLink = nil
        recorder?.stop()
        isRecording = false

        if let url = recordedFileURL {
            FileManager.default.removeItemLogging(at: url, context: "cancelled recording cleanup", logger: Logger.audioRecorder)
        }
        recordedFileURL = nil
        recorder = nil
        duration = 0
        audioLevels = Array(repeating: 0, count: 15)

        // Audit P2-iOS-4 — la session se rend pour que l'indicateur micro
        // s'éteigne ; sans elle, annuler un vocal laissait le micro tenu.
        endRecordingSession()
    }

    /// Fin d'enregistrement — envoi, annulation, échec (#11042) : le son
    /// Meeshy baissé remonte au volume qu'il avait, puis la session revient à
    /// sa lecture s'il joue encore, ou se rend aux autres apps
    /// (`.notifyOthersOnDeactivation`). Call-aware : pendant un appel VoIP,
    /// la session reste à l'appel.
    private func endRecordingSession() {
        recordingSession.finish(handingBackSession: true)
    }

    func result() -> AudioRecordingResult? {
        guard let url = recordedFileURL, duration >= settings.minimumDuration else { return nil }
        let data: Data?
        do {
            data = try Data(contentsOf: url)
        } catch {
            // L'URL reste exploitable par l'appelant ; seul le blob en mémoire manque.
            Logger.audioRecorder.error("Recorded audio unreadable, sending by URL only: \(error.localizedDescription, privacy: .public)")
            data = nil
        }
        return AudioRecordingResult(url: url, duration: duration, data: data)
    }

    /// Relève durée et niveau. Appelé par le lien d'affichage à l'écran, et
    /// par l'îlot (`VoiceRecordingLiveActivityCoordinator`) en arrière-plan.
    func updateMetering() {
        guard let recorder, recorder.isRecording else { return }

        duration = recorder.currentTime
        recorder.updateMeters()

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

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let audioRecorder = MeeshyLog.logger(.audioRecorder)
}

private nonisolated struct RecordingResources {
    var displayLink: CADisplayLink?
    var recorder: AVAudioRecorder?

    var isRecording: Bool {
        recorder != nil
    }

    static func invalidateDisplayLink(_ resources: inout RecordingResources) {
        resources.displayLink?.invalidate()
    }

    static func releaseOffMain(_ resources: RecordingResources) {
        guard let recorder = resources.recorder else { return }
        recorder.stop()
        FileManager.default.removeItemLogging(at: recorder.url, context: "aborted recording cleanup", logger: Logger.audioRecorder)
        DispatchQueue.main.async {
            MainActor.assumeIsolated { MeeshyRecordingSession.shared.finish(handingBackSession: true) }
        }
    }
}
