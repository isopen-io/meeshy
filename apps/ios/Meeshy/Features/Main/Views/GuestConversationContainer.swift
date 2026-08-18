import SwiftUI
import MeeshySDK
import MeeshyUI

struct GuestSession {
    let identifier: String
    var context: AnonymousSessionContext?
    /// La personne a CHOISI d'entrer sans compte alors qu'elle en a un.
    ///
    /// Sans ce drapeau, le conteneur invité se démonterait aussitôt : sa
    /// présentation exige `!isAuthenticated`, garde qui protège d'un tout autre
    /// cas — un lien traité AVANT la fin de la vérification de session, qui
    /// laisserait un utilisateur pourtant connecté échoué dans un flux invité.
    /// Distinguer l'intention de l'accident permet de garder cette protection
    /// tout en autorisant le choix délibéré.
    var isDeliberate: Bool = false
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
                anonymousSession: context,
                showsOwnConnectionBanner: true
            )
        } else {
            JoinFlowSheet(identifier: session.identifier) { joinResponse in
                let ctx = joinResponse.toSessionContext
                onSessionCreated(ctx)
            }
        }
    }
}
