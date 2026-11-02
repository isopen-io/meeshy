import XCTest
@testable import Meeshy
import MeeshySDK

/// #11215 — le menu d'une rangée ne propose que ce que la loi partagée
/// (`ConversationActionPolicy`) accorde au lecteur : son rôle de PLATEFORME
/// (`MeeshyUser.role`) et son rôle DANS la conversation (`currentUserRole`).
///
/// Avant ce lot, « Renommer » s'offrait à tout membre d'un groupe alors que la
/// passerelle exige MODERATOR+, et le lien de partage comparait des rôles qui
/// n'existent pas (`owner`, `co-owner`) en oubliant `creator`.
final class ConversationRowMenuCapabilitiesTests: XCTestCase {

    private func makeUser(id: String = "me", role: String? = "USER", isAnonymous: Bool? = false) -> MeeshyUser {
        MeeshyUser(id: id, username: "me", displayName: "Me", role: role, isAnonymous: isAnonymous)
    }

    private func makeConversation(
        type: MeeshyConversation.ConversationType = .group,
        currentUserRole: String? = "member",
        participantUserId: String? = nil,
        isActive: Bool = true
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: "c1",
            identifier: "c1",
            type: type,
            title: "Équipe",
            isActive: isActive,
            participantUserId: participantUserId,
            currentUserRole: currentUserRole
        )
    }

    private func capabilities(
        _ conversation: MeeshyConversation,
        user: MeeshyUser?
    ) -> ConversationRowMenuCapabilities {
        ConversationRowMenuCapabilities.make(conversation: conversation, currentUser: user)
    }

    // MARK: - Renommer

    func test_make_groupMember_hasNoRename() {
        let caps = capabilities(makeConversation(currentUserRole: "member"), user: makeUser())
        XCTAssertFalse(caps.rename, "Un simple membre ne renomme pas : la passerelle exige MODERATOR+.")
    }

    func test_make_groupModerator_hasRename() {
        let caps = capabilities(makeConversation(currentUserRole: "moderator"), user: makeUser())
        XCTAssertTrue(caps.rename)
    }

    func test_make_global_neverRenames_evenForPlatformAdmin() {
        let caps = capabilities(makeConversation(type: .global, currentUserRole: "creator"), user: makeUser(role: "ADMIN"))
        XCTAssertFalse(caps.rename, "Global ne se renomme jamais.")
    }

    func test_make_direct_hasNoRename() {
        let caps = capabilities(makeConversation(type: .direct, currentUserRole: "creator", participantUserId: "peer"), user: makeUser())
        XCTAssertFalse(caps.rename)
    }

    // MARK: - Inviter et lien de partage

    func test_make_groupCreator_hasInviteAndShareLink() {
        let caps = capabilities(makeConversation(currentUserRole: "creator"), user: makeUser())
        XCTAssertTrue(caps.invite, "Le créateur invite — l'ancienne règle l'oubliait (owner/co-owner).")
    }

    func test_make_groupMember_hasNoInvite() {
        let caps = capabilities(makeConversation(currentUserRole: "member"), user: makeUser())
        XCTAssertFalse(caps.invite)
    }

    func test_make_publicMember_invites_likeTheGateway() {
        let caps = capabilities(makeConversation(type: .public, currentUserRole: "member"), user: makeUser())
        XCTAssertTrue(caps.invite, "mayMintShareLink : tout membre inscrit d'une conversation publique fabrique un lien.")
    }

    func test_make_broadcastMember_hasNoInvite() {
        let caps = capabilities(makeConversation(type: .broadcast, currentUserRole: "member"), user: makeUser())
        XCTAssertFalse(caps.invite, "Une chaîne reste réservée aux moderators : seul public ouvre le lien au membre.")
    }

    func test_make_publicGuest_hasNoInvite() {
        let caps = capabilities(makeConversation(type: .public, currentUserRole: "member"), user: makeUser(isAnonymous: true))
        XCTAssertFalse(caps.invite, "Le lien exige une ligne Participant d'inscrit.")
    }

    func test_make_legacyUppercaseRole_keepsTheRightsTheGatewayGrants() {
        let caps = capabilities(makeConversation(currentUserRole: "ADMIN"), user: makeUser())
        XCTAssertTrue(caps.rename, "effectiveConversationRole plie la casse : une ligne « ADMIN » héritée renomme.")
        XCTAssertTrue(caps.invite)
    }

    // MARK: - Rôle de plateforme

    func test_make_platformAdmin_memberRow_hasRenameAndAdminOpen() {
        let caps = capabilities(makeConversation(currentUserRole: "member"), user: makeUser(role: "ADMIN"))
        XCTAssertTrue(caps.rename, "Un ADMIN de plateforme membre vaut le créateur.")
        XCTAssertTrue(caps.adminOpen)
    }

    func test_make_bigboss_hasAdminOpen() {
        let caps = capabilities(makeConversation(currentUserRole: "member"), user: makeUser(role: "BIGBOSS"))
        XCTAssertTrue(caps.adminOpen)
    }

    func test_make_platformModerator_hasNoAdminOpen() {
        let caps = capabilities(makeConversation(currentUserRole: "member"), user: makeUser(role: "MODERATOR"))
        XCTAssertFalse(caps.adminOpen, "« Ouvrir dans l'administration » est réservé à ADMIN et BIGBOSS.")
    }

    func test_make_audit_hasNothingMoreThanUser() {
        let roles = ["member", "moderator", "admin", "creator"]
        let types: [MeeshyConversation.ConversationType] = [.direct, .group, .public, .global, .broadcast]
        for type in types {
            for role in roles {
                let conversation = makeConversation(type: type, currentUserRole: role, participantUserId: type == .direct ? "peer" : nil)
                XCTAssertEqual(
                    capabilities(conversation, user: makeUser(role: "AUDIT")),
                    capabilities(conversation, user: makeUser(role: "USER")),
                    "AUDIT lit ; il n'agit pas plus qu'un USER (\(type.rawValue), \(role))."
                )
            }
        }
    }

    // MARK: - Quitter

    func test_make_leave_absentInDirectAndGlobal() {
        let direct = capabilities(makeConversation(type: .direct, participantUserId: "peer"), user: makeUser())
        let global = capabilities(makeConversation(type: .global), user: makeUser())
        XCTAssertFalse(direct.leave, "Une conversation directe ne se quitte pas.")
        XCTAssertFalse(global.leave, "Global ne se quitte pas.")
    }

    func test_make_leave_presentForGroupMember() {
        let caps = capabilities(makeConversation(currentUserRole: "member"), user: makeUser())
        XCTAssertTrue(caps.leave)
    }

    func test_make_closedConversation_offersNeitherLeaveNorRename() {
        let caps = capabilities(makeConversation(currentUserRole: "creator", isActive: false), user: makeUser())
        XCTAssertFalse(caps.leave)
        XCTAssertFalse(caps.rename)
    }

    // MARK: - Signaler

    func test_make_report_presentForAnotherPeerAndForGroup() {
        let direct = capabilities(makeConversation(type: .direct, participantUserId: "peer"), user: makeUser())
        let group = capabilities(makeConversation(), user: makeUser())
        XCTAssertTrue(direct.report)
        XCTAssertTrue(group.report)
    }

    func test_make_report_absentOnSelfConversation() {
        let caps = capabilities(makeConversation(type: .direct, participantUserId: "me"), user: makeUser(id: "me"))
        XCTAssertFalse(caps.report, "On ne se signale pas soi-même.")
    }

    func test_make_anonymousGuest_hasNoReportNorRemovalNorLeave() {
        let caps = capabilities(makeConversation(), user: makeUser(isAnonymous: true))
        XCTAssertFalse(caps.report)
        XCTAssertNil(caps.removal)
        XCTAssertFalse(caps.leave, "POST /conversations/:id/leave refuse les anonymes.")
    }

    func test_make_unloadedUser_opensNothingRoleBound() {
        let caps = capabilities(makeConversation(currentUserRole: "creator"), user: nil)
        XCTAssertFalse(caps.rename)
        XCTAssertFalse(caps.invite)
        XCTAssertFalse(caps.adminOpen)
    }

    // MARK: - Supprimer / Masquer

    func test_make_groupMemberWithoutDeleteForAll_hidesTheChat() {
        let caps = capabilities(makeConversation(currentUserRole: "member"), user: makeUser())
        XCTAssertEqual(caps.removal, .hide, "Un membre sans droit deleteForAll MASQUE la discussion.")
    }

    func test_make_groupAdmin_hides_untilDeleteForAllIsWired() {
        let caps = capabilities(makeConversation(currentUserRole: "admin"), user: makeUser())
        XCTAssertEqual(caps.removal, .hide, "Le geste ne masque que pour soi : « Supprimer » y affirmerait un droit qu'il n'exerce pas.")
    }

    func test_make_platformAdminInGroup_hides_untilDeleteForAllIsWired() {
        let caps = capabilities(makeConversation(currentUserRole: "member"), user: makeUser(role: "BIGBOSS"))
        XCTAssertEqual(caps.removal, .hide)
    }

    func test_make_direct_keepsDelete() {
        let caps = capabilities(makeConversation(type: .direct, participantUserId: "peer"), user: makeUser())
        XCTAssertEqual(caps.removal, .delete)
    }

    // MARK: - Gérer les membres (#12631)

    /// La grille type × rôle de `ConversationActionPolicy.manageMembers` : un
    /// membre ne gère rien, un modérateur de groupe gère, un direct jamais, et
    /// un rôle de plateforme PRIVILÉGIÉ vaut créateur une fois DANS (#11217).
    func test_make_manageMembers_followsTheTypeByRoleGrid() {
        let grid: [(type: MeeshyConversation.ConversationType, member: String, platform: String, expected: Bool)] = [
            (.group, "member", "USER", false),
            (.group, "moderator", "USER", true),
            (.group, "admin", "USER", true),
            (.group, "creator", "USER", true),
            (.group, "MODERATOR", "USER", true),
            (.public, "member", "USER", false),
            (.public, "moderator", "USER", true),
            (.broadcast, "member", "USER", false),
            (.broadcast, "admin", "USER", true),
            (.global, "member", "USER", false),
            (.global, "member", "MODERATOR", true),
            (.group, "member", "MODERATOR", true),
            (.group, "member", "ADMIN", true),
            (.group, "member", "AUDIT", false),
            (.group, "member", "ANALYST", false)
        ]
        for row in grid {
            let caps = capabilities(makeConversation(type: row.type, currentUserRole: row.member), user: makeUser(role: row.platform))
            XCTAssertEqual(caps.manageMembers, row.expected, "\(row.type.rawValue) · \(row.member) · \(row.platform)")
        }
    }

    func test_make_direct_neverManagesMembers_whateverTheRole() {
        for platform in ["USER", "MODERATOR", "ADMIN", "BIGBOSS"] {
            for member in ["member", "moderator", "admin", "creator"] {
                let caps = capabilities(
                    makeConversation(type: .direct, currentUserRole: member, participantUserId: "peer"),
                    user: makeUser(role: platform)
                )
                XCTAssertFalse(caps.manageMembers, "Un direct n'a pas de membres à gérer (\(member), \(platform)).")
            }
        }
    }

    func test_make_closedGroup_managesNoMember() {
        let caps = capabilities(makeConversation(currentUserRole: "creator", isActive: false), user: makeUser())
        XCTAssertFalse(caps.manageMembers, "Une conversation terminée ne se modifie plus.")
    }

    func test_make_unloadedUser_managesNoMember() {
        let caps = capabilities(makeConversation(currentUserRole: "creator"), user: nil)
        XCTAssertFalse(caps.manageMembers)
    }

    // MARK: - Le rang des réglages (#11230)

    /// L'entrée « Paramètres du groupe » s'ouvre sur le rang EFFECTIF de la
    /// loi : l'écran ne doit pas retenir ce que l'entrée a promis.
    func test_settingsRole_platformAdminMember_isCreator() {
        let role = ConversationRowMenuCapabilities.settingsRole(of: makeConversation(currentUserRole: "member"), currentUser: makeUser(role: "ADMIN"))
        XCTAssertEqual(role, .creator, "ADMIN de plateforme membre ⇒ rang effectif créateur, comme la passerelle.")
    }

    func test_settingsRole_servedAdmin_staysAdmin_caseFolded() {
        let role = ConversationRowMenuCapabilities.settingsRole(of: makeConversation(currentUserRole: "ADMIN"), currentUser: makeUser())
        XCTAssertEqual(role, .admin)
    }

    func test_settingsRole_platformModeratorMember_isCreator() {
        let role = ConversationRowMenuCapabilities.settingsRole(of: makeConversation(currentUserRole: "member"), currentUser: makeUser(role: "MODERATOR"))
        XCTAssertEqual(role, .creator, "MODERATOR de plateforme membre ⇒ créateur, comme ADMIN (#11217).")
    }

    func test_settingsRole_plainMember_staysMember() {
        let role = ConversationRowMenuCapabilities.settingsRole(of: makeConversation(currentUserRole: "member"), currentUser: makeUser(role: "AUDIT"))
        XCTAssertEqual(role, .member, "AUDIT de plateforme n'est qu'un membre dans la conversation.")
    }

    func test_settingsRole_unreadableRole_fallsToMember() {
        let role = ConversationRowMenuCapabilities.settingsRole(of: makeConversation(currentUserRole: "owner"), currentUser: makeUser())
        XCTAssertEqual(role, .member)
    }

    // MARK: - Administration

    func test_adminConsoleURL_pointsAtTheConversationSheetOfTheWebConsole() {
        let url = ConversationRowMenuCapabilities.adminConsoleURL(conversationId: "c1", webOrigin: "https://meeshy.me")
        XCTAssertEqual(url?.absoluteString, "https://meeshy.me/admin/conversations/c1")
    }
}

