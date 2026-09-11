import XCTest
@testable import Meeshy

/// **Répondre à un message ou à une story lève le clavier** (#6003).
///
/// `triggerReply(for:)` posait la citation puis `isTyping = true`. Or `isTyping`
/// est un `@FocusState` que `ConversationView` n'attache à AUCUN champ : il ne
/// fait que RECEVOIR le focus du composer (`onFocusChange`). L'affecter ne
/// déplaçait rien, et le clavier restait baissé. La porte prévue pour ce cas
/// existe — `UniversalComposerBar.focusTrigger` — et la conversation était la
/// seule surface à ne pas la câbler.
///
/// La réponse à une story arrive par un `ReplyContext` : la conversation posait
/// la citation à l'ouverture sans jamais demander le focus.
@MainActor
final class ConversationReplyComposerFocusTests: XCTestCase {

    private func source(_ file: String) throws -> String {
        try AppSourceGuard.unit("Meeshy/Features/Main/Views/\(file)")
    }

    /// Le corps d'une fonction, accolades équilibrées — une recherche dans le
    /// fichier entier trouverait `isTyping = true` ailleurs (l'édition le pose
    /// légitimement) et ferait mentir le témoin.
    private func body(of signature: String, in code: String) -> String? {
        guard let start = code.range(of: signature) else { return nil }
        var depth = 0
        var opened = false
        var index = start.upperBound
        while index < code.endIndex {
            let character = code[index]
            if character == "{" { depth += 1; opened = true }
            if character == "}" {
                depth -= 1
                if opened && depth == 0 { return String(code[start.lowerBound...index]) }
            }
            index = code.index(after: index)
        }
        return nil
    }

    // MARK: - La porte est câblée

    func test_leComposerDeConversationCableSaPorteDeFocus() throws {
        let code = try source("ConversationView+Composer.swift")
        XCTAssertTrue(
            code.contains("focusTrigger: $composerState.focusRequested"),
            "Sans ce câblage, aucune demande de focus n'atteint le champ : la barre garde `.constant(false)`."
        )
    }

    func test_laPorteNaitBaissee() {
        XCTAssertFalse(ConversationComposerState().focusRequested)
    }

    // MARK: - Chaque entrée de réponse demande le focus

    func test_repondreAUnMessageLeveLeClavier() throws {
        let code = try source("ConversationView+MessageRow.swift")
        let triggerReply = try XCTUnwrap(body(of: "func triggerReply(for msg: Message)", in: code))
        XCTAssertTrue(triggerReply.contains("requestReplyFocus(openingConversation: false)"))
        XCTAssertFalse(
            triggerReply.contains("isTyping = true"),
            "`isTyping` n'est lié à aucun champ : l'affecter ne lève pas le clavier."
        )
    }

    func test_ouvrirUneConversationPourRepondreLeveLeClavier() throws {
        let code = try source("ConversationView.swift")
        XCTAssertTrue(
            code.contains("if let context = replyContext { applyReplyContext(context, openingConversation: true) }"),
            "Une réponse à une story ouvre la conversation avec sa citation : le clavier doit suivre."
        )
    }

    func test_uneReponseAppliqueeAEcranOuvertLeveLeClavier() throws {
        let code = try source("ConversationView.swift")
        XCTAssertTrue(code.contains("applyReplyContext(ctx, openingConversation: false)"))
    }

    /// Rouvrir une conversation dont le brouillon porte une citation n'est pas
    /// un geste de réponse : lever le clavier là surprendrait, et masquerait le
    /// fil qu'on vient rouvrir pour le lire.
    ///
    /// Le témoin lit le BLOC de restauration, pas l'unité : `AppSourceGuard`
    /// agrège les extensions `ConversationView+*.swift`, où la demande de focus
    /// est légitimement déclarée.
    func test_unBrouillonRestaureNeLevePasLeClavier() throws {
        let code = try source("ConversationView.swift")
        let restauration = try XCTUnwrap(body(
            of: "if composerText.text.isEmpty, let draft = DraftStore.shared.load(for: viewModel.conversationId)",
            in: code
        ))
        XCTAssertTrue(restauration.contains("composerState.pendingReplyReference = ReplyReference("))
        XCTAssertFalse(
            restauration.contains("applyReplyContext(") || restauration.contains("requestReplyFocus("),
            "Rouvrir un brouillon cité n'est pas un geste de réponse : le clavier reste baissé."
        )
    }

    // MARK: - La demande est un FRONT, jamais une valeur

    /// `focusTrigger` est consommé par un `onChange` : une porte restée levée
    /// (composer absent, mode sélection) ne changerait plus jamais de valeur,
    /// et une affectation faite pendant la passe qui monte le composer n'est
    /// pas vue. La demande baisse donc la porte, puis la lève sur un tour
    /// ultérieur.
    func test_laDemandeProduitUnFrontBasHaut() throws {
        let code = try source("ConversationView+MessageRow.swift")
        let request = try XCTUnwrap(body(of: "func requestReplyFocus(openingConversation: Bool)", in: code))
        let lowered = try XCTUnwrap(request.range(of: "focusRequested = false"))
        let raised = try XCTUnwrap(request.range(of: "focusRequested = true"))
        XCTAssertLessThan(lowered.lowerBound, raised.lowerBound)
        XCTAssertTrue(request.contains("asyncAfter"), "Le front haut doit partir sur un tour ultérieur.")
    }

    func test_aLOuvertureLeClavierAttendLaFinDeLaPoussee() {
        XCTAssertEqual(ConversationComposerState.replyFocusDelay(openingConversation: false), 0)
        XCTAssertGreaterThan(
            ConversationComposerState.replyFocusDelay(openingConversation: true), 0,
            "Un focus posé pendant la transition de navigation est perdu."
        )
    }
}
