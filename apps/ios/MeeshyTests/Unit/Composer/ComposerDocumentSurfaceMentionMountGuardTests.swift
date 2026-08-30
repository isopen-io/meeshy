import XCTest
@testable import Meeshy

/// **#3904 — l'autocomplétion @mention est bien MONTÉE dans l'écran de
/// composition, pas seulement construite en pièces isolées.**
///
/// `MentionComposerController`, `ComposerMentionFriendsSource` et
/// `ComposerMentionControllerBox` ont chacun leur propre suite ; celle-ci
/// prouve le dernier maillon — que `ComposerDocumentSurface.body` les
/// assemble réellement, sur la SOURCE (même patron que
/// `ComposerToolRowLeadingAccessoryGuardTests` : suite tournée sans UIKit
/// réel, R5/R15).
final class ComposerDocumentSurfaceMentionMountGuardTests: XCTestCase {

    private func surfaceSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerSurfaceSource())
    }

    private func surfaceURL() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift")
    }

    private func body(of anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var result = ""
        for character in code[start.lowerBound...] {
            result.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return result }
            }
        }
        return nil
    }

    func test_body_mountsComposerMentionStrip_gatedOnActiveQuery() throws {
        let source = try surfaceSource()
        guard let bodyBlock = body(of: "var body: some View {", in: source) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            bodyBlock.contains("ComposerMentionStrip("),
            "`body` ne monte plus `ComposerMentionStrip` — l'autocomplétion @mention retomberait à des "
                + "pièces construites mais jamais affichées."
        )
        XCTAssertTrue(
            bodyBlock.contains("if mentionBox.controller.activeQuery != nil"),
            "`ComposerMentionStrip` doit rester gaté sur `activeQuery != nil` — le monter inconditionnellement "
                + "afficherait une bande vide en permanence sous le composer."
        )
    }

    /// **Bande fantôme (revue Opus 2026-08-27).** En `.composerDraft`, aucun
    /// appel réseau en attente ne remplira jamais `suggestions` : pas d'ami
    /// accepté, une requête sans correspondance, ou le temps du `.task` de
    /// chargement sont tous des états NOMINAUX, pas transitoires. Gater sur la
    /// seule requête active peindrait une bande de verre vide dans chacun.
    func test_body_gatesComposerMentionStrip_alsoOnNonEmptySuggestions() throws {
        let source = try surfaceSource()
        guard let bodyBlock = body(of: "var body: some View {", in: source) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            bodyBlock.contains("!mentionBox.controller.suggestions.isEmpty"),
            "`ComposerMentionStrip` doit aussi être gaté sur `!suggestions.isEmpty` — sans quoi taper « @ » "
                + "sans ami accepté, ou une requête sans correspondance, affiche une bande de verre VIDE."
        )
    }

    func test_body_wiresTextChangesToTheMentionController_viaAdaptiveOnChange() throws {
        let source = try surfaceSource()
        guard let bodyBlock = body(of: "var body: some View {", in: source) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            bodyBlock.contains(".adaptiveOnChange(of: text)"),
            "La frappe doit être relayée par `.adaptiveOnChange`, pas un `.onChange` brut — convention du "
                + "dépôt pour ne pas réintroduire la profondeur de pile qu'`AdaptiveOnChangeModifier` encapsule."
        )
        XCTAssertFalse(
            bodyBlock.contains(".onChange(of: text)"),
            "Un `.onChange` brut a remplacé `.adaptiveOnChange` — régression de la convention du dépôt."
        )
        XCTAssertTrue(
            bodyBlock.contains("mentionBox.controller.handleQuery(in:"),
            "Le changement de texte doit relayer vers `handleQuery` — sinon taper « @ » ne déclenche jamais "
                + "la liste de mentions."
        )
    }

    func test_body_loadsAcceptedFriendsOnce_viaTask() throws {
        let source = try surfaceSource()
        guard let bodyBlock = body(of: "var body: some View {", in: source) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            bodyBlock.contains(".task { mentionBox.candidates = await ComposerMentionFriendsSource.acceptedFriends() }"),
            "`body` doit charger les amis acceptés dans `mentionBox.candidates` via `.task` — sans cette "
                + "ligne, la bande de mentions resterait vide pour toujours (aucune autre source ne les pose)."
        )
    }

    func test_composerDocumentSurface_declaresTheMentionBoxAsAStateObject() throws {
        let source = try surfaceSource()
        XCTAssertTrue(
            source.contains("@StateObject private var mentionBox = ComposerMentionControllerBox()"),
            "`mentionBox` doit être un `@StateObject` — un `@State`/`let` laisserait SwiftUI recréer le "
                + "contrôleur (et perdre `draftMentions`/`activeQuery`) à chaque re-rendu de la surface."
        )
    }
}
