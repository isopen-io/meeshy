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

    private init(scheduleAfter: @escaping DelayedScheduler = DelayedScheduling.real) {
        self.scheduleAfter = scheduleAfter
    }

    #if DEBUG
    /// Une instance à part (tests) : le compteur du singleton est partagé avec
    /// des suites qui tournent en parallèle et le remettent à zéro.
    static func makeForTesting(scheduleAfter: @escaping DelayedScheduler = DelayedScheduling.real) -> MediaSessionCoordinator {
        MediaSessionCoordinator(scheduleAfter: scheduleAfter)
    }
    #endif

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

    /// Configure + active SYNCHRONEMENT la session `.playback` (call-aware) — source
    /// UNIQUE de la config de session de lecture pour les composants dont `load`/`play`
    /// sont synchrones (vidéo `SharedAVPlayerManager`, story canvas/coordinator), par
    /// opposition aux moteurs voice-note qui passent par `request(role:)` async
    /// refcompté. NE TOUCHE PAS la session pendant un appel VoIP (sinon micro coupé) :
    /// le média joue alors sous la session de l'appel. `nonisolated` (I/O session +
    /// `callActive` sont synchrones). Pas de refcount : `PlaybackCoordinator` garantit
    /// déjà l'exclusion mutuelle entre lecteurs.
    public nonisolated func activatePlaybackSync(
        mode: AVAudioSession.Mode = .default,
        options: AVAudioSession.CategoryOptions
    ) {
        installLeaseObserversIfNeeded()
        observeSystemEvents()
        guard Self.shouldManageSession(callActive: callActive) else { return }
        bumpActivationGeneration()
        guard contentMayReconfigureSession else { return }
        let session = AVAudioSession.sharedInstance()
        // Independent do/catch per call — a setCategory failure must not skip the
        // setActive attempt (each used to run regardless of the other's outcome).
        // `setCategory` is a synchronous round-trip to the audio server, paid on
        // the main thread by every video play and story open: skipped when the
        // session already carries exactly this configuration.
        let configurationDiffers = Self.playbackConfigurationDiffers(
            currentCategory: session.category, currentMode: session.mode,
            currentOptions: session.categoryOptions, mode: mode, options: options
        )
        // `setActive(true)` aussi est un aller-retour bloquant : sauté quand ce
        // coordinateur tient déjà le bail d'une session `.playback` identique
        // (chaque balayage de réel le payait — #9702).
        guard Self.shouldActivatePlayback(
            configurationDiffers: configurationDiffers, leaseHeld: playbackLeaseHeld
        ) else { return }
        if configurationDiffers {
            do {
                try session.setCategory(.playback, mode: mode, options: options)
            } catch {
                logger.error("activatePlaybackSync: setCategory failed — \(error.localizedDescription, privacy: .public)")
            }
        }
        do {
            try session.setActive(true)
            playbackLeaseHeld = true
            audibleContentHoldsSession = true
        } catch {
            playbackLeaseHeld = false
            logger.error("activatePlaybackSync: setActive failed — \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Pose SYNCHRONEMENT la session d'un enregistrement (vocal, caméra) telle
    /// que la dit `RecordingSessionLaw` — par `MeeshyRecordingSession`, seul
    /// appelant. Call-aware : pendant un appel VoIP la session appartient à
    /// RTCAudioSession — la reconfigurer casserait l'uplink micro de l'appel.
    /// `holding` : un enregistrement commence, et les lecteurs de contenu ne
    /// touchent plus la session jusqu'à `releaseRecordingHold()`.
    /// Retourne `false` si la session n'a pas pu être prise.
    @discardableResult
    public nonisolated func activateRecordingSync(
        _ configuration: RecordingSessionConfiguration,
        holding: Bool
    ) -> Bool {
        observeSystemEvents()
        guard Self.shouldManageSession(callActive: callActive) else { return false }
        bumpActivationGeneration()
        playbackLeaseHeld = false
        audibleContentHoldsSession = false
        let session = AVAudioSession.sharedInstance()
        let differs = Self.recordingConfigurationDiffers(
            currentCategory: session.category, currentMode: session.mode,
            currentOptions: session.categoryOptions, configuration: configuration
        )
        do {
            if differs {
                try session.setCategory(configuration.category, mode: configuration.mode, options: configuration.options)
            }
            try session.setActive(true)
        } catch {
            logger.error("activateRecordingSync failed — \(error.localizedDescription, privacy: .public)")
            return false
        }
        if holding { recordingHoldsSession = true }
        return true
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

    /// Désactive SYNCHRONEMENT la session (call-aware : ne coupe rien pendant un appel,
    /// la session appartient alors à l'appel).
    public nonisolated func deactivatePlaybackSync() {
        playbackLeaseHeld = false
        audibleContentHoldsSession = false
        guard Self.shouldManageSession(callActive: callActive), contentMayReconfigureSession else { return }
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            logger.error("deactivatePlaybackSync failed — \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Rend la session HORS du fil principal (`setActive(false)` est bloquant).
    /// Le bail tombe tout de suite, pour qu'une relance immédiate réactive la
    /// session ; et la désactivation s'efface si une prise est survenue entre la
    /// demande et son exécution — sinon elle coupait le lecteur relancé.
    public nonisolated func deactivatePlaybackDeferred(on queue: DispatchQueue = .global(qos: .utility)) {
        deactivatePlaybackDeferred(on: queue) { [self] in deactivatePlaybackSync() }
    }

    /// **Rend la main après une pause de l'utilisateur** (#11039) : la session
    /// se désactive avec `.notifyOthersOnDeactivation` au bout de
    /// `ContentPlaybackSessionLaw.userPauseReleaseDelay`, pour que la musique
    /// que Meeshy a mise en pause reprenne — et une relance dans l'intervalle
    /// (toute prise de session) annule la libération. Le lecteur doit être en
    /// pause AVANT l'appel : une désactivation sous un lecteur qui tourne
    /// échoue.
    public nonisolated func releaseAfterUserPause(on queue: DispatchQueue = .global(qos: .utility)) {
        releaseContentSession(after: ContentPlaybackSessionLaw.userPauseReleaseDelay, on: queue)
    }

    /// **Rend la main après une interruption sans reprise** (#11040, décision
    /// j) : fin d'interruption sans `shouldResume`, utilisateur qui a mis en
    /// pause pendant l'appel, appel Meeshy raccroché sans rien à reprendre.
    /// Appelé par le coordinateur lui-même à chaque fin d'interruption : les
    /// lecteurs qui reprennent réactivent la session pendant
    /// `ContentSessionReleaseLaw.interruptionResumeGrace`, ce qui annule la
    /// libération ; sinon la session se rend et la musique interrompue repart.
    public nonisolated func releaseAfterUnresumedInterruption(on queue: DispatchQueue = .global(qos: .utility)) {
        releaseContentSession(after: ContentSessionReleaseLaw.interruptionResumeGrace, on: queue)
    }

    /// La libération CENTRALE d'une session de contenu : au bout de `delay`,
    /// sur le fil principal, elle s'efface si une lecture a repris la session
    /// depuis la demande ou si un lecteur Meeshy joue encore
    /// (`ContentSessionReleaseLaw.mayRelease`) ; sinon la désactivation
    /// (bloquante) part sur `queue`.
    nonisolated func releaseContentSession(
        after delay: TimeInterval,
        on queue: DispatchQueue,
        meeshyStillPlays: @escaping @MainActor @Sendable () -> Bool = { RecordingPlaybackDucker.shared.meeshyStillPlays },
        deactivate: (@Sendable () -> Void)? = nil
    ) {
        playbackLeaseHeld = false
        let generation = _activationGeneration.withLock { $0 }
        let run: @Sendable () -> Void = deactivate ?? { [self] in deactivatePlaybackSync() }
        scheduleAfter(delay, .main) { [self] in
            let stillPlays = MainActor.assumeIsolated { meeshyStillPlays() }
            let activated = _activationGeneration.withLock { $0 } != generation
            guard ContentSessionReleaseLaw.mayRelease(activatedSinceRequest: activated, meeshyStillPlays: stillPlays) else { return }
            queue.async { [self] in
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
        guard delay > 0 else { return queue.async(execute: run) }
        scheduleAfter(delay, queue, run)
    }

    /// **Le point d'entrée des lecteurs de CONTENU** (#11039) : la session
    /// devient ce que dit `ContentPlaybackSessionLaw` pour ce contenu. Un son
    /// met la musique des autres apps en pause ; une vidéo muette n'y touche
    /// pas. Call-aware, synchrone, sans saut d'acteur.
    public nonisolated func activateContentPlayback(
        _ audibility: ContentPlaybackAudibility = .audible,
        mode: AVAudioSession.Mode = .default
    ) {
        let directive = ContentPlaybackSessionLaw.directive(
            for: audibility, audibleContentHoldsSession: audibleContentHoldsSession
        )
        switch directive {
        case .activatePlayback:
            activatePlaybackSync(mode: mode, options: ContentPlaybackSessionLaw.audibleOptions)
        case .configureAmbientWithoutActivating:
            configureAmbientForMutedPlayback()
        case .leaveSessionAlone:
            observeSystemEvents()
            guard Self.shouldManageSession(callActive: callActive) else { return }
            bumpActivationGeneration()
        }
    }

    /// Une lecture muette compte comme une prise (une libération différée ne
    /// la coupe pas), mais ne s'approprie pas la session : `.ambient` est
    /// mélangeable, et l'activation implicite d'`AVPlayer` ne coupera rien.
    private nonisolated func configureAmbientForMutedPlayback() {
        observeSystemEvents()
        guard Self.shouldManageSession(callActive: callActive) else { return }
        bumpActivationGeneration()
        guard contentMayReconfigureSession else { return }
        playbackLeaseHeld = false
        let session = AVAudioSession.sharedInstance()
        guard session.category != .ambient else { return }
        do {
            try session.setCategory(.ambient, mode: .default, options: [])
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
        let center = NotificationCenter.default
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
        // Never reconfigure the shared session while a VoIP call owns it (would
        // mute the mic). The refcount still tracks holders so balancing across
        // the call boundary stays coherent.
        let recordingKeepsSession = role == .playback && !contentMayReconfigureSession
        if Self.shouldManageSession(callActive: callActive), !recordingKeepsSession {
            #if DEBUG
            if let probe = testProbe, probe.failNextRequest {
                probe.failNextRequest = false
                throw MediaSessionCoordinatorTestProbe.SimulatedFailure()
            }
            #endif
            let session = AVAudioSession.sharedInstance()
            switch role {
            case .playback:
                try session.setCategory(.playback, mode: .default, options: playbackOptions)
            case .record:
                try session.setCategory(.record, mode: .default)
            case .playAndRecord:
                // Audit P2-iOS-3 — `.allowBluetooth` is the deprecated alias for
                // HFP. Use `.allowBluetoothHFP` explicitly to align with the
                // call-path policy (CallManager L1081 / PERF-010) and remove
                // the deprecation warning.
                try session.setCategory(.playAndRecord, mode: .default,
                                        options: [.defaultToSpeaker, .allowBluetoothHFP])
            }
            #if DEBUG
            testProbe?.calls.append(.activate)
            #endif
            try session.setActive(true)
            audibleContentHoldsSession = role == .playback
        }
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
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            logger.error("release: setActive(false) failed — \(error.localizedDescription, privacy: .public)")
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
            var created: AsyncStream<PlaybackSessionOp>.Continuation?
            let stream = AsyncStream<PlaybackSessionOp> { created = $0 }
            let continuation = created!
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
        do {
            try AVAudioSession.sharedInstance().setActive(
                false,
                options: .notifyOthersOnDeactivation
            )
        } catch {
            logger.error("deactivateForBackground failed: \(error.localizedDescription, privacy: .public)")
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
