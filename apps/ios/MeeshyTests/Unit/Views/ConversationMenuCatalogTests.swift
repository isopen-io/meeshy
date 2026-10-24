import XCTest
import UIKit
@testable import Meeshy
import MeeshySDK

/// #11230 — le menu d'une rangée de conversation se lit dans UN catalogue,
/// `ConversationMenuCatalog`, que les deux chemins d'OS (menu natif iOS 26 et
/// menu custom de repli) parcourent. Le catalogue est pur : il ne lit que les
/// verdicts de la loi (`ConversationRowMenuCapabilities`, projection de
/// `ConversationActionPolicy`) et l'état de la rangée.
@MainActor
final class ConversationMenuCatalogTests: XCTestCase {

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

    private func makeDirect() -> MeeshyConversation {
        makeConversation(type: .direct, currentUserRole: "member", participantUserId: "peer")
    }

    private func makeInput(
        _ conversation: MeeshyConversation,
        user: MeeshyUser? = nil,
        isPinned: Bool = false,
        isMuted: Bool = false,
        hasUnread: Bool = false,
        isLocked: Bool = false,
        isArchived: Bool = false,
        canToggleArchive: Bool = true,
        isPeerBlocked: Bool? = nil,
        windowsAvailable: Bool = false,
        offersReadingModes: Bool = false
    ) -> ConversationMenuCatalog.Input {
        ConversationMenuCatalog.Input(
            capabilities: ConversationRowMenuCapabilities.make(conversation: conversation, currentUser: user ?? makeUser()),
            isPinned: isPinned,
            isMuted: isMuted,
            hasUnread: hasUnread,
            isLocked: isLocked,
            isArchived: isArchived,
            canToggleArchive: canToggleArchive,
            isPeerBlocked: isPeerBlocked,
            windowsAvailable: windowsAvailable,
            offersReadingModes: offersReadingModes
        )
    }

    private func catalog(_ input: ConversationMenuCatalog.Input) -> ConversationMenuCatalog {
        ConversationMenuCatalog.make(input)
    }

    // MARK: - La tête compacte

    func test_make_header_isPinMuteRead_inThatOrder() {
        let menu = catalog(makeInput(makeConversation()))
        XCTAssertEqual(menu.header, [.pin, .mute, .markUnread])
    }

    func test_make_header_followsTheRowState() {
        let menu = catalog(makeInput(makeConversation(), isPinned: true, isMuted: true, hasUnread: true))
        XCTAssertEqual(menu.header, [.unpin, .unmute, .markRead])
    }

    func test_make_headerEntries_appearNowhereElse() {
        let menu = catalog(makeInput(makeConversation()))
        let rest = menu.reach + menu.organize + menu.more + menu.departure
        XCTAssertTrue(Set(menu.header).isDisjoint(with: Set(rest)), "Épingler, Sourdine et Lu ne se répètent pas sous la tête.")
    }

    // MARK: - Appels

    func test_make_direct_offersCallAndVideoCall() {
        let menu = catalog(makeInput(makeDirect()))
        XCTAssertTrue(menu.reach.contains(.call))
        XCTAssertTrue(menu.reach.contains(.videoCall), "Un direct s'appelle aussi en vidéo.")
    }

    func test_make_selfConversation_offersNoCall() {
        let menu = catalog(makeInput(
            makeConversation(type: .direct, participantUserId: "me"),
            user: makeUser(id: "me")
        ))
        XCTAssertFalse(menu.reach.contains(.call))
        XCTAssertFalse(menu.reach.contains(.videoCall))
    }

    func test_make_closedDirect_offersNoCall() {
        let menu = catalog(makeInput(makeConversation(type: .direct, participantUserId: "peer", isActive: false)))
        XCTAssertFalse(menu.reach.contains(.videoCall), "Une conversation terminée ne s'appelle plus.")
    }

    func test_make_group_offersNoDirectCall() {
        let menu = catalog(makeInput(makeConversation(currentUserRole: "admin")))
        XCTAssertFalse(menu.reach.contains(.call), "L'appel du menu compose un pair : un groupe n'en a pas.")
        XCTAssertFalse(menu.reach.contains(.videoCall))
    }

