import Foundation
import MeeshySDK

struct AnonymousSessionContext: Codable {
    let sessionToken: String
    let participantId: String
    let permissions: ParticipantPermissions
    let linkId: String
    let conversationId: String
    /// Les familles que cet invité peut joindre (#10001, #10006) — `nil` quand
    /// le lien ne restreint rien. Optionnel au décodage : une session
    /// enregistrée avant ce champ se relit sans restriction déclarée, et le
    /// serveur reste juge de chaque envoi.
    var allowedAttachmentKinds: [GuestAttachmentKind]? = nil

    var attachmentAllowance: GuestAttachmentAllowance {
        GuestAttachmentAllowance(kinds: allowedAttachmentKinds)
    }
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
            conversationId: conversation.id,
            allowedAttachmentKinds: conversation.attachmentAllowance.kinds
        )
    }
}
