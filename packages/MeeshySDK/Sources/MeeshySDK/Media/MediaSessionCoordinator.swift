#if os(iOS)
import AVFoundation
import Combine
import Foundation
import os
import UIKit

private let logger = MeeshyLog.logger(.audioSession, subsystem: .legacySDK)

typealias DelayedScheduler = @Sendable (_ delay: TimeInterval, _ queue: DispatchQueue, _ work: @escaping @Sendable () -> Void) -> Void

enum DelayedScheduling {
    static let real: DelayedScheduler = { delay, queue, work in
        queue.asyncAfter(deadline: .now() + delay, execute: work)
    }
}

/// Coordonne l'accès à AVAudioSession entre tous les composants audio.
///
/// Actor = thread-safe garanti à la compilation. Responsible for:
/// - Activating/deactivating the shared AVAudioSession in a refcounted way
/// - Listening to system interruptions (phone calls, Siri) and route changes
///   (AirPods, headphones, Bluetooth) and rebroadcasting them so individual
///   players can pause/resume coherently
/// - Providing a single `deactivateForBackground()` entry point the app can
///   call during the scene background transition.
public actor MediaSessionCoordinator {

    public static let shared = MediaSessionCoordinator()

    public enum AudioRole: Sendable {
        case playback
        case record
        case playAndRecord
    }

    /// Events rebroadcast to players. They should pause on `.interruptionBegan`
    /// and optionally resume on `.interruptionEndedShouldResume`, and pause on
    /// `.routeChangedOldDeviceUnavailable` (unplugged headphones, etc).
    public enum Event: Sendable {
        case interruptionBegan
        case interruptionEndedShouldResume
        case interruptionEndedShouldNotResume
        case routeChangedOldDeviceUnavailable
        case routeChangedOther
        /// F3 — a VoIP call just ended (the `setCallActive` true→false edge).
        /// In-process WebRTC / RTCAudioSession teardown does NOT reliably post a
        /// system `AVAudioSession.interruptionNotification`, so media that gated
        /// itself off while `isCallActive` (story reader audio, reels) gets no
        /// `interruptionEndedShouldResume`. This explicit signal lets those
        /// SDK-internal observers re-start their gated playback. Treat it exactly
        /// like `interruptionEndedShouldResume` (resume only if still on-screen
        /// and not user-paused). SDK-internal: emitted by `setCallActive`, no
        /// dependency on the app's call layer.
        case callEndedShouldResume
    }

    private var activationCount = 0

    /// Backing lock for `callActive`, mirroring `CallManager.isCallActiveFlag`
    /// (`CallManager.swift`, `_isCallActiveLock`) — the same read-from-any-
    /// thread / write-from-MainActor shape, guarded the same way. A prior
    /// revision of this property used `nonisolated(unsafe)` on a bare `Bool`
    /// and claimed "same pattern as `CallManager.isCallActiveFlag`", but
    /// `CallManager`'s flag has always been lock-guarded — the claim was
    /// aspirational, not actual, and left this one true data race: a torn
    /// read is not guaranteed impossible by the language for a `Bool` written
    /// on the MainActor thread and read concurrently from this actor's own
    /// serial executor (`request`/`release`/`deactivateForBackground`).
    private nonisolated let _callActiveLock = OSAllocatedUnfairLock(initialState: false)
    /// Mirror of the app's VoIP call state, pushed via `setCallActive(_:)`.
    /// While `true`, the coordinator must NOT reconfigure or tear down the
    /// shared `AVAudioSession`: the call owns it as `.playAndRecord/.voiceChat`
    /// (via RTCAudioSession) and switching the category to `.playback` mid-call
    /// mutes the microphone. `nonisolated` computed property backed by
    /// `_callActiveLock` so the `@MainActor` call layer can push the flag
    /// SYNCHRONOUSLY from `callState.didSet` — avoiding a `Task`-hop whose
    /// reordering across rapid call start/end could leave the flag stuck
    /// `true` (→ session never reconfigured again → post-call audio broken) —
    /// while concurrent reads from the actor's own executor never observe a
    /// torn write. Default `false` ⇒ behavior identical to before this seam.
    private nonisolated var callActive: Bool {
        get { _callActiveLock.withLock { $0 } }
        set { _callActiveLock.withLock { $0 = newValue } }
    }
    /// Les observateurs système (interruption, route) sont posés UNE fois, du
    /// premier chemin qui touche la session — synchrone ou non. Ils n'étaient
    /// posés que par `request(role:)` : un lecteur qui n'active la session
    /// que par `activatePlaybackSync` (vidéo, story) ne recevait jamais
    /// d'interruption (#11040).
    private nonisolated let _systemObserversLock = OSAllocatedUnfairLock(initialState: false)
    nonisolated(unsafe) private var observerTokens: [any NSObjectProtocol] = []

    /// `true` tant qu'un contenu AUDIBLE de Meeshy a activé la session
    /// `.playback` et que rien ne l'a rendue depuis. Une vidéo muette lit ce
    /// drapeau pour ne pas rétrograder la session sous un son qui joue
    /// (`ContentPlaybackSessionLaw`, #11039).
    private nonisolated let _audibleHoldLock = OSAllocatedUnfairLock(initialState: false)
    nonisolated var audibleContentHoldsSession: Bool {
        get { _audibleHoldLock.withLock { $0 } }
        set { _audibleHoldLock.withLock { $0 = newValue } }
    }

    /// **Le bail de lecture** (#9702) : `true` quand la DERNIÈRE opération de ce
    /// coordinateur sur la session a été une activation `.playback` réussie, et
    /// que rien ne l'a révoquée depuis. Chaque balayage de réel appelait
    /// `setActive(true)` — un aller-retour BLOQUANT au serveur audio, sur le
    /// fil principal — pour une session déjà active dans la bonne catégorie.
    ///
    /// Tout ce qui peut désactiver ou reconfigurer la session par ce
    /// coordinateur le révoque (désactivation, enregistrement, rôle refcompté,
    /// arrière-plan, bascule d'appel), et les signaux système aussi
    /// (interruption, réinitialisation des services média). Un composant qui
    /// change la CATÉGORIE ailleurs est rattrapé par `playbackConfigurationDiffers`,
    /// qui reste lu à chaque appel.
    private nonisolated let _playbackLeaseLock = OSAllocatedUnfairLock(initialState: false)
    nonisolated var playbackLeaseHeld: Bool {
        get { _playbackLeaseLock.withLock { $0 } }
        set { _playbackLeaseLock.withLock { $0 = newValue } }
    }
    private nonisolated let _leaseObserversLock = OSAllocatedUnfairLock(initialState: false)

    /// `true` entre le début et la fin d'un enregistrement dans Meeshy (vocal,
    /// caméra) : aucun lecteur de contenu ne reconfigure ni ne rend la session
    /// (`RecordingSessionLaw.contentMayReconfigureSession`, #11042) — `.playback`
    /// couperait le micro, une désactivation arrêterait la prise.
    private nonisolated let _recordingHoldLock = OSAllocatedUnfairLock(initialState: false)
    nonisolated var recordingHoldsSession: Bool {
        get { _recordingHoldLock.withLock { $0 } }
        set { _recordingHoldLock.withLock { $0 = newValue } }
    }
    private nonisolated var contentMayReconfigureSession: Bool {
        RecordingSessionLaw.contentMayReconfigureSession(recordingHoldsSession: recordingHoldsSession)
    }
    /// Compte les prises de session (lecture, enregistrement, rôle) : une
    /// désactivation différée ne s'exécute que si aucune prise n'est survenue
    /// depuis qu'elle a été demandée.
    private nonisolated let _activationGeneration = OSAllocatedUnfairLock(initialState: 0)
    private nonisolated func bumpActivationGeneration() {
        _activationGeneration.withLock { $0 &+= 1 }
    }

    /// Backing lock for `emit(_:)`. `PassthroughSubject.send(_:)` is not
    /// documented thread-safe for concurrent callers — `emit(_:)` is invoked
    /// both synchronously from the MainActor (`setCallActive`) and from this
    /// actor's own serial executor (`forward(_:)`, reached via `Task` off a
    /// system-notification callback), two distinct execution contexts that
    /// can genuinely overlap (e.g. a call ending at the same instant a route
    /// change fires). Serializing `send(_:)` itself — not the whole event
    /// pipeline — keeps both call sites synchronous.
    private nonisolated let _eventsLock = OSAllocatedUnfairLock(initialState: ())

    /// Non-isolated Combine subject so observers can subscribe from any
    /// context without hopping into the actor. Only ever published to via
    /// `emit(_:)`, which serializes concurrent senders with `_eventsLock` —
    /// do not call `.send(_:)` on this subject directly from a new call site.
    public nonisolated(unsafe) let events = PassthroughSubject<Event, Never>()

    /// Single, lock-serialized entry point for publishing on `events`. See
    /// `_eventsLock`.
    private nonisolated func emit(_ event: Event) {
        _eventsLock.withLock { _ in events.send(event) }
    }

    #if DEBUG
    /// Test seam: increments `deactivateCount` from callers that want to
    /// assert whether `deactivateForBackground()` was reached via the
    /// background transition path. `nonisolated(unsafe)` so a synchronous
    /// `MediaSessionCoordinator.shared.testProbe = probe` assignment from a
    /// test running on `@MainActor` does not require an `await` hop. The
    /// probe is only read/written from `@MainActor` callers in this codebase.
    public nonisolated(unsafe) var testProbe: MediaSessionCoordinatorTestProbe?
    #endif

    private nonisolated let scheduleAfter: DelayedScheduler

    /// **La file série UNIQUE de la session audio** (#17038). Chaque
    /// `setCategory` / `setActive` est un aller-retour SYNCHRONE vers le
    /// serveur audio — jusqu'à 1,69 s mesuré par HangTracer sur le fil
    /// principal. Tout ce qui écrit la session passe par cette file : les
    /// appels rendent la main tout de suite, et l'ordre des appels EST l'ordre
    /// des effets (une désactivation demandée avant une relance ne passe
    /// jamais après elle). Les décisions qui dépendent de l'état (appel,
    /// enregistrement, bail, configuration) se prennent AU MOMENT de
    /// l'exécution, sur la file. La couche appel y pose aussi sa session
    /// (`CallAudioSessionController.audioSessionQueue`).
    public nonisolated let sessionQueue = DispatchQueue(label: "me.meeshy.media-session", qos: .userInitiated)
    nonisolated let audioSession: any AudioSessionProviding
    private nonisolated let _pendingSessionWork = OSAllocatedUnfairLock(initialState: 0)

    /// `true` tant qu'une écriture de session attend ou s'exécute sur la file.
    nonisolated var hasPendingSessionWork: Bool { _pendingSessionWork.withLock { $0 > 0 } }

    /// **La file ordonnée des prises de lecture** (#9879) : une `Task` par appel
    /// ne garantit aucun ordre entre une libération et la requête qui la suit.
    /// `enqueue` est synchrone, `AsyncStream` est FIFO et un seul consommateur
    /// l'exécute dans l'acteur — l'ordre des appels EST l'ordre des effets.
    private nonisolated let _opsLock = OSAllocatedUnfairLock<AsyncStream<PlaybackSessionOp>.Continuation?>(initialState: nil)

    enum PlaybackSessionOp: Sendable {
        case request
        case release
        case deactivateIfIdle(generation: Int)
        case barrier(CheckedContinuation<Void, Never>)
    }

    /// Le centre où les signaux qui révoquent le bail sont écoutés : `.default`
    /// en production. Un témoin en reçoit un à part, pour qu'une interruption
    /// publiée par une suite parallèle ne révoque pas son bail.
    private nonisolated let leaseNotificationCenter: NotificationCenter

    private init(
        scheduleAfter: @escaping DelayedScheduler = DelayedScheduling.real,
        session: any AudioSessionProviding = SystemAudioSession(),
        leaseNotificationCenter: NotificationCenter = .default
    ) {
        self.scheduleAfter = scheduleAfter
        self.audioSession = session
        self.leaseNotificationCenter = leaseNotificationCenter
    }

    #if DEBUG
    /// Une instance à part (tests) : le compteur du singleton est partagé avec
    /// des suites qui tournent en parallèle et le remettent à zéro.
    static func makeForTesting(
        scheduleAfter: @escaping DelayedScheduler = DelayedScheduling.real,
        session: any AudioSessionProviding = SystemAudioSession(),
        leaseNotificationCenter: NotificationCenter = .default
    ) -> MediaSessionCoordinator {
        MediaSessionCoordinator(scheduleAfter: scheduleAfter, session: session, leaseNotificationCenter: leaseNotificationCenter)
    }
    #endif

    // MARK: - File de session (#17038)

    /// Met une écriture de session en file. Ne bloque jamais l'appelant.
    nonisolated func onSessionQueue(_ work: @escaping @Sendable () -> Void) {
        _pendingSessionWork.withLock { $0 += 1 }
        sessionQueue.async { [self] in
            work()
            _pendingSessionWork.withLock { $0 -= 1 }
        }
    }

    /// Exécute `work` sur la file et en attend l'issue, sans bloquer le fil
    /// de l'appelant.
    nonisolated func awaitSessionQueue<T: Sendable>(_ work: @escaping @Sendable () throws -> T) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            onSessionQueue { continuation.resume(with: Result { try work() }) }
        }
    }

    /// Rend quand tout ce qui a été mis en file de session avant l'appel est
    /// exécuté.
    public nonisolated func sessionSettled() async {
        await withCheckedContinuation { continuation in
            onSessionQueue { continuation.resume() }
        }
    }

    /// **L'attente d'une lecture audible** : `body` s'exécute sur le fil
    /// principal une fois la session posée. Sans écriture en file, il
    /// s'exécute tout de suite, sans saut de fil (un balayage de réel sous
    /// bail ne paie rien).
    public nonisolated func whenSessionSettled(_ body: @escaping @MainActor @Sendable () -> Void) {
        guard hasPendingSessionWork || !Thread.isMainThread else {
            return MainActor.assumeIsolated { body() }
        }
        onSessionQueue {
            Task { @MainActor in body() }
        }
    }

    deinit {
        let center = NotificationCenter.default
        for token in observerTokens {
            center.removeObserver(token)
        }
    }

    /// Push the app's VoIP call state into the coordinator (call on call
    /// start/end). While active, `request`/`release` skip ALL shared-session
    /// (re)configuration so the call keeps ownership of `.playAndRecord`.
    /// `nonisolated` + synchronous so `CallManager.callState.didSet` can call it
    /// without a `Task` hop (no reorder risk). SDK stays call-layer-agnostic:
    /// the app wires this from `CallManager`.
    public nonisolated func setCallActive(_ active: Bool) {
        // Read-and-write in one lock transaction rather than two separate
        // `callActive` accesses, so the wasActive/active comparison below
        // always reflects THIS call's own transition, never a torn view
        // spliced with a concurrent write.
        let wasActive = _callActiveLock.withLock { current -> Bool in
            let old = current
            current = active
            return old
        }
        // L'appel prend ou rend la session (RTCAudioSession) : ce que ce
        // coordinateur y avait activé ne tient plus.
        playbackLeaseHeld = false
        audibleContentHoldsSession = false
        // L'appel arrête la capture d'un vocal (`stopForCall`) : la session
        // n'appartient plus à l'enregistrement.
        recordingHoldsSession = false
        // On the true→false edge, broadcast an explicit resume signal. The system
        // interruption-ended notification is NOT reliably posted for in-process
        // WebRTC/RTCAudioSession call teardown, so SDK media that gated itself off
        // during the call (story reader audio, reels) would otherwise stay silent
        // until the next slide/page change. Emitted AFTER `callActive = false` so
        // any observer that re-checks `isCallActive` sees the cleared state.
        if wasActive && !active {
            emit(.callEndedShouldResume)
            // Meeshy rend la main si rien ne reprend après l'appel (#11040, j).
            releaseAfterUnresumedInterruption()
        }
    }

    /// `true` tant qu'un appel VoIP possède la session audio (`.playAndRecord/
    /// .voiceChat` via RTCAudioSession). Lu par les composants SDK qui posent la
    /// session DIRECTEMENT (vidéo, story) afin de NE PAS la reconfigurer pendant
    /// un appel (sinon micro coupé) — source UNIQUE de l'état d'appel côté SDK,
    /// sans dépendance à la couche appel de l'app. `nonisolated` → lecture sync.
    public nonisolated var isCallActive: Bool { callActive }

    /// Pose la session `.playback` (call-aware) — source UNIQUE de la config de
    /// session de lecture pour les composants dont `load`/`play` sont
    /// synchrones (vidéo `SharedAVPlayerManager`, story, éditeurs), par
    /// opposition aux moteurs voice-note qui passent par `request(role:)`
    /// refcompté. Rend la main TOUT DE SUITE : l'écriture part sur
    /// `sessionQueue` (#17038), et une lecture qui doit l'attendre passe par
    /// `whenSessionSettled`. NE TOUCHE PAS la session pendant un appel VoIP
    /// (sinon micro coupé), y compris quand l'appel commence entre la demande
    /// et son exécution. Pas de refcount : `PlaybackCoordinator` garantit déjà
    /// l'exclusion mutuelle entre lecteurs.
    public nonisolated func activatePlaybackSync(
        mode: AVAudioSession.Mode = .default,
        options: AVAudioSession.CategoryOptions
    ) {
        installLeaseObserversIfNeeded()
        observeSystemEvents()
        guard Self.shouldManageSession(callActive: callActive) else { return }
        bumpActivationGeneration()
        // Sous bail identique et file vide, rien à écrire ni à attendre : un
        // balayage de réel ne paie aucun saut de fil.
        guard hasPendingSessionWork || playbackActivationNeeded(mode: mode, options: options) else { return }
        onSessionQueue { [self] in performPlaybackActivation(mode: mode, options: options) }
    }

    /// L'écriture d'une activation `.playback`, sur `sessionQueue`. La décision
    /// se reprend sur l'état du moment : un appel commencé, un enregistrement
    /// posé ou un bail pris depuis la demande la changent.
    nonisolated func performPlaybackActivation(mode: AVAudioSession.Mode, options: AVAudioSession.CategoryOptions) {
        guard playbackActivationNeeded(mode: mode, options: options) else { return }
        // Independent do/catch per call — a setCategory failure must not skip
        // the setActive attempt. `setCategory` is skipped when the session
        // already carries exactly this configuration.
        if currentPlaybackConfigurationDiffers(mode: mode, options: options) {
            do {
                try audioSession.setCategory(.playback, mode: mode, options: options)
            } catch {
                logger.error("activatePlaybackSync: setCategory failed — \(error.localizedDescription, privacy: .public)")
            }
        }
        do {
            try audioSession.setActive(true, options: [])
            playbackLeaseHeld = true
            audibleContentHoldsSession = true
        } catch {
            playbackLeaseHeld = false
            logger.error("activatePlaybackSync: setActive failed — \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Faut-il écrire la session pour cette lecture ? Jamais pendant un appel
    /// ni sous un enregistrement ; sinon dès que la configuration diffère ou
    /// que ce coordinateur ne tient pas le bail (#9702).
    private nonisolated func playbackActivationNeeded(mode: AVAudioSession.Mode, options: AVAudioSession.CategoryOptions) -> Bool {
        guard Self.shouldManageSession(callActive: callActive), contentMayReconfigureSession else { return false }
        return Self.shouldActivatePlayback(
            configurationDiffers: currentPlaybackConfigurationDiffers(mode: mode, options: options),
            leaseHeld: playbackLeaseHeld
        )
    }

    private nonisolated func currentPlaybackConfigurationDiffers(mode: AVAudioSession.Mode, options: AVAudioSession.CategoryOptions) -> Bool {
        Self.playbackConfigurationDiffers(
            currentCategory: audioSession.category, currentMode: audioSession.mode,
            currentOptions: audioSession.categoryOptions, mode: mode, options: options
        )
    }

    /// Pose la session d'un enregistrement (vocal, caméra) telle que la dit
    /// `RecordingSessionLaw` — par `MeeshyRecordingSession`, seul appelant —
    /// sur `sessionQueue`, et rend son issue à `completion` sur le fil
    /// principal : l'enregistreur démarre une fois la session posée, sans que
    /// l'interface ait attendu (#17038). Call-aware : pendant un appel VoIP la
    /// session appartient à RTCAudioSession — la reconfigurer casserait
    /// l'uplink micro de l'appel. `holding` : un enregistrement commence, et
    /// les lecteurs de contenu ne touchent plus la session jusqu'à
    /// `releaseRecordingHold()`. `false` ⇒ la session n'a pas pu être prise.
    public nonisolated func activateRecording(
        _ configuration: RecordingSessionConfiguration,
        holding: Bool,
        completion: @escaping @MainActor @Sendable (Bool) -> Void
    ) {
        observeSystemEvents()
        guard Self.shouldManageSession(callActive: callActive) else {
            return Self.deliverOnMain(false, to: completion)
        }
        bumpActivationGeneration()
        playbackLeaseHeld = false
        audibleContentHoldsSession = false
        onSessionQueue { [self] in
            Self.deliverOnMain(performRecordingActivation(configuration, holding: holding), to: completion)
        }
    }

    private nonisolated func performRecordingActivation(_ configuration: RecordingSessionConfiguration, holding: Bool) -> Bool {
        guard Self.shouldManageSession(callActive: callActive) else { return false }
        playbackLeaseHeld = false
        audibleContentHoldsSession = false
        let differs = Self.recordingConfigurationDiffers(
            currentCategory: audioSession.category, currentMode: audioSession.mode,
            currentOptions: audioSession.categoryOptions, configuration: configuration
        )
        do {
            if differs {
                try audioSession.setCategory(configuration.category, mode: configuration.mode, options: configuration.options)
            }
            try audioSession.setActive(true, options: [])
        } catch {
            logger.error("activateRecording failed — \(error.localizedDescription, privacy: .public)")
            return false
        }
        if holding { recordingHoldsSession = true }
        return true
    }

    private nonisolated static func deliverOnMain(_ value: Bool, to completion: @escaping @MainActor @Sendable (Bool) -> Void) {
        Task { @MainActor in completion(value) }
    }

    /// Pure : la session porte-t-elle déjà exactement cette configuration
    /// d'enregistrement ? Reposer la même catégorie sous une capture qui tourne
    /// la reconfigurerait pour rien.
    nonisolated static func recordingConfigurationDiffers(
        currentCategory: AVAudioSession.Category,
        currentMode: AVAudioSession.Mode,
        currentOptions: AVAudioSession.CategoryOptions,
        configuration: RecordingSessionConfiguration
    ) -> Bool {
        currentCategory != configuration.category
            || currentMode != configuration.mode
            || currentOptions != configuration.options
    }

    /// Rend la session (call-aware : ne coupe rien pendant un appel, la session
    /// appartient alors à l'appel). Rend la main tout de suite : la
    /// désactivation passe sur `sessionQueue`, à son rang (#17038).
    public nonisolated func deactivatePlaybackSync() {
        playbackLeaseHeld = false
        audibleContentHoldsSession = false
        onSessionQueue { [self] in performPlaybackDeactivation() }
    }

    /// L'écriture d'une désactivation, sur `sessionQueue`.
    nonisolated func performPlaybackDeactivation() {
        playbackLeaseHeld = false
        audibleContentHoldsSession = false
        guard Self.shouldManageSession(callActive: callActive), contentMayReconfigureSession else { return }
        do {
            try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            logger.error("deactivatePlaybackSync failed — \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Rend la session à son rang sur `sessionQueue`. Le bail tombe tout de
    /// suite, pour qu'une relance immédiate réactive la session ; et la
    /// désactivation s'efface si une prise est survenue entre la demande et son
    /// exécution — vérifié SUR la file, sinon elle coupait le lecteur relancé.
    public nonisolated func deactivatePlaybackDeferred() {
        deactivatePlaybackDeferred(on: sessionQueue) { [self] in performPlaybackDeactivation() }
    }

    /// **Rend la main après une pause de l'utilisateur** (#11039) : la session
    /// se désactive avec `.notifyOthersOnDeactivation` au bout de
    /// `ContentPlaybackSessionLaw.userPauseReleaseDelay`, pour que la musique
    /// que Meeshy a mise en pause reprenne — et une relance dans l'intervalle
    /// (toute prise de session) annule la libération. Le lecteur doit être en
    /// pause AVANT l'appel : une désactivation sous un lecteur qui tourne
    /// échoue.
    public nonisolated func releaseAfterUserPause() {
        releaseContentSession(after: ContentPlaybackSessionLaw.userPauseReleaseDelay, on: sessionQueue)
    }

    /// **Rend la main après une interruption sans reprise** (#11040, décision
    /// j) : fin d'interruption sans `shouldResume`, utilisateur qui a mis en
    /// pause pendant l'appel, appel Meeshy raccroché sans rien à reprendre.
    /// Appelé par le coordinateur lui-même à chaque fin d'interruption : les
    /// lecteurs qui reprennent réactivent la session pendant
    /// `ContentSessionReleaseLaw.interruptionResumeGrace`, ce qui annule la
    /// libération ; sinon la session se rend et la musique interrompue repart.
    public nonisolated func releaseAfterUnresumedInterruption() {
        releaseContentSession(after: ContentSessionReleaseLaw.interruptionResumeGrace, on: sessionQueue)
    }

    /// La libération CENTRALE d'une session de contenu : au bout de `delay`,
    /// sur le fil principal, elle s'efface si une lecture a repris la session
    /// depuis la demande ou si un lecteur Meeshy joue encore
    /// (`ContentSessionReleaseLaw.mayRelease`) ; sinon la désactivation
    /// (bloquante) part sur `queue` — `sessionQueue` en production.
    nonisolated func releaseContentSession(
        after delay: TimeInterval,
        on queue: DispatchQueue,
        meeshyStillPlays: @escaping @MainActor @Sendable () -> Bool = { RecordingPlaybackDucker.shared.meeshyStillPlays },
        deactivate: (@Sendable () -> Void)? = nil
    ) {
        playbackLeaseHeld = false
        let generation = _activationGeneration.withLock { $0 }
        let run: @Sendable () -> Void = deactivate ?? { [self] in performPlaybackDeactivation() }
        scheduleAfter(delay, .main) { [self] in
            let stillPlays = MainActor.assumeIsolated { meeshyStillPlays() }
            let activated = _activationGeneration.withLock { $0 } != generation
            guard ContentSessionReleaseLaw.mayRelease(activatedSinceRequest: activated, meeshyStillPlays: stillPlays) else { return }
            dispatch(on: queue) { [self] in
                guard _activationGeneration.withLock({ $0 }) == generation else { return }
                run()
            }
        }
    }

    nonisolated func deactivatePlaybackDeferred(
        on queue: DispatchQueue,
        after delay: TimeInterval = 0,
        deactivate: @escaping @Sendable () -> Void
    ) {
        playbackLeaseHeld = false
        let generation = _activationGeneration.withLock { $0 }
        let run: @Sendable () -> Void = { [self] in
            guard _activationGeneration.withLock({ $0 }) == generation else { return }
            deactivate()
        }
        guard delay > 0 else { return dispatch(on: queue, run) }
        scheduleAfter(delay, queue, run)
    }

    /// `sessionQueue` passe par `onSessionQueue`, qui compte l'écriture en
    /// attente ; une autre file (témoins) reçoit le travail tel quel.
    private nonisolated func dispatch(on queue: DispatchQueue, _ work: @escaping @Sendable () -> Void) {
        guard queue === sessionQueue else { return queue.async(execute: work) }
        onSessionQueue(work)
    }

    /// **Le point d'entrée des lecteurs de CONTENU** (#11039) : la session
    /// devient ce que dit `ContentPlaybackSessionLaw` pour ce contenu. Un son
    /// met la musique des autres apps en pause ; une vidéo muette n'y touche
    /// pas. Call-aware, rend la main tout de suite : la loi se lit sur l'état
    /// du moment, sur `sessionQueue` — un son mis en file avant une vidéo
    /// muette n'est pas rétrogradé par elle (#17038).
    public nonisolated func activateContentPlayback(
        _ audibility: ContentPlaybackAudibility = .audible,
        mode: AVAudioSession.Mode = .default
    ) {
        installLeaseObserversIfNeeded()
        observeSystemEvents()
        guard Self.shouldManageSession(callActive: callActive) else { return }
        bumpActivationGeneration()
        guard hasPendingSessionWork || contentSessionWorkNeeded(audibility, mode: mode) else { return }
        onSessionQueue { [self] in performContentPlayback(audibility, mode: mode) }
    }

    private nonisolated func contentDirective(_ audibility: ContentPlaybackAudibility) -> ContentPlaybackSessionDirective {
        ContentPlaybackSessionLaw.directive(for: audibility, audibleContentHoldsSession: audibleContentHoldsSession)
    }

    private nonisolated func contentSessionWorkNeeded(_ audibility: ContentPlaybackAudibility, mode: AVAudioSession.Mode) -> Bool {
        switch contentDirective(audibility) {
        case .activatePlayback:
            return playbackActivationNeeded(mode: mode, options: ContentPlaybackSessionLaw.audibleOptions)
        case .configureAmbientWithoutActivating:
            return Self.shouldManageSession(callActive: callActive)
                && contentMayReconfigureSession
                && audioSession.category != .ambient
        case .leaveSessionAlone:
            return false
        }
    }

    private nonisolated func performContentPlayback(_ audibility: ContentPlaybackAudibility, mode: AVAudioSession.Mode) {
        switch contentDirective(audibility) {
        case .activatePlayback:
            performPlaybackActivation(mode: mode, options: ContentPlaybackSessionLaw.audibleOptions)
        case .configureAmbientWithoutActivating:
            configureAmbientForMutedPlayback()
        case .leaveSessionAlone:
            return
        }
    }

    /// Une lecture muette compte comme une prise (une libération différée ne
    /// la coupe pas), mais ne s'approprie pas la session : `.ambient` est
    /// mélangeable, et l'activation implicite d'`AVPlayer` ne coupera rien.
    /// Sur `sessionQueue`.
    private nonisolated func configureAmbientForMutedPlayback() {
        observeSystemEvents()
        guard Self.shouldManageSession(callActive: callActive), contentMayReconfigureSession else { return }
        playbackLeaseHeld = false
        guard audioSession.category != .ambient else { return }
        do {
            try audioSession.setCategory(.ambient, mode: .default, options: [])
        } catch {
            logger.error("configureAmbientForMutedPlayback: setCategory failed — \(error.localizedDescription, privacy: .public)")
        }
    }

    #if DEBUG
    /// Une prise de session, sans toucher la session réelle (tests : les
    /// suites voisines changent `callActive` en parallèle).
    nonisolated func noteActivationForTesting() { bumpActivationGeneration() }
    #endif

    /// Pure, testable decision: may the coordinator (re)configure or tear down
    /// the shared `AVAudioSession` right now? `false` while a VoIP call owns it
    /// — switching the category to `.playback` mid-call mutes the microphone.
    /// `nonisolated static` so the call-aware contract is unit-testable without
    /// touching the real `AVAudioSession`.
    nonisolated static func shouldManageSession(callActive: Bool) -> Bool {
        !callActive
    }

    /// Pure, testable decision behind `activatePlaybackSync`: reconfigure only
    /// when the session is not already `.playback` with this mode and options.
    nonisolated static func playbackConfigurationDiffers(
        currentCategory: AVAudioSession.Category,
        currentMode: AVAudioSession.Mode,
        currentOptions: AVAudioSession.CategoryOptions,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions
    ) -> Bool {
        currentCategory != .playback || currentMode != mode || currentOptions != options
    }

    /// Pure, testable decision behind the `setActive(true)` of
    /// `activatePlaybackSync` (#9702): skipped only when the session already
    /// carries this exact configuration AND this coordinator's last act on it
    /// was a successful `.playback` activation that nothing has revoked since.
    nonisolated static func shouldActivatePlayback(configurationDiffers: Bool, leaseHeld: Bool) -> Bool {
        configurationDiffers || !leaseHeld
    }

    /// Les signaux SYSTÈME qui retirent la session à l'app sans passer par ce
    /// coordinateur — interruption (appel cellulaire, Siri, alarme),
    /// réinitialisation des services média, arrière-plan — révoquent le bail. Installés une
    /// fois, au premier `activatePlaybackSync`, sans saut sur l'acteur.
    private nonisolated func installLeaseObserversIfNeeded() {
        let firstCall = _leaseObserversLock.withLock { installed -> Bool in
            guard !installed else { return false }
            installed = true
            return true
        }
        guard firstCall else { return }
        let lease = _playbackLeaseLock
        let audibleHold = _audibleHoldLock
        let center = leaseNotificationCenter
        // Le passage en arrière-plan aussi : une app suspendue perd sa session
        // sans interruption notifiée (iOS 14.5+), et le premier balayage au
        // retour doit la réactiver.
        let revoking: [Notification.Name] = [
            AVAudioSession.interruptionNotification,
            AVAudioSession.mediaServicesWereResetNotification,
            UIApplication.didEnterBackgroundNotification,
        ]
        for name in revoking {
            _ = center.addObserver(forName: name, object: nil, queue: nil) { _ in
                lease.withLock { $0 = false }
                audibleHold.withLock { $0 = false }
            }
        }
    }

    /// Active AVAudioSession pour le rôle demandé.
    public func request(
        role: AudioRole,
        playbackOptions: AVAudioSession.CategoryOptions = ContentPlaybackSessionLaw.audibleOptions
    ) async throws {
        observeSystemEvents()
        bumpActivationGeneration()
        playbackLeaseHeld = false
        audibleContentHoldsSession = false
        // Le compteur compte des DÉTENTEURS, pas des activations réussies :
        // chaque appelant pose son drapeau avant d'attendre `request` (erreur ignorée) et rendra
        // sa prise par `release()` même si l'activation jette. Compter après le
        // `try` faisait retirer à ce `release()` la prise d'un autre détenteur.
        activationCount += 1
        try await awaitSessionQueue { [self] in
            try performRoleActivation(role, playbackOptions: playbackOptions)
        }
    }

    /// L'écriture d'une prise refcomptée, sur `sessionQueue`.
    private nonisolated func performRoleActivation(
        _ role: AudioRole,
        playbackOptions: AVAudioSession.CategoryOptions
    ) throws {
        // Never reconfigure the shared session while a VoIP call owns it (would
        // mute the mic). The refcount still tracks holders so balancing across
        // the call boundary stays coherent.
        let recordingKeepsSession = role == .playback && !contentMayReconfigureSession
        guard Self.shouldManageSession(callActive: callActive), !recordingKeepsSession else { return }
        #if DEBUG
        if let probe = testProbe, probe.failNextRequest {
            probe.failNextRequest = false
            throw MediaSessionCoordinatorTestProbe.SimulatedFailure()
        }
        #endif
        switch role {
        case .playback:
            try audioSession.setCategory(.playback, mode: .default, options: playbackOptions)
        case .record:
            try audioSession.setCategory(.record, mode: .default, options: [])
        case .playAndRecord:
            // Audit P2-iOS-3 — `.allowBluetoothHFP` explicitly (the deprecated
            // `.allowBluetooth` alias), aligned with the call-path policy.
            try audioSession.setCategory(.playAndRecord, mode: .default,
                                         options: [.defaultToSpeaker, .allowBluetoothHFP])
        }
        #if DEBUG
        testProbe?.calls.append(.activate)
        #endif
        try audioSession.setActive(true, options: [])
        audibleContentHoldsSession = role == .playback
    }

    /// Libère la session si personne d'autre ne l'utilise.
    public func release() async {
        guard activationCount > 0 else { return }
        activationCount -= 1
        if activationCount == 0 { deactivateSession() }
    }

    private func deactivateSession() {
        guard Self.shouldManageSession(callActive: callActive), contentMayReconfigureSession else { return }
        playbackLeaseHeld = false
        audibleContentHoldsSession = false
        #if DEBUG
        testProbe?.calls.append(.deactivate)
        #endif
        onSessionQueue { [self] in
            guard Self.shouldManageSession(callActive: callActive), contentMayReconfigureSession else { return }
            do {
                try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                logger.error("release: setActive(false) failed — \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    // MARK: - File ordonnée (#9879)

    /// Prend la session `.playback` à son rang dans la file.
    public nonisolated func requestPlaybackInOrder() { enqueue(.request) }

    /// Rend la prise à son rang dans la file. Le dernier détenteur ne désactive
    /// qu'au bout de `ContentSessionReleaseLaw.swipeHandoverGrace` : la requête
    /// du canvas suivant, au balayage, annule la désactivation (la musique des
    /// autres apps ne baisse plus puis ne remonte plus).
    public nonisolated func releasePlaybackInOrder() { enqueue(.release) }

    nonisolated func enqueue(_ op: PlaybackSessionOp) {
        let continuation = _opsLock.withLock { state -> AsyncStream<PlaybackSessionOp>.Continuation in
            if let existing = state { return existing }
            let (stream, continuation) = AsyncStream.makeStream(of: PlaybackSessionOp.self)
            state = continuation
            Task { [weak self] in
                for await next in stream {
                    guard let self else { return }
                    await self.perform(next)
                }
            }
            return continuation
        }
        continuation.yield(op)
    }

    /// Rend quand tout ce qui a été mis en file avant l'appel est exécuté.
    func settled() async {
        await withCheckedContinuation { enqueue(.barrier($0)) }
    }

    private func perform(_ op: PlaybackSessionOp) async {
        switch op {
        case .request:
            do {
                try await request(role: .playback)
            } catch {
                logger.error("ordered request failed — \(error.localizedDescription, privacy: .public)")
            }
        case .release:
            releaseHandingOver()
        case .deactivateIfIdle(let generation):
            guard activationCount == 0, _activationGeneration.withLock({ $0 }) == generation else { return }
            deactivateSession()
        case .barrier(let continuation):
            continuation.resume()
        }
    }

    private func releaseHandingOver() {
        guard activationCount > 0 else { return }
        activationCount -= 1
        guard activationCount == 0 else { return }
        let generation = _activationGeneration.withLock { $0 }
        scheduleAfter(ContentSessionReleaseLaw.swipeHandoverGrace, .main) { [weak self] in
            self?.enqueue(.deactivateIfIdle(generation: generation))
        }
    }

    /// Called during the `.background` scene transition. Forces the session
    /// to release even if the refcount is still > 0 — individual players are
    /// expected to have been stopped by `PlaybackCoordinator.stopAll()`
    /// beforehand. Fails quietly if the session is already inactive.
    ///
    /// During an active call the audio session is owned by RTCAudioSession /
    /// CallKit, NOT by this coordinator — tearing it down here would mute a
    /// live VoIP call the moment the user locks the screen. Mirror the
    /// `callActive` guard every other method in this class already applies.
    public func deactivateForBackground() async {
        playbackLeaseHeld = false
        audibleContentHoldsSession = false
        guard Self.shouldManageSession(callActive: callActive), contentMayReconfigureSession else { return }
        activationCount = 0
        #if DEBUG
        testProbe?.deactivateCount += 1
        #endif
        await sessionSettled(after: { [self] in
            guard Self.shouldManageSession(callActive: callActive), contentMayReconfigureSession else { return }
            do {
                try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                logger.error("deactivateForBackground failed: \(error.localizedDescription, privacy: .public)")
            }
        })
    }

    /// Exécute `work` sur `sessionQueue` et rend quand il est fait.
    private nonisolated func sessionSettled(after work: @escaping @Sendable () -> Void) async {
        await withCheckedContinuation { continuation in
            onSessionQueue {
                work()
                continuation.resume()
            }
        }
    }

    // MARK: - System observers

    /// Pose les observateurs d'interruption et de route s'ils ne le sont pas
    /// encore. Appelé par chaque chemin qui touche la session, et par tout
    /// abonné à `events` qui veut les recevoir avant sa première activation.
    /// `nonisolated` et synchrone : aucun saut d'acteur sur le fil principal,
    /// et l'événement est publié dès sa réception.
    public nonisolated func observeSystemEvents() {
        _systemObserversLock.withLock { installed in
            guard !installed else { return }
            installed = true
            let center = NotificationCenter.default
            observerTokens.append(center.addObserver(
                forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
            ) { [weak self] notification in
                self?.forward(Self.parseInterruption(notification))
            })
            observerTokens.append(center.addObserver(
                forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
            ) { [weak self] notification in
                self?.forward(Self.parseRouteChange(notification))
            })
        }
    }

    nonisolated private func forward(_ event: Event?) {
        guard let event else { return }
        logger.info("Audio session event: \(String(describing: event))")
        emit(event)
        // Meeshy rend la main si rien ne reprend (#11040, j).
        if ContentSessionReleaseLaw.endsAnInterruption(event) {
            releaseAfterUnresumedInterruption()
        }
    }

    private nonisolated static func parseInterruption(_ notification: Notification) -> Event? {
        guard let info = notification.userInfo,
              let rawType = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType) else {
            return nil
        }
        switch type {
        case .began:
            return .interruptionBegan
        case .ended:
            let optionsRaw = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
            return options.contains(.shouldResume)
                ? .interruptionEndedShouldResume
                : .interruptionEndedShouldNotResume
        @unknown default:
            return nil
        }
    }

    private nonisolated static func parseRouteChange(_ notification: Notification) -> Event? {
        guard let info = notification.userInfo,
              let rawReason = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason) else {
            return nil
        }
        switch reason {
        case .oldDeviceUnavailable:
            if let previousRoute = info[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription,
               !previousRoute.outputs.isEmpty {
                return .routeChangedOldDeviceUnavailable
            }
            return .routeChangedOther
        default:
            return .routeChangedOther
        }
    }
}

#if DEBUG
/// Probe attached to `MediaSessionCoordinator.shared.testProbe` so
/// background-transition tests can assert whether the session was
/// actually torn down via `deactivateForBackground()`. Reference type
/// so the +1 mutation done by the production code is visible to the
/// test that owns the probe.
public final class MediaSessionCoordinatorTestProbe: @unchecked Sendable {
    public var deactivateCount: Int = 0
    /// Fait jeter le prochain `request(role:)` comme un `setCategory` /
    /// `setActive` refusé par le système.
    public var failNextRequest = false
    /// Les `setActive` de `request` et de la libération, dans l'ordre (#9879).
    public enum Call: Sendable { case activate, deactivate }
    public var calls: [Call] = []
    public struct SimulatedFailure: Error {}
    public init() {}
}

extension MediaSessionCoordinator {
    /// Nombre de détenteurs de la session (DEBUG, tests seulement).
    var holdCountForTesting: Int { activationCount }
}
#endif
#endif
