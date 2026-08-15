import XCTest
@testable import Meeshy

/// F-086bis (WS-7, arbitrage coordinateur — §WS-7 travaux 3-5, « Aa » de la
/// coquille : dans le périmètre de la section, exclu à tort au cadrage
/// F-086). Preuves de CÂBLAGE par lecture de source — même patron que
/// `ConversationViewReadingModeSourceGuardTests` (F-086) et
/// `FocalHostSourceGuardTests` (F-085). Jumelle comportementale :
/// `ReadingModeLensCatalogTests` (types purs, exécutables sans UIKit/GRDB).
final class ConversationViewReadingModeAffordanceTests: XCTestCase {

    private func hostRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: hostRoot().appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func strippedSource(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try source(relativePath))
    }

    private func conversationViewSource() throws -> String {
        try strippedSource("Meeshy/Features/Main/Views/ConversationView.swift")
    }

    // MARK: - Insertion APRÈS expandedHeaderSearchButton, JAMAIS avant headerCallButtons

    func test_readingModeAffordanceCluster_isInsertedInsideTheHStack_afterTheSearchButton() throws {
        let code = try conversationViewSource()
        guard let range = code.range(of: "private var headerButtonsCluster: some View {") else {
            XCTFail("headerButtonsCluster introuvable dans ConversationView.swift.")
            return
        }
        let end = code.index(range.lowerBound, offsetBy: 300, limitedBy: code.endIndex) ?? code.endIndex
        let body = code[range.lowerBound..<end]
        guard let callRange = body.range(of: "headerCallButtons.layoutPriority(1)"),
              let searchRange = body.range(of: "expandedHeaderSearchButton"),
              let affordanceRange = body.range(of: "readingModeAffordanceCluster")
        else {
            XCTFail("Un des trois éléments de la grappe (appel, recherche, mode) est introuvable dans les 300 premiers caractères de headerButtonsCluster.")
            return
        }
        XCTAssertTrue(
            callRange.upperBound < searchRange.lowerBound,
            "`headerCallButtons.layoutPriority(1)` doit rester le PREMIER élément — interdiction absolue de l'arbitrage de faire passer quoi que ce soit avant lui."
        )
        XCTAssertTrue(
            searchRange.upperBound < affordanceRange.lowerBound,
            "`readingModeAffordanceCluster` doit être inséré APRÈS `expandedHeaderSearchButton` (contrat §WS-7 travail 3, arbitrage F-086bis)."
        )
    }

    /// Garde de non-régression : cette insertion ne doit pas faire déraper le
    /// compte d'occurrences de « headerButtonsCluster » que
    /// `ConversationViewHeaderButtonsClusterTests` fixe à 3 (1 déclaration +
    /// 2 sites d'appel) — la grappe Aa est un NOUVEAU nom de propriété
    /// (`readingModeAffordanceCluster`), jamais une référence supplémentaire
    /// au nom existant.
    func test_headerButtonsClusterOccurrenceCount_remainsUnaffectedByTheNewCluster() throws {
        let code = try conversationViewSource()
        let occurrences = code.components(separatedBy: "headerButtonsCluster").count - 1
        XCTAssertEqual(
            occurrences, 3,
            "ConversationView.swift référence « headerButtonsCluster » \(occurrences) fois — 3 attendues (1 déclaration + 2 sites d'appel). L'ajout de la grappe Aa doit passer par un NOM DE PROPRIÉTÉ DISTINCT, jamais un quatrième site inline."
        )
    }

    // MARK: - Garde drapeau (bit-à-bit identique hors Focal/Script/Résumé/Rivière)

    func test_readingModeAffordanceCluster_isGuardedByModeNotBubbles() throws {
        let code = try conversationViewSource()
        XCTAssertTrue(
            code.contains("private var readingModeAffordanceCluster: some View {\n        if readingModeController.mode != .bubbles {"),
            "La grappe Aa doit être entièrement gardée par `readingModeController.mode != .bubbles` — drapeau OFF (résolu TOUJOURS `.bubbles`, §WS-1) ⇒ ni chip ni bouton Aa, bit-à-bit identique à avant ce lot."
        )
    }

    // MARK: - Bouton Aa : uniquement Focal/Script, bascule `select(mode.toggledDensity)`

    func test_densityButton_isShownOnlyForFocalOrScript() throws {
        let code = try conversationViewSource()
        XCTAssertTrue(
            code.contains("if readingModeController.mode == .focal || readingModeController.mode == .script {"),
            "Le bouton Aa doit être masqué en Résumé/Rivière — ils n'ont pas de densité (contrat §WS-7 travail 4)."
        )
    }

    func test_densityButton_callsSelectWithToggledDensity() throws {
        let code = try conversationViewSource()
        XCTAssertTrue(
            code.contains("readingModeController.select(readingModeController.mode.toggledDensity)"),
            "Le bouton Aa doit appeler `readingModeController.select(mode.toggledDensity)` — la MÊME préférence collante que la feuille Lentille, jamais un état local dupliqué (critère §7 : bascule instantanée)."
        )
    }

    // MARK: - Chip : ouvre la feuille, jamais une bascule directe

    func test_chip_opensTheLensSheet() throws {
        let code = try conversationViewSource()
        guard let range = code.range(of: "ReadingModeChip(model: readingModeChipModel) {") else {
            XCTFail("ReadingModeChip(model:) introuvable — le chip doit être construit avec `readingModeChipModel`.")
            return
        }
        let windowEnd = code.index(range.upperBound, offsetBy: 120, limitedBy: code.endIndex) ?? code.endIndex
        let onTapBody = code[range.upperBound..<windowEnd]
        XCTAssertTrue(
            onTapBody.contains("isReadingModeLensPresented = true"),
            "Le tap du chip doit ouvrir la feuille Lentille (`isReadingModeLensPresented = true`) — jamais une bascule directe de mode (réservée au bouton Aa)."
        )
    }

    // MARK: - Capacités : UNE SEULE résolution, réutilisée par la feuille

    func test_readingModeCapabilities_isAssignedFromTheSameLocal_notASecondResolution() throws {
        let code = try conversationViewSource()
        let occurrences = code.components(separatedBy: "ReadingModeOrchestrator.resolveCapabilities(").count - 1
        XCTAssertEqual(
            occurrences, 1,
            "`ReadingModeOrchestrator.resolveCapabilities(` doit être appelée UNE SEULE fois dans ConversationView.swift — la feuille Lentille doit lire `readingModeCapabilities` (stockée depuis la même résolution), jamais recalculer."
        )
        XCTAssertTrue(
            code.contains("self.readingModeCapabilities = capabilities"),
            "`readingModeCapabilities` doit être assignée depuis la constante locale `capabilities` déjà résolue pour `ReadingModeController` — pas une seconde résolution."
        )
    }

    func test_lensSheet_readsStoredCapabilities_notASecondResolution() throws {
        let code = try conversationViewSource()
        XCTAssertTrue(
            code.contains("capabilities: readingModeCapabilities,"),
            "`ReadingModeLensSheet` doit recevoir `readingModeCapabilities` (propriété stockée) — jamais un second appel à `resolveCapabilities`."
        )
    }

    // MARK: - Sélection / retour-auto passent PAR le contrôleur gelé (F-080)

    func test_lensSheet_onSelect_isWiredToTheController() throws {
        let code = try conversationViewSource()
        XCTAssertTrue(
            code.contains("onSelect: { readingModeController.select($0) }"),
            "`onSelect` de la feuille doit appeler `readingModeController.select(_:)` — la préférence collante GELÉE F-080, jamais un état local dupliqué."
        )
    }

    func test_lensSheet_onResetToAuto_isWiredToTheController() throws {
        let code = try conversationViewSource()
        XCTAssertTrue(
            code.contains("onResetToAuto: { readingModeController.resetToAuto() }"),
            "« Revenir en mode auto » doit appeler `readingModeController.resetToAuto()` — réengage l'orchestrateur (§WS-1)."
        )
    }

    // MARK: - Aucune redéclaration des types Lentille dans ConversationView.swift

    func test_lensTypes_areNotRedeclaredInConversationView() throws {
        let code = try conversationViewSource()
        XCTAssertFalse(code.contains("struct ReadingModeChip"), "ReadingModeChip doit vivre dans Focal/Lens/, jamais redéclaré dans ConversationView.swift.")
        XCTAssertFalse(code.contains("struct ReadingModeLensSheet"), "ReadingModeLensSheet doit vivre dans Focal/Lens/, jamais redéclaré dans ConversationView.swift.")
        XCTAssertFalse(code.contains("struct LensRowModel"), "LensRowModel doit vivre dans Focal/Lens/, jamais redéclaré dans ConversationView.swift.")
    }

    // MARK: - Les fichiers Focal/Lens/ existent et déclarent les types attendus

    func test_lensFolder_declaresExpectedTypes() throws {
        let chip = try strippedSource("Meeshy/Features/Main/Focal/Lens/ReadingModeChip.swift")
        XCTAssertTrue(chip.contains("struct ReadingModeChip: View"))
        XCTAssertTrue(chip.contains("struct ReadingModeDensityButton: View"))
        XCTAssertTrue(chip.contains("struct ReadingModeChipModel: Equatable"))
        XCTAssertTrue(chip.contains("var toggledDensity: ConversationReadingMode"))

        let sheet = try strippedSource("Meeshy/Features/Main/Focal/Lens/ReadingModeLensSheet.swift")
        XCTAssertTrue(sheet.contains("struct ReadingModeLensSheet: View"))
        XCTAssertTrue(sheet.contains("struct LensRowModel: Equatable, Identifiable"))
        XCTAssertTrue(sheet.contains("enum ReadingModeLensCatalog"))
    }

    // MARK: - Garde R15 : aucune constante de loi en dur dans le chip/la feuille

    func test_lensFiles_neverHardcodeLawConstants() throws {
        let forbidden = ["520", "380", "0.45", "0.82", "900", "25", "24"]
        for path in [
            "Meeshy/Features/Main/Focal/Lens/ReadingModeChip.swift",
            "Meeshy/Features/Main/Focal/Lens/ReadingModeLensSheet.swift"
        ] {
            let code = try strippedSource(path)
            for literal in forbidden {
                XCTAssertFalse(
                    code.contains(literal),
                    "\(path) contient le littéral « \(literal) » — les constantes de loi (garde R15) ne doivent JAMAIS apparaître en dur dans un fichier peau, seulement dans le miroir gelé."
                )
            }
        }
    }

    // MARK: - `Button(.plain)` — jamais `.onTapGesture`

    func test_lensFiles_neverUseOnTapGesture() throws {
        for path in [
            "Meeshy/Features/Main/Focal/Lens/ReadingModeChip.swift",
            "Meeshy/Features/Main/Focal/Lens/ReadingModeLensSheet.swift"
        ] {
            let code = try strippedSource(path)
            XCTAssertFalse(
                code.contains(".onTapGesture"),
                "\(path) utilise `.onTapGesture` — interdit, `Button(.plain)`/`.buttonStyle(.plain)` uniquement."
            )
        }
    }
}
