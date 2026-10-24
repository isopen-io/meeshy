import Foundation

// MARK: - La vitrine unique : un pack avec son prix et sa possession (#10632)
//
// MIROIR de `PackSummary` / `PackShopResponse` (spec 2026-10-14 §§ 4.1, 4.4).
// Tout est additif : un ancien serveur ne sert ni `price` ni `owned`, et le
// pack se lit alors gratuit et possédé — exactement la boutique d'aujourd'hui.

/// **Un pack de n'importe quel domaine, tel que la vitrine le montre.**
/// Tolérant champ par champ, sauf sur le slug.
public struct ShopPack: InstallablePack {
    public let slug: String
    public let name: String
    public let description: String
    public let author: String
    public let isBuiltin: Bool
    public let origin: PackOrigin
    public let coverUrl: String?
    public var installed: Bool
    public var installCount: Int
    /// En Meeshes ; `nil` = gratuit. Jamais 0 : un prix illisible ou nul se lit gratuit.
    public var price: Int?
    /// `nil` = le serveur ne le dit pas (ancien serveur) : gratuit ⇒ possédé.
    public var owned: Bool?
    /// `false` = un pack inclus (Essentiels, Mee, Contours essentiels…) : le serveur refuse de le
    /// retirer (409 `PACK_NOT_REMOVABLE`), la vitrine n'offre donc pas « Retirer » (#10718).
    /// Absent d'un ancien serveur ⇒ `true`, comme avant.
    public var removable: Bool
    /// Le nom et la description par langue (`{ en: { name, description } }`), comme le web les lit (#10711).
    public var names: [String: PackLocalizedName]
    /// Où les cadres d'un pack de cadres servent (#10711) ; `nil` hors cadres ou illisible.
    public var usage: FrameUsage?
    /// Ce qui reste à débloquer, et comment (S21, #11276) : servi pour un pack du registre NON possédé qui
    /// se gagne ou qui a une fenêtre. Absent d'un ancien serveur, d'un pack possédé ou libre ⇒ `nil`.
    public var requirementPreview: PackRequirementPreview?

    public var id: String { slug }
    public var isBundled: Bool { isBuiltin || origin == .builtin }

    /// Le nom dans la langue du lecteur, sinon celui que sert la passerelle.
    public func localizedName(language: String) -> String {
        names[FramePack.packLanguage(language)]?.name ?? name
    }

    public func localizedDescription(language: String) -> String {
        names[FramePack.packLanguage(language)]?.description ?? description
    }
    public var coverFile: PackAssetFile? { PackAssetFile(servedPath: coverUrl) }

    /// La règle unique de possession : un pack gratuit est possédé par tout
    /// compte ; un pack payant l'est quand le serveur le dit. Un pack à GAGNER (il porte un aperçu) n'est
    /// jamais possédé d'office parce qu'il est sans prix : le serveur le dit, ou il ne l'est pas.
    public var isOwned: Bool { owned ?? (price == nil && requirementPreview == nil) }
    /// Le serveur dit que le pack n'est pas encore débloqué : ni « Installer » ni « Acheter » — il refuserait.
    public var isLocked: Bool { requirementPreview.map { !$0.met } ?? false }
    /// Le sélecteur du profil ne propose que ce qui est installé, possédé — acheté ou gagné par le jeu — et
    /// débloqué : équiper ce que le serveur refuserait (`not-owned`) rendrait un échec au toucher.
    public var isEquipableOnProfile: Bool { installed && isOwned && !isLocked }
    /// Payant et pas encore à moi : le geste est « Acheter », pas « Installer ».
    public var needsPurchase: Bool { price != nil && !isOwned }

    public init(slug: String, name: String, description: String = "", author: String = "",
                isBuiltin: Bool = false, origin: PackOrigin = .official, coverUrl: String? = nil,
                installed: Bool = false, installCount: Int = 0, price: Int? = nil, owned: Bool? = nil,
                removable: Bool = true, names: [String: PackLocalizedName] = [:], usage: FrameUsage? = nil,
                requirementPreview: PackRequirementPreview? = nil) {
        self.requirementPreview = requirementPreview
        self.names = names
        self.usage = usage
        self.slug = slug
        self.name = name
        self.description = description
        self.author = author
        self.isBuiltin = isBuiltin
        self.origin = origin
        self.coverUrl = coverUrl
        self.installed = installed
        self.installCount = installCount
        self.price = price
        self.owned = owned
        self.removable = removable
    }

