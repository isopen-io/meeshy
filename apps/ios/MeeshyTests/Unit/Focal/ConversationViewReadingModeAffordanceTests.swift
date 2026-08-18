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
        // `AnyView` (not `some View`) since 2026-08-17 — erasure at the
        // DECLARATION was required to stop a Swift metadata-decoder stack
        // overflow at first render (see ConversationFirstRenderWarmup.swift).
        guard let range = code.range(of: "private var headerButtonsCluster: AnyView {") else {
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
        // `guard … else { return AnyView(EmptyView()) }` (not `if`) since
        // 2026-08-17 — same erasure campaign, same guarantee: drapeau OFF
        // (résolu TOUJOURS `.bubbles`, §WS-1) ⇒ ni chip ni bouton Aa.
        XCTAssertTrue(
            code.contains("private var readingModeAffordanceCluster: AnyView {\n        guard readingModeController.mode != .bubbles else { return AnyView(EmptyView()) }"),
            "La grappe Aa doit être entièrement gardée par `readingModeController.mode != .bubbles` — drapeau OFF (résolu TOUJOURS `.bubbles`, §WS-1) ⇒ ni chip ni bouton Aa, bit-à-bit identique à avant ce lot."
        )
    }

    // MARK: - P2 (spec 17/08) : PLUS de bouton Aa, nulle part

    func test_aaDensityButton_isGone() throws {
        let code = try conversationViewSource()
        XCTAssertFalse(
            code.contains("ReadingModeDensityButton"),
            "P2 : le bouton Aa est SUPPRIMÉ — le chip unique porte le cycle (tap) et le menu (appui long), plus aucune seconde affordance."
        )
        XCTAssertFalse(
            code.contains("toggledDensity"),
            "P2 : la bascule de densité Aa disparaît avec son bouton — le cycle du chip parcourt TOUS les modes disponibles, pas seulement Focal⇄Script."
        )
        let chip = try strippedSource("Meeshy/Features/Main/Focal/Lens/ReadingModeChip.swift")
        XCTAssertFalse(chip.contains("struct ReadingModeDensityButton"), "le type Aa lui-même est retiré — jamais de code mort monté nulle part.")
    }

    // MARK: - P2 : tap = CYCLE des modes disponibles (préférence collante)

    func test_chipTap_cyclesThroughAvailableModes_viaTheController() throws {
        let code = try conversationViewSource()
        guard let range = code.range(of: "private var readingModeAffordanceCluster: AnyView {") else {
            return XCTFail("readingModeAffordanceCluster introuvable.")
        }
        let windowEnd = code.index(range.lowerBound, offsetBy: 1600, limitedBy: code.endIndex) ?? code.endIndex
        let window = code[range.lowerBound..<windowEnd]
        XCTAssertTrue(
            window.contains("ReadingModeCycle.next("),
            "le tap du chip doit passer par la loi pure ReadingModeCycle.next — jamais un switch inline recopié."
        )
        XCTAssertTrue(
            window.contains("readingModeController.select("),
            "le cycle écrit la préférence collante via le contrôleur GELÉ (F-080) — jamais un état local dupliqué."
        )
    }

    // MARK: - P2 : appui long = menu listant les modes (même câblage contrôleur)

    func test_chipMenu_isWiredToTheController() throws {
        let code = try conversationViewSource()
        XCTAssertTrue(
            code.contains("onSelect: { readingModeController.select($0) }"),
            "le menu du chip sélectionne via readingModeController.select(_:) — même préférence collante que l'ancienne feuille."
        )
        XCTAssertTrue(
            code.contains("onAuto: { readingModeController.resetToAuto() }"),
            "« Automatique » du menu réengage l'orchestrateur via resetToAuto()."
        )
    }

    func test_chip_presentsItsMenuOnLongPress_viaContextMenu() throws {
        let chip = try strippedSource("Meeshy/Features/Main/Focal/Lens/ReadingModeChip.swift")
        XCTAssertTrue(
            chip.contains(".contextMenu"),
            "l'appui long présente le menu natif (.contextMenu — rendu Liquid Glass sur iOS 26) listant les modes."
        )
        XCTAssertTrue(
            chip.contains(".disabled("),
            "un mode indisponible reste LISTÉ mais désactivé — jamais retiré (amendement R : un mode indisponible n'est pas un écran vide)."
        )
    }

    // MARK: - P2 : la feuille Lentille est REMPLACÉE par le menu

    func test_lensSheet_isGone() throws {
        let code = try conversationViewSource()
        XCTAssertFalse(
            code.contains("isReadingModeLensPresented"),
            "P2 : le chip ne présente plus de feuille — tap = cycle, appui long = menu. L'état de présentation disparaît avec elle."
        )
        let sheet = try strippedSource("Meeshy/Features/Main/Focal/Lens/ReadingModeLensSheet.swift")
        XCTAssertFalse(
            sheet.contains("struct ReadingModeLensSheet: View"),
            "la vue de la feuille est supprimée (code mort sinon) — le CATALOGUE (LensRowModel + ReadingModeLensCatalog) reste, consommé par le menu."
        )
    }

    // MARK: - Loi pure du cycle

    func test_readingModeCycle_advancesInOrderAndWraps() {
        XCTAssertEqual(ReadingModeCycle.next(after: .focal, availableInOrder: [.focal, .script, .summary]), .script)
        XCTAssertEqual(ReadingModeCycle.next(after: .summary, availableInOrder: [.focal, .script, .summary]), .focal, "le cycle boucle — dernier mode disponible ⇒ retour au premier.")
    }

    func test_readingModeCycle_currentAbsentFallsBackToFirst() {
        XCTAssertEqual(
            ReadingModeCycle.next(after: .bubbles, availableInOrder: [.focal, .script]), .focal,
            "un mode courant hors liste (ex. .bubbles résiduel) repart au premier mode disponible."
        )
    }

    func test_readingModeCycle_singleOrEmptyListIsANoop() {
        XCTAssertNil(ReadingModeCycle.next(after: .focal, availableInOrder: [.focal]), "un seul mode disponible ⇒ le tap est un no-op, jamais une réécriture inutile de préférence.")
        XCTAssertNil(ReadingModeCycle.next(after: .focal, availableInOrder: []))
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

    func test_chipMenu_readsStoredCapabilities_notASecondResolution() throws {
        let code = try conversationViewSource()
        XCTAssertTrue(
            code.contains("capabilities: readingModeCapabilities,"),
            "les lignes du menu doivent être bâties depuis `readingModeCapabilities` (propriété stockée) — jamais un second appel à `resolveCapabilities`."
        )
    }

    // MARK: - Aucune redéclaration des types Lentille dans ConversationView.swift

    func test_lensTypes_areNotRedeclaredInConversationView() throws {
        let code = try conversationViewSource()
        XCTAssertFalse(code.contains("struct ReadingModeChip"), "ReadingModeChip doit vivre dans Focal/Lens/, jamais redéclaré dans ConversationView.swift.")

        XCTAssertFalse(code.contains("struct LensRowModel"), "LensRowModel doit vivre dans Focal/Lens/, jamais redéclaré dans ConversationView.swift.")
    }

    // MARK: - Les fichiers Focal/Lens/ existent et déclarent les types attendus

    func test_lensFolder_declaresExpectedTypes() throws {
        let chip = try strippedSource("Meeshy/Features/Main/Focal/Lens/ReadingModeChip.swift")
        XCTAssertTrue(chip.contains("struct ReadingModeChip: View"))
        XCTAssertTrue(chip.contains("struct ReadingModeChipModel: Equatable"))
        XCTAssertTrue(chip.contains("enum ReadingModeCycle"))

        let sheet = try strippedSource("Meeshy/Features/Main/Focal/Lens/ReadingModeLensSheet.swift")
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
