import XCTest
@testable import Meeshy

/// Garde d'accessibilité de la bande « Mon activité » de ma fiche (`ProfileActivityBand`, ex-section Statistiques).
///
/// Les trois nombres vivent dans un `Button` qui ouvre l'écran des statistiques détaillées. Sans regroupement,
/// VoiceOver lisait valeurs et intitulés en fragments épars et n'annonçait jamais que le toucher ouvre quelque chose.
/// Le bouton expose donc UN élément : `.accessibilityElement(children: .ignore)`, un libellé composé qui associe chaque
/// valeur à son nom, et un indice qui dit l'action (non évidente).
final class ProfileViewStatsAccessibilityTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Profile/Views/" + relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_activityBand_collapsesButtonIntoOneElementWithHint() throws {
        let band = try source("ProfileActivityBand.swift")
        XCTAssertTrue(
            band.contains(".accessibilityElement(children: .ignore)"),
            "Le bouton de la bande doit fondre ses nombres en UN élément VoiceOver."
        )
        XCTAssertTrue(
            band.contains(".accessibilityLabel(Self.accessibilityLabel(stats: stats))"),
            "Le bouton doit exposer le libellé composé."
        )
        XCTAssertTrue(
            band.contains("profile.stats.a11y.hint"),
            "Le bouton doit porter un indice : la bande a l'air statique mais ouvre les statistiques détaillées."
        )
    }

    func test_activityAccessibilityLabel_pairsEachValueWithItsNoun_andCountsNoRequest() throws {
        let band = try source("ProfileActivityBand.swift")
        for key in ["profile.section.activity", "profile.stats.messages", "profile.stats.conversations", "user.stats.translations"] {
            XCTAssertTrue(band.contains(key), "Le libellé composé doit redire \(key), pour que chaque valeur garde son nom.")
        }
        XCTAssertFalse(band.contains("profile.stats.friends"), "Un compteur de demandes n'est pas une statistique.")
    }

    func test_profileView_mountsTheActivityBand_whichOpensTheDetailedStats() throws {
        let profile = try source("ProfileView.swift")
        XCTAssertTrue(profile.contains("ProfileActivityBand(stats: stats, onOpen: openActivity)"))
        XCTAssertTrue(profile.contains("UserStatsView()"), "Mon activité ouvre toujours la feuille des statistiques")
        XCTAssertFalse(profile.contains("statsSection"), "l'ancienne section Statistiques a disparu")
    }
}
