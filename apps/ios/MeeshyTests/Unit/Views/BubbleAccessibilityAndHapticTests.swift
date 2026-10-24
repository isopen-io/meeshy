import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class BubbleAccessibilityAndHapticTests: XCTestCase {

    func test_bubble_exposesNamedAccessibilityActions_replyReactCopyMenu() {
        let all = BubbleAccessibilityActionSet.available(canReply: true, canReact: true, canCopy: true, canOpenMenu: true)
        XCTAssertEqual(all, [.reply, .react, .copy, .openMenu])
        XCTAssertTrue(all.allSatisfy { !$0.name.isEmpty })
        XCTAssertEqual(Set(all.map(\.name)).count, 4)
    }

    func test_bubble_omitsAccessibilityActionsWithoutHandler() {
        let some = BubbleAccessibilityActionSet.available(canReply: false, canReact: true, canCopy: false, canOpenMenu: true)
        XCTAssertEqual(some, [.react, .openMenu])
    }

    func test_swipeResistance_crossingReplyThreshold_firesLightHapticOnce() {
        let below = BubbleSwipeResistance.crossing(wasCrossed: false, offset: BubbleSwipeResistance.commitDistance - 1)
        XCTAssertEqual(below, .init(crossed: false, firesHaptic: false))

        let first = BubbleSwipeResistance.crossing(wasCrossed: false, offset: BubbleSwipeResistance.commitDistance)
        XCTAssertEqual(first, .init(crossed: true, firesHaptic: true))

        let beyond = BubbleSwipeResistance.crossing(wasCrossed: first.crossed, offset: BubbleSwipeResistance.commitDistance + 20)
        XCTAssertEqual(beyond, .init(crossed: true, firesHaptic: false))

        let backAndForth = BubbleSwipeResistance.crossing(wasCrossed: false, offset: -BubbleSwipeResistance.commitDistance)
        XCTAssertTrue(backAndForth.firesHaptic)
    }
}

