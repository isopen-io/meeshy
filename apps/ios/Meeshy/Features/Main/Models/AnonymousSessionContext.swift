import Foundation
import MeeshySDK

struct AnonymousSessionContext: Codable {
    let sessionToken: String
    let participantId: String
    let permissions: ParticipantPermissions
    let linkId: String
    let conversationId: String
}

extension AnonymousJoinResponse {
    var toSessionContext: AnonymousSessionContext {
        AnonymousSessionContext(
            sessionToken: sessionToken,
            participantId: participant.id,
            permissions: participant.permissions,
            linkId: linkId,
            conversationId: conversation.id
        )
    }
}
