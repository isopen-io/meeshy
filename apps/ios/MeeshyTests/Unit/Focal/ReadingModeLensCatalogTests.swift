import XCTest
@testable import Meeshy

/// F-086bis (WS-7 travail 5, arbitrage coordinateur — §WS-7 était dans le
/// périmètre, exclu à tort au cadrage initial) — preuves COMPORTEMENTALES
/// (pas seulement des preuves de source) : `ReadingModeLensCatalog` est
/// Swift pur, construit directement depuis
/// `ReadingModeOrchestrator.ReadingModeCapabilities` (miroir GELÉ), sans
/// UIKit/GRDB — exécutable comme les vecteurs `ReadingModeOrchestrator`
/// existants (R5 : aucune compile locale, mais rien ici n'a besoin d'un
/// simulateur pour être PROUVÉ correct par lecture + exécution CI macOS).
@MainActor
final class ReadingModeLensCatalogTests: XCTestCase {

    private func capabilities(
        availableModes: [ConversationReadingMode],
        riverEligible: Bool,
        threshold: Int = ReadingModeOrchestrator.riverEligibilityThreshold,
        current: Int
    ) -> ReadingModeOrchestrator.ReadingModeCapabilities {
        .init(
            availableModes: availableModes,
            riverEligible: riverEligible,
            riverEligibilityReason: .init(threshold: threshold, current: current)
        )
    }

    // MARK: - Ordre d'affichage

    func test_displayOrder_neverIncludesBubbles() {
        XCTAssertFalse(
            ReadingModeLensCatalog.displayOrder.contains(.bubbles),
            "`.bubbles` est le mode de repli drapeau OFF — il ne doit JAMAIS apparaître dans le catalogue sélectionnable de la feuille Lentille."
        )
    }

    func test_displayOrder_containsExactlyFourSelectableModes() {
        XCTAssertEqual(
            ReadingModeLensCatalog.displayOrder,
            [.focal, .script, .summary, .river],
            "Le catalogue doit lister exactement Focal, Script, Résumé, Rivière — dans cet ordre (contrat §WS-7 travail 5)."
        )
    }

    // MARK: - Rivière TOUJOURS présente (critère §7 « jamais un écran vide »)

    func test_river_alwaysPresentInRows_evenWhenIneligible() {
        let caps = capabilities(availableModes: [.focal, .script, .summary], riverEligible: false, current: 3)
        let rows = ReadingModeLensCatalog.rows(capabilities: caps, currentMode: .focal)
        XCTAssertEqual(rows.count, 4, "Les 4 lignes doivent apparaître même si la Rivière n'est pas ouverte — jamais retirée de la liste.")
        guard let riverRow = rows.last else {
            XCTFail("La ligne Rivière est introuvable en fin de catalogue.")
            return
        }
        XCTAssertEqual(riverRow.mode, .river)
        XCTAssertFalse(riverRow.isAvailable, "La Rivière doit être marquée indisponible quand `availableModes` ne la contient pas.")
    }

    func test_river_unavailableRow_carriesRealThresholdAndCurrentValues() {
        let caps = capabilities(availableModes: [.focal, .script, .summary], riverEligible: false, threshold: 5, current: 3)
        let rows = ReadingModeLensCatalog.rows(capabilities: caps, currentMode: .focal)
        guard let riverRow = rows.first(where: { $0.mode == .river }) else {
            XCTFail("Ligne Rivière introuvable.")
            return
        }
        XCTAssertEqual(riverRow.thresholdValue, 5, "Le seuil affiché doit être le VRAI seuil de `riverEligibilityReason`, jamais un placeholder.")
        XCTAssertEqual(riverRow.currentValue, 3, "Le compte courant affiché doit être la VRAIE valeur de `riverEligibilityReason`, jamais un placeholder.")
        XCTAssertNotNil(riverRow.reasonKey, "Un mode indisponible doit porter une clé de raison — jamais un écran vide (critère §7).")
    }

