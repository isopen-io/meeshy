import Foundation

// MARK: - ProfileDecor (#10632, spec §§ 5.5, 10.2)
//
// MIROIR de `packages/shared/types/profile-decor.ts` : le contour d'avatar et la
// bannière de design ÉQUIPÉS sur le profil, VISIBLES des autres. Lecture
// tolérante PAR CÔTÉ : un décor illisible n'empêche jamais d'ouvrir un profil,
// et un contour illisible n'emporte pas la bannière. Un profil sans
// `profileDecor` (ancien serveur) se rend comme avant.

public struct ProfileDecorRef: Codable, Hashable, Sendable {
    public let pack: String
    public let item: String

    public init(pack: String, item: String) {
        self.pack = pack
        self.item = item
    }
}

public struct ServedProfileDecorItem: Codable, Hashable, Sendable {
    public let pack: String
    public let item: String
    public let origin: PackOrigin
    /// L'adresse `<sha16>.json` du contrat ; `nil` pour un `builtin` embarqué.
    public let contract: String?

    public init(pack: String, item: String, origin: PackOrigin, contract: String? = nil) {
        self.pack = pack
        self.item = item
        self.origin = origin
        self.contract = contract
    }

    public var ref: ProfileDecorRef { ProfileDecorRef(pack: pack, item: item) }
}

public struct ServedProfileDecor: Codable, Hashable, Sendable {
    public var avatarRing: ServedProfileDecorItem?
    public var banner: ServedProfileDecorItem?

    public static let empty = ServedProfileDecor()

    public init(avatarRing: ServedProfileDecorItem? = nil, banner: ServedProfileDecorItem? = nil) {
        self.avatarRing = avatarRing
        self.banner = banner
    }

    private enum CodingKeys: String, CodingKey { case avatarRing, banner }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        avatarRing = try? c.decodeIfPresent(ServedProfileDecorItem.self, forKey: .avatarRing)
        banner = try? c.decodeIfPresent(ServedProfileDecorItem.self, forKey: .banner)
    }
}

public enum ProfileDecorSide: String, Sendable, Hashable, CaseIterable {
    case avatarRing
    case banner
}

extension ServedProfileDecor {
    public subscript(side: ProfileDecorSide) -> ServedProfileDecorItem? {
        get { side == .avatarRing ? avatarRing : banner }
        set { if side == .avatarRing { avatarRing = newValue } else { banner = newValue } }
    }
}

/// `PUT /me/profile-decor` : champ absent = inchangé, `null` = retiré.
public struct ProfileDecorWrite: Encodable, Sendable, Equatable {
    public enum Change: Sendable, Equatable {
        case unchanged
        case clear
        case set(ProfileDecorRef)
    }

    public var avatarRing: Change
    public var banner: Change

    public init(avatarRing: Change = .unchanged, banner: Change = .unchanged) {
        self.avatarRing = avatarRing
        self.banner = banner
    }

    public init(side: ProfileDecorSide, choice: ProfileDecorRef?) {
        let change: Change = choice.map(Change.set) ?? .clear
        self.init(avatarRing: side == .avatarRing ? change : .unchanged, banner: side == .banner ? change : .unchanged)
    }

    private enum CodingKeys: String, CodingKey { case avatarRing, banner }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try Self.encode(avatarRing, key: .avatarRing, in: &c)
        try Self.encode(banner, key: .banner, in: &c)
    }

    private static func encode(_ change: Change, key: CodingKeys, in c: inout KeyedEncodingContainer<CodingKeys>) throws {
        switch change {
        case .unchanged: break
        case .clear: try c.encodeNil(forKey: key)
        case .set(let ref): try c.encode(ref, forKey: key)
        }
    }
}

public protocol ProfileDecorProviding: Sendable {
    func update(_ write: ProfileDecorWrite) async throws -> ServedProfileDecor
}

public final class ProfileDecorService: ProfileDecorProviding, @unchecked Sendable {
    public static let shared = ProfileDecorService()

    private let api: APIClientProviding

    public init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func update(_ write: ProfileDecorWrite) async throws -> ServedProfileDecor {
        let response: APIResponse<ServedProfileDecor> = try await api.put(MeEndpoint.profileDecor, body: write)
        return response.data
    }
}

// MARK: - Équiper : optimiste, retour arrière du CÔTÉ touché seulement

