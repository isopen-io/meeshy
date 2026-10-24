import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Règles pures de la liste, sans état

extension ConversationListView {

    // MARK: - Preview Auto-Load Eligibility
    //
    // Pure/testable (no SwiftUI/MainActor dependency) — same `firstIndex`
    // scan shape as `triggerLoadMoreIfNeeded` below, but NOT the same call
    // cadence: `triggerLoadMoreIfNeeded` fires from `.onAppear` (once per
    // scroll-triggered row appearance), while this runs on every
    // `conversationRow` body evaluation for every on-screen row — including
    // re-renders driven by `presencePulse`. The caller (`sectionsContent`)
    // hoists the `orderedConversationIds` array build to ONCE per body pass
    // instead of once per row to keep that repeated cost bounded. Gates
    // `ConversationRowItem.enableAutoPreviewLoad` to the first `limit`
    // entries of `orderedConversationIds` — the caller MUST pass the
    // actually-rendered order (flattened `groupedConversations`), never the
    // raw unfiltered/ungrouped `conversationViewModel.conversations`: a
    // filtered/sectioned view's visible rows can fall entirely outside the
    // full-account top-20 by recency, permanently starving their auto-load
    // (fix 2026-07-21; audit 2026-07-20 introduced the limit itself: every
    // row firing its preview-prefetch `.task` on appear meant 1 REST call
    // per newly-visible row on a cold cache).
    nonisolated static func shouldAutoLoadPreview(
        conversationId: String,
        orderedConversationIds: [String],
        limit: Int
    ) -> Bool {
        guard limit > 0, let idx = orderedConversationIds.firstIndex(of: conversationId) else { return false }
        return idx < limit
    }

    // MARK: - Menu de la rangée — la loi partagée (#11215)

    /// Ce que le menu de CETTE rangée offre au lecteur connecté, lu dans
    /// `ConversationActionPolicy` — jamais dans une liste de rôles écrite ici.
    func rowMenuCapabilities(for conversation: Conversation) -> ConversationRowMenuCapabilities {
        ConversationRowMenuCapabilities.make(conversation: conversation, currentUser: AuthManager.shared.currentUser)
    }

    /// Inviter et le lien de partage suivent l'autorité de la loi, créateur compris.
    func canCreateShareLink(for conversation: Conversation) -> Bool {
        rowMenuCapabilities(for: conversation).invite
    }

    /// Libellé de la pilule : la section dont les rangs viennent d'entrer à
    /// l'écran, à défaut la première section rendue. Fonction PURE (aucune
    /// dépendance SwiftUI/MainActor), donc directement testable — même
    /// convention que `emptyBranch` / `shouldAutoLoadPreview`. La MAJUSCULE
    /// vient de `LentilleSticker.displayTitle` : pilule et sticker crient le
    /// même mot, par la même fonction, jamais par deux transformations
    /// parallèles qui dériveraient.
    nonisolated static func sectionPillTitle(
        visibleSectionId: String?,
        sections: [ConversationSection]
    ) -> String? {
        guard let fallback = sections.first else { return nil }
        let match = sections.first(where: { $0.id == visibleSectionId }) ?? fallback
        return LentilleSticker.displayTitle(match.name)
    }
}

// MARK: - Les verdicts du menu d'une rangée (#11215)

