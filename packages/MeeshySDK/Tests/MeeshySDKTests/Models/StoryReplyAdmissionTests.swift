import Testing
import Foundation
@testable import MeeshySDK

/// Un contexte de réponse à une story ou à une humeur ne s'applique QUE dans la
/// conversation directe de son auteur (#7883). `Router.pendingReplyContext` est
/// global : sans cette loi, la prochaine conversation ouverte — un groupe, le
/// DM d'un tiers — recevait la citation de la story d'un autre, puis l'envoyait
/// avec `storyReplyToId`.
@Suite("StoryReplyAdmission — une réponse à une story ne vit que dans le DM de son auteur")
struct StoryReplyAdmissionTests {

    private static func story(authorId: String = "alice") -> ReplyContext {
        .story(storyId: "story_1", authorId: authorId, authorName: "Alice", preview: "Coucher de soleil")
    }

    private static func mood(authorId: String = "alice") -> ReplyContext {
        .status(statusId: "mood_1", authorId: authorId, authorName: "Alice", emoji: "🌞", content: "En forme")
    }

    private static func messageQuote() -> ReplyReference {
        ReplyReference(messageId: "msg_1", authorName: "Bob", previewText: "Salut")
    }

    // MARK: - La loi sur des primitives

    @Test("le DM de l'auteur admet la réponse")
    func admits_authorDirect_true() {
        #expect(StoryReplyAdmission.admits(storyAuthorId: "alice", conversationIsDirect: true, participantUserId: "alice"))
    }

    @Test("le DM d'un autre refuse la réponse")
    func admits_otherDirect_false() {
        #expect(!StoryReplyAdmission.admits(storyAuthorId: "alice", conversationIsDirect: true, participantUserId: "carol"))
    }

    @Test("un groupe refuse la réponse, même si son participant résolu est l'auteur")
    func admits_group_false() {
        #expect(!StoryReplyAdmission.admits(storyAuthorId: "alice", conversationIsDirect: false, participantUserId: "alice"))
    }

    @Test("sans conversation résolue, la réponse est refusée")
    func admits_noParticipant_false() {
        #expect(!StoryReplyAdmission.admits(storyAuthorId: "alice", conversationIsDirect: true, participantUserId: nil))
    }

    @Test("un auteur inconnu ou vide n'égale jamais un participant vide")
    func admits_emptyIds_false() {
        #expect(!StoryReplyAdmission.admits(storyAuthorId: nil, conversationIsDirect: true, participantUserId: "alice"))
        #expect(!StoryReplyAdmission.admits(storyAuthorId: "", conversationIsDirect: true, participantUserId: ""))
    }

    // MARK: - ReplyContext (story ET humeur)

    @Test("story : DM de l'auteur admis, DM d'un autre et groupe refusés")
    func storyContext_admission() {
        #expect(Self.story().isAdmissible(conversationIsDirect: true, participantUserId: "alice"))
        #expect(!Self.story().isAdmissible(conversationIsDirect: true, participantUserId: "carol"))
        #expect(!Self.story().isAdmissible(conversationIsDirect: false, participantUserId: "alice"))
        #expect(!Self.story().isAdmissible(conversationIsDirect: false, participantUserId: nil))
    }

    @Test("humeur : même loi que la story")
    func moodContext_admission() {
        #expect(Self.mood().isAdmissible(conversationIsDirect: true, participantUserId: "alice"))
        #expect(!Self.mood().isAdmissible(conversationIsDirect: true, participantUserId: "carol"))
        #expect(!Self.mood().isAdmissible(conversationIsDirect: false, participantUserId: "alice"))
    }

    // MARK: - La citation en attente porte son auteur

    @Test("la citation d'une story ou d'une humeur grave l'auteur")
    func toReplyReference_engravesAuthor() {
        #expect(Self.story().toReplyReference.storyAuthorId == "alice")
        #expect(Self.mood().toReplyReference.storyAuthorId == "alice")
    }

    @Test("une citation de MESSAGE reste admise partout — elle naît du fil courant")
    func messageQuote_alwaysAdmissible() {
        #expect(Self.messageQuote().isAdmissible(conversationIsDirect: false, participantUserId: nil))
    }

    @Test("une citation de story sans auteur gravé est refusée (fail-closed)")
    func storyQuoteWithoutAuthor_refused() {
        let orphan = ReplyReference(messageId: "story_1", authorName: "Alice", previewText: "", isStoryReply: true)
        #expect(!orphan.isAdmissible(conversationIsDirect: true, participantUserId: "alice"))
    }

    // MARK: - Le routage à l'envoi

    @Test("envoi dans le DM de l'auteur : storyReplyToId part, replyToId non")
    func route_authorDirect_carriesStoryReply() {
        let pending = Self.story().toReplyReference
        let route = OutgoingReplyRoute(pending: pending, conversationIsDirect: true, participantUserId: "alice")
        #expect(route.storyReplyToId == "story_1")
        #expect(route.replyToId == nil)
        #expect(route.storyReference == pending)
        #expect(route.hasReply)
    }

    @Test("envoi dans un groupe : la citation de story est lâchée ENTIÈRE")
    func route_group_dropsStoryReply() {
        let route = OutgoingReplyRoute(pending: Self.mood().toReplyReference, conversationIsDirect: false, participantUserId: nil)
        #expect(route.storyReplyToId == nil)
        #expect(route.replyToId == nil)
        #expect(route.storyReference == nil)
        #expect(!route.hasReply)
    }

    @Test("envoi dans le DM d'un autre : la citation de story est lâchée")
    func route_otherDirect_dropsStoryReply() {
        let route = OutgoingReplyRoute(pending: Self.story().toReplyReference, conversationIsDirect: true, participantUserId: "carol")
        #expect(route == OutgoingReplyRoute(pending: nil, conversationIsDirect: true, participantUserId: "carol"))
    }

    @Test("une citation de message part en replyToId, jamais en storyReplyToId")
    func route_messageQuote_carriesReplyToId() {
        let route = OutgoingReplyRoute(pending: Self.messageQuote(), conversationIsDirect: false, participantUserId: nil)
        #expect(route.replyToId == "msg_1")
        #expect(route.storyReplyToId == nil)
        #expect(route.storyReference == nil)
    }

    @Test("un identifiant vide ne fait partir aucune réponse")
    func route_emptyId_noReply() {
        let blank = ReplyReference(messageId: "", authorName: "Bob", previewText: "")
        #expect(!OutgoingReplyRoute(pending: blank, conversationIsDirect: true, participantUserId: "bob").hasReply)
    }
}
