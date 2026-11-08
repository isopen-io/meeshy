import Foundation
import Testing
@testable import MeeshySDK

/// LA LOI D'UNE DEMANDE DE CRAN, côté SDK (#13938) — le miroir Swift rejoue les
/// seize cas COMMUNS `packages/shared/fixtures/relation-request-cases.json`,
/// écrits pour la loi TypeScript `evaluateRelationRequest`. Il ne décide
/// d'aucune demande : il sert à ne pas PROPOSER celle que le serveur refusera.
struct RelationRequestCasesTests {

    private struct Case: Decodable {
        let id: String
        let input: Input
        let expected: Expected
    }

    private struct Input: Decodable {
        let targetLevel: String
        let currentLevel: String
        let eligibleFor: String?
        let cooldownUntil: String?
        let now: String
    }

    private struct Expected: Decodable {
        let allowed: Bool
        let code: String?
    }

    private func cases() throws -> [Case] {
        let data = try ActionPolicyVectorFixtures.sharedData("packages/shared/fixtures/relation-request-cases.json")
        return try JSONDecoder().decode([Case].self, from: data)
    }

    private func verdict(of sharedCase: Case) throws -> RelationRequestVerdict {
        let input = sharedCase.input
        let now = try #require(ActionPolicyVectorFixtures.date(input.now))
        return RelationRequestRule.evaluate(
            target: RelationLevel(wire: input.targetLevel),
            current: RelationLevel(wire: input.currentLevel),
            eligibleFor: input.eligibleFor.map { RelationLevel(wire: $0) },
            cooldownUntil: ActionPolicyVectorFixtures.date(input.cooldownUntil),
            now: now
        )
    }

    @Test func theSharedFileCarriesTheSixteenCases() throws {
        #expect(try cases().count == 16)
    }

    @Test func everySharedCaseGivesTheSameVerdict() throws {
        for sharedCase in try cases() {
            let actual = try verdict(of: sharedCase)
            let expected: RelationRequestVerdict = sharedCase.expected.allowed
                ? .allowed
                : .refused(try #require(sharedCase.expected.code.flatMap(RelationRequestRefusal.init(rawValue:)), "\(sharedCase.id)"))
            #expect(actual == expected, "\(sharedCase.id)")
        }
    }

    @Test func theRungAfterEachLevelIsTheOnlyOneARequestMayAim() {
        #expect(RelationRequestRule.rung(after: .public) == .acquaintance)
        #expect(RelationRequestRule.rung(after: .community) == .acquaintance)
        #expect(RelationRequestRule.rung(after: .acquaintance) == .friend)
        #expect(RelationRequestRule.rung(after: .friend) == .close)
        #expect(RelationRequestRule.rung(after: .close) == .blood)
        #expect(RelationRequestRule.rung(after: .blood) == nil)
    }
}
