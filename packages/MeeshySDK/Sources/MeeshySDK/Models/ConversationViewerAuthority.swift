import Foundation

/// CE QU'UN LECTEUR EST dans une conversation (#11209) — l'`ActionViewer` de la
/// loi des actions (`packages/shared/utils/message-action-policy.ts`), avec le
/// rang effectif de `conversation-authority` (passerelle).
///
/// Les rôles arrivent en CHAÎNES, dans la casse que le serveur a servie, et se
/// lisent comme la loi les lit :
/// - `memberRole` EXACT, en minuscules comme `Participant.role` — plier la casse
///   offrirait ce que la passerelle refuse ; un rang illisible vaut 0, sous
///   `member` ;
/// - `platformRole` EXACT pour modérer, sans casse pour administrer
///   (`PlatformRole`).
///
/// Rang EFFECTIF : un ADMIN ou BIGBOSS de plateforme MEMBRE ACTIF vaut le
/// créateur, jamais au-dessus ; MODERATOR, AUDIT et ANALYST y gardent le rang
/// de leur ligne. Un lecteur qui porte `isAnonymous` est un invité, quel que
/// soit `hasAccount` (fermé par défaut).
public struct ConversationViewerAuthority: Equatable, Sendable {
    /// `User.id` pour un inscrit ; `Participant.id` pour un invité.
    public let id: String
    public let participantId: String?
    public let hasAccount: Bool
    public let isAnonymous: Bool
    /// `User.role`, tel que servi.
    public let platformRoleRaw: String?
    /// `Participant.role` DANS cette conversation, tel que servi.
    public let conversationRoleRaw: String?
    public let isActiveMember: Bool
    /// Permission d'envoi de l'invité (`Participant.permissions`) ; vraie pour un inscrit.
    public let canSendMessages: Bool
    public let isDeclaredMinor: Bool

    public init(
        id: String,
        participantId: String? = nil,
        hasAccount: Bool,
        isAnonymous: Bool = false,
        platformRoleRaw: String? = nil,
        conversationRoleRaw: String? = nil,
        isActiveMember: Bool,
        canSendMessages: Bool = true,
        isDeclaredMinor: Bool = false
    ) {
        self.id = id
        self.participantId = participantId
        self.hasAccount = hasAccount
        self.isAnonymous = isAnonymous
        self.platformRoleRaw = platformRoleRaw
        self.conversationRoleRaw = conversationRoleRaw
        self.isActiveMember = isActiveMember
        self.canSendMessages = canSendMessages
        self.isDeclaredMinor = isDeclaredMinor
    }

    /// Lecture EXACTE du rôle de plateforme.
    public var platformRole: PlatformRole? { PlatformRole(raw: platformRoleRaw) }

    /// Lecture EXACTE du rang de la ligne de participation.
    public var memberRole: MemberRole? { conversationRoleRaw.flatMap(MemberRole.init(rawValue:)) }

    /// Un compte, et pas un invité.
    public var isRegistered: Bool { hasAccount && !isAnonymous }

    /// MODERATOR, ADMIN ou BIGBOSS, comparés exactement.
    public var moderatesPlatform: Bool { platformRole?.moderatesContent ?? false }

    /// ADMIN ou BIGBOSS, casse pliée (`isGlobalAdmin`).
    public var administersPlatform: Bool { PlatformRole(caseFolding: platformRoleRaw)?.administers ?? false }

    /// Le niveau de la LIGNE — 0 hors membre actif ou rang illisible.
    public var memberRank: Int { isActiveMember ? memberRole?.level ?? 0 : 0 }

    /// `effectiveConversationRole` : `nil` hors membre actif.
    public var effectiveRole: MemberRole? {
        guard isActiveMember else { return nil }
        return administersPlatform ? .creator : memberRole
    }

    public var effectiveRank: Int { effectiveRole?.level ?? 0 }
}