/// Le décor local d'un profil et ses transitions PURES. Équiper s'écrit au
/// toucher ; la réponse du serveur fait foi ; un refus ou une panne rétablit LE
/// CÔTÉ touché — jamais l'autre : un instantané complet écraserait un
/// événement arrivé entre-temps.
public struct ProfileDecorState: Equatable, Sendable {
    public private(set) var decor: ServedProfileDecor

    public init(decor: ServedProfileDecor = .empty) {
        self.decor = decor
    }

    /// Applique le choix et rend ce qu'il faut pour revenir en arrière.
    @discardableResult
    public mutating func equip(_ item: ServedProfileDecorItem?, side: ProfileDecorSide) -> ServedProfileDecorItem? {
        let previous = decor[side]
        decor[side] = item
        return previous
    }

    public mutating func confirm(_ served: ServedProfileDecor) {
        decor = served
    }

    public mutating func rollback(side: ProfileDecorSide, to previous: ServedProfileDecorItem?) {
        decor[side] = previous
    }

    /// `profile:decor-updated` : les autres appareils de MOI ; l'événement d'un autre compte est ignoré.
    public mutating func apply(event: ProfileDecorUpdatedEvent, myUserId: String) {
        guard event.userId == myUserId else { return }
        decor = event.decor
    }
}

public struct ProfileDecorUpdatedEvent: Decodable, Sendable, Equatable {
    public let userId: String
    public let decor: ServedProfileDecor
}

/// Résolution du dessin d'un décor servi : le `builtin` se lit dans le catalogue EMBARQUÉ, sans réseau.
/// Un pack non embarqué (contrat adressé par contenu) n'est pas encore chargé côté iOS : `nil`, le
/// profil se peint sans décor — jamais en erreur.
public enum ProfileDecorResolver {
    public static func ring(_ item: ServedProfileDecorItem?, catalog: AvatarRingCatalog = .shared) -> AvatarRingDesign? {
        guard let item, isEmbedded(item) else { return nil }
        return catalog.ring(pack: item.pack, item: item.item)
    }

    public static func banner(_ item: ServedProfileDecorItem?, catalog: AppearanceCatalog = .shared) -> AppearanceDesign? {
        guard let item, isEmbedded(item) else { return nil }
        return catalog.bannerPacks.first { $0.slug == item.pack }?.designs.first { $0.key == item.item }
    }

    private static func isEmbedded(_ item: ServedProfileDecorItem) -> Bool {
        item.origin == .builtin || item.contract == nil
    }
}

/// Ce que le sélecteur PROPOSE : les packs installés ET possédés, rien d'autre (§ 9).
public enum ProfileDecorOptions {
    public struct OptionGroup<Design: Sendable>: Sendable {
        public let pack: String
        public let items: [(ref: ProfileDecorRef, design: Design)]
    }

    public static func rings(installed: [ShopPack]?, catalog: AvatarRingCatalog = .shared) -> [OptionGroup<AvatarRingDesign>] {
        groups(installed: installed, builtin: catalog.packs.map { ($0.slug, $0.installedByDefault, $0.rings) })
    }

    public static func banners(installed: [ShopPack]?, catalog: AppearanceCatalog = .shared) -> [OptionGroup<AppearanceDesign>] {
        groups(installed: installed, builtin: catalog.bannerPacks.map { ($0.slug, $0.installedByDefault, $0.designs) })
    }

    /// `installed == nil` (liste pas encore lue / ancien serveur) : les packs installés d'office.
    private static func groups<Design: Sendable>(installed: [ShopPack]?, builtin: [(slug: String, byDefault: Bool, designs: [Design])]) -> [OptionGroup<Design>] where Design: Identifiable, Design.ID == String {
        let usable: [(slug: String, designs: [Design])]
        if let installed {
            let owned = Set(installed.filter { $0.installed && $0.isOwned }.map(\.slug))
            usable = builtin.filter { owned.contains($0.slug) }.map { ($0.slug, $0.designs) }
        } else {
            usable = builtin.filter { $0.byDefault }.map { ($0.slug, $0.designs) }
        }
        return usable.filter { !$0.designs.isEmpty }.map { pack in
            OptionGroup(pack: pack.slug, items: pack.designs.map { (ref: ProfileDecorRef(pack: pack.slug, item: $0.id), design: $0) })
        }
    }
}
