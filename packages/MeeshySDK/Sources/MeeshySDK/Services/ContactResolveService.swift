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

public final class ContactResolveService: ContactResolveServiceProviding, @unchecked Sendable {
    public static let shared = ContactResolveService()

    private struct Entry {
        var accounts: [PublicContactAccount]
        var storedAt: Date
    }

    private let api: APIClientProviding
    private let freshness: TimeInterval
    private let failureBackoff: TimeInterval
    private let capacity: Int
    private let now: @Sendable () -> Date

    private let lock = NSLock()
    private var entries: [ContactResolveRequest: Entry] = [:]
    private var failures: [ContactResolveRequest: Date] = [:]
    private var inFlight: [ContactResolveRequest: Task<[PublicContactAccount]?, Never>] = [:]

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

    public func cachedAccounts(for request: ContactResolveRequest) -> [PublicContactAccount]? {
        lock.withLock { entries[request]?.accounts }
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

    private enum Plan {
        case served([PublicContactAccount])
        case await(Task<[PublicContactAccount]?, Never>)
    }

    private func plan(for request: ContactResolveRequest) -> Plan {
        lock.withLock {
            let cached = entries[request]
            if let cached, now().timeIntervalSince(cached.storedAt) < freshness {
                return .served(cached.accounts)
            }
            if let failedAt = failures[request], now().timeIntervalSince(failedAt) < failureBackoff {
                return .served(cached?.accounts ?? [])
            }
            if let running = inFlight[request] { return .await(running) }
            let api = self.api
            let task = Task { try? await Self.fetch(request, api: api) }
            inFlight[request] = task
            return .await(task)
        }
    }

    private func settle(_ request: ContactResolveRequest, with fetched: [PublicContactAccount]?) -> [PublicContactAccount] {
        lock.withLock {
            inFlight[request] = nil
            guard let fetched else {
                failures[request] = now()
                return entries[request]?.accounts ?? []
            }
            failures[request] = nil
            store(fetched, for: request)
            return fetched
        }
    }

    public func updateRelation(userId: String, to relation: ContactRelation) {
        lock.withLock { rewriteRelation(userId: userId, to: relation) }
    }

    private func rewriteRelation(userId: String, to relation: ContactRelation) {
        for (key, entry) in entries where entry.accounts.contains(where: { $0.userId == userId }) {
            entries[key]?.accounts = entry.accounts.map { account in
                guard account.userId == userId else { return account }
                var updated = account
                updated.relation = relation
                return updated
            }
        }
    }

    private func store(_ accounts: [PublicContactAccount], for request: ContactResolveRequest) {
        entries[request] = Entry(accounts: accounts, storedAt: now())
        guard entries.count > capacity,
              let oldest = entries.min(by: { $0.value.storedAt < $1.value.storedAt })?.key else { return }
        entries[oldest] = nil
    }

    private static func fetch(_ request: ContactResolveRequest, api: APIClientProviding) async throws -> [PublicContactAccount] {
        let response: APIResponse<ContactResolveResponse> = try await api.post(ContactsEndpoint.resolve, body: request)
        return response.data.accounts
    }
}
