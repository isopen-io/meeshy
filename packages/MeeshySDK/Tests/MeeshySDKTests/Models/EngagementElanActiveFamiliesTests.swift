import XCTest
@testable import MeeshySDK

/// LES FAMILLES DE L'ÉLAN, telles que la passerelle les sert (#5927, sous-issue de #5897).
///
/// La passerelle sert `elan.activeFamilies` : la LISTE derrière le cardinal, lue
/// sur la fenêtre glissante. Le modèle Swift ne la déclarait pas, et le décodeur
/// la jetait en silence. Les pastilles natives balayaient donc les compteurs
/// CUMULÉS. Mesuré sur staging le 2026-09-14, juste après une frappe qui avait
/// ramené quatre familles à zéro action : « Élan ×5 — 5 familles actives » au-dessus
/// d'une seule pastille.
///
/// Miroir de `engagement-progress.test.ts` § « activeFamilies, la LISTE derrière le cardinal ».
final class EngagementElanActiveFamiliesTests: XCTestCase {

    private func payload(activeFamilies: [String]?, count: Int) -> APIEngagementProgress {
        APIEngagementProgress(
            counters: [
                .init(axisKey: "content.text_message", count: 40),
                .init(axisKey: "tool.sticker", count: 6)
            ],
            milestones: [],
            streak: .init(currentStreakDays: 0, longestStreakDays: 0),
            level: .init(engagementScore: 0),
            elan: .init(factor: 2, activeFamilyCount: count, hasStanding: true, windowDays: 7, activeFamilies: activeFamilies)
        )
    }

    func test_decode_theWireCarriesTheFamilies() throws {
        let json = Data(#"{"factor":3,"activeFamilyCount":2,"activeFamilies":["social","content"],"hasStanding":true,"windowDays":7}"#.utf8)

        let elan = try JSONDecoder().decode(APIEngagementProgress.Elan.self, from: json)

        XCTAssertEqual(elan.activeFamilies, ["social", "content"], "Le décodeur jette la liste servie.")
    }

    func test_resolve_servedFamilies_reachThePresentation_inServedOrder() throws {
        let elan = try XCTUnwrap(EngagementProgressResolver.resolve(payload(activeFamilies: ["conversation", "content"], count: 2)).elan)

        XCTAssertEqual(elan.activeFamilies, [.conversation, .content])
    }

    /// Une famille ajoutée au catalogue serveur avant le client est IGNORÉE,
    /// jamais un échec de décodage qui ferait perdre tout l'écran.
    func test_resolve_unknownFamily_isIgnored() throws {
        let elan = try XCTUnwrap(EngagementProgressResolver.resolve(payload(activeFamilies: ["content", "famille-du-futur"], count: 2)).elan)

        XCTAssertEqual(elan.activeFamilies, [.content])
    }

    /// Un serveur antérieur à #5897 ne sert pas la liste : AUCUNE famille, jamais
    /// un repli sur les compteurs cumulés — une liste fausse vaut moins qu'une absence.
    func test_resolve_absentFamilies_areEmpty_neverTheCumulativeCounters() throws {
        let elan = try XCTUnwrap(EngagementProgressResolver.resolve(payload(activeFamilies: nil, count: 2)).elan)

        XCTAssertEqual(elan.activeFamilies, [])
    }
}
