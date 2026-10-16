import Foundation

// MARK: - Les étincelles (#10846)
//
// MIROIR de `packages/shared/utils/game/sparks.ts`. « Étincelle » est le nom des POINTS ; la monnaie reste la
// Meesh. Trois nombres, un seul dépensable :
//
//   - la POCHE  (`sparks`, ex-`engagementScore`) : ce que la frappe dépense — tout est convertible ;
//   - le CYCLE  (`sparksCycle`) : accumulé depuis le dernier prestige — le niveau se lit sur lui ;
//   - le TOTAL À VIE (`sparksLifetime`) : ne baisse ni à la frappe ni au prestige.
//
// Invariant : poche ≤ cycle ≤ total à vie. Un champ absent se lit sur le plus bas minorant sûr.

public enum GameSparks {

    public struct Facts: Equatable, Sendable {
        public let pocket: Int
        public let cycle: Int
        public let lifetime: Int
    }

    /// `sparksOf` : un champ absent ou en retard se lit sur celui d'en dessous, jamais sous lui.
    public static func facts(pocket: Int?, cycle: Int?, lifetime: Int?) -> Facts {
        let pocket = max(0, pocket ?? 0)
        let cycle = max(pocket, cycle ?? 0)
        return Facts(pocket: pocket, cycle: cycle, lifetime: max(cycle, lifetime ?? 0))
    }

    /// Un compte d'étincelles sur le fil : entier ≥ 0, ABSENT ou illisible ⇒ `nil` — jamais une erreur qui
    /// emporterait le bloc entier (un serveur antérieur ne sert pas ces champs).
    static func count<K: CodingKey>(_ container: KeyedDecodingContainer<K>, _ key: K) -> Int? {
        ((try? container.decodeIfPresent(Int.self, forKey: key)) ?? nil).map { max(0, $0) }
    }
}
