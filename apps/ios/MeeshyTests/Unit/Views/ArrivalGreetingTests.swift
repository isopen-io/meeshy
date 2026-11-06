import XCTest
import MeeshySDK
@testable import Meeshy

/// #16338 — le salut d'un arrivant se TOUCHE : l'invite « dis-lui salut » de
/// l'avis d'arrivée écrit `@pseudo ` de chaque arrivant dans le composeur.
@MainActor
final class ArrivalGreetingTests: XCTestCase {

    // MARK: - L'invite se détache de la phrase du catalogue

    func test_split_catalogLine_separatesSentenceAndInvite() {
        let line = ArrivalGreeting.split("Aïcha et Tom viennent d’arriver — dis-leur salut")
        XCTAssertEqual(line.sentence, "Aïcha et Tom viennent d’arriver")
        XCTAssertEqual(line.invite, "dis-leur salut")
    }

    func test_split_lineWithoutDash_hasNoInvite() {
        let line = ArrivalGreeting.split("Aïcha a rejoint la conversation")
        XCTAssertEqual(line.sentence, "Aïcha a rejoint la conversation")
        XCTAssertNil(line.invite)
    }

    func test_split_otherLanguage_keepsItsOwnInvite() {
        let line = ArrivalGreeting.split("Aïcha just arrived — say hi")
        XCTAssertEqual(line.invite, "say hi")
    }

    // MARK: - Les pseudos à saluer

    func test_handles_severalArrivals_keepsOrderDropsSelfAndUnknown() {
        let handles = ArrivalGreeting.handles(
            of: [("p1", "aicha"), ("p2", nil), ("p3", "tom"), ("p4", "me")],
            resolving: { $0 == "p2" ? "zoe" : nil },
            excluding: "me"
        )
        XCTAssertEqual(handles, ["aicha", "zoe", "tom"])
    }

    func test_handles_anonymousOnly_isEmpty() {
        XCTAssertEqual(ArrivalGreeting.handles(of: [("p1", nil)], resolving: { _ in nil }, excluding: nil), [])
    }

    // MARK: - Ce qui s'écrit dans le composeur

    func test_inserting_emptyDraft_writesAllMentionsThenSpace() {
        XCTAssertEqual(ArrivalGreeting.inserting(["a", "b"], into: ""), "@a @b ")
    }

    func test_inserting_draftWithText_appendsAfterASpace() {
        XCTAssertEqual(ArrivalGreeting.inserting(["a"], into: "Bienvenue"), "Bienvenue @a ")
        XCTAssertEqual(ArrivalGreeting.inserting(["a"], into: "Bienvenue "), "Bienvenue @a ")
    }

    func test_inserting_alreadyMentioned_isNotRepeated() {
        XCTAssertEqual(ArrivalGreeting.inserting(["a", "b"], into: "@a salut "), "@a salut @b ")
        XCTAssertEqual(ArrivalGreeting.inserting(["a"], into: "@a "), "@a ")
    }

    // MARK: - De l'avis touché au brouillon

    private func arrivalsLine(_ arrivals: [ArrivalsNoticeMetadata.Arrival]) -> Message {
        Message(id: "notice", conversationId: "c1", senderId: arrivals.first?.participantId ?? "", content: "",
                arrivalsNotice: ArrivalsNoticeMetadata(arrivals: arrivals, count: arrivals.count,
                                                       windowStartedAt: "2026-11-05T10:00:00Z"))
    }

    func test_draft_severalArrivals_mentionsEachKnownArrival() {
        let line = arrivalsLine([
            .init(participantId: "p1", displayName: "Aïcha", username: "aicha"),
            .init(participantId: "p2", displayName: "Tom"),
            .init(participantId: "p3", displayName: "Zoé"),
        ])
        let tomSpoke = Message(id: "m1", conversationId: "c1", senderId: "p2", content: "yo", senderUsername: "tom")
        XCTAssertEqual(ArrivalGreeting.draft(greeting: "notice", in: [line, tomSpoke], ownHandle: "me", draft: ""),
                       "@aicha @tom ")
    }

    func test_draft_singleJoin_mentionsTheArrival() {
        let join = Message(id: "notice", conversationId: "c1", senderId: "p1", content: "",
                           joinNotice: JoinNoticeMetadata(participantId: "p1", displayName: "Aïcha",
                                                          isAnonymous: false, viaShareLink: false, username: "aicha"))
        XCTAssertEqual(ArrivalGreeting.draft(greeting: "notice", in: [join], ownHandle: nil, draft: "Salut"),
                       "Salut @aicha ")
    }

    func test_draft_noticeGone_returnsNil() {
        XCTAssertNil(ArrivalGreeting.draft(greeting: "absent", in: [], ownHandle: nil, draft: "x"))
    }
    // MARK: - L'invite que l'avis porte, pour tous les modes de lecture

    private func content(of message: Message) -> BubbleContent {
        BubbleContent(message: message, translations: [], preferredTranslation: nil, currentUserId: "reader")
    }

    func test_content_arrivalsLine_carriesItsInvite_soFocalAndScriptRowsCanRenderIt() {
        var line = arrivalsLine([.init(participantId: "p1", displayName: "Testuser", username: "testuser")])
        line.messageSource = .system
        XCTAssertNotNil(content(of: line).arrivalsInvite, "la ligne d'arrivées porte son invite dans le modèle partagé par Bulles, Focal et Script")
    }

    func test_content_joinOfAnotherAccount_carriesItsInvite() {
        var join = Message(id: "notice", conversationId: "c1", senderId: "p1", content: "",
                           joinNotice: JoinNoticeMetadata(participantId: "p1", displayName: "Aïcha",
                                                          isAnonymous: false, viaShareLink: false, username: "aicha"))
        join.messageSource = .system
        XCTAssertNotNil(content(of: join).arrivalsInvite)
    }

    func test_content_anonymousJoin_hasNoInvite() {
        var join = Message(id: "notice", conversationId: "c1", senderId: "p1", content: "",
                           joinNotice: JoinNoticeMetadata(participantId: "p1", displayName: "Visiteur",
                                                          isAnonymous: true, viaShareLink: true, username: nil))
        join.messageSource = .system
        XCTAssertNil(content(of: join).arrivalsInvite)
    }

    func test_content_ordinaryMessage_hasNoInvite() {
        let message = Message(id: "m", conversationId: "c1", senderId: "p1", content: "Bonjour — à demain")
        XCTAssertNil(content(of: message).arrivalsInvite)
    }
}
