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
