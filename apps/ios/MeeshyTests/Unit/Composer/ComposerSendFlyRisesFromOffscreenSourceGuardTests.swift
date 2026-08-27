import XCTest

/// Garde de forme pour #3928 : le survol d'envoi (`ComposerSendFlyPreview`,
/// #3918) ne s'élève plus de 64pt depuis la position du composer — il part
/// de HORS ÉCRAN, sous le bas visible (sous le clavier si ouvert), puis
/// MONTE jusqu'à son emplacement naturel (au-dessus du composer, comme une
/// bulle neuve dans la liste inversée) avec un effet ressort.
final class ComposerSendFlyRisesFromOffscreenSourceGuardTests: XCTestCase {

    private static let flyPreviewPath = "apps/ios/Meeshy/Features/Main/Components/ComposerSendFlyPreview.swift"
    private static let conversationViewPath = "apps/ios/Meeshy/Features/Main/Views/ConversationView.swift"

    // MARK: - Départ hors écran, tenant compte du clavier

    func test_startOffset_accountsForComposerHeightAndKeyboardHeight() throws {
        let block = try Self.propertyBlock(anchor: "var startOffset: CGFloat {", in: Self.flyPreviewPath)
        XCTAssertTrue(
            block.contains("composerHeight") && block.contains("keyboardHeight"),
            "le départ hors écran doit dépendre à la fois de la hauteur du composer et du clavier — sinon le survol démarre à mi-écran, pas hors champ"
        )
    }