/// VoiceOver (#11215) : les entrées du menu custom sont exposées en actions
/// NOMMÉES, et ce sont les MÊMES verdicts que les rangées visibles.
@MainActor
final class ConversationContextMenuAccessibilityTests: XCTestCase {

    private final class Recorder {
        var calls: [String] = []
    }

    private func makeActions(_ recorder: Recorder) -> ConversationRowMenuActions {
        ConversationRowMenuActions(
            onPin: { recorder.calls.append("pin") },
            onMute: { recorder.calls.append("mute") },
            onMarkReadToggle: { recorder.calls.append("read") },
            onDetails: { recorder.calls.append("details") },
            onRename: { recorder.calls.append("rename") },
            onSetFavorite: { _ in recorder.calls.append("favorite") },
            onRemoveFavorite: { recorder.calls.append("removeFavorite") },
            onMove: { _ in recorder.calls.append("move") },
            onInvite: { recorder.calls.append("invite") },
            onLock: { recorder.calls.append("lock") },
            onArchive: { recorder.calls.append("archive") },
            onBlock: { recorder.calls.append("block") },
            onDelete: { recorder.calls.append("delete") },
            onLeave: { recorder.calls.append("leave") },
            onReport: { recorder.calls.append("report") },
            onOpenAdmin: { recorder.calls.append("adminOpen") },
            onDetach: { recorder.calls.append("detach") },
            onSearch: { recorder.calls.append("search") },
            onCall: { recorder.calls.append("call") },
            onVideoCall: { recorder.calls.append("videoCall") },
            onGroupSettings: { recorder.calls.append("groupSettings") },
            onManageMembers: { recorder.calls.append("manageMembers") }
        )
    }

