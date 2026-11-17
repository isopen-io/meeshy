import Foundation

/// Un niveau tel que `GET /relations/config` le présente (#13933) : sa clé de libellé, son
/// icône, et son libellé dans chacune des sept langues du catalogue.
public struct RelationLevelPresentation: Codable, Sendable, Equatable {
    public let level: String
    public let labelKey: String
    public let icon: String
    public let labels: [String: String]

    public init(level: String, labelKey: String, icon: String, labels: [String: String]) {
        self.level = level
        self.labelKey = labelKey
        self.icon = icon
        self.labels = labels
    }
}

/// La table des cercles servie par la passerelle. Les seuils et la matrice des features
/// existent dans la réponse ; ce client ne lit que ce qu'il AFFICHE (libellés, icônes) —
/// aucun seuil n'est recopié ici, la progression servie par lien dit déjà ce qu'il faut.
public struct RelationsConfig: Codable, Sendable, Equatable {
    public let levels: [RelationLevelPresentation]
    /// `services` : les interrupteurs serveur que le client lit (#13937). Absent d'un serveur antérieur ⇒ `nil`.
    public let services: RelationsServiceFlags?

    public init(levels: [RelationLevelPresentation], services: RelationsServiceFlags? = nil) {
        self.levels = levels
        self.services = services
    }

    private enum CodingKeys: String, CodingKey { case levels, services }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        levels = try c.decode([RelationLevelPresentation].self, forKey: .levels)
        services = (try? c.decodeIfPresent(RelationsServiceFlags.self, forKey: .services)) ?? nil
    }

    /// La position du Sang n'est ouverte que si le serveur le DIT : absent, illisible ou faux ⇒ fermée (fail-closed).
    public var bloodLocationEnabled: Bool {
        services?.bloodLocation == true
    }

    /// Le libellé du niveau dans la langue demandée, ou `nil` : l'appelant retombe alors sur
    /// le nom du catalogue local plutôt que d'afficher la clé.
    public func label(for level: RelationLevel, language: String) -> String? {
        presentation(of: level)?.labels[language]
    }

    public func icon(for level: RelationLevel) -> String? {
        presentation(of: level)?.icon
    }

    private func presentation(of level: RelationLevel) -> RelationLevelPresentation? {
        levels.first { $0.level == level.rawValue }
    }
}

/// Les interrupteurs de `GET /relations/config` → `services`. Une valeur illisible vaut « non dit » (`nil`).
public struct RelationsServiceFlags: Codable, Sendable, Equatable {
    public let bring: Bool?
    public let bloodLocation: Bool?

    public init(bring: Bool? = nil, bloodLocation: Bool? = nil) {
        self.bring = bring
        self.bloodLocation = bloodLocation
    }

    private enum CodingKeys: String, CodingKey { case bring, bloodLocation }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        bring = (try? c.decodeIfPresent(Bool.self, forKey: .bring)) ?? nil
        bloodLocation = (try? c.decodeIfPresent(Bool.self, forKey: .bloodLocation)) ?? nil
    }
}
