import Foundation

/// **Qui peut RETIRER le contenu d'un autre, et avec quel motif** (#11151).
///
/// Miroir du contrat passerelle : la passerelle tranche, ce prédicat ne fait que
/// décider si l'action « Retirer » s'offre. Un message se retire dans une
/// conversation de groupe, publique, globale ou de diffusion — jamais en direct —
/// par un administrateur, modérateur ou créateur de la conversation, ou par la
/// modération de la plateforme. Une publication (post, réel, story) ou un
/// commentaire, par la modération de la plateforme seulement. Son propre contenu
/// se SUPPRIME, il ne se retire pas.
public enum ContentRemovalPolicy {

    public static let reasonLengthRange: ClosedRange<Int> = 3...500

    public static let messageRemovalConversationTypes: Set<MeeshyConversation.ConversationType> = [
        .group, .public, .global, .broadcast,
    ]

    private static let conversationModeratorRoles: Set<String> = ["ADMIN", "MODERATOR", "CREATOR"]
    /// `PlatformRole.privileged`, la table unique des rôles de plateforme privilégiés (#11217).
    public static func isPlatformModerator(_ platformRole: String?) -> Bool {
        PlatformRole(caseFolding: platformRole)?.isPrivileged ?? false
    }

    public static func mayRemoveMessage(
        authoredByViewer: Bool,
        conversationType: MeeshyConversation.ConversationType,
        conversationRole: String?,
        platformRole: String?
    ) -> Bool {
        guard !authoredByViewer, messageRemovalConversationTypes.contains(conversationType) else { return false }
        return conversationModeratorRoles.contains(conversationRole?.uppercased() ?? "")
            || isPlatformModerator(platformRole)
    }

    public static func mayRemovePublication(authoredByViewer: Bool, platformRole: String?) -> Bool {
        !authoredByViewer && isPlatformModerator(platformRole)
    }

    /// Le motif tel qu'il part : rogné, entre 3 et 500 caractères — `nil` sinon.
    public static func normalizedReason(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return reasonLengthRange.contains(trimmed.count) ? trimmed : nil
    }
}
