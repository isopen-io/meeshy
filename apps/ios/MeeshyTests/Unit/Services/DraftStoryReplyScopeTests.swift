import XCTest
import MeeshySDK
@testable import Meeshy

/// Un brouillon qui porte une citation de story la restitue EN TANT que
/// citation de story — jamais comme une réponse à un message dont
/// l'identifiant serait celui d'un post — et seulement dans la conversation
/// directe de l'auteur (#7883).
@MainActor
final class DraftStoryReplyScopeTests: XCTestCase {

    private static let suiteName = "DraftStoryReplyScopeTests"

    private func makeDraftStore() -> DraftStore {
        let defaults = UserDefaults(suiteName: Self.suiteName)!
        let store = DraftStore(userDefaults: defaults, userIdProvider: { "me" })
        store.clearAll()
        return store
    }

    private func storyReference(authorId: String = "alice") -> ReplyReference {
        ReplyContext.story(storyId: "story_1", authorId: authorId, authorName: "Alice", preview: "Coucher de soleil")
            .toReplyReference
    }

    private func moodReference(authorId: String = "alice") -> ReplyReference {
        ReplyContext.status(statusId: "mood_1", authorId: authorId, authorName: "Alice", emoji: "🌞", content: "En forme")
            .toReplyReference
    }

    private func messageReference() -> ReplyReference {
        ReplyReference(messageId: "msg_1", authorName: "Bob", previewText: "Salut", isMe: true)
    }

    private func roundTrip(_ reply: ReplyReference?) -> MessageDraft? {
        let store = makeDraftStore()
        store.save(MessageDraft.composing(text: "hi", reply: reply), for: "c1")
        return store.load(for: "c1")
    }

    // MARK: - Restauration dans le DM de l'auteur

    func test_restoredReply_storyInAuthorDirect_restoresStoryQuote() throws {
        let restored = try XCTUnwrap(roundTrip(storyReference())?
            .restoredReply(conversationIsDirect: true, participantUserId: "alice"))

        XCTAssertTrue(restored.isStoryReply)
        XCTAssertEqual(restored.messageId, "story_1")
        XCTAssertEqual(restored.storyAuthorId, "alice")
    }

    func test_restoredReply_moodInAuthorDirect_keepsItsEmoji() throws {
        let restored = try XCTUnwrap(roundTrip(moodReference())?
            .restoredReply(conversationIsDirect: true, participantUserId: "alice"))

        XCTAssertTrue(restored.isStoryReply)
        XCTAssertEqual(restored.moodEmoji, "🌞")
    }

    // MARK: - Refus hors du DM de l'auteur

    func test_restoredReply_storyInOtherDirect_isDropped() {
        XCTAssertNil(roundTrip(storyReference())?.restoredReply(conversationIsDirect: true, participantUserId: "carol"))
    }

    func test_restoredReply_storyInGroup_isDropped() {
        XCTAssertNil(roundTrip(storyReference())?.restoredReply(conversationIsDirect: false, participantUserId: nil))
    }

    func test_restoredReply_moodInGroup_isDropped() {
        XCTAssertNil(roundTrip(moodReference())?.restoredReply(conversationIsDirect: false, participantUserId: "alice"))
    }

    // MARK: - Citation de message : inchangée

    func test_restoredReply_messageQuote_restoresEverywhere() throws {
        let restored = try XCTUnwrap(roundTrip(messageReference())?
            .restoredReply(conversationIsDirect: false, participantUserId: nil))

        XCTAssertFalse(restored.isStoryReply)
        XCTAssertEqual(restored.messageId, "msg_1")
        XCTAssertTrue(restored.isMe)
    }

    func test_restoredReply_noReply_isNil() {
        XCTAssertNil(roundTrip(nil)?.restoredReply(conversationIsDirect: true, participantUserId: "alice"))
    }

    // MARK: - Le nettoyage purge aussi la marque de story

    func test_clearReplyReference_purgesStoryMarkers() throws {
        let store = makeDraftStore()
        store.save(MessageDraft.composing(text: "hi", reply: moodReference()), for: "c1")

        store.clearReplyReference(conversationId: "c1")

        let draft = try XCTUnwrap(store.load(for: "c1"))
        XCTAssertNil(draft.replyStoryAuthorId)
        XCTAssertNil(draft.replyMoodEmoji)
        XCTAssertEqual(draft.text, "hi")
    }

    // MARK: - Les sites de ConversationView passent par la loi

    /// Les sites sont des méthodes d'une `View` : aucun test d'exécution ne les
    /// atteint sans monter l'écran. Garde de source, ANCRÉE sur l'unité
    /// entière (`ConversationView` + ses extensions), commentaires retirés.
    private func conversationViewUnit() throws -> String {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationView.swift"))
        XCTAssertTrue(code.contains("func applyReplyContext(_ context: ReplyContext, openingConversation: Bool) -> Bool"),
                      "Ancrage perdu : la garde ne doit pas passer à vide.")
        return code
    }

    func test_applyReplyContext_refusesAContextOutsideItsAuthorDirect() throws {
        let code = try conversationViewUnit()
        XCTAssertTrue(code.contains("guard context.isAdmissible(conversationIsDirect: isDirect, participantUserId: conversation?.participantUserId) else { return false }"))
    }

    func test_replyContextVersion_consumesOnlyWhatApplyAdmits() throws {
        let code = try conversationViewUnit()
        XCTAssertTrue(code.contains("applyReplyContext(ctx, openingConversation: false) else { return }"),
                      "Un contexte refusé ne doit ni s'appliquer ni être purgé : il attend SON DM.")
        XCTAssertFalse(code.contains("ctx.authorId == conversation?.participantUserId"),
                       "La loi a UN site — `StoryReplyAdmission` — aucune réécriture locale.")
    }

    func test_sendPaths_routeTheReplyThroughTheScopedLaw() throws {
        let code = try conversationViewUnit()
        XCTAssertFalse(code.contains("let isStory = pendingRef?.isStoryReply == true"),
                       "Les chemins d'envoi ne dérivent plus storyReplyToId à la main : `outgoingReplyRoute` le borne à la conversation.")
        XCTAssertGreaterThanOrEqual(code.components(separatedBy: "let route = outgoingReplyRoute").count - 1, 2,
                                    "Texte/média ET sticker passent par la route bornée.")
    }

    func test_draftRestore_goesThroughTheScopedLaw() throws {
        let code = try conversationViewUnit()
        XCTAssertTrue(code.contains("draft.restoredReply(conversationIsDirect: isDirect, participantUserId: conversation?.participantUserId)"))
        XCTAssertTrue(code.contains("MessageDraft.composing("),
                      "Le brouillon grave la marque de story : sans elle, l'id d'un post revient en réponse à un message.")
    }
}
