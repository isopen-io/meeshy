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

    public init(levels: [RelationLevelPresentation]) {
        self.levels = levels
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
