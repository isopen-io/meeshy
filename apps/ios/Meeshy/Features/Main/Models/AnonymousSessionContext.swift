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
            permissions: ParticipantPermissions(
                canSendMessages: participant.canSendMessages,
                canSendFiles: participant.canSendFiles,
                canSendImages: participant.canSendImages,
                canSendVideos: false,
                canSendAudios: false,
                canSendLocations: false,
                canSendLinks: false
            ),
            linkId: linkId,
            conversationId: conversation.id
        )
    }
}
