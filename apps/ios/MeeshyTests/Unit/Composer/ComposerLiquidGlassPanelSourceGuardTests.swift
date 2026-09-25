import XCTest

/// Garde de forme pour #7884 : la barre de composition repose sur UN panneau de
/// verre liquide, et les éléments posés dessus sont du verre aussi.
///
/// Directive porteur 2026-09-25 : « toute la barre repose sur un seul panneau de
/// verre et les éléments par-dessus sont des composants de verre si possible
/// aussi ». Le verre passe par `adaptiveLiquidGlass` (MeeshyUI) : `glassEffect`
/// réel sur iOS 26, verre fait maison avant — jamais `glassEffect` en direct,
/// qui ne compile pas sous iOS 26 sans sa bascule.
final class ComposerLiquidGlassPanelSourceGuardTests: XCTestCase {

    private static let composerPath = "Meeshy/Features/Main/Components/UniversalComposerBar.swift"

    func test_panel_isOneLiquidGlassSurface_tintedByTheDominantProtection() throws {
        let source = try Self.source()
        XCTAssertTrue(
            source.contains(".adaptiveLiquidGlass(in: Self.panelShape, tint: panelGlassTint)"),
            "la bande principale repose sur UN panneau de verre, teinté par la protection armée (#7884, #7667)"
        )
        let tint = try Self.block(named: "var panelGlassTint: Color?", in: source)
        XCTAssertTrue(tint.contains("dominantProtection"), "le voile du panneau suit la protection dominante (#7667)")
    }

    func test_transparentBackground_isGone() throws {
        let source = try Self.source()
        XCTAssertFalse(source.contains("composerBackground"),
                       "l'ancien fond transparent (#3920) est remplacé par le panneau de verre (#7884)")
    }

    func test_elementsOnThePanel_areGlassToo() throws {
        let source = try Self.source()
        let expectations: [(anchor: String, shape: String)] = [
            ("var textInputField: some View {", "adaptiveLiquidGlass(in: Self.fieldShape"),
            ("var attachButton: some View {", "adaptiveLiquidGlass(in: Circle()"),
            ("var recordingBar: some View {", "adaptiveLiquidGlass(in: Self.fieldShape"),
            ("var quickEmojiButtons: some View {", "adaptiveLiquidGlass(in: Circle()"),
        ]
        for expectation in expectations {
            let block = try Self.block(named: expectation.anchor, in: source)
            XCTAssertTrue(block.contains(expectation.shape),
                          "« \(expectation.anchor) » doit porter du verre liquide (#7884)")
        }
    }

    func test_languageChip_isGlass() throws {
        let source = try Self.source()
        XCTAssertTrue(source.contains("adaptiveLiquidGlass(in: Capsule()"),
                      "la pastille de langue de la barre d'outils est une capsule de verre (#7884)")
    }

    func test_noRawGlassEffect_inTheBar() throws {
        let source = try Self.source()
        XCTAssertFalse(source.contains(".glassEffect("),
                       "le verre passe par l'atome adaptatif du SDK, jamais par `glassEffect` en direct")
    }

    /// Directive porteur 2026-09-25 : le bouton d'envoi revient dès qu'il y a
    /// du texte. Les cadres à mots ne disparaissent pas pour autant : un appui
    /// long sur ce bouton les ouvre, et VoiceOver reçoit une action nommée.
    func test_sendButton_opensTheTextStickersOnLongPress() throws {
        let block = try Self.block(named: "var sendButton: some View {", in: try Self.source())
        XCTAssertTrue(block.contains("LongPressGesture"), "l'appui long sur le bouton d'envoi ouvre les cadres à mots")
        XCTAssertTrue(block.contains("showTextStickerSheet = true"), "l'appui long ouvre la feuille des cadres à mots")
        XCTAssertTrue(block.contains("accessibilityAction(named:"), "VoiceOver atteint les cadres à mots par une action nommée")
    }

    func test_textStickerPastille_isGone() throws {
        let source = try Self.source()
        XCTAssertFalse(source.contains("ComposerTextStickerButton("),
                       "la pastille qui remplaçait le bouton d'envoi est retirée (directive 2026-09-25)")
    }

    // MARK: - Extraction

    private struct GuardIsBlind: Error, CustomStringConvertible {
        let description: String
    }

    private static func source() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(composerPath))
    }

    private static func block(named anchor: String, in source: String) throws -> String {
        guard let anchorRange = source.range(of: anchor) else {
            throw GuardIsBlind(description: "Ancre « \(anchor) » introuvable : la garde ne garde plus rien")
        }
        var depth = 0
        var index = anchorRange.lowerBound
        while index < source.endIndex {
            let character = source[index]
            if character == "{" {
                depth += 1
            } else if character == "}" {
                depth -= 1
                if depth == 0 { return String(source[anchorRange.lowerBound...index]) }
            }
            index = source.index(after: index)
        }
        throw GuardIsBlind(description: "Accolade fermante du bloc « \(anchor) » introuvable")
    }
}
