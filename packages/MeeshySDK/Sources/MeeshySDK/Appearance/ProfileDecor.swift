import Foundation

// MARK: - ProfileDecor (#10632, spec §§ 5.5, 10.2)
//
// MIROIR de `packages/shared/types/profile-decor.ts` : le contour d'avatar, la
// bannière de design (le FOND) et le cadre de bannière (posé SUR la photo,
// centre transparent, #10932) ÉQUIPÉS sur le profil, VISIBLES des autres.
// Lecture tolérante PAR CÔTÉ : un décor illisible n'empêche jamais d'ouvrir un
// profil, un contour illisible n'emporte pas la bannière, un côté inconnu est
// ignoré. Un profil sans `profileDecor`, ou sans `bannerFrame` (ancien serveur),
// se rend comme avant.

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
    /// Le cadre posé SUR la photo de bannière (ou le fond), centre transparent (#10932).
    public var bannerFrame: ServedProfileDecorItem?

    public static let empty = ServedProfileDecor()

    public init(avatarRing: ServedProfileDecorItem? = nil, banner: ServedProfileDecorItem? = nil, bannerFrame: ServedProfileDecorItem? = nil) {
        self.avatarRing = avatarRing
        self.banner = banner
        self.bannerFrame = bannerFrame
    }

    private enum CodingKeys: String, CodingKey { case avatarRing, banner, bannerFrame }

    public init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        avatarRing = try? c.decodeIfPresent(ServedProfileDecorItem.self, forKey: .avatarRing)
        banner = try? c.decodeIfPresent(ServedProfileDecorItem.self, forKey: .banner)
        bannerFrame = try? c.decodeIfPresent(ServedProfileDecorItem.self, forKey: .bannerFrame)
    }
}

public enum ProfileDecorSide: String, Sendable, Hashable, CaseIterable {
    case avatarRing
    case banner
    case bannerFrame

    /// Le domaine de pack du côté : on n'équipe un côté qu'avec un modèle de SON domaine.
    public var packDomain: String {
        switch self {
        case .avatarRing: return "avatar-ring"
        case .banner: return "banner"
        case .bannerFrame: return "banner-frame"
        }
    }
}

extension ServedProfileDecor {
    public subscript(side: ProfileDecorSide) -> ServedProfileDecorItem? {
        get {
            switch side {
            case .avatarRing: return avatarRing
            case .banner: return banner
            case .bannerFrame: return bannerFrame
            }
        }
        set {
            switch side {
            case .avatarRing: avatarRing = newValue
            case .banner: banner = newValue
            case .bannerFrame: bannerFrame = newValue
            }
        }
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
    public var bannerFrame: Change

    public init(avatarRing: Change = .unchanged, banner: Change = .unchanged, bannerFrame: Change = .unchanged) {
        self.avatarRing = avatarRing
        self.banner = banner
        self.bannerFrame = bannerFrame
    }

    public init(side: ProfileDecorSide, choice: ProfileDecorRef?) {
        let change: Change = choice.map(Change.set) ?? .clear
        self.init(
            avatarRing: side == .avatarRing ? change : .unchanged,
            banner: side == .banner ? change : .unchanged,
            bannerFrame: side == .bannerFrame ? change : .unchanged
        )
    }

    private enum CodingKeys: String, CodingKey { case avatarRing, banner, bannerFrame }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try Self.encode(avatarRing, key: .avatarRing, in: &c)
        try Self.encode(banner, key: .banner, in: &c)
        try Self.encode(bannerFrame, key: .bannerFrame, in: &c)
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

    public init(userId: String, decor: ServedProfileDecor) {
        self.userId = userId
        self.decor = decor
    }
}

/// Ce qu'une bannière de profil peint : sa photo, sinon le design équipé, sinon le dégradé par défaut.
public enum ProfileBannerPaint: Equatable, Sendable {
    case photo(String)
    case design(AppearanceDesign)
    case plain
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

    /// Le cadre posé SUR la bannière (#10935) : un `builtin` se lit dans le catalogue EMBARQUÉ (#10936).
    public static func bannerFrame(_ item: ServedProfileDecorItem?, catalog: BannerFrameCatalog = .shared) -> BannerFrameDesign? {
        guard let item, isEmbedded(item) else { return nil }
        return catalog.frame(pack: item.pack, item: item.item)
    }

    /// Ce que la bannière d'un profil peint (#10933) : la photo gagne TOUJOURS ; le design équipé
    /// ne se peint qu'en l'absence de photo, et rien ne se peint sans l'un ni l'autre.
    public static func bannerPaint(photo: String?, decor: ServedProfileDecorItem?, catalog: AppearanceCatalog = .shared) -> ProfileBannerPaint {
        if let photo, !photo.isEmpty { return .photo(photo) }
        if let design = banner(decor, catalog: catalog) { return .design(design) }
        return .plain
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

    /// Une proposition à plat : sa clé (`pack/item`) est unique sur TOUTE la liste.
    public struct Entry<Design: Sendable>: Sendable, Identifiable {
        public let ref: ProfileDecorRef
        public let design: Design
        public var id: String { ref.pack + "/" + ref.item }
    }

    /// Les groupes mis à plat pour une grille. Deux `ForEach` imbriqués dans une grille paresseuse,
    /// l'intérieur identifié par son rang, se disputent les mêmes identifiants d'un groupe à l'autre :
    /// la première vignette du second pack (Halo doré, Aurore vive) disparaissait (#10719).
    public static func flattened<Design: Sendable>(_ groups: [OptionGroup<Design>]) -> [Entry<Design>] {
        groups.flatMap { group in group.items.map { Entry(ref: $0.ref, design: $0.design) } }
    }

    public static func rings(installed: [ShopPack]?, catalog: AvatarRingCatalog = .shared) -> [OptionGroup<AvatarRingDesign>] {
        groups(installed: installed, builtin: catalog.packs.map { ($0.slug, $0.installedByDefault, $0.rings) })
    }

    public static func banners(installed: [ShopPack]?, catalog: AppearanceCatalog = .shared) -> [OptionGroup<AppearanceDesign>] {
        groups(installed: installed, builtin: catalog.bannerPacks.map { ($0.slug, $0.installedByDefault, $0.designs) })
    }

    /// Les cadres posés SUR la bannière (#10936) : deux packs sont installés d'office (#11165).
    public static func bannerFrames(installed: [ShopPack]?, catalog: BannerFrameCatalog = .shared) -> [OptionGroup<BannerFrameDesign>] {
        groups(installed: installed, builtin: catalog.framePacks.map { ($0.slug, $0.installedByDefault, $0.frames) })
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
