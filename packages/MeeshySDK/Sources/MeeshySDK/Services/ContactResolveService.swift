import Foundation

// MARK: - Protocol

/// Rapproche les identifiants d'une carte de visite des comptes Meeshy
/// (`POST /api/v1/contacts/resolve`, #8101).
///
/// Cache SWR en mémoire : `cachedAccounts` sert SANS attendre ce qu'une
/// résolution précédente a rendu (une carte déjà résolue s'affiche sans
/// spinner) ; `resolve` ne touche le réseau que si l'entrée est absente ou
/// périmée, et coalesce les appels simultanés d'une même carte.
///
/// La résolution ne JETTE jamais : un serveur qui ne connaît pas la route
/// (404), une erreur réseau ou un refus rendent le dernier résultat connu,
/// ou une liste vide — la carte s'affiche alors sans section Meeshy.
public protocol ContactResolveServiceProviding: Sendable {
    func cachedAccounts(for request: ContactResolveRequest) -> [PublicContactAccount]?
    func resolve(_ request: ContactResolveRequest) async -> [PublicContactAccount]
    /// Applique localement un changement de relation (demande envoyée,
    /// acceptée) à toutes les entrées qui portent ce compte.
    func updateRelation(userId: String, to relation: ContactRelation)
}

public final class ContactResolveService: ContactResolveServiceProviding, Sendable {
    public static let shared = ContactResolveService()

    private struct Entry {
        var accounts: [PublicContactAccount]
        var storedAt: Date
    }

    private struct Ledger {
        var entries: [ContactResolveRequest: Entry] = [:]
        var failures: [ContactResolveRequest: Date] = [:]
        var inFlight: [ContactResolveRequest: Task<[PublicContactAccount]?, Never>] = [:]

        mutating func store(_ accounts: [PublicContactAccount], for request: ContactResolveRequest, at date: Date, capacity: Int) {
            entries[request] = Entry(accounts: accounts, storedAt: date)
            guard entries.count > capacity,
                  let oldest = entries.min(by: { $0.value.storedAt < $1.value.storedAt })?.key else { return }
            entries[oldest] = nil
        }

        mutating func rewriteRelation(userId: String, to relation: ContactRelation) {
            for (key, entry) in entries where entry.accounts.contains(where: { $0.userId == userId }) {
                entries[key]?.accounts = entry.accounts.map { account in
                    guard account.userId == userId else { return account }
                    var updated = account
                    updated.relation = relation
                    return updated
                }
            }
        }
    }

    private enum Plan {
        case served([PublicContactAccount])
        case await(Task<[PublicContactAccount]?, Never>)
    }

    private let api: APIClientProviding
    private let freshness: TimeInterval
    private let failureBackoff: TimeInterval
    private let capacity: Int
    private let now: @Sendable () -> Date
    private let ledger = Locked(Ledger())

    init(
        api: APIClientProviding = APIClient.shared,
        freshness: TimeInterval = 600,
        failureBackoff: TimeInterval = 120,
        capacity: Int = 200,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.api = api
        self.freshness = freshness
        self.failureBackoff = failureBackoff
        self.capacity = capacity
        self.now = now
    }

    /// Déconnexion / changement de compte : les relations résolues (« vous »,
    /// « ami », « demande envoyée ») sont celles du compte sortant.
    public func purge() {
        let pending = ledger.mutate { state -> [Task<[PublicContactAccount]?, Never>] in
            let running = Array(state.inFlight.values)
            state = Ledger()
            return running
        }
        pending.forEach { $0.cancel() }
    }

    public func cachedAccounts(for request: ContactResolveRequest) -> [PublicContactAccount]? {
        ledger.read { $0.entries[request]?.accounts }
    }

    public func resolve(_ request: ContactResolveRequest) async -> [PublicContactAccount] {
        guard !request.isEmpty else { return [] }
        switch plan(for: request) {
        case .served(let accounts):
            return accounts
        case .await(let task):
            let fetched = await task.value
            return settle(request, with: fetched)
        }
    }

    private func plan(for request: ContactResolveRequest) -> Plan {
        let now = now
        let freshness = freshness
        let failureBackoff = failureBackoff
        let api = api
        return ledger.mutate { state -> Plan in
            let cached = state.entries[request]
            if let cached, now().timeIntervalSince(cached.storedAt) < freshness {
                return .served(cached.accounts)
            }
            if let failedAt = state.failures[request], now().timeIntervalSince(failedAt) < failureBackoff {
                return .served(cached?.accounts ?? [])
            }
            if let running = state.inFlight[request] { return .await(running) }
            let task = Task { try? await ContactResolveService.fetch(request, api: api) }
            state.inFlight[request] = task
            return .await(task)
        }
    }

    private func settle(_ request: ContactResolveRequest, with fetched: [PublicContactAccount]?) -> [PublicContactAccount] {
        let now = now
        let capacity = capacity
        return ledger.mutate { state -> [PublicContactAccount] in
            state.inFlight[request] = nil
            guard let fetched else {
                state.failures[request] = now()
                return state.entries[request]?.accounts ?? []
            }
            state.failures[request] = nil
            state.store(fetched, for: request, at: now(), capacity: capacity)
            return fetched
        }
    }

    public func updateRelation(userId: String, to relation: ContactRelation) {
        ledger.mutate { $0.rewriteRelation(userId: userId, to: relation) }
    }

    private static func fetch(_ request: ContactResolveRequest, api: APIClientProviding) async throws -> [PublicContactAccount] {
        let response: APIResponse<ContactResolveResponse> = try await api.post(ContactsEndpoint.resolve, body: request)
        return response.data.accounts
    }
}
