import SwiftUI
import MeeshySDK
import MeeshyUI

struct GuestSession {
    let identifier: String
    var context: AnonymousSessionContext?
}

struct GuestConversationContainer: View {
    let session: GuestSession
    let onSessionCreated: (AnonymousSessionContext) -> Void
    let onDismiss: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        if let context = session.context {
            ConversationView(
                conversation: Conversation(
                    id: context.conversationId,
                    identifier: session.identifier,
                    type: .group
                ),
                anonymousSession: context
            )
        } else {
            JoinFlowSheet(identifier: session.identifier) { joinResponse in
                let ctx = joinResponse.toSessionContext
                onSessionCreated(ctx)
            }
        }
    }
}
