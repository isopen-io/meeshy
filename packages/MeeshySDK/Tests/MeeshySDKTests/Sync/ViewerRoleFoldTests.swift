import Foundation
import Testing
@testable import MeeshySDK

/// #15987 — le rang du LECTEUR change : sa capacité suit. `participant:role-updated` qui le
/// nomme porte sa capacité recalculée ; un serveur antérieur ne la porte pas, et celle de
/// l'ancien rang s'efface (la règle locale reprend).
struct ViewerRoleFoldTests {

    private func row(role: String = "member", canMakeObsolete: Bool? = false) -> MeeshyConversation {
        var conversation = MeeshyConversation(id: "c1", identifier: "c1", type: .group, lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000))
        conversation.currentUserRole = role
        conversation.viewerCapabilities = canMakeObsolete.map { ConversationViewerCapabilities(canMakeObsolete: $0) }
        return conversation
    }

    private func event(_ extra: String = "", userId: String = "me", role: String = "admin") throws -> ParticipantRoleUpdatedEvent {
        let json = #"{"conversationId":"c1","userId":"\#(userId)","newRole":"\#(role)","updatedBy":"u-z"\#(extra)}"#
        return try JSONDecoder().decode(ParticipantRoleUpdatedEvent.self, from: Data(json.utf8))
    }

    @Test func test_decode_servedCapability_isCarried() throws {
        #expect(try event(#","viewerCapabilities":{"canMakeObsolete":true}"#).viewerCapabilities?.canMakeObsolete == true)
        #expect(try event().viewerCapabilities == nil)
        #expect(try event(#","viewerCapabilities":"oui""#).viewerCapabilities?.canMakeObsolete == nil)
    }

    @Test func test_fold_promotedReader_takesTheServedCapability() throws {
        let folded = ViewerRoleFold.applying(try event(#","viewerCapabilities":{"canMakeObsolete":true}"#), to: [row()], readerId: "me")
        #expect(folded?.first?.viewerCapabilities?.canMakeObsolete == true)
        #expect(folded?.first?.currentUserRole == "admin")
    }

    @Test func test_fold_demotedReader_losesTheCapability() throws {
        let folded = ViewerRoleFold.applying(
            try event(#","viewerCapabilities":{"canMakeObsolete":false}"#, role: "member"),
            to: [row(role: "admin", canMakeObsolete: true)], readerId: "me")
        #expect(folded?.first?.viewerCapabilities?.canMakeObsolete == false)
        #expect(folded?.first?.currentUserRole == "member")
    }

    @Test func test_fold_olderServer_clearsTheStaleCapability() throws {
        let folded = ViewerRoleFold.applying(try event(), to: [row()], readerId: "me")
        #expect(folded?.first?.viewerCapabilities == nil)
        #expect(folded?.first?.currentUserRole == "admin")
    }

    @Test func test_fold_anotherMember_changesNothing() throws {
        #expect(ViewerRoleFold.applying(try event(#","viewerCapabilities":{"canMakeObsolete":true}"#, userId: "alice"), to: [row()], readerId: "me") == nil)
        #expect(ViewerRoleFold.applying(try event(), to: [row()], readerId: "") == nil)
    }

    @Test func test_fold_unknownConversation_changesNothing() throws {
        let other = MeeshyConversation(id: "c2", identifier: "c2", type: .group, lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000))
        #expect(ViewerRoleFold.applying(try event(), to: [other], readerId: "me") == nil)
    }
}
