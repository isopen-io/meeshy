import Foundation

// MARK: - Ce qu'un geste dépense ou exige (#9705)
//
// MIROIR de `packages/shared/utils/game/spend.ts` — montré AVANT le geste : ce
// qu'on a, ce que le geste coûte, ce qui restera ; ou, quand le solde ne
// suffit pas, ce qui manque. Une exigence (un niveau requis) se lit pareil.
//
// Pur et sans prix : le prix et le seuil viennent de la loi du geste ou du bloc
// servi. `spendable` distingue le SOLDE de la PART qui paie : une frappe se
// retranche des points en poche, mais seuls les points convertibles la paient.

public struct SpendPreview: Sendable, Equatable {
    public let held: Int
    public let cost: Int
    /// Le solde après le geste ; égal à `held` quand le geste n'est pas possible.
    public let after: Int
    /// `0` quand le geste est possible.
    public let missing: Int
    public let affordable: Bool

    public init(held: Int, cost: Int, after: Int, missing: Int, affordable: Bool) {
        self.held = held
        self.cost = cost
        self.after = after
        self.missing = missing
        self.affordable = affordable
    }
}

public struct RequirementPreview: Sendable, Equatable {
    public let current: Int
    public let required: Int
    /// `0` quand l'exigence est remplie.
    public let missing: Int
    public let met: Bool

    public init(current: Int, required: Int, missing: Int, met: Bool) {
        self.current = current
        self.required = required
        self.missing = missing
        self.met = met
    }
}

public enum GameSpend {
    public static func preview(held rawHeld: Int, cost rawCost: Int, spendable rawSpendable: Int? = nil) -> SpendPreview {
        let held = max(0, rawHeld)
        let cost = max(0, rawCost)
        let spendable = rawSpendable.map { max(0, $0) } ?? held
        let affordable = spendable >= cost
        return SpendPreview(
            held: held,
            cost: cost,
            after: affordable ? max(0, held - cost) : held,
            missing: affordable ? 0 : cost - spendable,
            affordable: affordable
        )
    }

    public static func requirement(current rawCurrent: Int, required rawRequired: Int) -> RequirementPreview {
        let current = max(0, rawCurrent)
        let required = max(0, rawRequired)
        let met = current >= required
        return RequirementPreview(current: current, required: required, missing: met ? 0 : required - current, met: met)
    }
}
