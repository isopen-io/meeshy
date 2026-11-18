import Foundation
import os

/// La carte d'un lien de fiche collé dans un message (#18865, iOS #19519), servie cache d'abord.
///
/// La lecture du cache est SYNCHRONE : une bulle qui défile rend une carte déjà vue à sa première image, sans
/// squelette ni saut de hauteur.
public protocol ProfileLinkCardProviding: Sendable {
    /// Ce que le cache sait déjà — jamais d'appel réseau.
    func cached(handle: String) -> CacheResult<ProfileLinkCardResolution>
    /// Relit la carte à la passerelle et la met en cache. Une erreur PASSAGÈRE ne remplace rien : on rend ce que
    /// le cache avait, sinon `.unavailable`.
    func refresh(handle: String) async -> ProfileLinkCardResolution
}

public final class ProfileLinkCardService: ProfileLinkCardProviding, Sendable {
    public static let shared = ProfileLinkCardService()

    /// Une carte vue il y a moins d'une minute ne se relit pas.
    static let freshInterval: TimeInterval = 60
    /// Au-delà d'un jour, une carte ne s'affiche plus sans être relue.
    static let staleInterval: TimeInterval = 24 * 60 * 60
    /// La bulle demande la présence que la porte de la fiche sert à CE lecteur.
    static let expansions = "presence"

    private struct Entry: Sendable {
        let resolution: ProfileLinkCardResolution
        let storedAt: Date
    }

    private let api: APIClientProviding
    private let now: @Sendable () -> Date
    private let entries = OSAllocatedUnfairLock(initialState: [String: Entry]())

    init(api: APIClientProviding = APIClient.shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.api = api
        self.now = now
    }

    public func cached(handle: String) -> CacheResult<ProfileLinkCardResolution> {
        guard let entry = entries.withLock({ $0[Self.key(handle)] }) else { return .empty }
        let age = now().timeIntervalSince(entry.storedAt)
        if age < Self.freshInterval { return .fresh(entry.resolution, age: age) }
        // Un « indisponible » ne se sert jamais périmé : c'est un repli, pas un contenu.
        if case .unavailable = entry.resolution { return .expired }
        if age < Self.staleInterval { return .stale(entry.resolution, age: age) }
        return .expired
    }

    public func refresh(handle: String) async -> ProfileLinkCardResolution {
        let encoded = handle.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? handle
        do {
            let response: APIResponse<ProfileLinkCard> = try await api.request(
                DirectoryEndpoint.peopleByHandle(handle: encoded),
                method: "GET",
                body: nil,
                queryItems: [
                    URLQueryItem(name: "via", value: "link"),
                    URLQueryItem(name: "expand", value: Self.expansions),
                ]
            )
            return store(.card(response.data), for: handle)
        } catch {
            guard let verdict = Self.definitiveVerdict(for: error) else {
                return cached(handle: handle).snapshot() ?? .unavailable
            }
            return store(verdict, for: handle)
        }
    }

    /// Oublie toutes les cartes : appelé par `CacheCoordinator.reset()` au logout et au changement de compte —
    /// une carte est celle d'UN lecteur, le compte B ne voit jamais celle résolue pour le compte A.
    public func invalidateAll() {
        entries.withLock { $0.removeAll() }
    }

    /// 404 est un VERDICT (inconnue, cachée, bloquée : la même réponse) ; une panne n'en est pas un (`nil`) ; tout
    /// autre refus (sans compte, ancienne passerelle) rend l'aperçu générique d'avant.
    static func definitiveVerdict(for error: Error) -> ProfileLinkCardResolution? {
        switch error as? MeeshyError {
        case .server(let code, _) where code == 404: return .closed
        case .server(let code, _) where (400..<500).contains(code): return .unavailable
        case .forbidden: return .unavailable
        default: return nil
        }
    }

    @discardableResult
    private func store(_ resolution: ProfileLinkCardResolution, for handle: String) -> ProfileLinkCardResolution {
        let entry = Entry(resolution: resolution, storedAt: now())
        entries.withLock { $0[Self.key(handle)] = entry }
        return resolution
    }

    private static func key(_ handle: String) -> String { handle }
}
