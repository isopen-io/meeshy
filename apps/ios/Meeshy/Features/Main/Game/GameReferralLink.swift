import Foundation
import MeeshySDK

// LE LIEN DE PARRAINAGE DE L'UTILISATEUR (#7742) — la seule pièce du déroulé photo qui parle au
// réseau, et elle n'y envoie AUCUNE image : elle lit les jetons d'affiliation de l'utilisateur.
// Elle vit donc HORS de `Photo/`, dont la garde de source interdit tout chemin vers le réseau
// (« la photo reste sur l'appareil tant qu'on ne la partage pas »).

/// QUEL JETON DEVIENT LE LIEN DE PARTAGE (#7742) — la règle du web (`loadShareableReferralLink`,
/// `apps/web/src/lib/api/referral-link.ts`), pure : le premier jeton CRÉÉ PAR le lecteur qui est
/// actif, non expiré, non épuisé, et qui porte un lien. Un jeton que la passerelle dirait inutilisable
/// ne part pas : un lien qui laisserait croire au parrainage serait pire que pas de lien.
nonisolated enum ReferralLinkRule {

    static let tokenName = "Invitation Meeshy"

    /// Expiré STRICTEMENT après l'échéance ; une date illisible ne vaut jamais « sans échéance ».
    static func isExpired(_ expiresAt: String?, now: Date) -> Bool {
        guard let expiresAt else { return false }
        guard let date = EngagementProgressResolver.reachedDate(expiresAt) else { return true }
        return now > date
    }

    /// `maxUses` nul ou absent veut dire illimité (même lecture que `GET /affiliate/validate/:token`).
    static func isExhausted(maxUses: Int?, currentUses: Int) -> Bool {
        guard let maxUses, maxUses > 0 else { return false }
        return currentUses >= maxUses
    }

    static func isUsable(_ token: AffiliateToken, now: Date) -> Bool {
        guard token.isActive, !isExpired(token.expiresAt, now: now),
              !isExhausted(maxUses: token.maxUses, currentUses: token.currentUses) else { return false }
        return !(token.affiliateLink ?? "").isEmpty
    }

    static func link(in tokens: [AffiliateToken], now: Date) -> String? {
        tokens.first { isUsable($0, now: now) }?.affiliateLink
    }
}

/// Où le déroulé photo lit le lien de parrainage de l'utilisateur.
///
/// **Aucun jeton ne se crée sans geste.** L'ouverture du déroulé LIT (`existingLink`) ; seul le toucher de
/// « Partager » CRÉE, quand l'utilisateur n'a encore aucun jeton utilisable (`shareableLink`).
@MainActor
protocol ReferralLinkProviding: AnyObject {
    /// Le lien d'un jeton qui EXISTE déjà (cache d'abord, puis la liste), ou `nil` : sans réseau, sans jeton
    /// utilisable, ou sur un refus. Ne crée RIEN, jamais.
    func existingLink() async -> String?
    /// Le lien à partager : celui d'un jeton existant, sinon celui du jeton que ce geste crée. `nil` sur un
    /// refus ou une lecture en panne. Jamais un lien inventé.
    func shareableLink() async -> String?
}

/// Ce que le service lit et écrit : les jetons du lecteur, et leur cache local.
@MainActor
protocol ReferralTokenGateway: AnyObject {
    func cachedTokens() async -> [AffiliateToken]
    func listTokens() async throws -> [AffiliateToken]
    func createToken(name: String) async throws -> AffiliateToken
    func store(_ tokens: [AffiliateToken]) async
}

/// La passerelle réelle : le service d'affiliation, et le cache que l'écran « Parrainage » lit déjà
/// (une seule liste de jetons, pas deux).
@MainActor
final class AffiliateTokenGateway: ReferralTokenGateway {
    nonisolated deinit {}

    func cachedTokens() async -> [AffiliateToken] {
        switch await CacheCoordinator.shared.affiliateTokens.load(for: "list") {
        case .fresh(let tokens, _), .stale(let tokens, _): tokens
        case .expired, .empty: []
        }
    }

    func listTokens() async throws -> [AffiliateToken] {
        try await AffiliateService.shared.listTokens()
    }

    func createToken(name: String) async throws -> AffiliateToken {
        try await AffiliateService.shared.createToken(name: name)
    }

    func store(_ tokens: [AffiliateToken]) async {
        try? await CacheCoordinator.shared.affiliateTokens.save(tokens, for: "list")
    }
}

/// LE LIEN DE PARRAINAGE DE L'UTILISATEUR (#7742), cache-first :
///
///  1. un jeton utilisable déjà en cache donne le lien SUR-LE-CHAMP (la carte se compose sans attendre) ;
///  2. sinon la liste se lit au réseau, et le premier jeton utilisable sert ;
///  3. sinon — et SEULEMENT à `shareableLink()`, le toucher de « Partager » — le geste CRÉE le jeton
///     (« Invitation Meeshy »), l'utilisateur n'a rien à régler.
///
/// **Échouer ne partage rien** : une lecture en panne ne crée pas de jeton à l'aveugle, et chaque
/// échec rend `nil` — la carte part alors sans bandeau.
@MainActor
final class ReferralLinkService: ReferralLinkProviding {
    nonisolated deinit {}

    static let shared = ReferralLinkService()

    private let gateway: ReferralTokenGateway
    private let now: () -> Date

    init(gateway: ReferralTokenGateway = AffiliateTokenGateway(), now: @escaping () -> Date = { Date() }) {
        self.gateway = gateway
        self.now = now
    }

    private enum Lookup {
        case found(String)
        /// La liste a été LUE et ne porte aucun jeton utilisable : seul cas où créer a un sens.
        case none(listed: [AffiliateToken])
        /// La lecture a échoué : on ne sait pas, donc on ne crée pas.
        case unreadable
    }

    private func lookup() async -> Lookup {
        if let cached = ReferralLinkRule.link(in: await gateway.cachedTokens(), now: now()) { return .found(cached) }
        guard let tokens = try? await gateway.listTokens() else { return .unreadable }
        await gateway.store(tokens)
        guard let listed = ReferralLinkRule.link(in: tokens, now: now()) else { return .none(listed: tokens) }
        return .found(listed)
    }

    func existingLink() async -> String? {
        guard case .found(let link) = await lookup() else { return nil }
        return link
    }

    func shareableLink() async -> String? {
        switch await lookup() {
        case .found(let link):
            return link
        case .unreadable:
            return nil
        case .none(let tokens):
            guard let created = try? await gateway.createToken(name: ReferralLinkRule.tokenName) else { return nil }
            await gateway.store([created] + tokens)
            return ReferralLinkRule.isUsable(created, now: now()) ? created.affiliateLink : nil
        }
    }
}
