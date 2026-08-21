import XCTest
@testable import Meeshy

/// Focal (2026-08-21) — le message EN FOCUS porte ses détails en PERMANENCE :
/// identité même en continuation, jour + heure, texte plafonné. Ces témoins
/// de structure (source lue à l'exécution) verrouillent le point que la
/// capture d'ouverture du 2026-08-21 a révélé : l'heure de la rangée en focus
/// passait par le révélé de défilement (`FocalRevealedTime`) et restait donc
/// INVISIBLE au repos — la règle était écrite, pas câblée.
final class FocalFocusedRowDetailsGuardTests: XCTestCase {

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func normalized(_ relativePath: String) throws -> String {
        let raw = try String(
            contentsOf: Self.iosRoot.appendingPathComponent(relativePath),
            encoding: .utf8
        )
        return AppSourceGuard.stripComments(raw)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    func test_focalRow_handsTheFocusSignal_toTheIdentityHeaderTime() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(
            row.contains("revealsTimeAlways: input.isFocused"),
            "La rangée en focus doit demander à son en-tête d'identité une heure PERMANENTE " +
            "(`revealsTimeAlways: input.isFocused`) — sinon l'heure suit le révélé et disparaît au repos."
        )
        // 2026-08-22 : l'identité d'un message en focus qui n'est pas tête de
        // groupe est une SUPERPOSITION sur la ligne du haut (hauteur stable,
        // affichage instantané) — plus un en-tête inséré dans la rangée.
        XCTAssertFalse(row.contains("if input.isFirstInGroup || input.isFocused {"), "plus d'en-tête inséré au focus")
        XCTAssertTrue(row.contains("if input.isFocused && !input.isFirstInGroup { focusIdentityChip"), "identité sur la ligne du haut")
        XCTAssertTrue(row.contains(".offset(y: -FocalMetrics.FocusStrip.identityOverhang)"))
    }

    /// 2026-08-22 : tout ce que porte la bulle en focus apparaît AVEC la carte
    /// — au tick d'élection, jamais au posé — parce que rien ne change de
    /// hauteur : bande et identité sont des superpositions, la date est
    /// pré-calculée à la configuration.
    func test_focusDetails_areInstant_noHeightChange_precomputedDate() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(row.contains(".opacity(input.isFocused ? 0 : 1)"), "la ligne drapeau+réactions garde sa place, elle s'efface")
        XCTAssertTrue(row.contains("if !input.isFirstInGroup { FocalMetaRow("), "la méta-rangée reste, focus ou pas")
        XCTAssertTrue(row.contains("if let precomputed = input.focusTimestamp { return precomputed }"), "date pré-calculée")
        let controller = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(controller.contains("if electionChanged { syncFocalFocusDetails() }"), "détails synchronisés au tick d'élection")
        XCTAssertTrue(controller.contains("focusTimestamp: self.focalDetailedLocalId == localId ? self.focalFocusTimestamp(for: message.createdAt) : nil"))
        let input = try normalized("Meeshy/Features/Main/Focal/Core/FocalRowInput.swift")
        XCTAssertTrue(input.contains("let focusTimestamp: String?"))
    }

    /// 2026-08-21 : le message en focus porte sur sa bordure basse les
    /// drapeaux disponibles, l'icône de traduction, le (+) emoji et ses
    /// réactions ; ses coches (haut-droite) ouvrent les détails de lecture.
    func test_focusedRow_hasTheBottomStrip_andTappableChecks() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(row.contains("if input.isFocused { focusStrip .offset(y: FocalMetrics.FocusStrip.overhang) }"), "la bande est une superposition SUR la ligne basse")
        XCTAssertTrue(row.contains("actions.onSetActiveDisplayLanguage?(content.messageId, code)"), "un drapeau = afficher cette langue")
        XCTAssertTrue(row.contains("actions.onShowTranslationDetail?(content.messageId)"), "l'icône de traduction du mode bulle")
        XCTAssertTrue(row.contains("actions.onOpenReactPicker?(content.messageId)"), "le (+) emoji, toujours")
        XCTAssertTrue(row.contains("onShowReadStatus: actions.onShowReadStatus.map"), "les coches ouvrent les détails de lecture")
        // Ordre (directive 2026-08-22) : traduction → drapeaux → (+) → réactions.
        let strip = try XCTUnwrap(row.range(of: "private var focusStrip: some View {"))
        let tail = row[strip.lowerBound...]
        let iTranslate = try XCTUnwrap(tail.range(of: "\"character.bubble\"")).lowerBound
        let iFlags = try XCTUnwrap(tail.range(of: "Self.focusFlagCodes(")).lowerBound
        let iPlus = try XCTUnwrap(tail.range(of: "\"face.smiling\"")).lowerBound
        let iReactions = try XCTUnwrap(tail.range(of: "focusReactionChip(reaction)")).lowerBound
        XCTAssertTrue(iTranslate < iFlags && iFlags < iPlus && iPlus < iReactions, "ordre : traduction, drapeaux, (+), réactions")
        XCTAssertTrue(row.contains(".fill(mine ? focusAccent : MeeshyColors.backgroundSecondary(isDark: input.isDark))"), "fond PLEIN quand j'ai réagi")
        let controller = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(controller.contains("cell.clipsToBounds = false"))
        XCTAssertTrue(controller.contains("cell.layer.zPosition = isFocusedCell ? 1 : 0"))
        let header = try normalized("Meeshy/Features/Main/Focal/Row/FocalIdentityHeader.swift")
        XCTAssertTrue(header.contains("Button(action: onShowReadStatus)"), "les coches sont un bouton quand la rangée sait ouvrir les détails")
    }

    func test_focusFlagCodes_putTheOriginalFirst_thenAvailable_thenTheDisplayedOne_neverRepeated() {
        XCTAssertEqual(
            FocalRow.focusFlagCodes(originalLangCode: "en", availableFlags: ["fr", "EN", "es"], activeLangCode: "fr"),
            ["en", "fr", "es"]
        )
        XCTAssertEqual(FocalRow.focusFlagCodes(originalLangCode: "fr", availableFlags: [], activeLangCode: "en"), ["fr", "en"])
    }

    func test_identityHeader_rendersAPermanentTime_whenAskedTo_andTheRevealedOneOtherwise() throws {
        let header = try normalized("Meeshy/Features/Main/Focal/Row/FocalIdentityHeader.swift")
        XCTAssertTrue(
            header.contains("if revealsTimeAlways { Text(timeString)"),
            "Heure permanente : un `Text` nu, hors de toute observation du révélé."
        )
        XCTAssertTrue(
            header.contains("} else { FocalRevealedTime(timeString: timeString, tint: metaTint) }"),
            "Hors focus, la règle commune des têtes de groupe reste le révélé de défilement."
        )
    }
}
