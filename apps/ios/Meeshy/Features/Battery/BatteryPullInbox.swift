import Combine
import Foundation
import MeeshySDK

/// Une demande de batterie NOMMÉE (#19565) : elle attend « Envoyer » jusqu'à son échéance.
nonisolated struct BatteryPullRequest: Identifiable, Equatable, Sendable {
    let requester: BatteryPullRequester
    let requestedAt: Date
    let expiresAt: Date

    var id: String { requester.id }
}

/// Les demandes de batterie qui attendent ma réponse, une par demandeur — la plus récente remplace la précédente.
/// Une demande sans auteur n'entre jamais ici : elle se relève aussitôt, comme avant (`BatteryCenter`).
@MainActor
final class BatteryPullInbox: ObservableObject {

    /// L'échéance quand la passerelle n'en sert pas : au-delà, la demande ne veut plus rien dire.
    static let defaultLifetime: TimeInterval = 900

    @Published private(set) var pending: [BatteryPullRequest] = []

    private let now: () -> Date

    nonisolated deinit {}

    init(now: @escaping () -> Date = { Date() }) {
        self.now = now
    }

    /// Rend `true` quand la demande nomme son auteur et attend donc la personne.
    @discardableResult
    func hold(_ event: BatteryPullRequested) -> Bool {
        guard let requester = event.requestedBy else { return false }
        let expiresAt = event.expiresAt ?? event.requestedAt.addingTimeInterval(Self.defaultLifetime)
        let request = BatteryPullRequest(requester: requester, requestedAt: event.requestedAt, expiresAt: expiresAt)
        let current = now()
        guard expiresAt > current else { return true }
        pending = [request] + pending.filter { $0.id != request.id && $0.expiresAt > current }
        return true
    }

    /// Ce qui se montre à `date` : une demande échue ne s'affiche plus.
    func visible(at date: Date) -> [BatteryPullRequest] {
        pending.filter { $0.expiresAt > date }
    }

    /// Retirée tout de suite (envoi optimiste) ; rendue par `restore` si l'envoi échoue.
    func take(_ id: String) -> BatteryPullRequest? {
        guard let request = pending.first(where: { $0.id == id }) else { return nil }
        pending = pending.filter { $0.id != id }
        return request
    }

    func restore(_ request: BatteryPullRequest) {
        guard request.expiresAt > now(), !pending.contains(where: { $0.id == request.id }) else { return }
        pending = [request] + pending
    }

    func reset() {
        pending = []
    }
}
