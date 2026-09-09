import XCTest
@testable import MeeshySDK

/// LES BORNES DU REGISTRE DE FRAPPE, jusqu'à l'écran natif (#5839).
///
/// La passerelle les sert et `packages/shared` les résout depuis le lot #5839 ;
/// le modèle Swift, lui, ne les déclarait pas — le décodeur les jetait en
/// silence, et le sous-menu natif ne pouvait pas dire ce que le web disait déjà.
/// Un champ absent d'un modèle ne rougit nulle part : c'est la forme du défaut
/// que ces témoins ferment.
///
/// Miroir de `engagement-progress.test.ts` § « bornes de frappe ».
final class EngagementMeeshMintDatesTests: XCTestCase {

    private func payload(
        firstMintedAt: String? = nil,
        lastMintedAt: String? = nil,
        mintedLifetime: Int = 2
    ) -> APIEngagementProgress {
        APIEngagementProgress(
            counters: [],
            milestones: [],
            streak: .init(currentStreakDays: 0, longestStreakDays: 0),
            level: .init(engagementScore: 0),
            meesh: .init(
                balance: 2,
                mintedLifetime: mintedLifetime,
                debitablePoints: 100,
                floorPoints: 40,
                missingPoints: 1121,
                mintCost: 1221,
                firstMintedAt: firstMintedAt,
                lastMintedAt: lastMintedAt
            )
        )
    }

    /// Le cas nominal : ce que la passerelle sert atteint la présentation.
    func test_resolve_servedMintDates_reachThePresentation() throws {
        let resolved = EngagementProgressResolver.resolve(payload(
            firstMintedAt: "2026-08-19T10:30:00.000Z",
            lastMintedAt: "2026-09-01T08:15:00.000Z"
        ))

        let meesh = try XCTUnwrap(resolved.meesh)
        XCTAssertNotNil(meesh.firstMintedAt, "La première frappe servie n'atteint pas l'écran.")
        XCTAssertNotNil(meesh.lastMintedAt, "La dernière frappe servie n'atteint pas l'écran.")
        let premiere = try XCTUnwrap(meesh.firstMintedAt)
        let derniere = try XCTUnwrap(meesh.lastMintedAt)
        XCTAssertLessThan(premiere, derniere, "L'ordre des deux bornes est inversé.")
    }

    /// **Une date illisible devient `nil`, jamais l'instant présent.** Une date
    /// fausse est pire qu'une date absente : la vue l'affiche avec la même
    /// assurance que les vraies, et rien ne signale l'invention.
    func test_resolve_illegibleMintDate_becomesNil_ratherThanAFabricatedInstant() throws {
        let resolved = EngagementProgressResolver.resolve(payload(
            firstMintedAt: "pas une date",
            lastMintedAt: "2026-09-01T08:15:00Z"
        ))

        let meesh = try XCTUnwrap(resolved.meesh)
        XCTAssertNil(meesh.firstMintedAt, "Une chaîne illisible a produit une date.")
        XCTAssertNotNil(meesh.lastMintedAt, "La borne lisible a été perdue avec l'autre.")
    }

    /// Aucune frappe : les deux bornes sont absentes, et le sous-menu le dira.
    func test_resolve_absentMintDates_areNil() throws {
        let meesh = try XCTUnwrap(EngagementProgressResolver.resolve(payload(mintedLifetime: 0)).meesh)
        XCTAssertNil(meesh.firstMintedAt)
        XCTAssertNil(meesh.lastMintedAt)
    }

    /// La forme SANS les deux clés — celle qu'une passerelle antérieure au lot
    /// #5839 sert encore — se décode toujours.
    func test_decode_payloadWithoutMintDates_stillDecodes() throws {
        let json = """
        {"counters":[],"milestones":[],"streak":{"currentStreakDays":0,"longestStreakDays":0},
         "level":{"engagementScore":0},
         "meesh":{"balance":1,"mintedLifetime":1,"debitablePoints":0,"floorPoints":0,"missingPoints":1221,"mintCost":1221}}
        """.data(using: .utf8)!

        let decoded = try JSONDecoder().decode(APIEngagementProgress.self, from: json)
        XCTAssertNil(decoded.meesh?.firstMintedAt)
        XCTAssertNil(decoded.meesh?.lastMintedAt)
    }
}
