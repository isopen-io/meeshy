import SwiftUI
import MeeshySDK
import MeeshyUI

/// D'où vient une session invitée : un lien de partage, ou l'entrée World
/// Wide de l'écran de connexion (#10006), qui sait déjà ce que `GET /world` a
/// servi.
enum GuestSessionOrigin: Equatable {
    case shareLink
    case world(WorldEntry)
}

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
    var origin: GuestSessionOrigin = .shareLink

    /// La conversation que le fil ouvre une fois la session obtenue. World
    /// Wide s'annonce par ce que le serveur a servi — son type global, son
    /// titre, son effectif — avant que le détail ne revienne du réseau.
    func conversationShell(for context: AnonymousSessionContext) -> Conversation {
        switch origin {
        case .shareLink:
            return Conversation(id: context.conversationId, identifier: identifier, type: .group)
        case .world(let entry):
            return Conversation(
                id: context.conversationId,
                identifier: entry.identifier,
                type: .global,
                title: entry.title,
                memberCount: entry.memberCount,
                memberCountCapped: entry.memberCountCapped == true
            )
        }
    }
}

struct GuestConversationContainer: View {
    let session: GuestSession
    let onSessionCreated: (AnonymousSessionContext) -> Void
    /// « Se connecter » / « Créer un compte » depuis la page d'invitation.
    let onAccountRequest: (InviteLandingChoice) -> Void

    var body: some View {
        if let context = session.context {
            ConversationView(
                conversation: session.conversationShell(for: context),
                anonymousSession: context,
                showsOwnConnectionBanner: true
            )
            .reportsConversationViewing(context.conversationId)
        } else if case .world(let entry) = session.origin {
            // #10006 — nom → langue → fil, depuis l'écran de connexion.
            WorldGuestEntryView(entry: entry, onEntered: onSessionCreated)
        } else {
            // Une entrée DÉLIBÉRÉE a déjà vu la page d'invitation (#7795) et y a
            // choisi l'anonymat : le formulaire s'ouvre directement.
            JoinFlowSheet(
                identifier: session.identifier,
                isSignedIn: session.isDeliberate,
                entry: session.isDeliberate ? .anonymousForm : .landing,
                onAccountRequest: onAccountRequest
            ) { joinResponse in
                let ctx = joinResponse.toSessionContext
                onSessionCreated(ctx)
            }
        }
    }
}