    private func makeMenu(memberRole: String, platformRole: String, recorder: Recorder) -> ConversationContextMenuView {
        let conversation = MeeshyConversation(id: "c1", identifier: "c1", type: .group, title: "Équipe", currentUserRole: memberRole)
        let user = MeeshyUser(id: "me", username: "me", role: platformRole, isAnonymous: false)
        let catalog = ConversationMenuCatalog.make(ConversationMenuCatalog.Input(
            capabilities: ConversationRowMenuCapabilities.make(conversation: conversation, currentUser: user),
            isPinned: false,
            isMuted: false,
            hasUnread: false,
            isLocked: false,
            isArchived: false,
            canToggleArchive: true,
            isPeerBlocked: nil,
            windowsAvailable: false,
            offersReadingModes: false
        ))
        return ConversationContextMenuView(
            accentHex: "6366F1",
            catalog: catalog,
            currentReaction: nil,
            categories: [],
            currentSectionId: nil,
            actions: makeActions(recorder),
            onDismiss: { recorder.calls.append("dismiss") }
        )
    }

    func test_accessibilityEntries_groupMember_offersLeaveReportAndHide_withoutRenameOrAdmin() {
        let ids = makeMenu(memberRole: "member", platformRole: "USER", recorder: Recorder()).accessibilityEntries.map(\.id)
        XCTAssertTrue(ids.contains("leave"))
        XCTAssertTrue(ids.contains("report"))
        XCTAssertTrue(ids.contains("hide"), "Un membre MASQUE la discussion.")
        XCTAssertFalse(ids.contains("rename"))
        XCTAssertFalse(ids.contains("adminOpen"))
    }

