import Combine
import Foundation
import MeeshySDK
import os

private extension Logger {
    nonisolated static let talkieSender = MeeshyLog.logger(.audioRecorder)
}

/// Le micro du talkie : rend des trames AAC ADTS une à une. Le vrai micro est `TalkieMicCapture` ; un double le remplace
/// dans les tests.
@MainActor
protocol TalkieCapturing: AnyObject {
    /// Ouvre le micro. `false` : refusé ou indisponible (appel en cours) — rien ne tourne.
    func start(onFrame: @escaping @MainActor @Sendable (Data, TimeInterval) -> Void) async -> Bool
    /// Arrête le micro ; rend la main une fois les dernières trames remises à `onFrame`.
    func stop() async
}

/// Ferme une prise de parole passé sa durée maximale. Rend de quoi l'annuler.
typealias TalkieDeadlineScheduler = @MainActor (TimeInterval, @escaping @MainActor () -> Void) -> () -> Void

/// **ÉMETTRE LE TALKIE DEPUIS iOS** (#16927, iso `createTalkieSender` de `apps/web/src/lib/talkie/talkie-sender.ts`) —
/// le micro est `TalkieMicCapture`, la socket `TalkieSocketEmitter`, le bouton `ProfileTalkieRow`.
///
/// - **Appuyer** ouvre `talkie:start` ET le micro EN MÊME TEMPS : ce qui est capté avant l'accusé est gardé (borné par
///   le plafond d'une prise de parole) et part dès l'ouverture — le premier mot n'est jamais mangé par l'aller-retour.
///   `talkie:start` part AVANT l'ouverture du micro (#17094) : celle-ci tient l'acteur principal (session audio,
///   moteur), et l'aller-retour court pendant ce temps au lieu de l'attendre.
/// - Les temps de la prise de parole (`TalkieLatency`) s'écrivent au journal dès le premier fragment parti.
/// - Chaque trame rejoint un fragment de ~120 ms (`TalkieFragmenter`) ; un fragment part dès qu'il est plein :
///   `talkie:send-chunk`, `seq` croissant (`TalkieBudget`), `capturedAt` pour mesurer la latence.
/// - **Relâcher** arrête le micro, vide ce qui reste, puis `talkie:end`.
/// - La durée maximale SERVIE ferme seule ; les plafonds d'octets et de fragments aussi, AVANT que le serveur ne coupe.
/// - Un `talkie:ended` qui porte MON `talkieId` (limite, coupure) arrête le micro. Un blocage posé par le destinataire
///   ne prévient PAS l'émetteur : ses fragments se perdent en silence, et c'est voulu.
@MainActor
final class TalkieSender: ObservableObject {

    enum Phase: Equatable {
        case idle
        case starting(toUserId: String)
        case talking(toUserId: String, talkieId: String)
    }

    @Published private(set) var phase: Phase = .idle
    /// Ce qu'il faut dire d'une prise de parole qui n'a pas abouti ; l'écran le remet à `nil` une fois dit.
    @Published var notice: TalkieSendOutcome?
    /// Les temps de la dernière prise de parole dont un fragment est parti.
    private(set) var lastLatency: TalkieLatency?

    /// Une prise de parole, de l'appui à sa fin.
    @MainActor
    private final class Session {
        let toUserId: String
        var opened: TalkieOpened?
        var micRunning = false
        var accepting = true
        var released = false
        var finishing = false
        var queue: [TalkieFragment] = []
        var fragmenter = TalkieFragmenter()
        var budget = TalkieBudget()
        var cancelDeadline: (() -> Void)?
        var latency: TalkieLatency

        init(toUserId: String, pressedAt: Date) {
            self.toUserId = toUserId
            latency = TalkieLatency(pressedAt: pressedAt)
        }

        nonisolated deinit {}

        var queuedBytes: Int { queue.reduce(0) { $0 + $1.data.count } }
    }

