import XCTest

/// Garde de forme pour #3918 : l'envoi d'un message texte montre une copie
/// du texte quitter le composer pour rejoindre le fil — un overlay séparé
/// de la liste (directive ROULEAU 2026-08-18 : aucune animation
/// d'insertion/suppression dans `MessageListLayout`/le data source
/// diffable), capturé AVANT que le champ ne soit vidé.
final class ComposerSendFlyAnimationSourceGuardTests: XCTestCase {

    private static let flyPreviewPath = "apps/ios/Meeshy/Features/Main/Components/ComposerSendFlyPreview.swift"
    private static let handlersPath = "apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift"

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

    // MARK: - Le composant existe et ne touche jamais la liste

    func test_flyPreview_neverReferencesTheDiffableDataSourceOrCollectionView() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertFalse(
            source.contains("UICollectionView"),
            "ComposerSendFlyPreview doit rester un overlay TOTALEMENT séparé de la liste — jamais de référence à UICollectionView (directive ROULEAU)"
        )
        XCTAssertFalse(
            source.contains("dataSource.apply") && source.contains("animatingDifferences: true"),
            "aucune animation d'insertion/suppression dans le data source diffable ne doit jamais réapparaître via ce fichier"
        )
    }

    func test_flyPreview_definesStruct() throws {
        let source = try Self.strippedSource(at: Self.flyPreviewPath)
        XCTAssertTrue(source.contains("struct ComposerSendFlyPreview: View"))
        XCTAssertTrue(source.contains("struct ComposerSendFlyPayload"))
    }

    // MARK: - Capture AVANT que le champ ne soit vidé

    /// L'ordre compte : capturer le texte APRÈS `composerText.text = ""`
    /// capturerait une chaîne déjà vide — le survol serait visuellement rien.
    func test_textOnlySend_triggersFlyAnimation_beforeClearingTheField() throws {
        let source = try Self.strippedSource(at: Self.handlersPath)
        guard let clearRange = source.range(of: "composerText.text = \"\"") else {
            return XCTFail("Ancre `composerText.text = \"\"` introuvable")
        }
        guard let triggerRange = source.range(of: "triggerSendFlyAnimation(text: text)") else {
            return XCTFail("`triggerSendFlyAnimation(text:)` n'est jamais appelé")
        }
        XCTAssertTrue(
            triggerRange.lowerBound < clearRange.lowerBound,
            "le survol doit être armé AVANT que composerText.text ne soit vidé — sinon le texte capturé est déjà vide"
        )
    }

    /// Les DEUX chemins d'envoi (texte seul, et texte + pièces jointes) vident
    /// le champ — les deux doivent donc déclencher le survol.
    func test_bothSendPaths_triggerFlyAnimation() throws {
        let source = try Self.strippedSource(at: Self.handlersPath)
        let occurrences = source.components(separatedBy: "triggerSendFlyAnimation(text: text)").count - 1
        XCTAssertEqual(
            occurrences, 2,
            "les deux chemins d'envoi (texte seul, texte + pièces jointes) doivent chacun déclencher le survol — trouvé \(occurrences)"
        )
    }

    func test_triggerSendFlyAnimation_isNoOpOnEmptyText() throws {
        let source = try Self.strippedSource(at: Self.handlersPath)
        guard let funcRange = source.range(of: "func triggerSendFlyAnimation(text: String) {") else {
            return XCTFail("`triggerSendFlyAnimation(text:)` introuvable")
        }
        var depth = 0
        var index = funcRange.lowerBound
        while index < source.endIndex {
            let character = source[index]
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { break }
            }
            index = source.index(after: index)
        }
        let block = String(source[funcRange.lowerBound...index])
        XCTAssertTrue(
            block.contains("guard !text.isEmpty else { return }"),
            "un envoi pièce-jointe-seule (texte vide) ne doit rien faire voler"
        )
    }
}