    // MARK: - Paramètres du groupe

    func test_make_groupAdmin_offersGroupSettings() {
        let menu = catalog(makeInput(makeConversation(currentUserRole: "admin")))
        XCTAssertTrue(menu.organize.contains(.groupSettings))
    }

    func test_make_groupMember_hasNoGroupSettings() {
        let menu = catalog(makeInput(makeConversation(currentUserRole: "member")))
        XCTAssertFalse(menu.entries.contains(.groupSettings), "Un simple membre ne règle pas le groupe.")
    }

    func test_make_direct_hasNoGroupSettings() {
        let menu = catalog(makeInput(makeConversation(type: .direct, currentUserRole: "creator", participantUserId: "peer")))
        XCTAssertFalse(menu.entries.contains(.groupSettings))
    }

    // MARK: - Fenêtre détachée et verrou

    func test_make_lockedConversation_neverDetaches() {
        let menu = catalog(makeInput(makeConversation(), isLocked: true, windowsAvailable: true))
        XCTAssertFalse(menu.entries.contains(.detach), "Une fenêtre détachée contournerait le PIN.")
    }

    func test_make_unlockedConversation_detaches_whenWindowsExist() {
        let menu = catalog(makeInput(makeConversation(), windowsAvailable: true))
        XCTAssertEqual(menu.reach.first, .detach)
    }

    func test_make_withoutWindows_neverDetaches() {
        let menu = catalog(makeInput(makeConversation()))
        XCTAssertFalse(menu.entries.contains(.detach))
    }

    func test_make_lockToggle_followsTheLock() {
        XCTAssertTrue(catalog(makeInput(makeConversation(), isLocked: true)).more.contains(.unlock))
        XCTAssertTrue(catalog(makeInput(makeConversation())).more.contains(.lock))
    }

    // MARK: - Les verdicts de la loi

    func test_make_groupMember_departsByLeavingAndHiding() {
        let menu = catalog(makeInput(makeConversation(currentUserRole: "member")))
        XCTAssertEqual(menu.departure, [.leave, .hide])
        XCTAssertFalse(menu.entries.contains(.rename))
        XCTAssertFalse(menu.entries.contains(.adminOpen))
    }

    func test_make_direct_departsByDeleting_andBlocks() {
        let menu = catalog(makeInput(makeDirect(), isPeerBlocked: false))
        XCTAssertEqual(menu.departure, [.delete])
        XCTAssertTrue(menu.more.contains(.block))
    }

    func test_make_blockedPeer_offersUnblock() {
        let menu = catalog(makeInput(makeDirect(), isPeerBlocked: true))
        XCTAssertTrue(menu.more.contains(.unblock))
        XCTAssertFalse(menu.more.contains(.block))
    }

    func test_make_platformAdmin_offersRenameAndAdministration() {
        let menu = catalog(makeInput(makeConversation(currentUserRole: "member"), user: makeUser(role: "ADMIN")))
        XCTAssertTrue(menu.organize.contains(.rename))
        XCTAssertTrue(menu.more.contains(.adminOpen))
    }

    func test_make_imposedArchive_offersNoArchiveToggle() {
        let menu = catalog(makeInput(makeConversation(), canToggleArchive: false))
        XCTAssertFalse(menu.more.contains(.archive))
        XCTAssertFalse(menu.more.contains(.unarchive))
    }

    func test_make_readingModes_offeredOnlyWhenOn() {
        XCTAssertFalse(catalog(makeInput(makeConversation())).entries.contains(.readingMode))
        XCTAssertTrue(catalog(makeInput(makeConversation(), offersReadingModes: true)).organize.contains(.readingMode))
    }

    func test_make_entries_neverRepeat() {
        let menu = catalog(makeInput(makeDirect(), isPeerBlocked: false, windowsAvailable: true, offersReadingModes: true))
        XCTAssertEqual(menu.entries.count, Set(menu.entries).count)
    }

    // MARK: - La table des libellés et des symboles

