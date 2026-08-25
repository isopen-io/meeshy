import Foundation
import Speech
import AVFoundation
import Combine
import MeeshySDK
import os

// nonisolated: os.Logger is a thread-safe value type (Apple docs) with no
// reason to inherit this file's default MainActor isolation — needed so the
// AVAudioEngine tap closure (which runs off-MainActor, see
// startLocalCapture/reinstallTap below) can log without an isolation error.
// Discovered via the Task 1 spike (2026-07-10): a bare `private let` here
// made the tap closure's log call fail to compile once the closure was
// correctly typed `@Sendable` (see below) — same fix applied there.
private nonisolated let callsLogger = Logger(subsystem: "me.meeshy.app", category: "calls")

// MARK: - Transcription Segment

struct TranscriptionSegment: Identifiable, Equatable {
    let id: UUID
    /// Identifiant de journal stable, partagé entre transports : minté à la
    /// capture par le device du locuteur, il voyage sur le data channel
    /// WebRTC ET dans `call:transcription-segment` → `call:translated-segment`.
    /// C'est la clé de fusion (`upsertRemoteSegment`) qui évite de dupliquer
    /// une ligne quand le même segment arrive par les deux chemins. `nil`
    /// pour les segments d'anciens pairs/gateways qui ne l'émettent pas.
    let wireId: String?
    let text: String
    let speakerId: String
    /// Nom d'affichage du locuteur tel que transporté par le wire — estampillé
    /// par le gateway sur le chemin socket (anti-usurpation), déclaratif sur
    /// le data channel. L'affichage préfère TOUJOURS le nom résolu localement
    /// depuis le roster de l'appel ; ce champ n'est qu'un fallback.
    let speakerDisplayName: String?
    let startTime: TimeInterval
    let endTime: TimeInterval
    let isFinal: Bool
    let confidence: Double
    let language: String
    let translatedText: String?
    let translatedLanguage: String?
    /// Wall-clock capture time — LOCAL segments stamp it when the ASR result
    /// arrives, REMOTE segments stamp it on socket receipt (see
    /// `CallManager.makeTranscriptionSegment`). Used for chronological
    /// ordering and for the "since call start" timestamp shown per row —
    /// `startTime`/`endTime` are ASR-buffer-relative (they reset every time
    /// `CallTranscriptionService.rotateRecognitionRequest` rotates the
    /// recognition request) and are unsuitable for either. No default: every
    /// call site must decide this deliberately rather than inherit a stale
    /// `Date()` evaluated at type-definition time.
    let capturedAt: Date

    init(
        id: UUID,
        wireId: String? = nil,
        text: String,
        speakerId: String,
        speakerDisplayName: String? = nil,
        startTime: TimeInterval,
        endTime: TimeInterval,
        isFinal: Bool,
        confidence: Double,
        language: String,
        translatedText: String? = nil,
        translatedLanguage: String? = nil,
        capturedAt: Date
    ) {
        self.id = id
        self.wireId = wireId
        self.text = text
        self.speakerId = speakerId
        self.speakerDisplayName = speakerDisplayName
        self.startTime = startTime
        self.endTime = endTime
        self.isFinal = isFinal
        self.confidence = confidence
        self.language = language
        self.translatedText = translatedText
        self.translatedLanguage = translatedLanguage
        self.capturedAt = capturedAt
    }
}

// MARK: - Transcription Permission

enum TranscriptionPermission: Equatable {
    case notDetermined
    case authorized
    case denied
    case restricted
}

// MARK: - Transcription Error

enum TranscriptionError: LocalizedError, Equatable {
    case permissionDenied
    case recognizerUnavailable(language: String)
    case onDeviceNotSupported(language: String)
    case recognitionFailed(underlying: Error)
    case audioEngineFailed(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Speech recognition permission denied"
        case .recognizerUnavailable(let language):
            return "Speech recognizer unavailable for language: \(language)"
        case .onDeviceNotSupported(let language):
            return "On-device recognition not supported for language: \(language)"
        case .recognitionFailed(let error):
            return "Recognition failed: \(error.localizedDescription)"
        case .audioEngineFailed(let error):
            return "Local audio capture failed: \(error.localizedDescription)"
        }
    }

    static func == (lhs: TranscriptionError, rhs: TranscriptionError) -> Bool {
        lhs.errorDescription == rhs.errorDescription
    }
}

// MARK: - Protocol

@MainActor
protocol CallTranscriptionServiceProviding {
    var segments: [TranscriptionSegment] { get }
    var isTranscribing: Bool { get }
    var permission: TranscriptionPermission { get }
    var lastError: TranscriptionError? { get }
    func startTranscribing(callId: String, localLanguage: String, localUserId: String, localDisplayName: String)
    func stopTranscribing()
    func requestPermission() async -> TranscriptionPermission
    func receiveTranslatedSegment(_ segment: TranscriptionSegment)
    func receivePeerEntry(_ segment: TranscriptionSegment)
}

// MARK: - Call Transcription Service

