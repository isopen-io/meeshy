import XCTest

/// Garde de forme pour #3920 : la barre de composition est transparente et le
/// bouton d'envoi n'apparaît que lorsqu'il y a du contenu à envoyer.
///
/// Directive porteur (2026-08-26) : « La barre de composition doit être
/// principalement transparent sans fond et le bouton envoyer ne doit
/// apparaitre que lorsqu'on a quelque chose à envoyer uniquement ».
///
/// Résolution de la tension avec la directive du 2026-05-28 (bug « on ne voit
/// pas le bouton envoyer ») : le bouton reste MONTÉ (le slot ne s'effondre
/// pas, pas de saut de layout) mais devient réellement INVISIBLE (opacité 0,
/// pas 0.4) tant qu'il n'y a rien à envoyer — l'affordance disparaît des yeux
/// de l'utilisateur sans réintroduire le trou visuel du 2026-05-28.
final class ComposerTransparentAndConditionalSendSourceGuardTests: XCTestCase {

    private static let composerPath = "apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar.swift"
    private static let conversationViewPath = "apps/ios/Meeshy/Features/Main/Views/ConversationView.swift"

    // MARK: - Bouton d'envoi : invisible à vide, pas seulement estompé

    func test_actionButtonBlock_isExtractedWhole() throws {
        let block = try Self.actionButtonBlock()
        XCTAssertTrue(block.contains("sendButton"), "le bloc extrait ne contient pas `sendButton`")
        XCTAssertTrue(block.contains("allowsHitTesting(isReady)"), "l'extraction est tronquée avant sa dernière ligne")
    }

    func test_actionButton_isInvisible_notMerelyFaded_whenNotReady() throws {
        let block = try Self.actionButtonBlock()
        XCTAssertTrue(
            block.contains("opacity(isReady ? 1.0 : 0)"),
            "sans contenu à envoyer, le bouton doit être INVISIBLE (opacité 0) — pas seulement estompé (0.4) : #3920"
        )
        XCTAssertFalse(
            block.contains("opacity(isReady ? 1.0 : 0.4)"),
            "l'ancienne opacité estompée (0.4) doit avoir disparu du bloc"
        )
    }

    // MARK: - Hôte du composer : plus de fond opaque forcé

    /// Le fond `.ultraThinMaterial` de l'hôte (`ConversationView`) était
    /// appliqué à TOUT le conteneur partagé (composer + panneau de mentions +
    /// clavier emoji) — alors que `mentionSuggestionPanel`, `EmojiKeyboardPanel`,
    /// `closedConversationBanner` et `blockedComposerZone` se dotent CHACUN de
    /// leur propre matériau. Le seul état qui dépendait de ce fond PARTAGÉ était
    /// le composer nu — exactement celui que #3920 veut transparent. Le retirer
    /// ne prive donc aucune sous-vue de sa lisibilité.
    func test_composerHost_noLongerForcesOpaqueBackground() throws {
        let source = try Self.strippedSource(at: Self.conversationViewPath)
        guard let anchorRange = source.range(of: ".ignoresSafeArea(.container, edges: .bottom)") else {
            throw GuardIsBlind(description: "Ancre `.ignoresSafeArea(.container, edges: .bottom)` introuvable")
        }
        let windowStart = source.index(anchorRange.lowerBound, offsetBy: -120, limitedBy: source.startIndex) ?? source.startIndex
        let window = String(source[windowStart..<anchorRange.upperBound])
        XCTAssertFalse(
            window.contains("ultraThinMaterial"),
            "l'hôte du composer ne doit plus forcer .ultraThinMaterial sur le conteneur partagé — chaque sous-vue qui en a besoin se dote de son propre matériau (#3920)"
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

    private static func actionButtonBlock() throws -> String {
        let source = try strippedSource(at: composerPath)
        let anchor = "var actionButton: some View {"
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
                if depth == 0 {
                    return String(source[anchorRange.lowerBound...index])
                }
            }
            index = source.index(after: index)
        }
        throw GuardIsBlind(description: "Accolade fermante du bloc `actionButton` introuvable")
    }
}