    func test_previewStruct_declaresComposerHeightAndKeyboardHeightProperties() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertTrue(source.contains("let composerHeight: CGFloat"), "`composerHeight` doit être injecté par l'hôte, pas recalculé")
        XCTAssertTrue(source.contains("let keyboardHeight: CGFloat"), "`keyboardHeight` doit être injecté par l'hôte, pas recalculé")
    }

    // MARK: - Montée en ressort, fondu DÉCOUPLÉ de la position

    /// Le fondu et la montée étaient pilotés par LE MÊME booléen (`lifted`)
    /// avant #3928 — ce qui smear le fondu sur toute la trajectoire. Un
    /// ressort avec overshoot sur la POSITION nécessite un état séparé pour
    /// le fondu, sans quoi l'opacité oscillerait aussi (valeurs hors
    /// [0,1] pendant le rebond).
    func test_riseAndFade_areDrivenBySeparateState() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertTrue(source.contains("@State private var risen"), "l'état de position (`risen`) est introuvable")
        XCTAssertTrue(source.contains("@State private var faded"), "l'état de fondu (`faded`), SÉPARÉ de la position, est introuvable")
    }

    func test_offset_usesRisenState_opacityUsesFadedState() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertTrue(
            source.contains(".offset(y: risen ? 0 : startOffset)"),
            "la position doit atterrir à 0 (son emplacement naturel, ancré par l'hôte) en partant de `startOffset` — hors écran"
        )
        XCTAssertTrue(
            source.contains(".opacity(faded ? 0 : 1)"),
            "le fondu doit être piloté par son propre état, pas par `risen`"
        )
    }

    func test_rise_usesASpringWithOvershoot() throws {
        let block = try Self.propertyBlock(anchor: "var body: some View {", in: Self.flyPreviewPath)
        XCTAssertTrue(block.contains("risen = true"), "`onAppear` doit déclencher la montée")
        guard let springRange = block.range(of: ".spring(") else {
            return XCTFail("la montée doit utiliser un spring — c'est lui qui produit l'effet ressort demandé")
        }
        _ = springRange
        XCTAssertTrue(block.contains("dampingFraction:"), "un spring sans `dampingFraction` < 1 ne produit pas d'overshoot")
    }

    // MARK: - ROULEAU intact (re-vérifié après la refonte)

    func test_flyPreview_stillNeverReferencesTheDiffableDataSourceOrCollectionView() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertFalse(
            source.contains("UICollectionView"),
            "ComposerSendFlyPreview doit rester un overlay TOTALEMENT séparé de la liste — jamais de référence à UICollectionView (directive ROULEAU)"
        )
    }

    // MARK: - L'hôte transmet composerHeight et keyboardHeight

    func test_callSite_passesComposerHeightAndKeyboardHeightToThePreview() throws {
        let block = try Self.propertyBlock(anchor: "if let payload = sendFlyPayload {", in: Self.conversationViewPath, matchAnchorLiterally: true)
        XCTAssertTrue(block.contains("composerHeight: composerHeight"), "l'hôte doit transmettre sa hauteur de composer mesurée")
        XCTAssertTrue(block.contains("keyboardHeight: keyboardHeight"), "l'hôte doit transmettre la hauteur de clavier déjà suivie")
    }

    // MARK: - #3935 : la course passe DERRIÈRE la barre du composer

    /// Un `.overlay()` se dessine TOUJOURS au-dessus de sa vue de base — posé
    /// sur le bloc composer, il faisait passer la capsule PAR-DESSUS
    /// `UniversalComposerBar` (retour porteur 2026-08-27). Le survol doit
    /// être un calque de `ZStack`, jamais un `.overlay()`.
    func test_flyPreview_isNoLongerAnOverlayOnTheComposerBlock() throws {
        let source = try Self.strippedSource(at: Self.conversationViewPath)
        XCTAssertFalse(
            source.contains(".overlay(alignment: .bottom)"),
            "le survol d'envoi ne doit plus être posé en `.overlay()` — un overlay se dessine toujours AU-DESSUS de sa vue de base, jamais derrière"
        )
    }

    /// Dans un `ZStack`, un calque déclaré AVANT un autre se dessine EN
    /// DESSOUS de lui. Le survol doit donc précéder textuellement
    /// `themedComposer` dans le même `ZStack(alignment: .bottom)` pour rester
    /// occulté par le fond opaque de la barre tant qu'il ne la dépasse pas.
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

    // MARK: - #3935bis : la forme suit le mode de lecture RÉEL

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

    /// Focal/Script rendent une rangée PLATE sans fond (`FocalRow.textBlock`)
    /// — Bulles/Rivière/Résumé rendent la bulle pleine. Le survol doit
    /// choisir la MÊME répartition, sans quoi il « change de forme » en
    /// cours de route au lieu de la porter dès son apparition.
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

    /// Même rayon, même fond PLAT que la bulle réelle (`BubbleBackground.swift`
    /// — « fonds PLATS au lieu de dégradés », décision perf 2026) : plus de
    /// `Capsule()` ni de dégradé `accentColor`/`secondaryColor` générique.
    func test_bubbleShape_matchesTheRealBubbleBackground() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertTrue(source.contains("RoundedRectangle(cornerRadius: Self.bubbleCornerRadius)"), "la forme bulle doit utiliser le MÊME rayon que la bulle réelle, pas une capsule générique")
        XCTAssertTrue(source.contains("MeeshyColors.brandPrimary"), "le fond bulle doit être le MÊME plat de marque que la bulle réelle, pas un dégradé accent/secondaire")
        XCTAssertFalse(source.contains("Capsule()"), "l'ancienne capsule générique ne doit plus apparaître — la forme suit désormais le mode de lecture")
        XCTAssertFalse(source.contains("LinearGradient"), "l'ancien dégradé accent/secondaire ne doit plus apparaître — le fond bulle est plat (`MeeshyColors.brandPrimary`)")
    }

    func test_scriptShape_usesDefaultTextColorNoBackground() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertTrue(source.contains("MeeshyColors.textPrimary(isDark: isDark)"), "le texte en mode script doit utiliser la couleur de texte par défaut — jamais blanc sur fond teinté")
    }

    // MARK: - #3935bis : un posé en douceur, jamais un rebond marqué

    /// `dampingFraction` plus élevé qu'à l'origine (`0.68`) — moins de rebond,
    /// une décélération nette à l'approche, un posé « en douceur ».
    func test_rise_dampingIsHigherForAGentlerLanding() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertTrue(source.contains("dampingFraction: 0.86"), "le damping doit être resserré pour ralentir nettement l'arrivée et réduire le rebond")
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