/// Live-call captions: transcribes ONLY the local device's own microphone
/// (never the remote/decoded WebRTC audio — see
/// docs/superpowers/specs/2026-07-10-live-call-transcription-design.md for
/// why that sidesteps the "no ADM in the public WebRTC SDK build" blocker
/// that made the previous leader/follower design unreachable). Final
/// segments are sent to the gateway over the existing call socket
/// (`call:transcription-segment`), which relays them translated per
/// listener (`call:translated-segment`) — this class never translates
/// anything itself.
@MainActor
final class CallTranscriptionService: ObservableObject, CallTranscriptionServiceProviding {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private enum Constants {
        static let segmentRetentionLimit = 50
        /// Safety ceiling for the PERSISTENCE accumulator (`persistedSegments`)
        /// — never hit in normal use (a multi-hour call at continuous speech
        /// is still well under this), just a memory guard against pathological
        /// growth. NOT the live display cap, which stays 50 — see
        /// docs/superpowers/specs/2026-07-11-call-transcript-history-design.md §2.
        static let persistedSegmentCeiling = 2000
    }

    @Published private(set) var segments: [TranscriptionSegment] = []
    @Published private(set) var isTranscribing = false
    @Published private(set) var permission: TranscriptionPermission = .notDetermined
    @Published private(set) var lastError: TranscriptionError?

    /// PERF-005: while the live-captions panel is hidden, non-final results
    /// are skipped (no per-frame UI churn); finals are always processed and
    /// emitted regardless, since they also feed the other participant's view.
    @Published var isShowingOverlay: Bool = false

    /// The full retained history (bounded only by `segmentRetentionLimit`),
    /// not a short tail — the transcript panel is a real scrollable surface
    /// now (not a floating overlay with limited space), so segments must
    /// scroll out of view rather than vanish once more than a handful pile
    /// up. User-reported 2026-07-11.
    var displayedSegments: [TranscriptionSegment] {
        segments
    }

    private let socket: any MessageSocketProviding
    private var callId: String?
    private var localUserId = ""
    /// Identifiant de journal de l'énoncé EN COURS de reconnaissance : les
    /// révisions partielles successives d'un même énoncé (le moteur corrige
    /// au fil de l'eau) partagent ce wireId pour que le pair les remplace en
    /// place — le final le clôt (et libère l'id pour l'énoncé suivant).
    private var currentUtteranceWireId: String?
    /// Nom d'affichage local embarqué dans les entrées P2P du data channel
    /// (pas de serveur pour l'estampiller sur ce chemin) — fourni par
    /// `CallManager.toggleTranscription` au démarrage.
    private var localDisplayName = ""
    /// Envoi P2P opportuniste d'une entrée de journal sur le data channel
    /// WebRTC — injecté par `CallManager` (→ `WebRTCService.sendTranscriptEntry`),
    /// no-op silencieux quand le channel n'est pas ouvert. Le relais socket
    /// reste émis systématiquement (traduction + fallback) ; le pair fusionne
    /// par `wireId`.
    var sendPeerEntry: ((DataChannelTranscriptEntry) -> Void)?
    private var allSegments: [TranscriptionSegment] = []
    /// Full-call accumulator for local persistence at call end — append-only,
    /// NOT re-sorted per append (unlike `allSegments`/`segments`, which drive
    /// the live UI and must stay cheap to re-render), bounded only by
    /// `Constants.persistedSegmentCeiling`.
    private var persistedSegments: [TranscriptionSegment] = []

    private let audioEngine = AVAudioEngine()
    /// Guards every `audioEngine`/tap touch in `stopLocalCapture()`. Merely
    /// *accessing* `audioEngine.inputNode` for the first time lazily
    /// activates the process's audio session — safe on a real device, but an
    /// uncatchable crash (SIGABRT) in the unit test host, which has no
    /// microphone entitlement/hardware. `resetForCallEnd`/`stopTranscribing`
    /// must be callable from a service that never ran `startLocalCapture`
    /// (e.g. a receive-only call, or any test exercising end-of-call
    /// teardown without first starting capture) without ever touching
    /// `audioEngine` at all.
    private var isCaptureActive = false
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var rotationCount = 0
    private var configurationChangeObserver: NSObjectProtocol?
    private var interruptionObserver: NSObjectProtocol?

    init(socket: any MessageSocketProviding = MessageSocketManager.shared) {
        self.socket = socket
    }

    #if DEBUG
    /// Test-only seam: `isTranscribing` is otherwise only flippable via
    /// `startTranscribing`, which requires a real `SFSpeechRecognizer` +
    /// `AVAudioEngine` unavailable in the unit test host (see
    /// `applyRecognitionResult`'s doc comment for the same constraint).
    func setTranscribingForTesting(_ value: Bool) {
        isTranscribing = value
    }

    var persistedSegmentsForTesting: [TranscriptionSegment] { persistedSegments }

