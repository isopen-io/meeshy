import Foundation

/// CE QU'UN LECTEUR PEUT FAIRE D'UNE CONVERSATION (#11205, #11209) — miroir
/// exact de `conversationActionsFor`
/// (`packages/shared/utils/conversation-action-policy.ts`), jumelle PURE de
/// `MessageActionPolicy`. `ConversationActionPolicyVectorTests` rejoue la
/// grille type × profil que la loi TypeScript a produite.
///
/// Rang EFFECTIF de `conversation-authority` (`ConversationViewerAuthority`) :
/// ADMIN ou BIGBOSS de plateforme MEMBRE ⇒ créateur, jamais au-dessus ;
/// MODERATOR, AUDIT, ANALYST y sont des membres ; rang illisible < membre.
/// Fermé en plus : un `direct` n'a pas d'autorité (ses rangs sont un ordre
/// d'arrivée) ; Global ne se renomme, ne se quitte ni ne se supprime pour tous,
/// et seuls ADMIN/BIGBOSS y invitent ; une conversation terminée ne se modifie
/// plus ; un type inconnu n'ouvre rien qui en dépende. L'appel suit
/// `CallPermission.canStartCall` ; le badge suit
/// `MessageActionPolicy.Conversation.isEndToEnd`, la loi qui retire les
/// services aux messages.
public enum ConversationActionPolicy {

    public typealias Conversation = MessageActionPolicy.Conversation

    public struct Input: Equatable, Sendable {
        public let conversation: Conversation
        public let viewer: ConversationViewerAuthority

        public init(conversation: Conversation, viewer: ConversationViewerAuthority) {
            self.conversation = conversation
            self.viewer = viewer
        }
    }

    public struct Actions: Equatable, Sendable {
        public let rename: Bool
        public let invite: Bool
        public let leave: Bool
        public let deleteForAll: Bool
        public let hide: Bool
        public let report: Bool
        public let manageMembers: Bool
        public let adminOpen: Bool
        public let call: Bool
        public let videoCall: Bool
        public let e2eeBadge: Bool
    }

    private static let authorityTypes: Set<String> = ["group", "public", "broadcast"]
    private static let managedTypes: Set<String> = authorityTypes.union(["global"])

    public static func actions(for input: Input) -> Actions {
        let conversation = input.conversation
        let viewer = input.viewer
        let rank = viewer.effectiveRank
        let open = !conversation.isClosed
        let authority = authorityTypes.contains(conversation.type)
        let global = conversation.isGlobal
        let moderates = rank >= MemberRole.moderator.level
        let registered = viewer.isRegistered
        let callable = open && viewer.isActiveMember && CallPermission.canStartCall(
            CallPermission.Context(
                conversationType: conversation.type,
                viewerIsCreator: (viewer.conversationRoleRaw ?? "").lowercased() == MemberRole.creator.rawValue,
                viewerConversationRole: viewer.conversationRoleRaw,
                viewerPlatformRole: viewer.platformRoleRaw,
                viewerIsGuest: !registered
            )
        )
        let invites = global ? viewer.isActiveMember && viewer.administersPlatform : authority && moderates
        return Actions(
            rename: open && authority && moderates,
            invite: open && invites,
            leave: open && authority && viewer.isActiveMember,
            deleteForAll: open && authority && rank >= MemberRole.admin.level,
            hide: registered,
            report: registered,
            manageMembers: open && managedTypes.contains(conversation.type) && moderates,
            adminOpen: viewer.administersPlatform,
            call: callable,
            videoCall: callable,
            e2eeBadge: conversation.isEndToEnd
        )
    }
}
