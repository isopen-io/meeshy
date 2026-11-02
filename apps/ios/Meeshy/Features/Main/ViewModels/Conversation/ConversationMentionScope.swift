import SwiftUI
import MeeshySDK

/// **Ce qu'une mention ferait dans UNE conversation** (#14066, #14071) : son type,
/// son interlocuteur (directe) et l'appartenance du lecteur. C'est ce qui borne la
/// liste `@` à ce que la passerelle garderait à l'envoi (`MentionReach`, miroir de
/// `mentionableScope`).
///
/// `unknown` est le repli fail-closed : une surface qui répond dans une
/// conversation sans savoir laquelle ne propose personne.
/// Lit les participants ACTIFS servis d'une conversation. `@concurrent` écrit :
/// sans isolement, le type deviendrait `nonisolated(nonsending)`, absent du
/// runtime d'iOS 16 et 17 (#8182).
typealias ServedMembersLoader = @Sendable @concurrent (String) async -> [String]

struct ConversationMentionTarget: Equatable, Sendable {
    let conversationId: String?
    let conversationType: String?
    let interlocutorId: String?
    let isMember: Bool
    /// Un invité de lien : la passerelle ne lui sert ni les membres ni la
    /// recherche (#10205) ; les auteurs du fil qu'elle lui a servis sont ses
    /// membres connus.
    let isGuest: Bool

    static let unknown = ConversationMentionTarget(
        conversationId: nil, conversationType: nil, interlocutorId: nil, isMember: false, isGuest: false
    )
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
            isMember: anonymousSession != nil || conversation.currentUserRole != nil,
            isGuest: anonymousSession != nil
        )
    }

    static func applying(
        _ conversation: Conversation?,
        anonymousSession: AnonymousSessionContext?,
        to viewModel: ConversationViewModel
    ) -> ConversationViewModel {
        viewModel.mentionController.scope(
            to: target(for: conversation, anonymousSession: anonymousSession),
            servedMembers: servedActiveMembers
        )
        return viewModel
    }

    /// Les participants ACTIFS servis de la conversation (première page) : les
    /// membres qu'un `@` propose en local, jamais les auteurs de l'historique.
    ///
    /// Seule une page FRAÎCHE compte — en cache `.fresh`, ou juste revalidée par
    /// le réseau : elle prouve l'appartenance du lecteur et ouvre une portée. Une
    /// page `.stale` / expirée peut porter un lecteur PARTI et des partis ; elle
    /// n'ouvre rien, et la portée reste celle du rang servi (`currentUserRole`).
    /// Un échec n'en rend aucun — la recherche distante suit.
    static let servedActiveMembers: ServedMembersLoader = { conversationId in
        if let fresh = await freshParticipants(conversationId) { return activeUserIds(fresh) }
        _ = try? await ParticipantService.shared.loadFirstPage(for: conversationId, forceRefresh: true)
        return await freshParticipants(conversationId).map(activeUserIds) ?? []
    }

    private static func freshParticipants(_ conversationId: String) async -> [PaginatedParticipant]? {
        guard case .fresh(let items, _) = await CacheCoordinator.shared.participants.load(for: conversationId) else { return nil }
        return items
    }

    nonisolated private static func activeUserIds(_ page: [PaginatedParticipant]) -> [String] {
        page.filter { $0.isActive != false }.compactMap(\.userId)
    }

    /// Le fil ouvert par son seul id (`conversation == nil` à l'ouverture) est
    /// fail-closed jusqu'à ce que la conversation arrive ; elle se relit à
    /// chaque repeinte (`admitRepainted`), rang du lecteur compris.
    static func rescope(_ viewModel: ConversationViewModel, to conversation: Conversation, anonymousSession: AnonymousSessionContext?) {
        viewModel.mentionController.scope(
            to: target(for: conversation, anonymousSession: anonymousSession),
            servedMembers: servedActiveMembers
        )
    }

    /// Une barre qui répond DANS une conversation hors du fil (la réponse à une
    /// pièce, depuis la galerie) : elle interroge les suggestions de CETTE
    /// conversation et en prend la portée. Sans cible connue, personne.
    static func apply(
        _ target: ConversationMentionTarget?,
        to controller: MentionComposerController,
        servedMembers: @escaping ServedMembersLoader = servedActiveMembers
    ) {
        let resolved = target ?? .unknown
        if let conversationId = resolved.conversationId {
            controller.retarget(.conversation(id: conversationId))
        }
        controller.scope(to: resolved, servedMembers: resolved.conversationId == nil ? nil : servedMembers)
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
