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

/// **Le glissé latéral, les actions VoiceOver et le double toucher d'une
/// rangée n'offrent que ce que le menu offre au même message** (#12626).
///
/// Le menu d'appui long lit `MessageActionPolicy` par `MessageMenuContext.make`.
/// Les deux autres portes de la rangée ne la lisaient pas : on répondait au
/// glissé à une vue unique, à un envoi `cid_` que le serveur ne connaît pas, à
/// un avis système, dans un canal d'annonce sans le rang d'écrire ; on
/// transférait un message chiffré de bout en bout. Un contrôle existe s'il a
/// un effet : sans verdict, le côté du glissé ne s'arme pas et l'action nommée
/// n'est pas exposée.
@MainActor
final class MessageRowOfferLawTests: XCTestCase {

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
        deletedAt: Date? = nil,
        effects: MessageEffects = .none,
        deliveryStatus: Message.DeliveryStatus = .sent,
        mine: Bool = false
    ) -> Message {
        Message(
            id: id,
            conversationId: "6a0ad86a6e21a483b4443d99",
            senderId: mine ? "6a0ad86a6e21a483b4443da1" : "6a0ad86a6e21a483b4443da2",
            content: "Bonjour",
            messageSource: messageSource,
            deletedAt: deletedAt,
            effects: effects,
            createdAt: now.addingTimeInterval(-3600),
            updatedAt: now.addingTimeInterval(-3600),
            senderUserId: mine ? viewerId : otherId,
            deliveryStatus: deliveryStatus,
            isMe: mine
        )
    }

    private func lawOffer(_ message: Message, _ authority: ConversationMenuAuthority) -> MessageRowOffer {
        MessageRowOffer.of(message, authority: authority, now: now)
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
        let offer = lawOffer(message(), authority())
        XCTAssertTrue(offer.canReply)
        XCTAssertTrue(offer.canForward)
        XCTAssertEqual(offer.accessibilityActions, [.reply, .forward])
    }

    // MARK: - Répondre : ce que la loi refuse ne s'offre pas

    func test_offer_aViewOnceMessage_offersNoReply() {
        let offer = lawOffer(message(effects: MessageEffects(flags: .viewOnce)), authority())
        XCTAssertFalse(offer.canReply, "une vue unique ne se cite pas")
        XCTAssertFalse(offer.accessibilityActions.contains(.reply))
    }

    func test_offer_anUnsentClientMessage_offersNoReply() {
        let offer = lawOffer(message(id: ClientMessageId.generate(), deliveryStatus: .sending), authority())
        XCTAssertFalse(offer.canReply, "un envoi `cid_` n'existe pas encore pour le serveur : sa citation pointerait dans le vide")
        XCTAssertFalse(offer.accessibilityActions.contains(.reply))
    }

    func test_offer_aSystemNotice_offersNoReply() {
        let offer = lawOffer(message(messageSource: .system), authority())
        XCTAssertFalse(offer.canReply, "un avis système ne se cite pas")
        XCTAssertFalse(offer.canForward, "un avis système ne se transfère pas")
        XCTAssertEqual(offer.accessibilityActions, [])
    }

    func test_offer_anAnnouncementChannelWithoutTheWritingRank_offersNoReply() {
        let offer = lawOffer(message(), authority(isAnnouncementChannel: true))
        XCTAssertFalse(offer.canReply, "un membre sans rang d'écriture ne répond pas dans un canal d'annonce")
        XCTAssertFalse(offer.accessibilityActions.contains(.reply))
    }

    func test_offer_anAnnouncementChannelAdmin_replies() {
        XCTAssertTrue(lawOffer(message(), authority(conversationRole: "admin", isAnnouncementChannel: true)).canReply)
    }

    // MARK: - Transférer : le verdict de la loi, pas la seule loi de sortie

    func test_offer_anEndToEndEncryptedMessage_offersNoForward() {
        let offer = lawOffer(message(), authority(encryptionMode: "e2ee"))
        XCTAssertFalse(offer.canForward, "un message E2EE ne se transfère pas : le serveur n'en a pas le clair")
        XCTAssertTrue(offer.canReply, "répondre reste offert en E2EE")
        XCTAssertEqual(offer.accessibilityActions, [.reply])
    }

    // MARK: - D8 (#10949) : un flouté se transfère, flou hérité

    func test_offer_aBlurredMessage_forwardsWithItsBlur() {
        let offer = lawOffer(message(effects: MessageEffects(flags: .blurred)), authority())
        XCTAssertTrue(offer.canForward, "D8 : un flouté se transfère au glissé, la passerelle impose le flou à la copie")
        XCTAssertTrue(offer.canReply, "répondre reste offert : la citation masque un contenu protégé")
        XCTAssertEqual(offer.accessibilityActions, [.reply, .forward])
    }

    // MARK: - Même message, même verdict : la loi énoncée, le menu et la rangée

    /// Les attendus sont ÉNONCÉS, jamais recalculés : la rangée ET la feuille
    /// « Plus… » se comparent à la loi (`verdicts.canReply`, `verdicts.forward`
    /// composé avec la loi de sortie, D8 pour le flou), pas l'une à l'autre.
    func test_offer_andMenu_followTheStatedLaw() {
        let cases: [(name: String, message: Message, authority: ConversationMenuAuthority, reply: Bool, forward: Bool)] = [
            ("texte nominal", message(), authority(), true, true),
            ("flouté (D8)", message(effects: MessageEffects(flags: .blurred)), authority(), true, true),
            ("vue unique", message(effects: MessageEffects(flags: .viewOnce)), authority(), false, false),
            ("envoi cid_", message(id: ClientMessageId.generate(), deliveryStatus: .sending), authority(), false, false),
            ("envoi raté", message(deliveryStatus: .failed), authority(), false, false),
            ("supprimé", message(deletedAt: now.addingTimeInterval(-60)), authority(), false, false),
            ("avis système", message(messageSource: .system), authority(), false, false),
            ("annonce, membre", message(), authority(isAnnouncementChannel: true), false, true),
            ("annonce, admin", message(), authority(conversationRole: "admin", isAnnouncementChannel: true), true, true),
            ("E2EE", message(), authority(encryptionMode: "e2ee"), true, false)
        ]
        for c in cases {
            let offer = lawOffer(c.message, c.authority)
            let menu = menuOffers(c.message, c.authority)
            XCTAssertEqual(offer.canReply, c.reply, "glissé « Répondre » — \(c.name)")
            XCTAssertEqual(offer.canForward, c.forward, "glissé « Transférer » — \(c.name)")
            XCTAssertEqual(menu.contains(.reply), c.reply, "menu « Répondre » — \(c.name)")
            XCTAssertEqual(menu.contains(.forward), c.forward, "menu « Transférer » — \(c.name)")
        }
    }

    // MARK: - Éditer au double toucher : la même lecture, une seule fois

    func test_offer_ownTextWithinTheWindow_edits() {
        XCTAssertTrue(lawOffer(message(mine: true), authority()).canEdit)
    }

    func test_offer_someoneElsesMessage_doesNotEdit() {
        XCTAssertFalse(lawOffer(message(), authority(conversationRole: "admin")).canEdit,
                       "un rang de conversation n'ouvre pas l'édition du message d'autrui")
    }

    func test_closed_offersNothing() {
        let closed = MessageRowOffer.closed
        XCTAssertFalse(closed.canEdit || closed.canReply || closed.canForward)
    }

    // MARK: - Le geste : un côté sans verdict ne s'arme pas

    func test_committed_aRefusedSide_neverFires() {
        let replyOnly = MessageRowOffer(canReply: true, canForward: false)
        let distance = BubbleSwipeResistance.commitDistance
        XCTAssertEqual(replyOnly.committed(directedOffset: distance), .reply)
        XCTAssertNil(replyOnly.committed(directedOffset: -distance), "le transfert refusé ne se valide pas au glissé")

        let forwardOnly = MessageRowOffer(canReply: false, canForward: true)
        XCTAssertNil(forwardOnly.committed(directedOffset: distance), "la réponse refusée ne se valide pas au glissé")
        XCTAssertEqual(forwardOnly.committed(directedOffset: -distance), .forward)
    }

    /// Un côté refusé ne s'arme pas, mais l'horodatage reste lisible : la bulle
    /// suit le doigt SOUS le seuil — ni icône d'action, ni haptique, ni validation.
    func test_tracking_aRefusedSide_staysUnderTheThreshold_andKeepsTheStamp() {
        let replyOnly = MessageRowOffer(canReply: true, canForward: false)
        let far: CGFloat = 140
        XCTAssertEqual(replyOnly.trackedOffset(far, replyDirection: 1), far, "le côté offert suit le doigt")
        let refused = replyOnly.trackedOffset(-far, replyDirection: 1)
        XCTAssertLessThan(refused, -8, "l'horodatage du glissé reste visible")
        XCTAssertFalse(BubbleSwipeResistance.commits(offset: abs(refused)), "ni icône d'action, ni haptique")
        XCTAssertNil(replyOnly.committed(directedOffset: refused), "le côté refusé ne se valide pas")

        let mirrored = replyOnly.trackedOffset(far, replyDirection: -1)
        XCTAssertFalse(BubbleSwipeResistance.commits(offset: abs(mirrored)), "la direction de réponse est lue, pas le signe brut")

        let closed = MessageRowOffer.closed.trackedOffset(far, replyDirection: 1)
        XCTAssertGreaterThan(closed, 8, "sans verdict, le glissé montre encore quand le message est parti")
        XCTAssertFalse(BubbleSwipeResistance.commits(offset: closed))
        XCTAssertFalse(MessageRowOffer.closed.armsAnySide, "sans verdict, aucune action ne s'arme")
        XCTAssertEqual(MessageRowOffer.closed.accessibilityActions, [])
    }

    func test_accessibilityActions_areNamed() {
        let names = MessageRowOffer(canReply: true, canForward: true).accessibilityActions.map(\.accessibilityName)
        XCTAssertEqual(names.count, 2)
        XCTAssertTrue(names.allSatisfy { !$0.isEmpty })
        XCTAssertEqual(Set(names).count, 2)
    }

    // MARK: - Les gardes défensives

    func test_triggerReplyAndSwipeForward_readTheLaw() throws {
        let row = try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationView+MessageRow.swift")
        XCTAssertEqual(
            row.components(separatedBy: "guard MessageRowOffer.of(msg, authority: menuAuthority).canReply else { return }").count - 1, 2,
            "les deux `triggerReply` (message entier, pièce citée) refusent ce que la loi refuse"
        )
        let layer = try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationView+MessageListLayer.swift")
        XCTAssertTrue(layer.contains("MessageRowOffer.of(msg, authority: authority()).canForward"),
                      "le transfert au glissé relit le verdict de la loi, à l'autorité VIVANTE, pas la seule loi de sortie")
        XCTAssertTrue(layer.contains("let authority: () -> ConversationMenuAuthority"),
                      "l'autorité se relit au moment d'agir : une valeur capturée survit aux closures que `.equatable()` garde")
        XCTAssertFalse(layer.contains("msg.isForwardable else { return }"))
        let rows = try AppSourceGuard.unit("Meeshy/Features/Main/Views/MessageListViewController+Rows.swift")
        XCTAssertTrue(rows.contains("onSwipeReply: offer.canReply ?"), "sans verdict, le glissé vers « Répondre » ne s'arme pas")
        XCTAssertTrue(rows.contains("onSwipeForward: offer.canForward ?"), "sans verdict, le glissé vers « Transférer » ne s'arme pas")
        XCTAssertTrue(rows.contains("repondre: offer.canReply ? callbacks.swipeReply : nil"), "le double toucher suit le même verdict")
        XCTAssertTrue(rows.contains("transferer: offer.canForward ? callbacks.swipeForward : nil"))
    }

    /// La barre de réaction rapide est une porte de plus : « Répondre » n'y est
    /// rendu que si la loi l'offre (un bouton sans effet n'existe pas), et
    /// « Transférer » lit le verdict de la loi, pas la seule loi de sortie.
    func test_quickReactionBar_readsTheSameOffer() throws {
        let row = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationView+MessageRow.swift"))
        XCTAssertTrue(row.contains("let offer = viewModel.messageIndex(for: messageId).map { MessageRowOffer.of(viewModel.messages[$0], authority: menuAuthority) } ?? .closed"))
        XCTAssertTrue(row.contains("if offer.canReply {"), "« Répondre » n'est rendu que si la loi l'offre")
        XCTAssertTrue(row.contains("if offer.canForward {"), "« Transférer » lit le verdict de la loi")
        XCTAssertFalse(row.contains("viewModel.messages[$0].isForwardable"), "la barre ne relit plus la seule loi de sortie")
    }
}
