import XCTest
@testable import Meeshy

/// **#4003 — éditer un message écrasait le brouillon en cours, sans jamais
/// le restituer.**
///
/// Trois sites entraient en mode édition en écrivant `composerState.
/// editingMessageId`/`editingOriginalContent`/`composerText.text` chacun de
/// son côté. L'un d'eux (le menu longpress custom, `onEdit: {
/// composerState.editingMessageId = msg.id }`) oubliait `composerText.text`
/// — le bandeau d'édition s'affichait avec un champ VIDE. Et aucun site ne
/// sauvegardait le brouillon existant avant de l'écraser avec le contenu du
/// message à éditer : `cancelEdit()` remettait toujours `composerText.text
/// = ""`, jamais le brouillon d'origine.
///
/// Le correctif introduit un point d'entrée UNIQUE, `beginEdit(_:)`, que les
/// trois sites appellent — cette garde le prouve par la SOURCE (même patron
/// que `ComposerToolRowLeadingAccessoryGuardTests` : suite tournée sans
/// UIKit réel, R5/R15).
final class ConversationEditDraftGuardTests: XCTestCase {

    /// **L'UNITÉ, jamais le seul fichier-tête.** `ConversationView` a été
    /// découpée en dix parties pour rentrer dans le budget de taille, et les
    /// blocs que cette garde ancre — `beginEdit`, `cancelEdit` — ont suivi dans
    /// ses extensions. Lisant le fichier-tête, la garde ne trouvait plus ses
    /// ancres : deux témoins rouges pour un code parfaitement correct.
    ///
    /// Une garde de source qui nomme des FICHIERS se périme au premier fichier
    /// ajouté ; `AppSourceGuard.unit` globe `Type+*.swift` et survit au
    /// découpage (leçon 347).
    private func source(_ relativePath: String) throws -> String {
        // L'état du composer vit dans `ConversationComposerState.swift` depuis
        // le 2026-09-02 : un compagnon sans le nom du type, que le glob ne voit
        // pas — l'unité de l'écran le nomme.
        AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/" + relativePath,
            alsoIncluding: AppSourceGuard.conversationViewCompanions))
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

    // MARK: - `ComposerState` porte le brouillon sauvegardé

    func test_composerState_declaresADraftBeforeEditField() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(
            code.contains("var draftBeforeEdit: String? = nil"),
            "`ComposerState` doit porter `draftBeforeEdit` — sans lui, aucun site ne peut sauvegarder le "
                + "brouillon en cours avant d'entrer en édition."
        )
    }

    // MARK: - `beginEdit` sauvegarde le brouillon ET peuple les trois champs

    func test_beginEdit_savesTheDraftAndPopulatesAllThreeFields() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        guard let fn = body(of: "func beginEdit(", in: code) else {
            return XCTFail("`beginEdit` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            fn.contains("draftBeforeEdit"),
            "`beginEdit` doit sauvegarder le brouillon courant dans `draftBeforeEdit` AVANT de l'écraser."
        )
        XCTAssertTrue(
            fn.contains("editingMessageId ="),
            "`beginEdit` doit poser `editingMessageId`."
        )
        XCTAssertTrue(
            fn.contains("editingOriginalContent ="),
            "`beginEdit` doit poser `editingOriginalContent`."
        )
        XCTAssertTrue(
            fn.contains("composerText.text ="),
            "`beginEdit` doit charger le contenu du message dans `composerText.text` — c'est exactement "
                + "l'omission qui laissait le champ vide sur l'un des trois sites d'origine."
        )
    }

    // MARK: - `cancelEdit` restitue le brouillon, ne le vide plus

    func test_cancelEdit_restoresTheSavedDraft_neverHardcodesEmpty() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        guard let fn = body(of: "func cancelEdit(", in: code) else {
            return XCTFail("`cancelEdit` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(
            fn.contains("composerText.text = \"\""),
            "`cancelEdit` ne doit plus vider inconditionnellement le champ — le brouillon d'origine doit "
                + "être restitué, pas perdu."
        )
        XCTAssertTrue(
            fn.contains("draftBeforeEdit"),
            "`cancelEdit` doit lire `draftBeforeEdit` pour restituer le brouillon."
        )
    }

    // MARK: - Les TROIS sites d'entrée en édition appellent le point d'entrée unique

    func test_allThreeEditEntryPoints_callBeginEdit() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        let occurrences = code.components(separatedBy: "beginEdit(").count - 1
        XCTAssertGreaterThanOrEqual(
            occurrences, 3,
            "Les trois sites d'entrée en édition (menu longpress custom, montage alternatif, menu natif "
                + "iOS 26+) doivent tous appeler `beginEdit(_:)` — une logique recopiée à trois endroits "
                + "est ce qui a laissé le site cassé passer inaperçu."
        )
        XCTAssertFalse(
            code.contains("editingMessageId = msg.id }"),
            "Aucun site ne doit plus poser `editingMessageId` seul sans passer par `beginEdit` — c'est "
                + "exactement le site cassé d'origine."
        )
    }
}
