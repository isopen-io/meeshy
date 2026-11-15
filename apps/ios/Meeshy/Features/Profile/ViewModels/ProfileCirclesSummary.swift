import Foundation
import MeeshySDK

/// Ce que la rangée « Mes cercles » de ma fiche montre (#18590) : combien de personnes vivent à chaque niveau, dans
/// l'ordre des cercles, et combien de demandes attendent ma réponse.
///
/// Valeur pure, dérivée des liens SERVIS : un nombre que le serveur n'a pas donné n'existe pas, donc rien de servi se
/// lit comme cinq zéros, jamais comme une estimation. Public n'est pas un cercle (c'est l'absence de lien) : il ne se
/// compte pas.
nonisolated struct ProfileCirclesSummary: Equatable, Sendable {

    struct Entry: Identifiable, Equatable, Sendable {
        let level: RelationLevel
        let count: Int
        var id: RelationLevel { level }
    }

    /// Du plus large au plus intime, comme on monte dans les cercles.
    static let levels: [RelationLevel] = [.community, .acquaintance, .friend, .close, .blood]

    static let empty = make(links: [], pendingCount: 0)

    let entries: [Entry]
    let pendingCount: Int

    var total: Int { entries.reduce(0) { $0 + $1.count } }

    var isEmpty: Bool { total == 0 }

    func count(of level: RelationLevel) -> Int {
        entries.first { $0.level == level }?.count ?? 0
    }

    /// Chaque personne se compte UNE fois, à son niveau EFFECTIF (le niveau qui gouverne ce que l'autre voit), jamais
    /// à mon seul accord ; servie deux fois, la dernière version gagne.
    static func make(links: [RelationLink], pendingCount: Int) -> ProfileCirclesSummary {
        let levelByPerson = links.reduce(into: [String: RelationLevel]()) { $0[$1.userId] = $1.effectiveLevel }
        let counts = levelByPerson.values.reduce(into: [RelationLevel: Int]()) { $0[$1, default: 0] += 1 }
        return ProfileCirclesSummary(
            entries: levels.map { Entry(level: $0, count: counts[$0] ?? 0) },
            pendingCount: max(0, pendingCount)
        )
    }
}
