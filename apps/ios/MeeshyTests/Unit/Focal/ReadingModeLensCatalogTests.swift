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

    /// AMENDEMENT S1 (REV-3/B3) : `current` est FAILLIBLE (`nil` = compte
    /// inconnu) et la raison porte son discriminant. Défaut `.belowThreshold`
    /// — la forme que les témoins historiques exerçaient déjà, pour qu'ils
    /// restent lisibles tels quels.
    private func capabilities(
        availableModes: [ConversationReadingMode],
        riverEligible: Bool,
        threshold: Int = ReadingModeOrchestrator.riverEligibilityThreshold,
        current: Int?,
        riverReason: ReadingModeOrchestrator.RiverEligibilityReasonKind = .belowThreshold
    ) -> ReadingModeOrchestrator.ReadingModeCapabilities {
        .init(
            availableModes: availableModes,
            riverEligible: riverEligible,
            riverEligibilityReason: .init(threshold: threshold, current: current, riverReason: riverReason)
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

    // MARK: - AMENDEMENT S1 (REV-3/B3) — la trifurcation, côté Lens

    /// `direct` ⇒ une clé DÉDIÉE, sans le moindre nombre. Le sous-titre
    /// « S'ouvrira à 5 personnes actives — 2 aujourd'hui » sur un duo
    /// promettait une porte qui n'existe pas ; le fil et la liste
    /// (`LentilleModeLabels.riverReason`) racontent désormais la même histoire.
    func test_river_neverEligibleRow_carriesTheDedicatedKey_andNoNumbers() throws {
        let caps = capabilities(
            availableModes: [.focal, .script, .summary],
            riverEligible: false,
            current: 2,
            riverReason: .neverEligible
        )
        let rows = ReadingModeLensCatalog.rows(capabilities: caps, currentMode: .focal)
        let riverRow = try XCTUnwrap(rows.first { $0.mode == .river }, "Ligne Rivière introuvable.")

        XCTAssertEqual(riverRow.reasonKey, "reading_mode.river.never")
        XCTAssertNil(riverRow.thresholdValue, "Un seuil qui ne sera JAMAIS atteint n'a rien à afficher.")
        XCTAssertNil(riverRow.currentValue, "Un compte qui ne changerait rien n'a rien à afficher.")

        let subtitle = ReadingModeLensCatalog.subtitle(for: riverRow)
        // Résolution locale-agnostique : même `String(localized:)` que la
        // production. La langue est libre, l'identité de la clé ne l'est pas.
        XCTAssertEqual(
            subtitle,
            String(
                localized: "reading_mode.river.never",
                defaultValue: "Jamais en conversation directe",
                bundle: .main
            )
        )
        XCTAssertFalse(
            subtitle.contains(where: \.isNumber),
            "Aucun nombre ne doit survivre dans le sous-titre « jamais » — rendu : « \(subtitle) »."
        )
    }

    /// Compte INCONNU (`nil`) ⇒ le SEUIL seul. C'est la contrepartie du
    /// passage de `LentilleReadingModeContext.activeParticipantCount` à `nil` :
    /// plus aucun « 0 aujourd'hui » fabriqué.
    func test_river_unknownCountRow_citesTheThresholdOnly_neverAFabricatedZero() throws {
        let caps = capabilities(
            availableModes: [.focal, .script, .summary],
            riverEligible: false,
            threshold: 5,
            current: nil
        )
        let rows = ReadingModeLensCatalog.rows(capabilities: caps, currentMode: .focal)
        let riverRow = try XCTUnwrap(rows.first { $0.mode == .river }, "Ligne Rivière introuvable.")

        XCTAssertEqual(riverRow.reasonKey, "reading_mode.river.threshold_only")
        XCTAssertEqual(riverRow.thresholdValue, 5, "Le seuil, lui, est une valeur RÉELLE — il reste affiché.")
        XCTAssertNil(riverRow.currentValue)

        let subtitle = ReadingModeLensCatalog.subtitle(for: riverRow)
        XCTAssertEqual(
            subtitle,
            String(
                format: String(
                    localized: "reading_mode.river.threshold_only",
                    defaultValue: "S'ouvrira à %d personnes actives",
                    bundle: .main
                ),
                5
            )
        )
        XCTAssertTrue(subtitle.contains("5"), "Le seuil vivant doit rester visible.")
        XCTAssertFalse(
            subtitle.contains("0"),
            "Un compte inconnu ne doit JAMAIS ressortir en « 0 » — rendu : « \(subtitle) »."
        )

        // Discrimination (leçon 266) : compte MESURÉ à zéro ⇒ l'autre clé, et
        // un sous-titre différent. Sans ce contraste, un libellé unique
        // passerait les deux témoins.
        let measuredZero = capabilities(
            availableModes: [.focal, .script, .summary],
            riverEligible: false,
            threshold: 5,
            current: 0
        )
        let zeroRow = try XCTUnwrap(
            ReadingModeLensCatalog.rows(capabilities: measuredZero, currentMode: .focal)
                .first { $0.mode == .river }
        )
        XCTAssertEqual(zeroRow.reasonKey, "reading_mode.river.unavailable_reason")
        XCTAssertNotEqual(
            ReadingModeLensCatalog.subtitle(for: zeroRow), subtitle,
            "« inconnu » et « mesuré à zéro » sont deux états ; les afficher pareil est le " +
            "défaut que l'amendement S1 retire."
        )
    }

    /// Nominal INCHANGÉ : compte connu sous le seuil ⇒ la formule à deux
    /// nombres et sa clé historique.
    func test_river_belowThresholdWithAKnownCount_keepsTheHistoricalTwoNumberKey() throws {
        let caps = capabilities(
            availableModes: [.focal, .script, .summary],
            riverEligible: false,
            threshold: 5,
            current: 3
        )
        let riverRow = try XCTUnwrap(
            ReadingModeLensCatalog.rows(capabilities: caps, currentMode: .focal).first { $0.mode == .river }
        )
        XCTAssertEqual(riverRow.reasonKey, "reading_mode.river.unavailable_reason")
        let subtitle = ReadingModeLensCatalog.subtitle(for: riverRow)
        XCTAssertTrue(subtitle.contains("5") && subtitle.contains("3"), "Les DEUX nombres vivants, comme avant l'amendement.")
    }
}
