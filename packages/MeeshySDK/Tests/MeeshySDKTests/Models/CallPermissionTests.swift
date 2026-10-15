import Testing
@testable import MeeshySDK

/// QUI PEUT LANCER UN APPEL (#10207, directive porteur du 2026-10-11) — miroir
/// des vecteurs de `packages/shared/utils/call-permission.test.ts`. Rejoindre
/// un appel déjà en cours n'est pas gouverné ici.
struct CallPermissionTests {

    private func viewer(
        type: String = "group",
        isCreator: Bool = false,
        conversationRole: String? = "member",
        platformRole: String? = "USER",
        isGuest: Bool = false
    ) -> CallPermission.Context {
        CallPermission.Context(
            conversationType: type,
            viewerIsCreator: isCreator,
            viewerConversationRole: conversationRole,
            viewerPlatformRole: platformRole,
            viewerIsGuest: isGuest
        )
    }

    @Test func anInvitedVisitorNeverStartsACall_evenInADirect() {
        #expect(!CallPermission.canStartCall(viewer(type: "direct", isGuest: true)))
        #expect(!CallPermission.canStartCall(viewer(conversationRole: "admin", isGuest: true)))
    }

    @Test func nobodyStartsACallInAGlobalConversation() {
        #expect(!CallPermission.canStartCall(viewer(type: "global")))
        #expect(!CallPermission.canStartCall(viewer(type: "global", isCreator: true)))
        #expect(!CallPermission.canStartCall(viewer(type: "global", conversationRole: "creator")))
        #expect(!CallPermission.canStartCall(viewer(type: "global", platformRole: "BIGBOSS")))
        #expect(!CallPermission.canStartCall(viewer(type: "GLOBAL", platformRole: "ADMIN")))
    }

    @Test func inAPublicConversation_anOrdinaryMemberOrAModeratorDoesNotStartACall() {
        #expect(!CallPermission.canStartCall(viewer(type: "public")))
        #expect(!CallPermission.canStartCall(viewer(type: "public", conversationRole: "moderator")))
        #expect(!CallPermission.canStartCall(viewer(type: "public", platformRole: "MODERATOR")))
    }

    @Test func inAPublicConversation_theCreatorStartsTheCall() {
        #expect(CallPermission.canStartCall(viewer(type: "public", isCreator: true)))
        #expect(CallPermission.canStartCall(viewer(type: "public", conversationRole: "creator")))
        #expect(CallPermission.canStartCall(viewer(type: "public", conversationRole: "CREATOR")))
    }

    @Test func inAPublicConversation_aConversationAdminStartsTheCall_whateverItsCase() {
        #expect(CallPermission.canStartCall(viewer(type: "public", conversationRole: "admin")))
        #expect(CallPermission.canStartCall(viewer(type: "public", conversationRole: "ADMIN")))
    }

    @Test func inAPublicConversation_aPlatformAdministratorStartsTheCall() {
        #expect(CallPermission.canStartCall(viewer(type: "public", platformRole: "ADMIN")))
        #expect(CallPermission.canStartCall(viewer(type: "public", platformRole: "bigboss")))
    }

    @Test func inAPublicConversation_anAbsentRoleFailsClosed() {
        #expect(!CallPermission.canStartCall(viewer(type: "public", conversationRole: nil, platformRole: nil)))
    }

    @Test func inADirectOrAGroup_aMemberStartsTheCallAsBefore() {
        #expect(CallPermission.canStartCall(viewer(type: "direct")))
        #expect(CallPermission.canStartCall(viewer(type: "group")))
    }

    @Test func anyOtherOrUnknownTypeFailsClosed() {
        #expect(!CallPermission.canStartCall(viewer(type: "broadcast")))
        #expect(!CallPermission.canStartCall(viewer(type: "community")))
        #expect(!CallPermission.canStartCall(viewer(type: "something-new")))
    }
}
