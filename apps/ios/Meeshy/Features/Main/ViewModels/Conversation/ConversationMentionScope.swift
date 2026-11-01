import SwiftUI
import MeeshySDK

/// **Ce qu'une mention ferait dans UNE conversation** (#14066, #14071) : son type,
/// son interlocuteur (directe) et l'appartenance du lecteur. C'est ce qui borne la
/// liste `@` à ce que la passerelle garderait à l'envoi (`MentionReach`, miroir de
/// `mentionableScope`).
///
/// `unknown` est le repli fail-closed : une surface qui répond dans une
/// conversation sans savoir laquelle ne propose personne.
struct ConversationMentionTarget: Equatable, Sendable {
    let conversationId: String?
    let conversationType: String?
    let interlocutorId: String?
    let isMember: Bool

    static let unknown = ConversationMentionTarget(conversationId: nil, conversationType: nil, interlocutorId: nil, isMember: false)
}

/// **La liste `@` d'un fil ne propose que ce qu'une mention ferait ICI.**
///
/// La ligne de liste qui ouvre le fil connaît le type de la conversation, son
/// interlocuteur et le rang du lecteur (`currentUserRole`, servi par la passerelle
/// au seul participant actif, à défaut relu dans le roster). Un invité de lien
/// est membre par sa session. Rang inconnu ⇒ non-membre : rien n'est proposé.
@MainActor
enum ConversationMentionScope {

    static func target(for conversation: Conversation?, anonymousSession: AnonymousSessionContext?) -> ConversationMentionTarget {
        guard let conversation else { return .unknown }
        return ConversationMentionTarget(
            conversationId: conversation.id,
            conversationType: conversation.type.rawValue,
            interlocutorId: conversation.participantUserId,
            isMember: anonymousSession != nil || conversation.currentUserRole != nil
        )
    }

    static func applying(
        _ conversation: Conversation?,
        anonymousSession: AnonymousSessionContext?,
        to viewModel: ConversationViewModel
    ) -> ConversationViewModel {
        viewModel.mentionController.scope(to: target(for: conversation, anonymousSession: anonymousSession))
        return viewModel
    }

    /// Le fil ouvert par son seul id (`conversation == nil` à l'ouverture) est
    /// fail-closed jusqu'à ce que la conversation arrive ; elle se relit à
    /// chaque repeinte (`admitRepainted`), rang du lecteur compris.
    static func rescope(_ viewModel: ConversationViewModel, to conversation: Conversation, anonymousSession: AnonymousSessionContext?) {
        viewModel.mentionController.scope(to: target(for: conversation, anonymousSession: anonymousSession))
    }

    /// Une barre qui répond DANS une conversation hors du fil (la réponse à une
    /// pièce, depuis la galerie) : elle interroge les suggestions de CETTE
    /// conversation et en prend la portée. Sans cible connue, personne.
    static func apply(_ target: ConversationMentionTarget?, to controller: MentionComposerController) {
        let resolved = target ?? .unknown
        if let conversationId = resolved.conversationId {
            controller.retarget(.conversation(id: conversationId))
        }
        controller.scope(to: resolved)
    }
}

// MARK: - La conversation des plein écrans

private struct ConversationMentionTargetKey: EnvironmentKey {
    static let defaultValue: ConversationMentionTarget? = nil
}

extension EnvironmentValues {
    /// **La conversation où répond un plein écran** (galerie, vocal) : l'hôte du
    /// fil la pose sur la vue qu'il présente, la barre de réponse la lit. Absente
    /// ⇒ `nil`, et la barre est fail-closed.
    var conversationMentionTarget: ConversationMentionTarget? {
        get { self[ConversationMentionTargetKey.self] }
        set { self[ConversationMentionTargetKey.self] = newValue }
    }
}