    private let emitter: TalkieEmitting
    private let capture: TalkieCapturing
    private let now: () -> Date
    private let schedule: TalkieDeadlineScheduler
    private var session: Session?
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        emitter: TalkieEmitting = TalkieSocketEmitter.shared,
        capture: TalkieCapturing? = nil,
        endedEvents: AnyPublisher<TalkieEnded, Never> = TalkieEvents.ended,
        now: @escaping () -> Date = { Date() },
        schedule: @escaping TalkieDeadlineScheduler = TalkieSender.sleepingDeadline
    ) {
        self.emitter = emitter
        self.capture = capture ?? TalkieMicCapture()
        self.now = now
        self.schedule = schedule
        let lane = OrderedEventLane()
        endedEvents
            .relay(through: lane) { [weak self] ended in await self?.ended(ended.talkieId, reason: ended.reason) }
            .store(in: &cancellables)
        lane.store(in: &cancellables)
    }

    static func sleepingDeadline(_ delay: TimeInterval, _ run: @escaping @MainActor () -> Void) -> () -> Void {
        let task = Task { @MainActor in
            do {
                try await Task.sleep(for: .seconds(delay))
            } catch {
                return
            }
            run()
        }
        return { task.cancel() }
    }

    var isActive: Bool { phase != .idle }

    // MARK: - Le geste

    func press(toUserId: String) {
        guard session == nil else { return }
        guard emitter.isConnected else {
            notice = .offline
            return
        }
        let current = Session(toUserId: toUserId, pressedAt: now())
        session = current
        phase = .starting(toUserId: toUserId)
        let verdict = Task { () -> TalkieStartVerdict in
            let verdict = await self.emitter.start(toUserId: toUserId)
            current.latency.mark(.opened, at: self.now())
            return verdict
        }
        Task {
            await Task.yield()
            let micReady = await self.openMic(current)
            await self.conclude(current, verdict: await verdict.value, micReady: micReady)
        }
    }

    func release() async {
        guard let current = session, !current.released else { return }
        current.released = true
        guard current.opened == nil else {
            await finish(current, outcome: nil)
            return
        }
        await stopMic(current)
        if let rest = current.fragmenter.flush() { enqueue(current, rest) }
    }

    /// La passerelle a fermé une prise de parole : si c'est la mienne, tout s'arrête — sans `talkie:end`.
    func ended(_ talkieId: String, reason: TalkieEndReason?) async {
        guard let current = session, current.opened?.talkieId == talkieId else { return }
        let outcome: TalkieSendOutcome? = switch reason {
        case .sender: nil
        case .limit: .limit
        case .cut, nil: .failed
        }
        await finish(current, outcome: outcome, notify: false)
    }

    // MARK: - Interne

    private func openMic(_ current: Session) async -> Bool {
        let ready = await capture.start { [weak self] data, duration in self?.frame(current, data, duration) }
        guard ready else { return false }
        current.latency.mark(.micReady, at: now())
        if current.finishing || current.released {
            current.accepting = false
            await capture.stop()
        } else {
            current.micRunning = true
        }
        return true
    }

    private func conclude(_ current: Session, verdict: TalkieStartVerdict, micReady: Bool) async {
        switch verdict {
        case .refused(let outcome):
            await refuse(current, outcome)
        case .opened(let opened) where !micReady:
            current.opened = opened
            await finish(current, outcome: .micDenied)
        case .opened(let opened):
            await open(current, opened)
        }
    }

    private func open(_ current: Session, _ opened: TalkieOpened) async {
        current.opened = opened
        current.fragmenter.maxChunkBytes = opened.maxChunkBytes
        guard !current.finishing else { return }
        phase = .talking(toUserId: current.toUserId, talkieId: opened.talkieId)
        current.cancelDeadline = schedule(opened.maxDuration) { [weak self] in
            Task { await self?.finish(current, outcome: .limit) }
        }
        let pending = current.queue
        current.queue = []
        pending.forEach { dispatch(current, $0) }
        if current.released { await finish(current, outcome: nil) }
    }

    private func frame(_ current: Session, _ data: Data, _ duration: TimeInterval) {
        guard current.accepting, !data.isEmpty else { return }
        current.fragmenter.append(data, duration: duration, at: now()).forEach { dispatch(current, $0) }
    }

    private func dispatch(_ current: Session, _ fragment: TalkieFragment) {
        guard current.opened != nil else {
            enqueue(current, fragment)
            return
        }
        guard !transmit(current, fragment) else { return }
        Task { await finish(current, outcome: .limit) }
    }

    private func enqueue(_ current: Session, _ fragment: TalkieFragment) {
        guard current.queuedBytes + fragment.data.count <= TalkieContract.maxTotalBytes else { return }
        current.queue.append(fragment)
    }

    /// `false` : le fragment ferait dépasser un plafond de la prise de parole.
    private func transmit(_ current: Session, _ fragment: TalkieFragment) -> Bool {
        guard let opened = current.opened, !fragment.data.isEmpty else { return true }
        guard let seq = current.budget.admit(bytes: fragment.data.count) else { return false }
        emitter.sendChunk(talkieId: opened.talkieId, seq: seq, capturedAt: fragment.capturedAt, data: fragment.data)
        if seq == 0 { record(current) }
        return true
    }

    private func record(_ current: Session) {
        current.latency.mark(.firstChunk, at: now())
        lastLatency = current.latency
        Logger.talkieSender.info("talkie · émission · \(current.latency.summary, privacy: .public)")
    }

    private func stopMic(_ current: Session) async {
        if current.micRunning {
            current.micRunning = false
            await capture.stop()
        }
        current.accepting = false
    }

    /// Ferme une prise de parole OUVERTE : micro arrêté, reste vidé, `talkie:end` (sauf si le serveur l'a déjà close).
    private func finish(_ current: Session, outcome: TalkieSendOutcome?, notify: Bool = true) async {
        guard !current.finishing else { return }
        current.finishing = true
        current.cancelDeadline?()
        if !notify { current.accepting = false }
        await stopMic(current)
        if let opened = current.opened, notify {
            if let rest = current.fragmenter.flush() { _ = transmit(current, rest) }
            emitter.end(talkieId: opened.talkieId)
        }
        settle(current, outcome)
    }

    private func refuse(_ current: Session, _ outcome: TalkieSendOutcome) async {
        current.finishing = true
        current.accepting = false
        await stopMic(current)
        settle(current, outcome)
    }

    private func settle(_ current: Session, _ outcome: TalkieSendOutcome?) {
        current.cancelDeadline?()
        current.cancelDeadline = nil
        if session === current {
            session = nil
            phase = .idle
        }
        if let outcome { notice = outcome }
    }
}
