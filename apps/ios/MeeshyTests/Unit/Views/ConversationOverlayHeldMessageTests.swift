import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le menu d'appui long suit le message VIVANT** (#12627).
///
/// `overlayState.overlayMessage` est une copie prise au geste. Montée telle
/// quelle, elle laissait copiable un message supprimé pour tous pendant que le
/// menu restait ouvert, et un envoi `cid_…` accusé n'offrait ni réponse ni
/// suppression. Ces témoins relisent le message tenu dans le fil, par son
/// identité stable, et disent ce que la surcouche en fait.
@MainActor
final class ConversationOverlayHeldMessageTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let viewerId = "6a0ad86a6e21a483b4443d01"
    private let serverId = "6a0ad86a6e21a483b4443d11"
    private let optimisticId = "cid_3f0c5e7a-8a51-4c43-9a8e-0d1f2b3c4d5e"

    private func message(
        id: String? = nil,
        mine: Bool = false,
        deletedAt: Date? = nil,
        expiresAt: Date? = nil,
        pinnedAt: Date? = nil
    ) -> Message {
        Message(
            id: id ?? serverId,
            conversationId: "6a0ad86a6e21a483b4443d99",
            senderId: mine ? "6a0ad86a6e21a483b4443da1" : "6a0ad86a6e21a483b4443da2",
            content: "Bonjour",
            deletedAt: deletedAt,
            expiresAt: expiresAt,
            pinnedAt: pinnedAt,
            createdAt: now.addingTimeInterval(-60),
            updatedAt: now.addingTimeInterval(-60),
            senderUserId: mine ? viewerId : "6a0ad86a6e21a483b4443d02",
            isMe: mine
        )
    }

    private func authority() -> ConversationMenuAuthority {
        ConversationMenuAuthority(
            viewer: ConversationViewerAuthority(
                id: viewerId, participantId: nil, hasAccount: true, isAnonymous: false,
                platformRoleRaw: "USER", conversationRoleRaw: "member", isActiveMember: true,
                canSendMessages: true, isDeclaredMinor: false
            ),
            conversation: MessageActionPolicy.Conversation(type: "group")
        )
    }

    private func menu(_ message: Message) -> MessageMenuContext {
        MessageMenuContext.make(message: message, facts: MessageMenuFacts(), authority: authority(), now: now)
    }

    private func moreActions(_ ctx: MessageMenuContext) -> [MoreItem] {
        MessageActionResolver.moreSections(ctx).flatMap { section -> [MoreItem] in
            if case .actions(let items) = section { return items }
            return []
        }
    }

    private func resolver(
        thread: [Message],
        pendingServerIds: [String: String] = [:]
    ) -> (Message) -> OverlayHeldMessage.Resolution {
        let byId = Dictionary(thread.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let now = self.now
        return { held in
            OverlayHeldMessage.resolve(held, pendingServerIds: pendingServerIds, now: now) { byId[$0] }
        }
    }

    private func openMenu(on held: Message) -> ConversationOverlayState {
        var state = ConversationOverlayState()
        state.overlayMessage = held
        state.showOverlayMenu = true
        return state
    }

    // MARK: - Ce qui part referme le menu

    func test_aRemoteDeletionWhileTheMenuIsOpen_closesIt() {
        let held = message()
        var state = openMenu(on: held)
        state.detailSheetMessage = held
        state.shareMessage = held

        let outcome = state.reconciled(resolver(thread: [message(deletedAt: now)]))

        XCTAssertFalse(outcome.state.showOverlayMenu, "un message supprimé pour tous ne garde pas son menu ouvert")
        XCTAssertNil(outcome.state.overlayMessage, "la copie du geste ne survit pas au retrait")
        XCTAssertNil(outcome.state.detailSheetMessage, "la feuille « Plus… » se referme aussi")
        XCTAssertNil(outcome.state.shareMessage, "le partage d'un contenu retiré ne reste pas offert")
        XCTAssertTrue(outcome.announcesWithdrawal, "VoiceOver dit pourquoi le menu s'est refermé")
    }

    func test_aMessageThatLeavesTheThread_closesTheMenu() {
        let outcome = openMenu(on: message()).reconciled(resolver(thread: []))

        XCTAssertFalse(outcome.state.showOverlayMenu)
        XCTAssertTrue(outcome.announcesWithdrawal)
    }

    func test_anEphemeralThatExpiresWhileHeld_closesTheMenu() {
        let held = message(expiresAt: now.addingTimeInterval(30))
        let expired = message(expiresAt: now.addingTimeInterval(-1))

        let outcome = openMenu(on: held).reconciled(resolver(thread: [expired]))

        XCTAssertFalse(outcome.state.showOverlayMenu, "un éphémère échu ne reste pas copiable sous le menu")
    }

    /// Un message DÉJÀ supprimé s'ouvre sur son menu de pierre tombale
    /// (« Supprimer pour moi ») : il n'a rien perdu depuis le geste.
    func test_aMessageAlreadyDeletedAtTheGesture_keepsItsMenu() {
        let tombstone = message(deletedAt: now.addingTimeInterval(-600))

        let outcome = openMenu(on: tombstone).reconciled(resolver(thread: [tombstone]))

        XCTAssertTrue(outcome.state.showOverlayMenu)
        XCTAssertFalse(outcome.announcesWithdrawal)
    }

    /// Un menu déjà refermé ne s'annonce pas : rien ne disparaît sous les yeux.
    func test_aWithdrawalAfterTheMenuClosed_isNotAnnounced() {
        var state = openMenu(on: message())
        state.showOverlayMenu = false

        let outcome = state.reconciled(resolver(thread: [message(deletedAt: now)]))

        XCTAssertNil(outcome.state.overlayMessage)
        XCTAssertFalse(outcome.announcesWithdrawal)
    }

    // MARK: - Ce qui change se recompose

    func test_anAcknowledgedOptimisticMessage_offersReply() throws {
        let held = message(id: optimisticId, mine: true)
        let acknowledged = message(mine: true)
        let resolve = resolver(thread: [acknowledged], pendingServerIds: [optimisticId: serverId])

        let live = try XCTUnwrap(resolve(held).live, "l'accusé change l'id : le message se relit par son identité stable")

        XCTAssertEqual(live.id, serverId)
        XCTAssertFalse(MessageActionResolver.primaryActions(menu(held)).contains(.reply), "prémisse : un `cid_` ne se cite pas")
        XCTAssertTrue(MessageActionResolver.primaryActions(menu(live)).contains(.reply), "accusé, il s'offre à la réponse")
        XCTAssertEqual(openMenu(on: held).reconciled(resolve).state.overlayMessage?.id, serverId,
                       "la surcouche se réancre sur l'id servi : la cellule masquée sous l'aperçu est la bonne")
    }

    func test_aReceivedPin_turnsPinIntoUnpin() throws {
        let held = message()
        let resolve = resolver(thread: [message(pinnedAt: now)])

        let live = try XCTUnwrap(resolve(held).live)

        XCTAssertTrue(moreActions(menu(held)).contains(.pin), "prémisse : la copie du geste n'est pas épinglée")
        XCTAssertTrue(moreActions(menu(live)).contains(.unpin), "l'épingle reçue se lit dans le menu ouvert")
        XCTAssertFalse(moreActions(menu(live)).contains(.pin))
    }

    func test_aLiveChange_neitherClosesNorAnnounces() {
        let outcome = openMenu(on: message()).reconciled(resolver(thread: [message(pinnedAt: now)]))

        XCTAssertTrue(outcome.state.showOverlayMenu, "un changement vivant recompose sans refermer")
        XCTAssertFalse(outcome.announcesWithdrawal)
    }

    /// La signature que l'hôte observe : elle ne change qu'au retrait ou au
    /// changement d'id, jamais pour une épingle — le menu se recompose au
    /// rendu, sans réécrire l'état ni rejouer l'entrée.
    func test_theHeldSignature_movesOnlyOnWithdrawalOrNewIdentity() {
        let state = openMenu(on: message())

        XCTAssertEqual(state.heldSlots(resolver(thread: [message()])), state.heldSlots(resolver(thread: [message(pinnedAt: now)])))
        XCTAssertNotEqual(state.heldSlots(resolver(thread: [message()])), state.heldSlots(resolver(thread: [])))
    }

    // MARK: - L'hôte monte le message vivant

    func test_theOverlayLayer_mountsTheLiveMessage_andFollowsItsWithdrawal() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationLayers/ConversationBodyPresentations.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))

        XCTAssertTrue(code.contains("viewModel.resolveHeld(held).live"), "le menu se monte depuis le message relu, jamais depuis la copie du geste")
        XCTAssertTrue(code.contains(".adaptiveOnChange(of: overlayState.heldSlots"), "l'hôte suit le retrait du message tenu")
        XCTAssertTrue(code.contains("AdaptiveAccessibility.announce("), "la fermeture s'annonce à VoiceOver")
    }
}
