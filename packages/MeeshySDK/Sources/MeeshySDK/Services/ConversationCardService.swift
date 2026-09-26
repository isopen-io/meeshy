import Foundation
import os

/// La carte d'une URL Meeshy de conversation (#8099), servie cache d'abord.
///
/// La lecture du cache est SYNCHRONE : une bulle qui défile doit pouvoir rendre
/// une carte déjà vue à sa première image, sans squelette ni saut de hauteur.
public protocol ConversationCardServiceProviding: Sendable {
    /// Ce que le cache sait déjà — jamais d'appel réseau.
    func cached(_ target: ConversationCardTarget) -> CacheResult<ConversationCardResolution>
    /// Relit la carte au serveur et la met en cache. Une erreur PASSAGÈRE ne
    /// remplace rien : on rend ce que le cache avait, sinon `.unavailable`.
    func refresh(_ target: ConversationCardTarget) async -> ConversationCardResolution
    /// Pose un verdict connu localement (état optimiste d'une jonction).
    func store(_ resolution: ConversationCardResolution, for target: ConversationCardTarget)
    func invalidate(_ target: ConversationCardTarget)
}

public final class ConversationCardService: ConversationCardServiceProviding, @unchecked Sendable {
    public static let shared = ConversationCardService()

    /// Une carte vue il y a moins d'une minute ne se relit pas.
    static let freshInterval: TimeInterval = 60
    /// Au-delà d'un jour, une carte ne s'affiche plus sans être relue.
    static let staleInterval: TimeInterval = 24 * 60 * 60

    private struct Entry {
        let resolution: ConversationCardResolution
        let storedAt: Date
    }

    private let api: APIClientProviding
    private let now: @Sendable () -> Date
    private let entries = OSAllocatedUnfairLock(initialState: [ConversationCardTarget: Entry]())

    init(api: APIClientProviding = APIClient.shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.api = api
        self.now = now
    }

    public func cached(_ target: ConversationCardTarget) -> CacheResult<ConversationCardResolution> {
        guard let entry = entries.withLock({ $0[target] }) else { return .empty }
        let age = now().timeIntervalSince(entry.storedAt)
        if age < Self.freshInterval { return .fresh(entry.resolution, age: age) }
        // Un « indisponible » ne se sert jamais périmé : c'est un repli, pas un
        // contenu, et le serveur a pu gagner la route entre-temps.
        if case .unavailable = entry.resolution { return .expired }
        if age < Self.staleInterval { return .stale(entry.resolution, age: age) }
        return .expired
    }

    public func refresh(_ target: ConversationCardTarget) async -> ConversationCardResolution {
        do {
            let response: APIResponse<ConversationCard> = try await api.request(ConversationCardEndpoint(target: target))
            let resolution = ConversationCardResolution.card(response.data)
            store(resolution, for: target)
            return resolution
        } catch {
            guard let verdict = Self.definitiveVerdict(for: error, target: target) else {
                return cached(target).snapshot() ?? .unavailable
            }
            store(verdict, for: target)
            return verdict
        }
    }

    public func store(_ resolution: ConversationCardResolution, for target: ConversationCardTarget) {
        let entry = Entry(resolution: resolution, storedAt: now())
        entries.withLock { $0[target] = entry }
    }

    public func invalidate(_ target: ConversationCardTarget) {
        _ = entries.withLock { $0.removeValue(forKey: target) }
    }

    /// Un refus du serveur est un VERDICT (il se cache) ; une panne de réseau
    /// n'en est pas un (`nil`). Sur un lien direct, 403 et 404 disent la même
    /// chose — « pas pour toi » — et rien du titre ne doit fuir.
    static func definitiveVerdict(for error: Error, target: ConversationCardTarget) -> ConversationCardResolution? {
        let status: Int? = {
            switch error as? MeeshyError {
            case .server(let code, _): return code
            case .forbidden: return 403
            default: return nil
            }
        }()
        guard let status, (400..<500).contains(status) else { return nil }
        switch target {
        case .direct where status == 403 || status == 404: return .privateConversation
        case .direct, .shareLink: return .unavailable
        }
    }
}