/// **Le glissé latéral et les actions VoiceOver d'une rangée n'offrent que ce
/// que le menu offre au même message** (#12626).
///
/// Le menu d'appui long lit `MessageActionPolicy` par `MessageMenuContext.make`.
/// Les deux autres portes de la rangée ne la lisaient pas : on répondait au
/// glissé à une vue unique, à un envoi `cid_` que le serveur ne connaît pas, à
/// un avis système, dans un canal d'annonce sans le rang d'écrire ; on
/// transférait un message chiffré de bout en bout. Un contrôle existe s'il a
/// un effet : sans verdict, le côté du glissé ne s'arme pas et l'action nommée
/// n'est pas exposée.
@MainActor
final class BubbleSwipeOfferLawTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let viewerId = "6a0ad86a6e21a483b4443d01"
    private let otherId = "6a0ad86a6e21a483b4443d02"

    private func authority(
        conversationRole: String? = "member",
        encryptionMode: String? = nil,
        isAnnouncementChannel: Bool = false
    ) -> ConversationMenuAuthority {
        ConversationMenuAuthority(
            viewer: ConversationViewerAuthority(
                id: viewerId,
                participantId: nil,
                hasAccount: true,
                isAnonymous: false,
                platformRoleRaw: "USER",
                conversationRoleRaw: conversationRole,
                isActiveMember: true,
                canSendMessages: true,
                isDeclaredMinor: false
            ),
            conversation: MessageActionPolicy.Conversation(
                type: "group",
                encryptionMode: encryptionMode,
                isAnnouncementChannel: isAnnouncementChannel
            )
        )
    }

    private func message(
        id: String = "6a0ad86a6e21a483b4443d11",
        messageSource: Message.MessageSource = .user,
        effects: MessageEffects = .none,
        deliveryStatus: Message.DeliveryStatus = .sent
    ) -> Message {
        Message(
            id: id,
            conversationId: "6a0ad86a6e21a483b4443d99",
            senderId: "6a0ad86a6e21a483b4443da2",
            content: "Bonjour",
            messageSource: messageSource,
            effects: effects,
            createdAt: now.addingTimeInterval(-3600),
            updatedAt: now.addingTimeInterval(-3600),
            senderUserId: otherId,
            deliveryStatus: deliveryStatus,
            isMe: false
        )
    }

    private func offer(_ message: Message, _ authority: ConversationMenuAuthority) -> BubbleSwipeOffer {
        BubbleSwipeOffer.of(message, authority: authority, now: now)
    }

    private func menuOffers(_ message: Message, _ authority: ConversationMenuAuthority) -> [MoreItem] {
        let ctx = MessageMenuContext.make(message: message, facts: MessageMenuFacts(), authority: authority, now: now)
        return MessageActionResolver.moreSections(ctx).flatMap { section -> [MoreItem] in
            switch section {
            case .actions(let items), .info(let items), .moderation(let items): return items
            }
        }
    }

    // MARK: - Le nominal : les deux portes

    func test_offer_aPlainTextMessage_offersReplyAndForward() {
        let offer = offer(message(), authority())
        XCTAssertTrue(offer.canReply)
        XCTAssertTrue(offer.canForward)
        XCTAssertEqual(offer.accessibilityActions, [.reply, .forward])
    }

    // MARK: - Répondre : ce que la loi refuse ne s'offre pas

    func test_offer_aViewOnceMessage_offersNoReply() {
        let offer = offer(message(effects: MessageEffects(flags: .viewOnce)), authority())
        XCTAssertFalse(offer.canReply, "une vue unique ne se cite pas")
        XCTAssertFalse(offer.accessibilityActions.contains(.reply))
    }

    func test_offer_anUnsentClientMessage_offersNoReply() {
        let offer = offer(message(id: ClientMessageId.generate(), deliveryStatus: .sending), authority())
        XCTAssertFalse(offer.canReply, "un envoi `cid_` n'existe pas encore pour le serveur : sa citation pointerait dans le vide")
        XCTAssertFalse(offer.accessibilityActions.contains(.reply))
    }

    func test_offer_aSystemNotice_offersNoReply() {
        let offer = offer(message(messageSource: .system), authority())
        XCTAssertFalse(offer.canReply, "un avis système ne se cite pas")
        XCTAssertFalse(offer.canForward, "un avis système ne se transfère pas")
        XCTAssertEqual(offer.accessibilityActions, [])
    }

    func test_offer_anAnnouncementChannelWithoutTheWritingRank_offersNoReply() {
        let offer = offer(message(), authority(isAnnouncementChannel: true))
        XCTAssertFalse(offer.canReply, "un membre sans rang d'écriture ne répond pas dans un canal d'annonce")
        XCTAssertFalse(offer.accessibilityActions.contains(.reply))
    }

    func test_offer_anAnnouncementChannelAdmin_replies() {
        XCTAssertTrue(offer(message(), authority(conversationRole: "admin", isAnnouncementChannel: true)).canReply)
    }

    // MARK: - Transférer : le verdict de la loi, pas la seule loi de sortie

    func test_offer_anEndToEndEncryptedMessage_offersNoForward() {
        let offer = offer(message(), authority(encryptionMode: "e2ee"))
        XCTAssertFalse(offer.canForward, "un message E2EE ne se transfère pas : le serveur n'en a pas le clair")
        XCTAssertTrue(offer.canReply, "répondre reste offert en E2EE")
        XCTAssertEqual(offer.accessibilityActions, [.reply])
    }

    // MARK: - Même message, même verdict que le menu

    func test_offer_neverOffersWhatTheMenuRefuses() {
        let cases: [(Message, ConversationMenuAuthority)] = [
            (message(), authority()),
            (message(effects: MessageEffects(flags: .viewOnce)), authority()),
            (message(id: ClientMessageId.generate(), deliveryStatus: .sending), authority()),
            (message(messageSource: .system), authority()),
            (message(), authority(isAnnouncementChannel: true)),
            (message(), authority(encryptionMode: "e2ee"))
        ]
        for (msg, auth) in cases {
            let menu = menuOffers(msg, auth)
            let offer = offer(msg, auth)
            XCTAssertEqual(offer.canReply, menu.contains(.reply), "glissé et menu divergent sur « Répondre » (\(msg.id))")
            XCTAssertEqual(offer.canForward, menu.contains(.forward), "glissé et menu divergent sur « Transférer » (\(msg.id))")
        }
    }

    // MARK: - Le geste : un côté sans verdict ne s'arme pas

    func test_committed_aRefusedSide_neverFires() {
        let replyOnly = BubbleSwipeOffer(canReply: true, canForward: false)
        let distance = BubbleSwipeResistance.commitDistance
        XCTAssertEqual(replyOnly.committed(directedOffset: distance), .reply)
        XCTAssertNil(replyOnly.committed(directedOffset: -distance), "le transfert refusé ne se valide pas au glissé")

        let forwardOnly = BubbleSwipeOffer(canReply: false, canForward: true)
        XCTAssertNil(forwardOnly.committed(directedOffset: distance), "la réponse refusée ne se valide pas au glissé")
        XCTAssertEqual(forwardOnly.committed(directedOffset: -distance), .forward)
    }

    func test_arms_aRefusedSide_keepsTheBubbleInPlace() {
        let replyOnly = BubbleSwipeOffer(canReply: true, canForward: false)
        XCTAssertTrue(replyOnly.arms(directedOffset: 30))
        XCTAssertFalse(replyOnly.arms(directedOffset: -30), "la bulle ne suit pas le doigt vers un côté refusé")
        XCTAssertFalse(BubbleSwipeOffer.closed.armsAnySide, "sans verdict, aucun glissé ne s'engage")
        XCTAssertEqual(BubbleSwipeOffer.closed.accessibilityActions, [])
    }

    func test_accessibilityActions_areNamed() {
        let names = BubbleSwipeOffer(canReply: true, canForward: true).accessibilityActions.map(\.accessibilityName)
        XCTAssertEqual(names.count, 2)
        XCTAssertTrue(names.allSatisfy { !$0.isEmpty })
        XCTAssertEqual(Set(names).count, 2)
    }

    // MARK: - Les gardes défensives

    func test_triggerReplyAndSwipeForward_readTheLaw() throws {
        let row = try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationView+MessageRow.swift")
        XCTAssertEqual(
            row.components(separatedBy: "guard mayReply(to: msg) else { return }").count - 1, 2,
            "les deux `triggerReply` (message entier, pièce citée) refusent ce que la loi refuse"
        )
        let layer = try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationView+MessageListLayer.swift")
        XCTAssertTrue(layer.contains("BubbleSwipeOffer.of(msg, authority: authority).canForward"),
                      "le transfert au glissé relit le verdict de la loi, pas la seule loi de sortie")
        XCTAssertFalse(layer.contains("msg.isForwardable else { return }"))
    }
}