    func test_accessibilityEntries_platformAdmin_offersRenameAndAdminOpen() {
        let ids = makeMenu(memberRole: "member", platformRole: "ADMIN", recorder: Recorder()).accessibilityEntries.map(\.id)
        XCTAssertTrue(ids.contains("rename"))
        XCTAssertTrue(ids.contains("adminOpen"))
    }

    func test_accessibilityEntry_perform_runsItsActionThenDismisses() {
        let recorder = Recorder()
        let leave = makeMenu(memberRole: "member", platformRole: "USER", recorder: recorder)
            .accessibilityEntries.first { $0.id == "leave" }
        leave?.perform()
        XCTAssertEqual(recorder.calls, ["leave", "dismiss"])
    }

    func test_accessibilityEntries_reachFavoritesAndMoveTargets() {
        let recorder = Recorder()
        let entries = makeMenu(memberRole: "member", platformRole: "USER", recorder: recorder).accessibilityEntries
        XCTAssertEqual(entries.filter { $0.id.hasPrefix("favorite.") }.count, 8, "Les huit favoris sont des actions nommées.")
        XCTAssertTrue(entries.contains { $0.id == "move.inbox" }, "« Mes conversations » est atteignable sans ouvrir le sous-panneau.")
        entries.first { $0.id.hasPrefix("favorite.") }?.perform()
        XCTAssertEqual(recorder.calls, ["favorite", "dismiss"])
    }

    func test_hideLabel_namesWhatTheGestureDoes() {
        XCTAssertEqual(ConversationContextMenuView.removalIcon(.hide), "eye.slash")
        XCTAssertNotEqual(
            ConversationContextMenuView.removalLabel(.hide),
            ConversationContextMenuView.removalLabel(.delete),
            "Un membre qui masque ne lit pas « Supprimer »."
        )
    }
}
