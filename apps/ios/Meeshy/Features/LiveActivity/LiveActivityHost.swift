import Foundation
import os
import MeeshySDK

/// Ce qu'un coordinateur de Live Activity demande à ActivityKit : ouvrir,
/// mettre à jour, fermer — rien d'autre. Les LOIS décident ; l'hôte exécute.
@MainActor
protocol LiveActivityHostProviding<State>: AnyObject {
    associatedtype State
    var isRunning: Bool { get }
    var activityID: String? { get }
    /// Appelé sur le fil principal quand l'activité demandée est OUVERTE —
    /// l'ouverture se fait hors du fil principal, donc après `start`.
    var onStarted: ((String) -> Void)? { get set }
    func endOrphans()
    func start(_ state: State)
    func update(_ state: State)
    func end(_ state: State, dismissAfter delay: TimeInterval)
}

/// **L'exécution d'une Live Activity** (#9782, #9783, #9784, #9680),
/// commune aux quatre activités de l'îlot.
///
/// L'hôte GARDE l'activité qu'il a obtenue (#11524) : savoir si elle tourne
/// est une lecture locale, jamais une question au système. Tout ce qui parle
/// à ActivityKit passe par `LiveActivityBackend`, hors du fil principal, et
/// reste CHAÎNÉ (`pending`) : ouverture, mises à jour et fermeture partent
/// dans l'ordre où elles ont été demandées. Une ouverture refusée (app pas au
/// premier plan) est retentée par le coordinateur au retour au premier plan.
@MainActor
final class LiveActivityHost<Attributes: Sendable, State: Sendable>: LiveActivityHostProviding {
    nonisolated deinit {}

    private static var logger: Logger { MeeshyLog.logger(.liveActivity) }

    /// Le handle d'une ouverture en cours, que la fermeture demandée pendant
    /// l'ouverture retrouve quand son tour vient dans la chaîne.
    private final class Opening {
        nonisolated deinit {}

        var handle: (any LiveActivityHandle<State>)?
    }

    private enum Phase {
        case idle
        case starting(Opening)
        case running(any LiveActivityHandle<State>)
    }

    private nonisolated enum OpenOutcome: Sendable {
        case opened(any LiveActivityHandle<State>)
        case disabled
        case failed(String)
    }

    private let backend: any LiveActivityBackend<Attributes, State>
    private let attributes: () -> Attributes
    private var phase: Phase = .idle
    private var pending: Task<Void, Never>?
    private var closureWatch: Task<Void, Never>?
    private(set) var activityID: String?
    var onStarted: ((String) -> Void)?

    init(backend: any LiveActivityBackend<Attributes, State>, attributes: @escaping () -> Attributes) {
        self.backend = backend
        self.attributes = attributes
    }

    var isRunning: Bool {
        if case .idle = phase { return false }
        return true
    }

    /// Une activité laissée par une session précédente (app tuée en plein
    /// appel, en pleine lecture) ne dit plus rien de vrai : elle part sans
    /// s'afficher. L'activité gardée est lue AU TOUR de la fermeture, pour
    /// épargner une ouverture demandée juste avant.
    func endOrphans() {
        let backend = backend
        chain { @MainActor [self] in
            await Self.endOrphans(on: backend, except: keptActivityID)
        }
    }

    func start(_ state: State) {
        guard case .idle = phase else { return update(state) }
        let opening = Opening()
        phase = .starting(opening)
        let backend = backend
        let attributes = attributes()
        chain { @MainActor [self] in
            let outcome = await Self.open(on: backend, attributes: attributes, state: state)
            settle(opening, with: outcome)
        }
    }

    func update(_ state: State) {
        guard isRunning else { return }
        chain { @MainActor [self] in
            guard case .running(let handle) = phase else { return }
            await Self.send(state, to: handle)
        }
    }

    func end(_ state: State, dismissAfter delay: TimeInterval) {
        let closing = phase
        phase = .idle
        activityID = nil
        closureWatch?.cancel()
        closureWatch = nil
        switch closing {
        case .idle:
            return
        case .running(let handle):
            chain { @MainActor in await Self.close(handle, with: state, dismissAfter: delay) }
        case .starting(let opening):
            chain { @MainActor in
                guard let handle = opening.handle else { return }
                await Self.close(handle, with: state, dismissAfter: delay)
            }
        }
    }

    // MARK: - Transitions sur le fil principal

    private var keptActivityID: String? {
        switch phase {
        case .idle: return nil
        case .starting(let opening): return opening.handle?.id
        case .running(let handle): return handle.id
        }
    }

    private func settle(_ opening: Opening, with outcome: OpenOutcome) {
        switch outcome {
        case .disabled:
            if case .starting(let current) = phase, current === opening { phase = .idle }
        case .failed(let reason):
            Self.logger.info("Live Activity non ouverte : \(reason, privacy: .public)")
            if case .starting(let current) = phase, current === opening { phase = .idle }
        case .opened(let handle):
            opening.handle = handle
            guard case .starting(let current) = phase, current === opening else { return }
            phase = .running(handle)
            activityID = handle.id
            watchClosure(of: handle)
            onStarted?(handle.id)
        }
    }

    /// L'utilisateur ou le système peut fermer l'activité sans nous : l'hôte
    /// repasse alors au repos, et la loi du coordinateur peut la rouvrir.
    private func watchClosure(of handle: any LiveActivityHandle<State>) {
        closureWatch?.cancel()
        closureWatch = Task { @MainActor [weak self] in
            await Self.waitUntilClosed(handle)
            guard !Task.isCancelled else { return }
            self?.closedOutside(handle.id)
        }
    }

    private func closedOutside(_ id: String) {
        guard case .running(let handle) = phase, handle.id == id else { return }
        phase = .idle
        activityID = nil
        closureWatch = nil
    }

    /// Rend la main quand tout ce qui a été chaîné est passé — y compris ce
    /// qu'un maillon a chaîné à son tour.
    func waitForPendingWork() async {
        while let current = pending {
            await current.value
            if pending == current { return }
        }
    }

    private func chain(_ work: @escaping @MainActor () async -> Void) {
        let previous = pending
        pending = Task { @MainActor in
            await previous?.value
            await work()
        }
    }

    // MARK: - Hors du fil principal

    @concurrent
    private nonisolated static func open(
        on backend: any LiveActivityBackend<Attributes, State>,
        attributes: Attributes,
        state: State
    ) async -> OpenOutcome {
        guard backend.areEnabled() else { return .disabled }
        do {
            return .opened(try backend.request(attributes, state: state))
        } catch {
            return .failed(error.localizedDescription)
        }
    }

    @concurrent
    private nonisolated static func send(_ state: State, to handle: any LiveActivityHandle<State>) async {
        await handle.update(state)
    }

    @concurrent
    private nonisolated static func close(
        _ handle: any LiveActivityHandle<State>,
        with state: State,
        dismissAfter delay: TimeInterval
    ) async {
        await handle.end(state, dismissAfter: delay)
    }

    @concurrent
    private nonisolated static func waitUntilClosed(_ handle: any LiveActivityHandle<State>) async {
        await handle.waitUntilClosed()
    }

    @concurrent
    private nonisolated static func endOrphans(
        on backend: any LiveActivityBackend<Attributes, State>,
        except keep: String?
    ) async {
        for orphan in backend.openActivities(except: keep) {
            await orphan.end(nil, dismissAfter: 0)
        }
    }
}
