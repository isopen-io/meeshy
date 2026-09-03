import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class ConversationReplyContextTests: XCTestCase {

    private static let suiteName = "ConversationReplyContextTests"

    private func makeDraftStore() -> DraftStore {
        let defaults = UserDefaults(suiteName: Self.suiteName)!
        let store = DraftStore(userDefaults: defaults)
        store.clearAll()
        return store
    }

    private func makeReplyReference(messageId: String = "story_1") -> ReplyReference {
        ReplyReference(
            messageId: messageId,
            authorName: "alice",
            previewText: "previous bubble",
            isStoryReply: true
        )
    }

    // MARK: - clear behaviour

    func test_clear_purgesPendingReplyReference() {
        let draftStore = makeDraftStore()
        var pending: ReplyReference? = makeReplyReference()
        let sut = ReplyContextCleaner(conversationId: "c1", draftStore: draftStore)

        sut.clear(pendingReplyReference: &pending)

        XCTAssertNil(pending)
    }

    func test_clear_purgesPersistedReplyToId() {
        let draftStore = makeDraftStore()
        draftStore.save(MessageDraft(text: "hi", replyToId: "story_1"), for: "c1")
        var pending: ReplyReference? = makeReplyReference()
        let sut = ReplyContextCleaner(conversationId: "c1", draftStore: draftStore)

        sut.clear(pendingReplyReference: &pending)

        XCTAssertNil(draftStore.load(for: "c1")?.replyToId)
    }

    func test_clear_preservesDraftText() {
        let draftStore = makeDraftStore()
        draftStore.save(MessageDraft(text: "mon texte", replyToId: "story_1"), for: "c1")
        var pending: ReplyReference? = makeReplyReference()
        let sut = ReplyContextCleaner(conversationId: "c1", draftStore: draftStore)

        sut.clear(pendingReplyReference: &pending)

        XCTAssertEqual(draftStore.load(for: "c1")?.text, "mon texte")
    }

    // MARK: - L'avatar de l'auteur cité, gravé par le geste « Répondre »

    /// `triggerReply` est une méthode d'extension de `ConversationView` : aucun
    /// test d'exécution ne peut l'appeler sans monter la vue et son
    /// environnement. Garde de SOURCE, donc — mais ANCRÉE : l'assertion
    /// d'ancrage échoue bruyamment si le fichier est tronqué (accident du
    /// dépouilleur de commentaires) ou la fonction renommée, de sorte que la
    /// preuve ne peut jamais passer à vide.
    func test_triggerReply_engravesTheQuotedAuthorAvatar() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationView+MessageRow.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))

        XCTAssertTrue(
            code.contains("func triggerReply(for msg: Message)"),
            "Ancrage perdu : ni fichier tronqué ni fonction renommée ne doit laisser cette garde passer à vide."
        )
        // #4945 : le geste ne compose plus sa citation à la main — il passe par la
        // fabrique UNIQUE du ViewModel, la même que la bulle optimiste, qui grave
        // l'avatar (et désormais les faits du média, le Prisme et la protection).
        // Garder l'ancrage sur le littéral `authorAvatarUrl:` aurait figé la
        // divergence que la fabrique vient de supprimer.
        XCTAssertTrue(
            code.contains("viewModel.optimisticReplyReference(quoting: msg)"),
            "Le geste « Répondre » doit passer par la fabrique unique de citation (`optimisticReplyReference`) — sinon la bannière et la bulle divergent à nouveau."
        )
        // `= ReplyReference(` et non `ReplyReference(` : le second est un
        // SOUS-MOT de `optimisticReplyReference(`, l'appel même que l'assertion
        // précédente EXIGE — la garde interdisait donc ce qu'elle prescrit deux
        // lignes plus haut. Une garde négative s'ancre sur ce qui distingue la
        // composition manuelle (l'affectation) de l'appel à la fabrique.
        XCTAssertFalse(
            code.contains("= ReplyReference("),
            "Aucune citation ne se compose à la main dans ce fichier : la fabrique est le seul producteur."
        )
    }

    func test_appReopen_preservesReplyToIdWhenNoSendNorCancel() {
        // Simulate: user opened a conversation, replied to a story (replyToId
        // persisted in draft), then backgrounded the app. Re-open: the reply
        // banner should still appear because no send/cancel has fired.
        let draftStore = makeDraftStore()
        draftStore.save(MessageDraft(text: "hi", replyToId: "story_1"), for: "c1")

        // No call to ReplyContextCleaner.clear

        XCTAssertEqual(draftStore.load(for: "c1")?.replyToId, "story_1")
    }
}
