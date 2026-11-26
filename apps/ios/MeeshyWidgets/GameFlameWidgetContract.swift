import Foundation

/// **« Ma Flamme »** (#20562, tranche iOS de #17369) : le contrat du groupe d'app entre l'app, qui publie, et le widget,
/// qui peint.
///
/// Compilé dans les DEUX cibles (`project.yml`) : une seule définition tient les deux bouts du fil. Il ne porte que la
/// Flamme et les actes du jour du compte connecté, tels que la passerelle les a servis dans le bloc `game` : rien
/// d'autrui, aucune règle recalculée.
nonisolated struct WidgetGameFlame: Codable, Equatable, Sendable {
    /// Les jours de la Flamme, servis.
    let days: Int
    /// Le jeton `FlameStatus.rawValue` servi : `none`, `lit`, `at-risk`, `covered`, `out`.
    let status: String
    /// Les actes du rêve du jour réalisés, sur `actsTotal` ; `actsTotal == 0` : aucun acte servi.
    let actsDone: Int
    let actsTotal: Int
}

/// Ce que l'app publie : la Flamme, ou « Jeu masqué », qui vide le widget. Aucune publication : le widget invite au
/// premier geste.
nonisolated enum WidgetGameFlameState: Codable, Equatable, Sendable {
    case hidden
    case shown(WidgetGameFlame)
}

nonisolated enum GameFlameWidgetKeys {
    static let kind = "GameFlame"
    static let defaultsKey = "game_flame"
    /// Ma Légende, où la Flamme et les actes du jour se jouent (`GameLinkParser` : `me/progression` → `.legend`).
    static let link = URL(string: "meeshy://me/progression")

    static func decode(_ data: Data?) -> WidgetGameFlameState? {
        guard let data else { return nil }
        return try? JSONDecoder().decode(WidgetGameFlameState.self, from: data)
    }
}
