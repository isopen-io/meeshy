import Foundation
import Testing
@testable import MeeshySDK

/// Ce qu'un geste du jeu dépense ou exige, montré AVANT le geste (#9705) — miroir
/// de `packages/shared/__tests__/game/spend.test.ts`.
@Suite("Jeu Meeshy — ce qu'un geste dépense ou exige")
struct GameSpendTests {

    @Test("le solde couvre le prix : ce qui restera se dit")
    func affordableSpendSaysWhatRemains() {
        #expect(GameSpend.preview(held: 5, cost: 3) == SpendPreview(held: 5, cost: 3, after: 2, missing: 0, affordable: true))
        #expect(GameSpend.preview(held: 10, cost: 10) == SpendPreview(held: 10, cost: 10, after: 0, missing: 0, affordable: true))
    }

    @Test("le solde ne couvre pas le prix : ce qui manque se dit, le solde reste")
    func unaffordableSpendSaysWhatIsMissing() {
        #expect(GameSpend.preview(held: 1, cost: 3) == SpendPreview(held: 1, cost: 3, after: 1, missing: 2, affordable: false))
    }

    @Test("le manque se mesure sur la part DÉPENSABLE, le reste sur le solde entier")
    func spendableGovernsAffordability() {
        #expect(GameSpend.preview(held: 5000, cost: 1221, spendable: 900) == SpendPreview(held: 5000, cost: 1221, after: 5000, missing: 321, affordable: false))
        #expect(GameSpend.preview(held: 5000, cost: 1221, spendable: 2000) == SpendPreview(held: 5000, cost: 1221, after: 3779, missing: 0, affordable: true))
    }

    @Test("une valeur négative ne fausse pas le compte")
    func negativeValuesAreClamped() {
        #expect(GameSpend.preview(held: -4, cost: 2) == SpendPreview(held: 0, cost: 2, after: 0, missing: 2, affordable: false))
    }

    @Test("une exigence dit ce qui manque sous le seuil, rien au-dessus")
    func requirementSaysWhatIsMissing() {
        #expect(GameSpend.requirement(current: 3, required: 5) == RequirementPreview(current: 3, required: 5, missing: 2, met: false))
        #expect(GameSpend.requirement(current: 5, required: 5) == RequirementPreview(current: 5, required: 5, missing: 0, met: true))
        #expect(GameSpend.requirement(current: 40, required: 20) == RequirementPreview(current: 40, required: 20, missing: 0, met: true))
    }
}
