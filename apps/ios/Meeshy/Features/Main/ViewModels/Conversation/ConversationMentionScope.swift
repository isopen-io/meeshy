import Foundation
import MeeshySDK

/// **La liste `@` d'un fil ne propose que ce qu'une mention ferait ICI** (#14071).
///
/// La ligne de liste qui ouvre le fil connaît le type de la conversation et,
/// pour une directe, son interlocuteur : c'est ce qui borne la liste à ce que
/// la passerelle garderait à l'envoi (`MentionReach`, miroir de
/// `mentionableScope`). Posé une fois, à l'ouverture, avant la première frappe.
@MainActor
enum ConversationMentionScope {

    static func applying(_ conversation: Conversation?, to viewModel: ConversationViewModel) -> ConversationViewModel {
        viewModel.mentionController.scope(
            toConversationType: conversation?.type.rawValue,
            interlocutorId: conversation?.participantUserId
        )
        return viewModel
    }
}