    func test_river_availableRow_carriesNoThresholdsOrReason() {
        let caps = capabilities(availableModes: [.focal, .script, .summary, .river], riverEligible: true, current: 8)
        let rows = ReadingModeLensCatalog.rows(capabilities: caps, currentMode: .river)
        guard let riverRow = rows.first(where: { $0.mode == .river }) else {
            XCTFail("Ligne Rivière introuvable.")
            return
        }
        XCTAssertTrue(riverRow.isAvailable)
        XCTAssertTrue(riverRow.isCurrent, "currentMode == .river doit marquer la ligne Rivière comme courante.")
        XCTAssertNil(riverRow.reasonKey)
        XCTAssertNil(riverRow.thresholdValue)
        XCTAssertNil(riverRow.currentValue)
    }

    // MARK: - `isCurrent` reflète fidèlement `currentMode`

    func test_isCurrent_marksOnlyTheActiveMode() {
        let caps = capabilities(availableModes: [.focal, .script, .summary, .river], riverEligible: true, current: 8)
        let rows = ReadingModeLensCatalog.rows(capabilities: caps, currentMode: .script)
        let currentModes = rows.filter(\.isCurrent).map(\.mode)
        XCTAssertEqual(currentModes, [.script], "Une seule ligne doit être marquée courante — exactement `.script` ici.")
    }

    // MARK: - Sous-titres — jamais un texte inventé pour un mode indisponible

    func test_subtitle_forUnavailableRiver_usesRealValues_notAPlaceholder() {
        let caps = capabilities(availableModes: [.focal, .script, .summary], riverEligible: false, threshold: 5, current: 2)
        let rows = ReadingModeLensCatalog.rows(capabilities: caps, currentMode: .focal)
        guard let riverRow = rows.first(where: { $0.mode == .river }) else {
            XCTFail("Ligne Rivière introuvable.")
            return
        }
        let subtitle = ReadingModeLensCatalog.subtitle(for: riverRow)
        XCTAssertTrue(subtitle.contains("5"), "Le sous-titre doit citer le VRAI seuil (5) — jamais un texte générique.")
        XCTAssertTrue(subtitle.contains("2"), "Le sous-titre doit citer le VRAI compte courant (2) — jamais un texte générique.")
    }

    func test_subtitle_forAvailableMode_fallsBackToDefaultSubtitle() {
        let caps = capabilities(availableModes: [.focal, .script, .summary, .river], riverEligible: true, current: 8)
        let rows = ReadingModeLensCatalog.rows(capabilities: caps, currentMode: .focal)
        guard let focalRow = rows.first(where: { $0.mode == .focal }) else {
            XCTFail("Ligne Focal introuvable.")
            return
        }
        XCTAssertEqual(
            ReadingModeLensCatalog.subtitle(for: focalRow),
            ReadingModeLensCatalog.defaultSubtitle(for: .focal),
            "Un mode disponible doit afficher son sous-titre par défaut, jamais un texte de seuil (réservé à l'indisponibilité)."
        )
    }

    // MARK: - `toggledDensity` — bascule Focal⇄Script UNIQUEMENT

    func test_toggledDensity_focalBecomesScript() {
        XCTAssertEqual(ConversationReadingMode.focal.toggledDensity, .script)
    }

    func test_toggledDensity_scriptBecomesFocal() {
        XCTAssertEqual(ConversationReadingMode.script.toggledDensity, .focal)
    }

    func test_toggledDensity_summaryIsUnchanged() {
        XCTAssertEqual(
            ConversationReadingMode.summary.toggledDensity, .summary,
            "Résumé n'a pas de densité — `toggledDensity` doit être un no-op en dehors de Focal/Script."
        )
    }

    func test_toggledDensity_riverIsUnchanged() {
        XCTAssertEqual(ConversationReadingMode.river.toggledDensity, .river)
    }

    func test_toggledDensity_bubblesIsUnchanged() {
        XCTAssertEqual(ConversationReadingMode.bubbles.toggledDensity, .bubbles)
    }
}