    func test_everyEntry_hasALabelAndASystemSymbol() {
        for entry in ConversationMenuEntry.allCases {
            XCTAssertFalse(entry.label.isEmpty, "\(entry) sans libellé")
            XCTAssertNotNil(UIImage(systemName: entry.symbol), "\(entry) : « \(entry.symbol) » n'est pas un symbole SF")
        }
        XCTAssertNotNil(UIImage(systemName: ConversationMenuEntry.favorite.displayedSymbol(hasFavorite: true)))
    }

    func test_toggles_sayTwoDifferentWords() {
        let pairs: [(ConversationMenuEntry, ConversationMenuEntry)] = [
            (.pin, .unpin), (.mute, .unmute), (.markRead, .markUnread),
            (.lock, .unlock), (.archive, .unarchive), (.block, .unblock), (.delete, .hide)
        ]
        for (on, off) in pairs {
            XCTAssertNotEqual(on.label, off.label)
        }
    }

    func test_onlyRemovals_areDestructive() {
        let destructive = ConversationMenuEntry.allCases.filter(\.isDestructive)
        XCTAssertEqual(Set(destructive), [.block, .leave, .delete, .hide])
    }

    func test_submenus_areReadingModeFavoriteAndMove() {
        XCTAssertEqual(Set(ConversationMenuEntry.allCases.filter(\.opensSubmenu)), [.readingMode, .favorite, .move])
    }
}

/// Les gestes du catalogue : chaque entrée qui agit appelle UNE closure, la
/// même sur les deux chemins d'OS.
@MainActor
final class ConversationMenuCatalogDispatchTests: XCTestCase {

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
            onGroupSettings: { recorder.calls.append("groupSettings") }
        )
    }

    func test_perform_everyActingEntry_callsExactlyOneGesture() {
        for entry in ConversationMenuEntry.allCases where !entry.opensSubmenu {
            let recorder = Recorder()
            makeActions(recorder).perform(entry)
            XCTAssertEqual(recorder.calls.count, 1, "\(entry) doit appeler un geste, et un seul")
        }
    }

    func test_perform_submenus_callNothing() {
        for entry in ConversationMenuEntry.allCases where entry.opensSubmenu {
            let recorder = Recorder()
            makeActions(recorder).perform(entry)
            XCTAssertTrue(recorder.calls.isEmpty)
        }
    }

    func test_perform_routesTheNewEntries() {
        let recorder = Recorder()
        let actions = makeActions(recorder)
        actions.perform(.videoCall)
        actions.perform(.groupSettings)
        actions.perform(.hide)
        XCTAssertEqual(recorder.calls, ["videoCall", "groupSettings", "delete"])
    }

    /// Les deux chemins rendent la MÊME liste : le menu custom expose à
    /// VoiceOver exactement les entrées agissantes du catalogue qu'il reçoit,
    /// dans l'ordre où le menu natif les pose.
    func test_customMenu_exposesTheCatalogEntries_inCatalogOrder() {
        let conversation = MeeshyConversation(
            id: "c1", identifier: "c1", type: .direct, title: "Ada",
            participantUserId: "peer", currentUserRole: "member"
        )
        let user = MeeshyUser(id: "me", username: "me", role: "USER", isAnonymous: false)
        let menuCatalog = ConversationMenuCatalog.make(ConversationMenuCatalog.Input(
            capabilities: ConversationRowMenuCapabilities.make(conversation: conversation, currentUser: user),
            isPinned: false, isMuted: false, hasUnread: true, isLocked: false,
            isArchived: false, canToggleArchive: true, isPeerBlocked: false,
            windowsAvailable: true, offersReadingModes: false
        ))
        let menu = ConversationContextMenuView(
            accentHex: "6366F1",
            catalog: menuCatalog,
            currentReaction: nil,
            categories: [],
            currentSectionId: nil,
            actions: makeActions(Recorder()),
            onDismiss: {}
        )
        let exposed = menu.accessibilityEntries.compactMap { ConversationMenuEntry(rawValue: $0.id) }
        XCTAssertEqual(exposed, menuCatalog.entries.filter { !$0.opensSubmenu })
    }
}