/// CE QUE LE MENU D'UNE RANGÉE PROPOSE — les deux chemins d'OS (menu natif
/// iOS 26 et menu custom de repli) lisent ces verdicts, qui projettent
/// `ConversationActionPolicy` (SDK, miroir de `conversationActionsFor`) sur un
/// `ConversationViewerAuthority` construit pour la rangée : le rôle de
/// PLATEFORME servi (`MeeshyUser.role`) et le rôle DANS la conversation
/// (`currentUserRole`). Une liste de conversations ne montre que celles dont le
/// lecteur est membre : la ligne est active dès que le lecteur est chargé. Le
/// rang de la ligne se lit casse pliée, comme `effectiveConversationRole`.
///
/// Fermé par défaut : un lecteur pas encore chargé n'est membre de rien et n'a
/// pas de compte, donc rien de ce qu'un rôle ouvrirait ne s'offre avant.
nonisolated struct ConversationRowMenuCapabilities: Equatable, Sendable {

    /// Ce que l'entrée qui retire DIT, pour un geste qui ne masque que pour soi
    /// (`deleteConversation` → `.deleteForUser`).
    nonisolated enum Removal: Equatable, Sendable {
        /// « Supprimer » — une conversation directe, comme dans toute messagerie.
        case delete
        /// « Masquer la discussion » — tout autre type : la discussion disparaît
        /// de SA liste, les autres membres la gardent. Le droit `deleteForAll`
        /// n'y change rien tant que la liste n'appelle pas la suppression pour
        /// tous : « Supprimer » affirmerait un effet que le geste n'a pas.
        case hide
    }

    let rename: Bool
    let invite: Bool
    let leave: Bool
    let report: Bool
    let adminOpen: Bool
    let removal: Removal?
    /// Appeler le pair d'un direct — l'appel du menu compose UN pair, donc
    /// jamais un groupe ni soi-même (`CallPermission.canStartCall`).
    let call: Bool
    let videoCall: Bool
    /// « Paramètres du groupe » (#11230) — l'écran édite titre, description,
    /// avatar et bannière : il se lit sur `rename` (MODERATOR+ d'un type à
    /// autorité, ouvert), jamais sur `manageMembers`, qui couvre aussi Global,
    /// où la passerelle refuse toute modification (403).
    let groupSettings: Bool

    static func make(conversation: MeeshyConversation, currentUser: MeeshyUser?) -> ConversationRowMenuCapabilities {
        let actions = ConversationActionPolicy.actions(for: ConversationActionPolicy.Input(
            conversation: ConversationActionPolicy.Conversation(
                type: conversation.type.rawValue,
                encryptionMode: conversation.encryptionMode,
                isActive: conversation.isActive,
                closedAt: conversation.closedAt,
                isAnnouncementChannel: conversation.isAnnouncementChannel,
                defaultWriteRole: conversation.defaultWriteRole
            ),
            viewer: viewer(of: conversation, currentUser: currentUser)
        ))
        let talksToSelf = conversation.type == .direct
            && conversation.participantUserId != nil
            && conversation.participantUserId == currentUser?.id
        let talksToPeer = conversation.type == .direct && conversation.participantUserId != nil && !talksToSelf
        return ConversationRowMenuCapabilities(
            rename: actions.rename,
            invite: actions.invite,
            leave: actions.leave,
            report: actions.report && !talksToSelf,
            adminOpen: actions.adminOpen,
            removal: actions.hide ? (conversation.type == .direct ? .delete : .hide) : nil,
            call: actions.call && talksToPeer,
            videoCall: actions.videoCall && talksToPeer,
            groupSettings: actions.rename
        )
    }

    /// Le rang auquel s'ouvrent les réglages : le rang EFFECTIF de la loi, celui
    /// qui a fait offrir l'entrée (MODERATOR/ADMIN/BIGBOSS de plateforme membre ⇒
    /// créateur, comme `actorHasMinimumRole` côté passerelle). Le rang servi
    /// retiendrait ce que l'entrée a promis.
    static func settingsRole(of conversation: MeeshyConversation, currentUser: MeeshyUser?) -> MemberRole {
        viewer(of: conversation, currentUser: currentUser).effectiveRole ?? .member
    }

    /// Le lecteur tel que la loi le lit, pour une rangée de SA liste.
    static func viewer(of conversation: MeeshyConversation, currentUser: MeeshyUser?) -> ConversationViewerAuthority {
        let isAnonymous = currentUser?.isAnonymous ?? false
        let hasAccount = currentUser != nil && !isAnonymous
        return ConversationViewerAuthority(
            id: currentUser?.id ?? "",
            hasAccount: hasAccount,
            isAnonymous: isAnonymous,
            platformRoleRaw: hasAccount ? currentUser?.role : nil,
            conversationRoleRaw: conversation.currentUserRole,
            isActiveMember: currentUser != nil,
            canSendMessages: hasAccount,
            isDeclaredMinor: ConversationMenuAuthority.declaresMinor(conversation)
        )
    }

    /// La fiche de la conversation dans la console d'administration web.
    static func adminConsoleURL(conversationId: String, webOrigin: String) -> URL? {
        URL(string: "\(webOrigin)/admin/conversations/\(conversationId)")
    }
}
