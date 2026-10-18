import Foundation

// MARK: - Les étincelles (#10846)
//
// MIROIR de `packages/shared/utils/game/sparks.ts`. « Étincelle » est le nom des POINTS ; la monnaie reste la
// Meesh. Trois nombres, un seul dépensable — et c'est lui qui fait le niveau (porteur 2026-10-17, #10892) :
//
//   - la POCHE  (`sparks`, ex-`engagementScore`) : ce que la frappe dépense — tout est convertible — et ce que le
//     NIVEAU lit : frapper fait donc baisser le niveau du montant dépensé, regagner le fait remonter ;
//   - le CYCLE  (`sparksCycle`) : accumulé depuis le dernier prestige — INDICATIF, le potentiel du profil ;
//   - le TOTAL À VIE (`sparksLifetime`) : ne baisse ni à la frappe ni au prestige — INDICATIF lui aussi.
//
// Invariant : poche ≤ cycle ≤ total à vie. Un champ absent se lit sur le plus bas minorant sûr.

public enum GameSparks {

    /// Ce qui bloque la frappe hors prix et rang (`mint.blockedBy`, `meesh.blockedBy`) — une valeur inconnue se tait.
    public enum MintBlock: String, Codable, Sendable, Hashable {
        case debt
        /// Une raison ajoutée côté serveur avant la mise à jour de l'app : elle ne bloque rien ici, et ne fait jamais
        /// tomber le bloc qui la porte.
        case unknown

        public init(from decoder: Decoder) throws {
            self = MintBlock(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
        }
    }

    static func mintBlock<K: CodingKey>(_ container: KeyedDecodingContainer<K>, _ key: K) -> MintBlock? {
        ((try? container.decodeIfPresent(String.self, forKey: key)) ?? nil).flatMap(MintBlock.init(rawValue:))
            .flatMap { $0 == .unknown ? nil : $0 }
    }

    public struct Facts: Equatable, Sendable {
        /// La base du niveau (`levelSparksOf`, #10892) : jamais le cycle.
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

    /// Les trois nombres ET la dette — ce qu'un gain et un Prestige transforment (#10902).
    public struct Ledger: Equatable, Sendable {
        public let pocket: Int
        public let cycle: Int
        public let lifetime: Int
        public let debt: Int

        public init(pocket: Int, cycle: Int, lifetime: Int, debt: Int) {
            self.pocket = pocket
            self.cycle = cycle
            self.lifetime = lifetime
            self.debt = debt
        }
    }

    /// `sparksAfterCredit` : la dette se rembourse d'abord, seul le reste va en poche ; le cycle et le total à vie montent du
    /// gain ENTIER, jamais sous la poche (compte d'avant le rattrapage). La loi que `writeEngagementScore` écrit en base.
    public static func afterCredit(_ ledger: Ledger, points: Int) -> Ledger {
        let gained = max(0, points)
        let debt = max(0, ledger.debt)
        let repaid = min(debt, gained)
        let pocket = max(0, ledger.pocket)
        let cycle = max(max(0, ledger.cycle), pocket)
        return Ledger(pocket: pocket + gained - repaid, cycle: cycle + gained,
                      lifetime: max(max(0, ledger.lifetime), cycle) + gained, debt: debt - repaid)
    }

    /// `sparksAfterPrestige` : la poche et le cycle repartent de zéro ; le total à vie et la dette restent.
    public static func afterPrestige(_ ledger: Ledger) -> Ledger {
        Ledger(pocket: 0, cycle: 0,
               lifetime: max(max(0, ledger.lifetime), max(0, ledger.cycle), max(0, ledger.pocket)),
               debt: max(0, ledger.debt))
    }

    /// Un compte d'étincelles sur le fil : entier ≥ 0, ABSENT ou illisible ⇒ `nil` — jamais une erreur qui
    /// emporterait le bloc entier (un serveur antérieur ne sert pas ces champs).
    static func count<K: CodingKey>(_ container: KeyedDecodingContainer<K>, _ key: K) -> Int? {
        ((try? container.decodeIfPresent(Int.self, forKey: key)) ?? nil).map { max(0, $0) }
    }
}

public extension GameBlock.Level {
    /// Les étincelles SERVIES et la dette, lues par `sparksOf` — `nil` devant un serveur d'avant les étincelles.
    var sparkLedger: GameSparks.Ledger? {
        guard let sparks else { return nil }
        let facts = GameSparks.facts(pocket: sparks, cycle: sparksCycle, lifetime: sparksLifetime)
        return GameSparks.Ledger(pocket: facts.pocket, cycle: facts.cycle, lifetime: facts.lifetime, debt: sparksDebt ?? 0)
    }
}