    /// Test-only seam: sets the active call identity without going through
    /// `startTranscribing`, which requires a real `SFSpeechRecognizer` +
    /// `AVAudioEngine` unavailable in the unit test host. Lets tests simulate
    /// the stale-callback-after-redial race that `applyRecognitionResult`'s
    /// `callId` guard defends against.
    func setCallIdForTesting(_ value: String?) {
        callId = value
    }
    #endif

    // MARK: - Permission

    func requestPermission() async -> TranscriptionPermission {
        let status = await withCheckedContinuation { continuation in
            // Confirmed on device (crash Meeshy-2026-07-11-020237.ips,
            // faulting thread invoked by tccd via XPC): the `Task { @MainActor
            // in }`-wrapping tried first was NOT sufficient — the OUTER
            // closure passed to requestAuthorization is itself implicitly
            // MainActor-isolated (same SWIFT_DEFAULT_ACTOR_ISOLATION
            // inference as the AVAudioEngine tap block, see
            // startLocalCapture), and the dynamic isolation assertion traps
            // at the CALL SITE — before the closure's body (the Task{}) ever
            // runs — when tccd invokes it off-MainActor. The only fix that
            // actually breaks the inference is the same one used for the tap
            // block: an explicit @Sendable-typed local.
            let completion: @Sendable (SFSpeechRecognizerAuthorizationStatus) -> Void = { status in
                continuation.resume(returning: status)
            }
            SFSpeechRecognizer.requestAuthorization(completion)
        }
        let result = mapAuthorizationStatus(status)
        permission = result
        return result
    }

    // MARK: - Lifecycle

    func startTranscribing(callId: String, localLanguage: String, localUserId: String, localDisplayName: String = "") {
        guard !isTranscribing else {
            callsLogger.warning("startTranscribing called while already transcribing")
            return
        }
        guard permission == .authorized else {
            lastError = .permissionDenied
            callsLogger.warning("startTranscribing: not authorized — permission=\(String(describing: self.permission))")
            return
        }

        let locale = Locale(identifier: localLanguage)
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            lastError = .recognizerUnavailable(language: localLanguage)
            callsLogger.warning("startTranscribing: no recognizer available for \(localLanguage)")
            return
        }
        // Confidentialité — jamais de repli sur la reconnaissance vocale
        // serveur d'Apple pendant un appel privé (décision produit du spec).
        guard recognizer.supportsOnDeviceRecognition else {
            lastError = .onDeviceNotSupported(language: localLanguage)
            callsLogger.warning("startTranscribing: on-device unsupported for \(localLanguage)")
            return
        }

        self.callId = callId
        self.localUserId = localUserId
        self.localDisplayName = localDisplayName
        self.recognizer = recognizer
        lastError = nil

        do {
            try startLocalCapture()
        } catch {
            lastError = .audioEngineFailed(underlying: error)
            callsLogger.error("startTranscribing: AVAudioEngine failed: \(error.localizedDescription)")
            self.recognizer = nil
            return
        }