    enum CodingKeys: String, CodingKey {
        case slug, name, description, author, origin, coverUrl, installed, installCount, price, owned, removable
        case names, usage, requirementPreview
        case isBuiltin = "builtin"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        slug = try c.decode(String.self, forKey: .slug)
        name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? slug
        description = (try? c.decodeIfPresent(String.self, forKey: .description)) ?? ""
        author = (try? c.decodeIfPresent(String.self, forKey: .author)) ?? ""
        isBuiltin = (try? c.decodeIfPresent(Bool.self, forKey: .isBuiltin)) ?? false
        origin = (try? c.decodeIfPresent(PackOrigin.self, forKey: .origin)) ?? .unknown
        coverUrl = try? c.decodeIfPresent(String.self, forKey: .coverUrl)
        installed = (try? c.decodeIfPresent(Bool.self, forKey: .installed)) ?? false
        installCount = (try? c.decodeIfPresent(Int.self, forKey: .installCount)) ?? 0
        price = (try? c.decodeIfPresent(Int.self, forKey: .price)).flatMap { $0 > 0 ? $0 : nil }
        owned = try? c.decodeIfPresent(Bool.self, forKey: .owned)
        removable = (try? c.decodeIfPresent(Bool.self, forKey: .removable)) ?? true
        names = Self.lossyNames(c)
        usage = try? c.decodeIfPresent(FrameUsage.self, forKey: .usage)
        requirementPreview = try? c.decodeIfPresent(PackRequirementPreview.self, forKey: .requirementPreview)
    }

    /// Une langue illisible tombe seule : les autres noms restent.
    private static func lossyNames(_ c: KeyedDecodingContainer<CodingKeys>) -> [String: PackLocalizedName] {
        guard let nested = try? c.nestedContainer(keyedBy: DynamicKey.self, forKey: .names) else { return [:] }
        return nested.allKeys.reduce(into: [String: PackLocalizedName]()) { map, key in
            if let value = try? nested.decode(PackLocalizedName.self, forKey: key) { map[key.stringValue] = value }
        }
    }
}

/// Les packs d'UN domaine dans la réponse de `GET /packs/shop`.
public struct PackShopSection: Codable, Hashable, Sendable {
    public let domain: PackDomain
    public var packs: [ShopPack]

    public init(domain: PackDomain, packs: [ShopPack]) {
        self.domain = domain
        self.packs = packs
    }

    enum CodingKeys: String, CodingKey { case domain, packs }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        domain = try c.decode(PackDomain.self, forKey: .domain)
        packs = (try? c.decodeIfPresent(LossyDecodableArray<ShopPack>.self, forKey: .packs))?.elements ?? []
    }
}

/// `GET /packs/shop` : les domaines servis, dans l'ordre du serveur, et le solde.
/// Un domaine que ce client ne connaît pas est ÉCARTÉ ; un autre illisible tombe seul.
public struct PackShopResponse: Decodable, Hashable, Sendable {
    public let sections: [PackShopSection]
    public let balance: Int?

    public init(sections: [PackShopSection], balance: Int? = nil) {
        self.sections = sections
        self.balance = balance
    }

    enum CodingKeys: String, CodingKey { case domains, balance }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let served = (try? c.decodeIfPresent(LossyDecodableArray<PackShopSection>.self, forKey: .domains))?.elements ?? []
        sections = served.filter { $0.domain != .unknown }
        balance = try? c.decodeIfPresent(Int.self, forKey: .balance)
    }

    /// **Domaine absent = vitrine vide** : jamais une erreur, jamais le pack d'un autre.
    public func packs(in domain: PackDomain) -> [ShopPack] {
        sections.first { $0.domain == domain }?.packs ?? []
    }
}

public struct PackPurchaseRequest: Encodable, Sendable {
    public let requestId: String

    public init(requestId: String) {
        self.requestId = requestId
    }
}

/// `{ pack (owned, installed), balance }` — la réponse d'un achat, rejouée à l'identique.
public struct PackPurchaseResponse: Decodable, Hashable, Sendable {
    public let pack: ShopPack
    public let balance: Int?

    public init(pack: ShopPack, balance: Int? = nil) {
        self.pack = pack
        self.balance = balance
    }

    enum CodingKeys: String, CodingKey { case pack, balance }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        pack = try c.decode(ShopPack.self, forKey: .pack)
        balance = try? c.decodeIfPresent(Int.self, forKey: .balance)
    }
}

// MARK: - Le statut d'une erreur de pack

