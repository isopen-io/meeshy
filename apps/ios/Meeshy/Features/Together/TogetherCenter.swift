import Combine
import Foundation
import MeeshySDK

/// Ce que l'interface DIT d'une séance qui ne s'ouvre pas, ou qui s'arrête — une phrase, jamais une raison.
enum TogetherNotice: Equatable {
    case ended
    case gone
    case joinFailed
}

/// REGARDER OU ÉCOUTER ENSEMBLE SUR iOS (#17097, iso `together-live.ts` + `together-host.tsx`) — la séance de cet
/// appareil, pour toute la durée de l'app.
///
/// - `together:invited` propose (jamais ma propre invitation) ; sans réponse, l'invitation s'éteint deux minutes après
///   sa réception, à l'horloge de l'APPAREIL.
/// - `together:started` ouvre la séance chez l'hôte et l'invité ; l'accusé de « Rejoindre » l'ouvre aussi, sans
///   attendre l'événement.
/// - `together:synced` fait suivre la lecture ; `together:ended` ferme, et une séance close ne se rouvre pas.
/// - Les personnes sont nommées par les caches ; inconnues, elles sont « Quelqu'un », jamais inventées.
///
/// Le serveur a déjà jugé (Proche ou Sang, conversation commune, média lisible) : ce centre ne rejuge rien.
@MainActor
final class TogetherCenter: ObservableObject {

    @Published private(set) var state = TogetherState()
    @Published private(set) var names: [String: String] = [:]
    @Published var notice: TogetherNotice?

    private let emitter: TogetherEmitting
    private let people: CirclePeopleResolving
    private let viewerId: () -> String?
    private let now: () -> Date
    private var expiry: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        emitter: TogetherEmitting,
        people: CirclePeopleResolving,
        viewerId: @escaping () -> String?,
        invitedEvents: AnyPublisher<TogetherInvited, Never> = TogetherEvents.invited,
        startedEvents: AnyPublisher<TogetherStarted, Never> = TogetherEvents.started,
        syncedEvents: AnyPublisher<TogetherSynced, Never> = TogetherEvents.synced,
        endedEvents: AnyPublisher<TogetherEnded, Never> = TogetherEvents.ended,
        now: @escaping () -> Date = { Date() }
    ) {
        self.emitter = emitter
        self.people = people
        self.viewerId = viewerId
        self.now = now
        let lane = OrderedEventLane()
        invitedEvents
            .relay(through: lane) { [weak self] event in await self?.receive(event) }
            .store(in: &cancellables)
        startedEvents
            .relay(through: lane) { [weak self] event in await self?.receive(event) }
            .store(in: &cancellables)
        syncedEvents
            .relay(through: lane) { [weak self] event in await self?.receive(event) }
            .store(in: &cancellables)
        endedEvents
            .relay(through: lane) { [weak self] event in await self?.receive(event) }
            .store(in: &cancellables)
        lane.store(in: &cancellables)
    }

    // MARK: - Recevoir

    func receive(_ event: TogetherInvited) {
        let next = state.invited(event, viewerId: viewerId(), at: now())
        guard next != state else { return }
        state = next
        hydrate(event.fromUserId)
        scheduleExpiry()
    }

    func receive(_ event: TogetherStarted) {
        let next = state.started(event, viewerId: viewerId(), at: now())
        guard next != state else { return }
        state = next
        if let partner = state.session?.partnerId { hydrate(partner) }
    }

    func receive(_ event: TogetherSynced) {
        state = state.synced(event, at: now())
    }

    func receive(_ event: TogetherEnded) {
        close(event.sessionId)
    }

    /// Ce que le minuteur appelle : l'invitation sans réponse passé son terme s'éteint, sans rien envoyer.
    func expireDue() {
        state = state.expiringInvitation(at: now())
    }

    // MARK: - Agir

    func invite(toUserId: String, conversationId: String, attachmentId: String) async -> TogetherInviteOutcome {
        let outcome = await emitter.invite(toUserId: toUserId, conversationId: conversationId, attachmentId: attachmentId)
        if case .invited(let sessionId, let media) = outcome {
            state = state.waiting(TogetherOutgoing(sessionId: sessionId, toUserId: toUserId, media: media))
            hydrate(toUserId)
        }
        return outcome
    }

    func join() async {
        guard let sessionId = state.invitation?.sessionId else { return }
        switch await emitter.join(sessionId: sessionId) {
        case .joined(let started):
            receive(started)
        case .gone:
            state = state.ended(sessionId)
            notice = .gone
        case .offline, .failed:
            notice = .joinFailed
        }
    }

    func decline() {
        guard let sessionId = state.invitation?.sessionId else { return }
        state = state.ended(sessionId)
        emitter.leave(sessionId: sessionId)
    }

    /// Quitter la séance, ou annuler l'invitation envoyée : fermé ICI d'abord, puis chez l'autre.
    func leave() {
        guard let sessionId = state.session?.sessionId ?? state.outgoing?.sessionId else { return }
        state = state.ended(sessionId)
        emitter.leave(sessionId: sessionId)
    }

    /// Un geste local qui change l'état partagé : le serveur l'horodate et le rend aux deux.
    func sync(playing: Bool, positionMs: Double) async {
        guard let sessionId = state.session?.sessionId else { return }
        guard let playback = await emitter.sync(sessionId: sessionId, playing: playing, positionMs: positionMs) else { return }
        receive(TogetherSynced(sessionId: sessionId, playback: playback))
    }

    func name(of userId: String) -> String {
        names[userId] ?? String(localized: "together.someone", defaultValue: "Quelqu’un", bundle: .main)
    }

    // MARK: - Interne

    private func close(_ sessionId: String) {
        let wasLive = state.session?.sessionId == sessionId
        state = state.ended(sessionId)
        if wasLive { notice = .ended }
    }

    private func scheduleExpiry() {
        expiry?.cancel()
        guard let deadline = state.invitation?.deadline else { return }
        let delay = max(0, deadline.timeIntervalSince(now())) + 0.05
        expiry = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(delay))
            } catch {
                return
            }
            self?.expireDue()
        }
    }

    private func hydrate(_ userId: String) {
        guard names[userId] == nil else { return }
        Task {
            let known = await people.people(for: [userId])
            guard let person = known[userId] else { return }
            names[userId] = person.name
        }
    }
}

extension TogetherCenter {
    /// Le câblage de production : le seul endroit qui nomme les singletons.
    static let shared = TogetherCenter(
        emitter: TogetherSocketEmitter.shared,
        people: CirclePeopleDirectory.shared,
        viewerId: { AuthManager.shared.currentUser?.id }
    )
}