        startRecognitionTask(language: localLanguage)
        isTranscribing = true
        // Le signal de présence `call:transcription-active` n'est PLUS émis
        // ici : il dit « j'écoute », pas « je capture ». Depuis que la capture
        // démarre aussi pour servir un pair qui écoute, l'émettre depuis la
        // capture faisait que deux devices s'entretenaient mutuellement —
        // chacun voyant l'autre « actif », aucun ne pouvait plus s'arrêter et
        // le micro restait tapé jusqu'à la fin de l'appel. C'est désormais
        // `CallManager.publishListeningIntentIfChanged()`, piloté par le
        // PANNEAU local, qui l'émet.
        callsLogger.info("Call transcription started — local language: \(localLanguage)")
    }

    func stopTranscribing() {
        // Pas de signal de présence ici non plus — voir startTranscribing :
        // arrêter la CAPTURE ne signifie pas cesser d'ÉCOUTER, et l'inverse
        // est vrai aussi.
        removeConfigurationObserver()
        removeInterruptionObserver()
        stopLocalCapture()
        recognitionTask?.cancel()
        recognitionTask = nil
        request?.endAudio()
        request = nil
        recognizer = nil
        currentUtteranceWireId = nil

        // Le JOURNAL est volontairement CONSERVÉ : fermer le panneau en cours
        // d'appel désabonne émission (moteur arrêté ici) et réception (gardes
        // isShowingOverlay côté CallManager), mais rouvrir le panneau doit
        // réafficher tout ce qui a été transcrit — la purge n'a qu'un seul
        // site, `resetForCallEnd` (fin d'appel définitive, après persistance).
        isTranscribing = false
        lastError = nil
        callId = nil

        callsLogger.info("Call transcription stopped (journal retained)")
    }

    /// End-of-call teardown — PERSISTS before purging. `callId`/`conversationId`/
    /// `callStartedAt`/speaker names are threaded in as parameters (this
    /// service has no stored `conversationId`/`callStartDate`, and its own
    /// `callId` is nil whenever this device never called `startTranscribing`
    /// — see the `callId: String?` guard below, which fixes a real bug: a
    /// receive-only device (never transcribed locally, only received the
    /// other participant's segments) must NOT persist under an empty-string
    /// key. `CallManager` — the sole caller, always at definite end-of-call —
    /// has every value in hand at its call site.
    func resetForCallEnd(callId: String?, conversationId: String, callStartedAt: Date?, localUserId: String, localSpeakerName: String, remoteSpeakerName: String) {
        if let callId, !persistedSegments.isEmpty {
            let snapshot = CallTranscript(
                callId: callId,
                conversationId: conversationId,
                callStartedAt: callStartedAt ?? Date(),
                segments: persistedSegments.map { seg in
                    CallTranscriptSegment(
                        speakerId: seg.speakerId,
                        speakerName: seg.speakerId == localUserId
                            ? localSpeakerName
                            : (seg.speakerDisplayName ?? remoteSpeakerName),
                        isLocal: seg.speakerId == localUserId,
                        text: seg.text,
                        translatedText: seg.translatedText,
                        translatedLanguage: seg.translatedLanguage,
                        language: seg.language,
                        capturedAt: seg.capturedAt
                    )
                }
            )
            Task { await CallTranscriptStore.shared.saveMerging(snapshot) }
        }
        stopTranscribing()
        // Purge inconditionnelle — UNIQUE site (stopTranscribing conserve le
        // journal pour la réouverture du panneau en cours d'appel) : sans
        // elle, un appel suivant hériterait des segments de celui-ci.
        allSegments.removeAll()
        persistedSegments.removeAll()
        segments.removeAll()
        isShowingOverlay = false
    }

    // MARK: - Local audio capture (jamais l'audio distant)

    /// Tap indépendant du pipeline audio WebRTC, installé APRÈS l'activation
    /// CallKit (voir CallManager.toggleTranscription — jamais avant, même
    /// contrainte documentée dans P2PWebRTCClient.swift pour WebRTC
    /// lui-même). Validé par le spike Phase 0 — voir Task 1 de
    /// docs/superpowers/plans/2026-07-10-live-call-transcription.md.
    ///
    /// The tap block MUST be an explicit `@Sendable`-typed local, not a bare
    /// trailing closure — under this project's
    /// `SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor`, a closure literal written
    /// inline inside this `@MainActor` method is implicitly inferred as
    /// MainActor-isolated regardless of what it captures. AVAudioEngine
    /// invokes tap blocks off-MainActor (its own real-time queue); an
    /// inferred-MainActor closure traps at runtime (SIGTRAP,
    /// `swift_task_isCurrentExecutorImpl`) the first time it's called.
    /// Discovered via the Task 1 spike (2026-07-10, crash report
    /// `Meeshy-2026-07-10-173828.ips`) — do not revert this pattern.
    private func startLocalCapture() throws {
        let newRequest = SFSpeechAudioBufferRecognitionRequest()
        newRequest.shouldReportPartialResults = true
        newRequest.addsPunctuation = true
        newRequest.requiresOnDeviceRecognition = true
        request = newRequest

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        // nonisolated(unsafe): SFSpeechAudioBufferRecognitionRequest isn't
        // audited Sendable by Apple, but `append(_:)` is Apple's documented
        // call pattern for exactly this real-time tap callback — the type
        // is safe here, the compiler just can't see it.
        nonisolated(unsafe) let capturedRequest = newRequest
        let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { buffer, _ in
            capturedRequest.append(buffer)
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format, block: tapBlock)
        audioEngine.prepare()
        try audioEngine.start()
        isCaptureActive = true
        observeConfigurationChanges()
        observeAudioInterruptions()
    }

    private func stopLocalCapture() {
        // Never touch `audioEngine` when capture was never started (fix
        // 2026-07-21, crash CallTranscriptionServiceTests via
        // `resetForCallEnd`/`applyRecognitionError`) — see `isCaptureActive`'s
        // doc comment.
        guard isCaptureActive else { return }

        // removeTap(onBus:) must run unconditionally, NOT only while the
        // engine is running. An AVAudioSession interruption (Siri, an
        // incoming GSM call, an alarm — all common mid-call) auto-stops the
        // engine on its own, so `isRunning` is already false by the time a
        // call ends normally. Gating removeTap behind `isRunning` used to
        // skip it in that case, leaving the tap installed on bus 0; the next
        // startLocalCapture()'s installTap(onBus: 0, …) on an already-tapped
        // bus raises an uncatchable NSInternalInconsistencyException. Apple
        // documents removeTap as safe to call even with no tap installed.
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        isCaptureActive = false
    }

    /// A route change mid-capture (Bluetooth connect/disconnect, headphones,
    /// hardware reconfiguration) posts this notification with a new
    /// `inputNode` format — Apple's documented pattern for any long-lived tap
    /// is to reinstall it with the fresh format, otherwise the tap's stale
    /// format mismatches CoreAudio's new hardware format (crash) or the
    /// recognizer silently stops receiving audio. This engine is independent
    /// of the WebRTC/`RTCAudioSession` route-change handling in CallManager
    /// (see its `AVAudioSession.routeChangeNotification` observer), which
    /// only fixes up the call's own audio path, not this one.
    private func observeConfigurationChanges() {
        removeConfigurationObserver()
        configurationChangeObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: audioEngine,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.handleAudioEngineConfigurationChange()
            }
        }
    }

    private func handleAudioEngineConfigurationChange() {
        guard isTranscribing, let request else { return }
        let ownerCallId = callId
        reinstallTap(for: request)
        if !audioEngine.isRunning {
            do {
                try audioEngine.start()
            } catch {
                // The tap is now installed on a STOPPED engine — no more audio
                // will ever reach the recognizer for the rest of the call.
                // Degrade explicitly (mirrors startTranscribing's own catch)
                // instead of leaving `isTranscribing` lit with dead captions:
                // see `applyRecognitionError`'s doc comment.
                callsLogger.error("Failed to restart AVAudioEngine after configuration change: \(error.localizedDescription)")
                applyRecognitionError(.audioEngineFailed(underlying: error), callId: ownerCallId)
                return
            }
        }
        callsLogger.info("Reinstalled transcription tap after AVAudioEngine configuration change")
    }

    private func removeConfigurationObserver() {
        if let configurationChangeObserver {
            NotificationCenter.default.removeObserver(configurationChangeObserver)
        }
        configurationChangeObserver = nil
    }

    /// iOS auto-stops `AVAudioEngine` on ANY `AVAudioSession` interruption
    /// (Siri, an incoming GSM call, an alarm — all common mid-call), unlike
    /// `.AVAudioEngineConfigurationChange` (hardware/route reconfiguration
    /// only, handled above). Without this observer, captions silently stop
    /// producing segments for the rest of the call: no recognizer error
    /// fires (no audio buffers ≠ an error callback), so `isTranscribing`
    /// stays `true` and the captions UI keeps claiming they're live.
    private func observeAudioInterruptions() {
        removeInterruptionObserver()
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
            Task { @MainActor [weak self] in
                self?.handleAudioInterruption(type: type)
            }
        }
    }

    private func handleAudioInterruption(type: AVAudioSession.InterruptionType) {
        let action = Self.evaluateInterruptionAction(
            type: type,
            isTranscribing: isTranscribing,
            engineIsRunning: audioEngine.isRunning
        )
        guard action == .restartEngine, let request else { return }
        let ownerCallId = callId
        reinstallTap(for: request)
        do {
            try audioEngine.start()
            callsLogger.info("Restarted transcription capture after audio interruption ended")
        } catch {
            // Same failure mode as handleAudioEngineConfigurationChange above:
            // a resume that throws (mic grabbed by another app, a second
            // interruption arriving back-to-back, hardware busy) leaves the
            // tap on a stopped engine with `isTranscribing` still `true` —
            // exactly the silently-dead-captions bug this observer exists to
            // prevent (see observeAudioInterruptions's doc comment above).
            callsLogger.error("Failed to restart transcription capture after interruption: \(error.localizedDescription)")
            applyRecognitionError(.audioEngineFailed(underlying: error), callId: ownerCallId)
        }
    }

    private func removeInterruptionObserver() {
        if let interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
        }
        interruptionObserver = nil
    }

    /// Pure decision extracted from `handleAudioInterruption` so it's unit
    /// testable without a real `AVAudioEngine`/`AVAudioSession` (unavailable
    /// in the unit test host — see `applyRecognitionResult`'s doc comment
    /// for the same constraint).
    enum InterruptionAction: Equatable {
        case none
        case restartEngine
    }

    static func evaluateInterruptionAction(
        type: AVAudioSession.InterruptionType,
        isTranscribing: Bool,
        engineIsRunning: Bool
    ) -> InterruptionAction {
        guard isTranscribing else { return .none }
        switch type {
        case .began:
            return .none
        case .ended:
            return engineIsRunning ? .none : .restartEngine
        @unknown default:
            return .none
        }
    }

    /// See `startLocalCapture`'s doc comment — same `@Sendable`-typed-local
    /// requirement applies here.
    private func reinstallTap(for newRequest: SFSpeechAudioBufferRecognitionRequest) {
        audioEngine.inputNode.removeTap(onBus: 0)
        let format = audioEngine.inputNode.outputFormat(forBus: 0)
        // nonisolated(unsafe): see startLocalCapture's identical comment.
        nonisolated(unsafe) let capturedRequest = newRequest
        let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { buffer, _ in
            capturedRequest.append(buffer)
        }
        audioEngine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: format, block: tapBlock)
    }

    // MARK: - Recognition

    private func startRecognitionTask(language: String) {
        guard let recognizer, let request else { return }
        let speakerId = localUserId
        // Captured HERE (MainActor, at task-start time) so a stale callback
        // from a call that has since ended/redialed can be told apart from
        // the current one once it reaches applyRecognitionResult/Error — see
        // those methods' callId guard.
        let ownerCallId = callId
        // @Sendable-typed local: recognitionTask(with:)'s resultHandler runs
        // on the recognizer's own queue, off-MainActor — same isolation trap
        // as startLocalCapture's tap block and requestPermission's
        // authorization completion. Not yet observed crashing here (no
        // report reached this far before the requestPermission fix), but
        // it's the identical Apple-completion-handler shape, so fixed
        // preemptively rather than waiting for a third device round-trip.
        let resultHandler: @Sendable (SFSpeechRecognitionResult?, Error?) -> Void = { [weak self] result, error in
            self?.handleRecognizerCallback(result: result, error: error, speakerId: speakerId, language: language, ownerCallId: ownerCallId)
        }
        recognitionTask = recognizer.recognitionTask(with: request, resultHandler: resultHandler)
    }

    /// PERF-005: runs on the recognizer's own queue (off-Main). Extracts
    /// Sendable scalars, then hands off to MainActor for state mutation.
    nonisolated private func handleRecognizerCallback(
        result: SFSpeechRecognitionResult?,
        error: Error?,
        speakerId: String,
        language: String,
        ownerCallId: String?
    ) {
        if let error {
            let errorDescription = error.localizedDescription
            Task.detached(priority: .utility) { [weak self] in
                await MainActor.run { [weak self] in
                    self?.applyRecognitionError(.recognitionFailed(underlying: NSError(
                        domain: "CallTranscriptionService",
                        code: -2,
                        userInfo: [NSLocalizedDescriptionKey: errorDescription]
                    )), callId: ownerCallId)
                    callsLogger.error("Recognition error: \(errorDescription, privacy: .public)")
                }
            }
            return
        }

        guard let result else { return }
        // Captured HERE, at true callback-arrival time on the recognizer's
        // serial queue — not inside applyRecognitionResult after the
        // Task.detached hop below, which gives no ordering guarantee between
        // two independently detached callbacks. Re-stamping `Date()` at
        // application time could sort a later-arriving-but-earlier-applied
        // result ahead of one that truly arrived first (see appendSegment's
        // capturedAt-based sort and TranscriptionSegment's doc comment).
        let capturedAt = Date()
        let isFinal = result.isFinal
        let text = result.bestTranscription.formattedString
        let asrSegments = result.bestTranscription.segments
        let startMs = Int((asrSegments.first?.timestamp ?? 0) * 1000)
        let lastAsrSegment = asrSegments.last
        let endMs = Int(((lastAsrSegment?.timestamp ?? 0) + (lastAsrSegment?.duration ?? 0)) * 1000)
        let confidence = Double(lastAsrSegment?.confidence ?? 0)

        Task.detached(priority: .utility) { [weak self] in
            await self?.applyRecognitionResult(
                text: text, speakerId: speakerId, startMs: startMs, endMs: endMs,
                isFinal: isFinal, confidence: confidence, language: language, capturedAt: capturedAt,
                callId: ownerCallId
            )
        }
    }

    /// Internal (not `private`) so `CallTranscriptionServiceTests` can drive
    /// it directly, matching the stale-callback-after-teardown guard test.
    /// `capturedAt` is caller-supplied (arrival time), never re-stamped here
    /// — see `handleRecognizerCallback`'s comment on why application time is
    /// the wrong clock for this value.
    ///
    /// `callId` is the call that OWNED the recognition task at the moment it
    /// was started (captured in `startRecognitionTask`), not the currently
    /// active one — comparing it against `self.callId` here rejects a result
    /// from a call that has since ended and been replaced by a new one
    /// before this detached callback got a chance to run. Same defensive
    /// pattern as `P2PWebRTCClient`'s `peerConnection === self.peerConnection`
    /// identity guard and `CallManager`'s `currentCallId == callId` re-checks.
    func applyRecognitionResult(
        text: String, speakerId: String, startMs: Int, endMs: Int,
        isFinal: Bool, confidence: Double, language: String, capturedAt: Date,
        callId: String? = nil
    ) {
        guard self.callId == callId else { return }
        guard isTranscribing else { return }
        // Les révisions PARTIELLES partent toujours sur le data channel : la
        // capture peut tourner pour servir un PAIR qui écoute alors que le
        // panneau local est fermé (TranscriptionCapturePolicy) — les gâter
        // sur `isShowingOverlay` privait ce pair du flux vivant et ne lui
        // laissait que les finals, l'énoncé apparaissant d'un bloc.
        // Seul l'APPEND au journal local reste lié au panneau.

        // Le wireId (clé de journal inter-transports) est minté au PREMIER
        // résultat de l'énoncé et partagé par toutes ses révisions
        // partielles ET son final — c'est lui qui permet au pair de
        // remplacer les corrections en place (stream vivant) puis de
        // fusionner la traduction serveur, sans jamais dupliquer de ligne.
        let wireId = currentUtteranceWireId ?? UUID().uuidString.lowercased()
        currentUtteranceWireId = wireId
        let segment = TranscriptionSegment(
            id: UUID(), wireId: wireId, text: text, speakerId: speakerId,
            startTime: Double(startMs) / 1000, endTime: Double(endMs) / 1000,
            isFinal: isFinal, confidence: confidence, language: language,
            capturedAt: capturedAt
        )
        if isFinal || isShowingOverlay {
            appendSegment(segment)
        }

        guard isFinal else {
            // Révision partielle : P2P uniquement (data channel) — jamais le
            // socket, dont le débit est borné (rate limit gateway) et dont le
            // pipeline de traduction ne consomme que les finals.
            emitPartialEntry(
                wireId: wireId, text: text, speakerId: speakerId,
                confidence: confidence, language: language, capturedAt: capturedAt
            )
            return
        }
        currentUtteranceWireId = nil
        emitFinalSegment(
            wireId: wireId, text: text, speakerId: speakerId, startMs: startMs, endMs: endMs,
            confidence: confidence, language: language, capturedAt: capturedAt
        )
        rotateRecognitionRequest(language: language)
    }

    /// Internal (not `private`) so `CallTranscriptionServiceTests` can drive
    /// it directly, matching `applyRecognitionResult`'s pattern. A recognizer
    /// error means captions have genuinely stopped producing results — stop
    /// transcribing so `isTranscribing` (which the captions toggle is driven
    /// off, see `CallView`) reflects reality instead of staying lit while
    /// nothing updates, then restore `lastError` since `stopTranscribing()`
    /// clears it.
    func applyRecognitionError(_ error: TranscriptionError, callId: String? = nil) {
        guard self.callId == callId else { return }
        guard isTranscribing else { return }
        stopTranscribing()
        lastError = error
    }

    /// Double transport, un seul segment : le data channel WebRTC porte
    /// l'entrée de journal en P2P direct quand il est ouvert (affichage
    /// instantané côté pair, texte original + tag de langue), le socket part
    /// TOUJOURS (le gateway traduit par auditeur et sert de fallback quand le
    /// channel est absent/fermé). Le pair fusionne les deux arrivées par
    /// `wireId` — jamais de doublon.
    private func emitFinalSegment(
        wireId: String, text: String, speakerId: String, startMs: Int, endMs: Int,
        confidence: Double, language: String, capturedAt: Date
    ) {
        guard let callId else { return }
        let capturedAtMs = Int(capturedAt.timeIntervalSince1970 * 1000)
        sendPeerEntry?(DataChannelTranscriptEntry(
            id: wireId, callId: callId, speakerId: speakerId,
            speakerDisplayName: localDisplayName, text: text, language: language,
            capturedAtMs: capturedAtMs, isFinal: true, confidence: confidence
        ))
        let payload = CallTranscriptionSegmentPayload(
            id: wireId, text: text, speakerId: speakerId, startMs: startMs, endMs: endMs,
            isFinal: true, confidence: confidence, language: language, capturedAtMs: capturedAtMs
        )
        socket.emitCallTranscriptionSegment(callId: callId, segment: payload)
    }

    /// Révision partielle d'un énoncé en cours — data channel UNIQUEMENT
    /// (no-op silencieux si fermé : le pair verra alors l'énoncé apparaître
    /// d'un coup au final via le relais serveur, dégradation gracieuse).
    private func emitPartialEntry(
        wireId: String, text: String, speakerId: String,
        confidence: Double, language: String, capturedAt: Date
    ) {
        guard let callId else { return }
        sendPeerEntry?(DataChannelTranscriptEntry(
            id: wireId, callId: callId, speakerId: speakerId,
            speakerDisplayName: localDisplayName, text: text, language: language,
            capturedAtMs: Int(capturedAt.timeIntervalSince1970 * 1000),
            isFinal: false, confidence: confidence
        ))
    }

    private func rotateRecognitionRequest(language: String) {
        recognitionTask?.cancel()
        request?.endAudio()

        let newRequest = SFSpeechAudioBufferRecognitionRequest()
        newRequest.shouldReportPartialResults = true
        newRequest.addsPunctuation = true
        newRequest.requiresOnDeviceRecognition = true
        request = newRequest
        reinstallTap(for: newRequest)

        startRecognitionTask(language: language)
    }

    // MARK: - Remote segments (data channel P2P + relais serveur traduit)

    /// Segment relayé par le gateway (`call:translated-segment`) — si la même
    /// entrée est déjà arrivée en P2P par le data channel, la traduction vient
    /// ENRICHIR la ligne existante (fusion par `wireId`), jamais la dupliquer.
    func receiveTranslatedSegment(_ segment: TranscriptionSegment) {
        upsertRemoteSegment(segment)
    }

    /// Entrée de journal arrivée en P2P direct par le data channel WebRTC —
    /// même sink de fusion que le relais socket : premier arrivé crée la
    /// ligne, le suivant l'enrichit.
    func receivePeerEntry(_ segment: TranscriptionSegment) {
        upsertRemoteSegment(segment)
    }

    private func upsertRemoteSegment(_ segment: TranscriptionSegment) {
        guard let wireId = segment.wireId,
              let index = allSegments.firstIndex(where: { $0.wireId == wireId }) else {
            appendSegment(segment)
            return
        }
        let merged = mergedSegment(existing: allSegments[index], incoming: segment)
        allSegments[index] = merged
        segments = allSegments.sorted { $0.capturedAt < $1.capturedAt }
        guard merged.isFinal else { return }
        if let persistedIndex = persistedSegments.firstIndex(where: { $0.wireId == wireId }) {
            persistedSegments[persistedIndex] = merged
        } else {
            // L'énoncé est entré dans le journal comme révision partielle
            // (jamais persistée) et vient d'être finalisé par fusion — c'est
            // ICI qu'il gagne sa place dans l'accumulateur de persistance.
            persistedSegments.append(merged)
            if persistedSegments.count > Constants.persistedSegmentCeiling {
                persistedSegments = Array(persistedSegments.suffix(Constants.persistedSegmentCeiling))
            }
        }
    }

    /// Fusion d'un même énoncé (`wireId` partagé) à travers ses révisions et
    /// ses transports — miroir de `mergeEntries` dans
    /// `packages/shared/utils/call-transcript.ts` :
    /// 1. existant PARTIEL → la révision entrante REMPLACE le texte (stream
    ///    de corrections du moteur de l'auteur) ; le final clôt par ce chemin ;
    /// 2. existant FINAL + entrant partiel → révision périmée en retard
    ///    (aucun ordre garanti entre les deux transports), ignorée ;
    /// 3. final + final (data channel puis relais traduit) → le texte
    ///    original est conservé, traduction/nom manquant viennent enrichir.
    /// Dans tous les cas `capturedAt` garde la valeur la plus ancienne (le
    /// début de l'énoncé — l'heure de capture réelle, jamais la réception).
    private func mergedSegment(
        existing: TranscriptionSegment, incoming: TranscriptionSegment
    ) -> TranscriptionSegment {
        let displayName = existing.speakerDisplayName ?? incoming.speakerDisplayName
        let capturedAt = min(existing.capturedAt, incoming.capturedAt)
        if !existing.isFinal {
            return TranscriptionSegment(
                id: existing.id,
                wireId: existing.wireId,
                text: incoming.text,
                speakerId: existing.speakerId,
                speakerDisplayName: displayName,
                startTime: incoming.startTime,
                endTime: incoming.endTime,
                isFinal: incoming.isFinal,
                confidence: incoming.confidence,
                language: incoming.language,
                translatedText: incoming.translatedText ?? existing.translatedText,
                translatedLanguage: incoming.translatedLanguage ?? existing.translatedLanguage,
                capturedAt: capturedAt
            )
        }
        guard incoming.isFinal else {
            return TranscriptionSegment(
                id: existing.id,
                wireId: existing.wireId,
                text: existing.text,
                speakerId: existing.speakerId,
                speakerDisplayName: displayName,
                startTime: existing.startTime,
                endTime: existing.endTime,
                isFinal: true,
                confidence: existing.confidence,
                language: existing.language,
                translatedText: existing.translatedText,
                translatedLanguage: existing.translatedLanguage,
                capturedAt: capturedAt
            )
        }
        return TranscriptionSegment(
            id: existing.id,
            wireId: existing.wireId,
            text: existing.text,
            speakerId: existing.speakerId,
            speakerDisplayName: displayName,
            startTime: existing.startTime,
            endTime: existing.endTime,
            isFinal: true,
            confidence: existing.confidence,
            language: existing.language,
            translatedText: incoming.translatedText ?? existing.translatedText,
            translatedLanguage: incoming.translatedLanguage ?? existing.translatedLanguage,
            capturedAt: capturedAt
        )
    }

    // MARK: - Private — Result Handling

    private func appendSegment(_ segment: TranscriptionSegment) {
        allSegments.removeAll { $0.speakerId == segment.speakerId && !$0.isFinal }
        allSegments.append(segment)
        if allSegments.count > Constants.segmentRetentionLimit {
            allSegments = Array(allSegments.suffix(Constants.segmentRetentionLimit))
        }
        // Sorted on capturedAt (wall clock), not startTime — startTime is
        // ASR-buffer-relative and resets on every recognition-request
        // rotation, which would scramble the order of a local speaker's own
        // consecutive utterances once more than one final segment has fired.
        segments = allSegments.sorted { $0.capturedAt < $1.capturedAt }

        if segment.isFinal {
            persistedSegments.append(segment)
            if persistedSegments.count > Constants.persistedSegmentCeiling {
                persistedSegments = Array(persistedSegments.suffix(Constants.persistedSegmentCeiling))
            }
        }
    }

    private func mapAuthorizationStatus(_ status: SFSpeechRecognizerAuthorizationStatus) -> TranscriptionPermission {
        switch status {
        case .authorized: return .authorized
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }
}