public enum PackHTTPStatus {
    /// Le code HTTP qu'une erreur transporte, quelle que soit la couche qui l'a levée.
    public static func code(of error: Error) -> Int? {
        switch error {
        case APIError.serverError(let code, _): return code
        case MeeshyError.server(let code, _): return code
        case MeeshyError.rejected(let rejection): return rejection.statusCode
        case MeeshyError.forbidden: return 403
        default: return nil
        }
    }

    /// `INSUFFICIENT_MEESHES` : le solde ne couvre pas le prix, sans effet côté serveur.
    public static func isInsufficientMeeshes(_ error: Error) -> Bool {
        guard case MeeshyError.rejected(let rejection) = error else { return false }
        return rejection.code == "INSUFFICIENT_MEESHES"
    }

    /// Un refus DÉFINITIF (le geste est tranché) : 4xx hors 408/429. Un réseau
    /// coupé ou un 5xx laisse le geste rejouable avec le même `requestId`.
    public static func isDefinitiveRefusal(_ error: Error) -> Bool {
        guard let code = code(of: error) else { return false }
        return (400...499).contains(code) && code != 408 && code != 429
    }
}

// MARK: - La vitrine, côté service

public protocol PackShopProviding: Sendable {
    /// Les packs des `domains` (tous les domaines routables si `nil`).
    func shop(domains: [PackDomain]?) async throws -> PackShopResponse
    func setInstalled(_ installed: Bool, domain: PackDomain, slug: String) async throws -> ShopPack
    func purchase(domain: PackDomain, slug: String, requestId: String) async throws -> PackPurchaseResponse
}

/// **Une seule vitrine sur `/packs/shop`, avec repli sur les boutiques par
/// domaine.** Un ancien serveur répond 404 : la vitrine se recompose domaine par
/// domaine, et un domaine que ce serveur ne sert pas est vide, jamais en erreur.
public final class PackShopService: PackShopProviding, @unchecked Sendable {
    public static let shared = PackShopService()

    private let api: APIClientProviding

    public init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func shop(domains: [PackDomain]?) async throws -> PackShopResponse {
        let wanted = (domains ?? PackDomain.allCases).filter { $0 != .unknown }
        let query = domains.map { _ in [URLQueryItem(name: "domains", value: wanted.map(\.rawValue).joined(separator: ","))] }
        do {
            let response: APIResponse<PackShopResponse> = try await api.request(
                PacksEndpoint.shop, method: "GET", body: nil, queryItems: query
            )
            return response.data
        } catch {
            guard PackHTTPStatus.code(of: error) == 404 else { throw error }
            return try await composedFromDomains(wanted)
        }
    }

    public func setInstalled(_ installed: Bool, domain: PackDomain, slug: String) async throws -> ShopPack {
        try await PackService<ShopPack>(domain: domain, api: api).setInstalled(installed, slug: slug)
    }

    public func purchase(domain: PackDomain, slug: String, requestId: String) async throws -> PackPurchaseResponse {
        try await PackService<ShopPack>(domain: domain, api: api).purchase(slug: slug, requestId: requestId)
    }

    private func composedFromDomains(_ domains: [PackDomain]) async throws -> PackShopResponse {
        var sections: [PackShopSection] = []
        for domain in domains {
            do {
                let packs = try await PackService<ShopPack>(domain: domain, api: api).catalogue()
                sections.append(PackShopSection(domain: domain, packs: packs))
            } catch {
                guard PackHTTPStatus.code(of: error) == 404 else { throw error }
                sections.append(PackShopSection(domain: domain, packs: []))
            }
        }
        return PackShopResponse(sections: sections, balance: nil)
    }
}

// MARK: - L'état de la vitrine et ses transitions PURES

/// **Acheter ou installer à l'instant, confirmer, revenir en arrière** — le
/// calcul sans réseau. Le `requestId` d'un achat naît AU GESTE et reste attaché
/// au pack tant que le geste n'est pas tranché : un nouvel essai après une
/// coupure le réutilise, le serveur ne débite qu'une fois.
public struct PackShopState: Equatable, Sendable {
    public enum Failure: Equatable, Sendable {
        case insufficientMeeshes
        case generic
    }

    /// `nil` = la vitrine n'a jamais été lue (cache vide).
    public var sections: [PackShopSection]?
    public var balance: Int?
    public var pending: Set<String> = []
    public var requestIds: [String: String] = [:]
    public var failure: Failure?

    public init(sections: [PackShopSection]? = nil, balance: Int? = nil) {
        self.sections = sections
        self.balance = balance
    }

    public static func key(_ domain: PackDomain, _ slug: String) -> String { "\(domain.rawValue).\(slug)" }

