import Foundation
import MeeshySDK

/// Encapsulates the reply-context cleanup logic shared between the composer
/// send paths and the reply banner cancel button.
///
/// `ConversationView`'s composer state mirrors a `ReplyReference` in memory
/// while `DraftStore` persists the reply id alongside the draft text so the
/// banner survives an app kill. Without this helper, the two were cleaned up
/// at different points: the in-memory reference was dropped on send/cancel
/// but the persisted `replyToId` lingered, causing the banner to reappear
/// the next time the user re-entered the conversation. Calling
/// `clear(pendingReplyReference:)` purges both atomically from the same
/// call site.
@MainActor
struct ReplyContextCleaner {
    let conversationId: String
    let draftStore: DraftStore

    init(conversationId: String, draftStore: DraftStore = .shared) {
        self.conversationId = conversationId
        self.draftStore = draftStore
    }

    /// Clears the in-memory reply reference and removes the persisted
    /// `replyToId` from the conversation's stored draft. Text and attachments
    /// of the draft are preserved.
    func clear(pendingReplyReference: inout ReplyReference?) {
        pendingReplyReference = nil
        draftStore.clearReplyReference(conversationId: conversationId)
    }
}
