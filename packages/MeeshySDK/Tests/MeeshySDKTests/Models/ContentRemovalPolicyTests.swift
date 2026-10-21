import Testing
@testable import MeeshySDK

/// QUI PEUT RETIRER LE CONTENU D'UN AUTRE, ET AVEC QUEL MOTIF (#11151) — miroir
/// du contrat passerelle : un message se retire dans un groupe, une conversation
/// publique, globale ou de diffusion, jamais en direct ; une publication ou un
/// commentaire, par la modération de la plateforme seulement.
struct ContentRemovalPolicyTests {

    private func mayRemoveMessage(
        mine: Bool = false,
        type: MeeshyConversation.ConversationType = .group,
        conversationRole: String? = "member",
        platformRole: String? = "USER"
    ) -> Bool {
        ContentRemovalPolicy.mayRemoveMessage(
            authoredByViewer: mine,
            conversationType: type,
            conversationRole: conversationRole,
            platformRole: platformRole
        )
    }

    @Test(arguments: ["admin", "moderator", "creator", "ADMIN", "Creator"])
    func test_mayRemoveMessage_conversationModeratorInGroup_isTrue(role: String) {
        #expect(mayRemoveMessage(conversationRole: role))
    }

    @Test(arguments: ["MODERATOR", "ADMIN", "BIGBOSS", "bigboss"])
    func test_mayRemoveMessage_platformModeratorAsMember_isTrue(role: String) {
        #expect(mayRemoveMessage(conversationRole: "member", platformRole: role))
    }

    @Test(arguments: [MeeshyConversation.ConversationType.group, .public, .global, .broadcast])
    func test_mayRemoveMessage_allowedConversationTypes_isTrue(type: MeeshyConversation.ConversationType) {
        #expect(mayRemoveMessage(type: type, conversationRole: "admin"))
    }

    @Test(arguments: [MeeshyConversation.ConversationType.direct, .community, .channel, .bot])
    func test_mayRemoveMessage_otherConversationTypes_isFalse(type: MeeshyConversation.ConversationType) {
        #expect(!mayRemoveMessage(type: type, conversationRole: "creator", platformRole: "BIGBOSS"))
    }

    @Test
    func test_mayRemoveMessage_ownMessage_isFalse() {
        #expect(!mayRemoveMessage(mine: true, conversationRole: "admin", platformRole: "ADMIN"))
    }

    @Test(arguments: ["AUDIT", "ANALYST", "USER", ""])
    func test_mayRemoveMessage_memberWithoutModerationRole_isFalse(role: String) {
        #expect(!mayRemoveMessage(conversationRole: "member", platformRole: role))
    }

    @Test
    func test_mayRemoveMessage_unknownRoles_isFalse() {
        #expect(!mayRemoveMessage(conversationRole: nil, platformRole: nil))
    }

    @Test(arguments: ["MODERATOR", "ADMIN", "BIGBOSS"])
    func test_mayRemovePublication_platformModeratorOnOthersContent_isTrue(role: String) {
        #expect(ContentRemovalPolicy.mayRemovePublication(authoredByViewer: false, platformRole: role))
    }

    @Test
    func test_mayRemovePublication_ownContent_isFalse() {
        #expect(!ContentRemovalPolicy.mayRemovePublication(authoredByViewer: true, platformRole: "BIGBOSS"))
    }

    @Test(arguments: ["USER", "AUDIT", "ANALYST", nil] as [String?])
    func test_mayRemovePublication_ordinaryRole_isFalse(role: String?) {
        #expect(!ContentRemovalPolicy.mayRemovePublication(authoredByViewer: false, platformRole: role))
    }

    @Test
    func test_normalizedReason_trimsSurroundingWhitespace() {
        #expect(ContentRemovalPolicy.normalizedReason("  Spam répété \n") == "Spam répété")
    }

    @Test(arguments: ["", "  ", "ab", " ab \n"])
    func test_normalizedReason_tooShort_isNil(raw: String) {
        #expect(ContentRemovalPolicy.normalizedReason(raw) == nil)
    }

    @Test
    func test_normalizedReason_atBounds_isKept() {
        #expect(ContentRemovalPolicy.normalizedReason("abc") == "abc")
        let longest = String(repeating: "a", count: 500)
        #expect(ContentRemovalPolicy.normalizedReason(longest) == longest)
    }

    @Test
    func test_normalizedReason_tooLong_isNil() {
        #expect(ContentRemovalPolicy.normalizedReason(String(repeating: "a", count: 501)) == nil)
    }
}
