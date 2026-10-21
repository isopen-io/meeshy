import Foundation
import MeeshySDK

enum ComposerSendRelation {
    static func of(_ route: OutgoingReplyRoute, citing anchor: QuotedAttachmentSend?) -> MessageRelation {
        if let storyReplyToId = route.storyReplyToId {
            return .storyReply(to: StoryID(storyReplyToId), reference: route.storyReference)
        }
        if let replyToId = route.replyToId {
            return .reply(to: MessageID(replyToId), citing: anchor)
        }
        return .none
    }
}
