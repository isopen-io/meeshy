import Foundation

/// Ce que le cercle d'une fiche ME tient fermé de ses adresses (#19444, servi par #19274) : par cercle qui les ouvre,
/// combien. Rien d'autre ne se lit, même si le fil en portait — ni titre, ni adresse, ni glyphe : la rangée qui le
/// montre ne peut rien en dire. Un cercle inconnu ou public, un compte nul se sautent ; une forme inattendue vaut
/// « aucune », jamais la perte du profil entier.
public struct ServedLockedAddresses: Codable, Sendable, Equatable {
    public struct Group: Sendable, Equatable {
        public let circle: RelationLevel
        public let count: Int

        public init(circle: RelationLevel, count: Int) {
            self.circle = circle
            self.count = count
        }
    }

    /// Un groupe par cercle, du plus proche du lecteur au plus lointain.
    public let groups: [Group]

    public init(_ groups: [Group]) {
        let totals = groups
            .filter { $0.count > 0 && $0.circle != .public }
            .reduce(into: [RelationLevel: Int]()) { $0[$1.circle, default: 0] += $1.count }
        self.groups = totals
            .map { Group(circle: $0.key, count: $0.value) }
            .sorted { $0.circle < $1.circle }
    }

    private struct Wire: Codable {
        let circle: String
        let count: Int
    }

    private struct Skipped: Decodable {
        init(from decoder: Decoder) throws {}
    }

    public init(from decoder: Decoder) throws {
        guard var container = try? decoder.unkeyedContainer() else {
            self.init([])
            return
        }
        var read: [Group] = []
        while !container.isAtEnd {
            if let wire = try? container.decode(Wire.self) {
                if let circle = RelationLevel(rawValue: wire.circle) {
                    read.append(Group(circle: circle, count: wire.count))
                }
            } else if (try? container.decode(Skipped.self)) == nil {
                break
            }
        }
        self.init(read)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(groups.map { Wire(circle: $0.circle.rawValue, count: $0.count) })
    }
}

/// Une communauté PUBLIQUE de la personne, telle que sa fiche me la sert : son adresse, ses membres, et si j'en fais
/// déjà partie. Sans identifiant ni nom, elle ne se lit pas.
public struct ProfileOpenCommunity: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let identifier: String
    public let name: String
    public let avatar: String?
    public let memberCount: Int?
    public let isMember: Bool?

    public init(id: String, identifier: String, name: String, avatar: String? = nil, memberCount: Int? = nil,
                isMember: Bool? = nil) {
        self.id = id
        self.identifier = identifier
        self.name = name
        self.avatar = avatar
        self.memberCount = memberCount
        self.isMember = isMember
    }

    /// Absent vaut « pas encore » : on propose de rejoindre, le serveur tranche.
    public var isReaderMember: Bool { isMember == true }

    /// L'adresse telle qu'on la lit, sans schéma — celle que l'app ouvre (`/communities/<identifiant>`).
    public var displayAddress: String { "\(ProfileLink.host)/communities/\(identifier)" }

    var isReadable: Bool {
        !id.isEmpty && !identifier.trimmingCharacters(in: .whitespaces).isEmpty
            && !name.trimmingCharacters(in: .whitespaces).isEmpty
    }
}

/// Les communautés ouvertes d'une fiche (#19444) : lues avec indulgence, une seule fois chacune, dans l'ordre servi.
public struct ServedOpenCommunities: Codable, Sendable, Equatable {
    public let items: [ProfileOpenCommunity]

    public init(_ items: [ProfileOpenCommunity]) {
        self.items = items
            .filter(\.isReadable)
            .reduce(into: [ProfileOpenCommunity]()) { kept, item in
                if !kept.contains(where: { $0.id == item.id }) { kept.append(item) }
            }
    }

    private struct Skipped: Decodable {
        init(from decoder: Decoder) throws {}
    }

    public init(from decoder: Decoder) throws {
        guard var container = try? decoder.unkeyedContainer() else {
            self.init([])
            return
        }
        var read: [ProfileOpenCommunity] = []
        while !container.isAtEnd {
            if let community = try? container.decode(ProfileOpenCommunity.self) {
                read.append(community)
            } else if (try? container.decode(Skipped.self)) == nil {
                break
            }
        }
        self.init(read)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(items)
    }
}
