import UIKit
import MeeshySDK

struct AttachmentSendIntent {
    let plan: [MultiAttachmentSendPlanner.PlannedMessage]
    let route: OutgoingReplyRoute
    let relation: MessageRelation
    let protection: MessageProtectionIntent
    let language: String
    let place: SharedPlace?
    let mediaFiles: [String: URL]
}

struct AttachmentSendBatch {
    let plan: [MultiAttachmentSendPlanner.PlannedMessage]
    let mediaGroupSends: [OutgoingMediaGroup]
    let mediaFiles: [String: URL]
    let thumbnails: [String: UIImage]
    let textGroup: MultiAttachmentSendPlanner.PlannedMessage?
    let textTempId: String?
    let place: SharedPlace?
    let relation: MessageRelation
    let replyToId: String?
    let protection: MessageProtectionIntent
    let language: String
    let currentUserId: String
    let guestAllowedKinds: [GuestAttachmentKind]?

    /// La bulle texte est posée dès le tap : le texte seul, ou un lieu sans groupe texte.
    static func textTempId(
        textGroup: MultiAttachmentSendPlanner.PlannedMessage?,
        place: SharedPlace?,
        generate: () -> String
    ) -> String? {
        let hasText = !(textGroup?.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        guard hasText || (textGroup == nil && place != nil) else { return nil }
        return generate()
    }

    func cleanupURLs() -> (audio: [URL], visual: [URL]) {
        (urls(of: .audio), urls(of: .visual))
    }

    private func urls(of kind: MultiAttachmentSendPlanner.Kind) -> [URL] {
        plan.filter { $0.kind == kind }.flatMap(\.attachments).compactMap { mediaFiles[$0.id] }
    }
}
