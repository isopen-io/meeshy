import XCTest

/// Garde de forme pour #3938 : le survol d'envoi (`ComposerSendFlyPreview`,
/// #3918, remontée #3928/#3935) n'anime plus AUCUNE position — retour
/// porteur 2026-08-27 : « Enlève l'effet de remontée de message qui a été
/// introduit ce n'est pas bien généré du tout, il faut laisser le fade in ».
/// Il apparaît et disparaît EN PLACE, à son emplacement final, par un simple
/// fondu. Remplace `ComposerSendFlyRisesFromOffscreenSourceGuardTests.swift`
/// (supprimé — son sujet n'existe plus).
final class ComposerSendFlyFadesInPlaceSourceGuardTests: XCTestCase {

    private static let flyPreviewPath = "apps/ios/Meeshy/Features/Main/Components/ComposerSendFlyPreview.swift"
    private static let conversationViewPath = "apps/ios/Meeshy/Features/Main/Views/ConversationView.swift"

    // MARK: - Plus AUCUNE position animée (garde négative — le cœur du retrait)

    func test_flyPreview_neverOffsetsItsPosition() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertFalse(
            source.contains(".offset("),
            "la remontée a été retirée sur demande porteur (2026-08-27, « mal générée ») — aucun `.offset()` ne doit jamais réapparaître"
        )
    }

    func test_flyPreview_doesNotDeclareComposerHeightOrKeyboardHeightProperties() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertFalse(source.contains("composerHeight"), "plus de géométrie de départ à calculer — `composerHeight` ne doit plus apparaître")
        XCTAssertFalse(source.contains("keyboardHeight"), "plus de géométrie de départ à calculer — `keyboardHeight` ne doit plus apparaître")
    }

    func test_callSite_noLongerPassesComposerHeightOrKeyboardHeightToThePreview() throws {
        let block = try Self.propertyBlock(anchor: "if let payload = sendFlyPayload {", in: Self.conversationViewPath, matchAnchorLiterally: true)
        XCTAssertFalse(block.contains("composerHeight: composerHeight"), "l'hôte ne doit plus transmettre `composerHeight` — la vue n'anime plus de position")
        XCTAssertFalse(block.contains("keyboardHeight: keyboardHeight"), "l'hôte ne doit plus transmettre `keyboardHeight` — la vue n'anime plus de position")
    }

    // MARK: - Un fondu, entrée puis sortie

    func test_previewStruct_declaresASingleOpacityState() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertTrue(source.contains("@State private var opacityValue: Double = 0"), "un unique état d'opacité, démarrant invisible pour permettre le fondu d'entrée")
    }

    func test_opacity_fadesInThenFadesOut() throws {
        let block = try Self.propertyBlock(anchor: "var body: some View {", in: Self.flyPreviewPath)
        XCTAssertTrue(block.contains(".opacity(opacityValue)"), "l'opacité doit être pilotée par `opacityValue`")
        guard let onAppearRange = block.range(of: "onAppear {") else {
            return XCTFail("`onAppear` introuvable — le fondu doit démarrer à l'apparition")
        }
        let onAppearBlock = String(block[onAppearRange.lowerBound...])
        guard let fadeInRange = onAppearBlock.range(of: "opacityValue = 1") else {
            return XCTFail("le fondu D'ENTRÉE (`opacityValue = 1`) est introuvable")
        }
        guard let fadeOutRange = onAppearBlock.range(of: "opacityValue = 0") else {
            return XCTFail("le fondu DE SORTIE (`opacityValue = 0`) est introuvable")
        }
        XCTAssertTrue(
            fadeInRange.lowerBound < fadeOutRange.lowerBound,
            "le fondu d'entrée doit être programmé AVANT celui de sortie"
        )
        XCTAssertTrue(onAppearBlock.contains(".delay("), "le fondu de sortie doit être différé — sinon les deux animations se chevauchent dès l'apparition")
    }

    // MARK: - #3935bis intact : la forme suit toujours le mode de lecture RÉEL

    func test_previewStruct_declaresReadingModeAndIsDarkProperties() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertTrue(source.contains("let readingMode: ConversationReadingMode"), "`readingMode` doit être injecté par l'hôte, pas recalculé")
        XCTAssertTrue(source.contains("let isDark: Bool"), "`isDark` doit être injecté par l'hôte pour colorer le texte en mode script")
    }

    func test_callSite_passesReadingModeAndIsDarkToThePreview() throws {
        let block = try Self.propertyBlock(anchor: "if let payload = sendFlyPayload {", in: Self.conversationViewPath, matchAnchorLiterally: true)
        XCTAssertTrue(block.contains("readingMode: readingModeController.mode"), "l'hôte doit transmettre le mode de lecture RÉEL, pas un style neutre")
        XCTAssertTrue(block.contains("isDark: isDark"), "l'hôte doit transmettre son état clair/sombre déjà suivi")
    }

    func test_usesBubbleShape_matchesTheRealPerModeSplit() throws {
        let block = try Self.propertyBlock(anchor: "var usesBubbleShape: Bool {", in: Self.flyPreviewPath)
        guard let focalCase = block.range(of: "case .focal, .script:") else {
            return XCTFail("le cas Focal/Script (rangée plate) est introuvable")
        }
        guard let bubbleCase = block.range(of: "case .bubbles, .river, .summary:") else {
            return XCTFail("le cas Bulles/Rivière/Résumé (bulle pleine) est introuvable")
        }
        let focalBlock = String(block[focalCase.upperBound..<bubbleCase.lowerBound])
        XCTAssertTrue(focalBlock.contains("return false"), "Focal/Script doit rendre SANS bulle (rangée plate)")
        let bubbleBlock = String(block[bubbleCase.upperBound...])
        XCTAssertTrue(bubbleBlock.contains("return true"), "Bulles/Rivière/Résumé doit rendre AVEC bulle")
    }

    func test_bubbleShape_matchesTheRealBubbleBackground() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertTrue(source.contains("RoundedRectangle(cornerRadius: Self.bubbleCornerRadius)"), "la forme bulle doit utiliser le MÊME rayon que la bulle réelle, pas une capsule générique")
        XCTAssertTrue(source.contains("MeeshyColors.brandPrimary"), "le fond bulle doit être le MÊME plat de marque que la bulle réelle, pas un dégradé accent/secondaire")
        XCTAssertFalse(source.contains("Capsule()"), "l'ancienne capsule générique ne doit jamais réapparaître — la forme suit le mode de lecture")
        XCTAssertFalse(source.contains("LinearGradient"), "l'ancien dégradé accent/secondaire ne doit jamais réapparaître — le fond bulle est plat (`MeeshyColors.brandPrimary`)")
    }

    func test_scriptShape_usesDefaultTextColorNoBackground() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertTrue(source.contains("MeeshyColors.textPrimary(isDark: isDark)"), "le texte en mode script doit utiliser la couleur de texte par défaut — jamais blanc sur fond teinté")
    }

    // MARK: - ROULEAU intact + jamais un `.overlay()` par-dessus le composer

    func test_flyPreview_neverReferencesTheDiffableDataSourceOrCollectionView() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertFalse(
            source.contains("UICollectionView"),
            "ComposerSendFlyPreview doit rester un overlay TOTALEMENT séparé de la liste — jamais de référence à UICollectionView (directive ROULEAU)"
        )
    }

    func test_flyPreview_isNeverAnOverlayOnTheComposerBlock() throws {
        let source = try Self.strippedSource(at: Self.conversationViewPath)
        XCTAssertFalse(
            source.contains(".overlay(alignment: .bottom)"),
            "le survol d'envoi ne doit jamais être posé en `.overlay()` — un overlay se dessine toujours AU-DESSUS de sa vue de base, jamais derrière"
        )
    }

    /// Dans un `ZStack`, un calque déclaré AVANT un autre se dessine EN
    /// DESSOUS de lui. Le survol doit donc précéder textuellement
    /// `themedComposer` dans le même `ZStack(alignment: .bottom)` pour rester
    /// occulté par le fond opaque de la barre.
    func test_flyPreview_isLayeredBehindThemedComposerInTheSameZStack() throws {
        let block = try Self.propertyBlock(anchor: "ZStack(alignment: .bottom) {", in: Self.conversationViewPath, matchAnchorLiterally: true)
        guard let flyRange = block.range(of: "sendFlyPayload") else {
            return XCTFail("le survol d'envoi (`sendFlyPayload`) est introuvable dans le `ZStack(alignment: .bottom)` du bloc composer")
        }
        guard let composerRange = block.range(of: "themedComposer") else {
            return XCTFail("`themedComposer` est introuvable dans le `ZStack(alignment: .bottom)` du bloc composer")
        }
        XCTAssertTrue(
            flyRange.lowerBound < composerRange.lowerBound,
            "le calque `sendFlyPayload` doit précéder `themedComposer` dans le ZStack — sinon il se dessine PAR-DESSUS la barre, pas derrière"
        )
    }

    // MARK: - Extraction

    private struct GuardIsBlind: Error, CustomStringConvertible {
        let description: String
    }

    private static func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Composer
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // repo root
    }

    private static func strippedSource(at relativePath: String) throws -> String {
        let file = repoRoot().appendingPathComponent(relativePath)
        guard FileManager.default.fileExists(atPath: file.path) else {
            throw XCTSkip("Source introuvable depuis \(repoRoot().path) — arbre source indisponible")
        }
        return AppSourceGuard.stripComments(try String(contentsOf: file, encoding: .utf8))
    }

    /// `matchAnchorLiterally` : quand `true`, l'ancre elle-même délimite un
    /// bloc `if` (pas une déclaration `var`/`func`) — la fermeture accolade
    /// suit la même logique de comptage.
    private static func propertyBlock(anchor: String, in relativePath: String, matchAnchorLiterally: Bool = false) throws -> String {
        let source = try strippedSource(at: relativePath)
        guard let anchorRange = source.range(of: anchor) else {
            throw GuardIsBlind(description: "Ancre « \(anchor) » introuvable dans \(relativePath) : la garde ne garde plus rien")
        }
        var depth = 0
        var index = anchorRange.lowerBound
        while index < source.endIndex {
            let character = source[index]
            if character == "{" {
                depth += 1
            } else if character == "}" {
                depth -= 1
                if depth == 0 {
                    return String(source[anchorRange.lowerBound...index])
                }
            }
            index = source.index(after: index)
        }
        throw GuardIsBlind(description: "Accolade fermante du bloc introuvable pour « \(anchor) »")
    }
}
