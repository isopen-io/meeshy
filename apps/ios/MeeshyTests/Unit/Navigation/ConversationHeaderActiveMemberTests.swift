import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

// Les trois participants les plus actifs de l'en-tête sont une MISE EN AVANT
// de ces personnes (#7831) : le toucher mène à leur story non vue, sinon à
// leur profil — jamais plus à un repli de la bande.

@MainActor
final class ConversationHeaderActiveMemberTests: XCTestCase {

    // MARK: - Factories

    private func makeMessage(
        senderId: String,
        senderName: String = "Awa",
        senderUserId: String? = nil,
        senderIsAnonymous: Bool = false,
        isMe: Bool = false
    ) -> Message {
        Message(
            conversationId: "conv-1",
            senderId: senderId,
            content: "salut",
            senderName: senderName,
            senderUsername: senderName.lowercased(),
            senderUserId: senderUserId,
            senderIsAnonymous: senderIsAnonymous,
            isMe: isMe
        )
    }

    private func makeProfile(isAnonymous: Bool, participantId: String? = "participant-9") -> ProfileSheetUser {
        ProfileSheetUser(
            userId: isAnonymous ? nil : "user-1",
            username: "awa",
            participantId: participantId,
            isAnonymous: isAnonymous
        )
    }

    // MARK: - Toucher

    func test_tapTarget_unreadStory_opensStory() {
        XCTAssertEqual(ConversationHeaderMemberTap.resolve(storyState: .unread), .story)
    }

    func test_tapTarget_readStory_opensProfile() {
        XCTAssertEqual(ConversationHeaderMemberTap.resolve(storyState: .read), .profile)
    }

    func test_tapTarget_noStory_opensProfile() {
        XCTAssertEqual(ConversationHeaderMemberTap.resolve(storyState: .none), .profile)
    }

    // MARK: - Appui long

    func test_menuEntries_withUnreadStory_listsStoryProfileDetailsMessageInOrder() {
        XCTAssertEqual(
            ConversationHeaderMemberMenuEntry.entries(storyState: .unread),
            [.viewStory, .viewProfile, .conversationDetails, .sendMessage]
        )
    }

    func test_menuEntries_withReadStory_stillOffersTheStory() {
        XCTAssertEqual(
            ConversationHeaderMemberMenuEntry.entries(storyState: .read),
            [.viewStory, .viewProfile, .conversationDetails, .sendMessage]
        )
    }

    func test_menuEntries_withoutStory_startsWithProfile() {
        XCTAssertEqual(
            ConversationHeaderMemberMenuEntry.entries(storyState: .none),
            [.viewProfile, .conversationDetails, .sendMessage]
        )
    }

    // MARK: - Classement et identité

    func test_ranked_ordersByMessageCountAndKeepsThree() {
        let messages = ["a", "b", "b", "c", "c", "c", "d", "d", "d", "d"]
            .map { makeMessage(senderId: $0, senderName: $0.uppercased()) }

        let ranked = ConversationActiveMember.ranked(from: messages, fallbackColor: "#6366F1")

        XCTAssertEqual(ranked.map(\.id), ["d", "c", "b"])
    }

    func test_ranked_excludesOwnMessages() {
        let messages = [
            makeMessage(senderId: "me", isMe: true),
            makeMessage(senderId: "me", isMe: true),
            makeMessage(senderId: "other"),
        ]

        let ranked = ConversationActiveMember.ranked(from: messages, fallbackColor: "#6366F1")

        XCTAssertEqual(ranked.map(\.id), ["other"])
    }

    func test_ranked_registeredSender_carriesAccountProfile() {
        let messages = [makeMessage(senderId: "participant-1", senderUserId: "user-1")]

        let profile = ConversationActiveMember.ranked(from: messages, fallbackColor: "#6366F1").first?.profile

        XCTAssertEqual(profile?.userId, "user-1")
        XCTAssertEqual(profile?.isAnonymous, false)
    }

    func test_ranked_anonymousSender_carriesParticipantIdentityWithoutAccount() {
        let messages = [makeMessage(senderId: "participant-7", senderIsAnonymous: true)]

        let profile = ConversationActiveMember.ranked(from: messages, fallbackColor: "#6366F1").first?.profile

        XCTAssertNil(profile?.userId)
        XCTAssertEqual(profile?.participantId, "participant-7")
        XCTAssertEqual(profile?.isAnonymous, true)
    }

    // MARK: - Chemin de la fiche (le même que l'avatar des bulles)

    func test_openProfile_registeredUser_presentsAccountProfile() {
        let router = Router()
        let user = makeProfile(isAnonymous: false)

        router.openProfile(user, inConversation: "conv-1")

        XCTAssertEqual(router.deepLinkProfileUser, user)
        XCTAssertNil(router.participantProfileTarget)
    }

    func test_openProfile_anonymousParticipant_presentsParticipantSheet() {
        let router = Router()

        router.openProfile(makeProfile(isAnonymous: true), inConversation: "conv-1")

        XCTAssertEqual(
            router.participantProfileTarget,
            ParticipantProfileTarget(conversationId: "conv-1", participantId: "participant-9")
        )
        XCTAssertNil(router.deepLinkProfileUser)
    }

    func test_openProfile_anonymousWithoutConversation_fallsBackToProfileSheet() {
        let router = Router()
        let user = makeProfile(isAnonymous: true)

        router.openProfile(user, inConversation: nil)

        XCTAssertEqual(router.deepLinkProfileUser, user)
        XCTAssertNil(router.participantProfileTarget)
    }
}