    public func packs(in domain: PackDomain) -> [ShopPack]? {
        sections.map { list in list.first { $0.domain == domain }?.packs ?? [] }
    }

    public func pack(_ domain: PackDomain, _ slug: String) -> ShopPack? {
        sections?.first { $0.domain == domain }?.packs.first { $0.slug == slug }
    }

    public func loaded(_ response: PackShopResponse) -> PackShopState {
        var next = self
        next.sections = response.sections
        if let balance = response.balance { next.balance = balance }
        return next
    }

    /// **Acheter À L'INSTANT** : le pack devient possédé et installé, le solde
    /// baisse du prix. `nil` si le pack est inconnu, gratuit ou déjà possédé,
    /// ou si un geste est déjà en vol sur lui.
    public func purchasing(_ domain: PackDomain, _ slug: String,
                           makeRequestId: () -> String) -> (state: PackShopState, requestId: String)? {
        let key = Self.key(domain, slug)
        guard !pending.contains(key), let current = pack(domain, slug), current.needsPurchase, !current.isLocked,
              let price = current.price else { return nil }
        var bought = current
        bought.owned = true
        if !bought.installed { bought.installCount += 1 }
        bought.installed = true
        let requestId = requestIds[key] ?? makeRequestId()
        var next = replacing(bought, in: domain)
        next.balance = balance.map { $0 - price }
        next.pending.insert(key)
        next.requestIds[key] = requestId
        next.failure = nil
        return (next, requestId)
    }

    /// Le serveur a confirmé : son résumé et son solde font foi.
    public func purchaseSettled(_ domain: PackDomain, _ slug: String, _ response: PackPurchaseResponse) -> PackShopState {
        let key = Self.key(domain, slug)
        var next = replacing(response.pack, in: domain)
        next.pending.remove(key)
        next.requestIds[key] = nil
        if let balance = response.balance { next.balance = balance }
        return next
    }

    /// **Retour en arrière du SEUL pack refusé.** Un refus définitif (solde
    /// insuffisant, pack introuvable) clôt le geste : son `requestId` part. Un
    /// échec transitoire (réseau) le GARDE pour le nouvel essai.
    public func purchaseRefused(_ domain: PackDomain, _ slug: String, restoring previous: PackShopState,
                                failure: Failure, definitive: Bool) -> PackShopState {
        let key = Self.key(domain, slug)
        var next = self
        if let before = previous.pack(domain, slug) { next = next.replacing(before, in: domain) }
        if let price = previous.pack(domain, slug)?.price, let balance = next.balance, previous.balance != nil {
            next.balance = balance + price
        }
        next.pending.remove(key)
        if definitive { next.requestIds[key] = nil }
        next.failure = failure
        return next
    }

    /// Installer ou retirer À L'INSTANT un pack POSSÉDÉ (gratuit ou déjà acheté).
    /// `nil` s'il faut l'acheter d'abord, s'il n'est pas encore débloqué (le serveur refuserait), ou si un
    /// geste est en vol. Un pack déjà installé se retire toujours.
    public func togglingInstall(_ domain: PackDomain, _ slug: String) -> PackShopState? {
        let key = Self.key(domain, slug)
        guard !pending.contains(key), let current = pack(domain, slug), !current.needsPurchase,
              current.installed || !current.isLocked else { return nil }
        var flipped = current
        flipped.installed.toggle()
        flipped.installCount = max(0, current.installCount + (flipped.installed ? 1 : -1))
        var next = replacing(flipped, in: domain)
        next.pending.insert(key)
        next.failure = nil
        return next
    }

    public func installSettled(_ domain: PackDomain, _ slug: String, confirmed: ShopPack) -> PackShopState {
        var next = self
        next.pending.remove(Self.key(domain, slug))
        if var current = pack(domain, slug) {
            current.installed = confirmed.installed
            current.installCount = confirmed.installCount
            next = next.replacing(current, in: domain)
        }
        return next
    }

    public func installRefused(_ domain: PackDomain, _ slug: String, restoring previous: PackShopState) -> PackShopState {
        var next = self
        if let before = previous.pack(domain, slug) { next = next.replacing(before, in: domain) }
        next.pending.remove(Self.key(domain, slug))
        next.failure = .generic
        return next
    }

    private func replacing(_ pack: ShopPack, in domain: PackDomain) -> PackShopState {
        var next = self
        next.sections = sections?.map { section in
            guard section.domain == domain else { return section }
            return PackShopSection(domain: domain, packs: section.packs.map { $0.slug == pack.slug ? pack : $0 })
        }
        return next
    }
}
