import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le menu et l'aperçu d'un message lisent la loi partagée EN ENTIER**
/// (#11214, milestone « L'appui long montre ce qu'on voit et ne propose que ce
/// qu'on peut faire »).
///
/// Huit lacunes confirmées, chacune éprouvée par son propre témoin : la barre
/// d'emojis et la réaction de pièce offertes à qui ne peut pas réagir ; le
/// mineur dans Global codé en dur à `false` ; Supprimer à deux gestes ; la
/// traduction disparue en E2EE ; trois états protégés confondus avec un message
/// ordinaire ; un aperçu réduit à 40 % ; la citation d'une pièce dans une
/// conversation fermée.
@MainActor
final class MessageOverlayMaturityTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let viewerId = "6a0ad86a6e21a483b4443d01"
    private let otherId = "6a0ad86a6e21a483b4443d02"

    // MARK: - Fabriques

    private func viewer(isDeclaredMinor: Bool = false) -> ConversationViewerAuthority {
        ConversationViewerAuthority(
            id: viewerId, participantId: nil, hasAccount: true, isAnonymous: false,
            platformRoleRaw: "USER", conversationRoleRaw: "member",
            isActiveMember: true, canSendMessages: true, isDeclaredMinor: isDeclaredMinor
        )
    }

    private func authority(
        type: String = "group",
        encryptionMode: String? = nil,
        isActive: Bool? = true,
        closedAt: Date? = nil,
        isDeclaredMinor: Bool = false
    ) -> ConversationMenuAuthority {
        ConversationMenuAuthority(
            viewer: viewer(isDeclaredMinor: isDeclaredMinor),
            conversation: MessageActionPolicy.Conversation(
                type: type, encryptionMode: encryptionMode, isActive: isActive, closedAt: closedAt
            )
        )
    }

    private func message(
        mine: Bool,
        content: String = "Bonjour",
        deletedAt: Date? = nil,
        expiresAt: Date? = nil,
        isEncrypted: Bool = false,
        attachments: [MessageAttachment] = []
    ) -> Message {
        Message(
            id: "6a0ad86a6e21a483b4443d11",
            conversationId: "6a0ad86a6e21a483b4443d99",
            senderId: mine ? "6a0ad86a6e21a483b4443da1" : "6a0ad86a6e21a483b4443da2",
            content: content,
            deletedAt: deletedAt,
            expiresAt: expiresAt,
            isEncrypted: isEncrypted,
            createdAt: now.addingTimeInterval(-3600),
            updatedAt: now.addingTimeInterval(-3600),
            attachments: attachments,
            senderUserId: mine ? viewerId : otherId,
            isMe: mine
        )
    }

    private func make(_ message: Message, _ authority: ConversationMenuAuthority) -> MessageMenuContext {
        MessageMenuContext.make(message: message, facts: MessageMenuFacts(), authority: authority, now: now)
    }

    // MARK: - 1. Réagir

    func test_make_whenVerdictCannotReact_contextCanReactIsFalse() {
        let closed = make(message(mine: false), authority(closedAt: now.addingTimeInterval(-60)))
        XCTAssertFalse(closed.canReact, "une conversation fermée ne se réagit pas")
        let inactive = make(message(mine: false), authority(isActive: false))
        XCTAssertFalse(inactive.canReact)
        let gone = make(message(mine: false, deletedAt: now), authority())
        XCTAssertFalse(gone.canReact, "un message disparu ne se réagit pas")
        XCTAssertTrue(make(message(mine: false), authority()).canReact, "témoin : une conversation ouverte réagit")
    }

    func test_overlayMenu_whenCannotReact_doesNotMountEmojiQuickBar() {
        XCTAssertFalse(MessageOverlayMenu.showsEmojiQuickBar(for: .closed), "hors hôte, aucun verdict n'est ouvert")
        let closed = make(message(mine: false), authority(closedAt: now.addingTimeInterval(-60)))
        XCTAssertFalse(MessageOverlayMenu.showsEmojiQuickBar(for: closed))
        let open = make(message(mine: false), authority())
        XCTAssertTrue(MessageOverlayMenu.showsEmojiQuickBar(for: open))
    }

    // MARK: - 2. Le mineur dans Global

    private func globalConversation(restriction: ConversationWriteRestriction?) -> Conversation {
        var conversation = MeeshyConversation(id: "6a0ad86a6e21a483b4443d99", identifier: "global", type: .global)
        conversation.viewerWriteRestriction = restriction
        return conversation
    }

    func test_make_whenViewerWriteRestrictionGlobalAdultsOnly_hidesReplyEditPin() {
        let user = MeeshyUser(id: viewerId, username: "lea")
        let minorAuthority = ConversationMenuAuthority.make(
            conversation: globalConversation(restriction: .minorGlobal), currentUser: user, guest: nil)
        XCTAssertTrue(minorAuthority.viewer.isDeclaredMinor, "la restriction SERVIE fait le mineur")

        let own = make(message(mine: true), minorAuthority)
        XCTAssertFalse(own.canReply, "Global n'admet l'écriture qu'à 18 ans")
        XCTAssertFalse(own.canEdit)
        XCTAssertFalse(own.canPin)
        XCTAssertFalse(MessageActionResolver.primaryActions(own).contains(.reply))
        XCTAssertFalse(MessageActionResolver.primaryActions(own).contains(.edit))

        let adult = ConversationMenuAuthority.make(
            conversation: globalConversation(restriction: nil), currentUser: user, guest: nil)
        let adultContext = make(message(mine: true), adult)
        XCTAssertTrue(adultContext.canReply)
        XCTAssertTrue(adultContext.canEdit)
        XCTAssertTrue(adultContext.canPin)
    }

    func test_declaresMinor_onlyMinorGlobalClosesTheWriteDoor() {
        XCTAssertTrue(ConversationMenuAuthority.declaresMinor(globalConversation(restriction: .minorGlobal)))
        XCTAssertFalse(ConversationMenuAuthority.declaresMinor(globalConversation(restriction: .unknown("future"))),
                       "une restriction inconnue laisse écrire : la passerelle refuse et dit pourquoi")
        XCTAssertFalse(ConversationMenuAuthority.declaresMinor(nil))
    }

    func test_listRowViewer_readsTheServedRestriction() {
        let user = MeeshyUser(id: viewerId, username: "lea")
        let minor = ConversationRowMenuCapabilities.viewer(of: globalConversation(restriction: .minorGlobal), currentUser: user)
        XCTAssertTrue(minor.isDeclaredMinor)
        let adult = ConversationRowMenuCapabilities.viewer(of: globalConversation(restriction: nil), currentUser: user)
        XCTAssertFalse(adult.isDeclaredMinor)
    }

    // MARK: - 3. Supprimer à un geste

    func test_resolver_destructiveGroup_putsDeleteInPrimaryAsRed() {
        let own = make(message(mine: true), authority())
        XCTAssertTrue(own.canDelete)
        let primary = MessageActionResolver.primaryActions(own)
        XCTAssertEqual(Array(primary.suffix(2)), [.deleteMessage, .more], "rouge, juste avant « Plus… » : un geste")
        XCTAssertTrue(PrimaryAction.deleteMessage.isDestructive)
        XCTAssertTrue(PrimaryAction.deletePiece.isDestructive)
        XCTAssertFalse(PrimaryAction.reply.isDestructive)
        XCTAssertEqual(PrimaryAction.deleteMessage.verb, .delete, "un acte, un verbe : la table commune le nomme")
    }

    func test_resolver_destructiveGroup_followsTheContentType() {
        let gone = make(message(mine: true, deletedAt: now), authority())
        XCTAssertEqual(MessageActionResolver.primaryActions(gone), [.deleteMessage, .more],
                       "un message disparu : Supprimer pour moi est le seul geste qui reste")
        let noRight = MessageMenuContext(
            isMine: false, canEdit: false, canDelete: false, hasText: true, hasMedia: false, hasTimebasedMedia: false,
            isPinned: false, isStarred: false, isEdited: false, hasEditRevisions: false)
        XCTAssertFalse(MessageActionResolver.primaryActions(noRight).contains(.deleteMessage),
                       "sans verdict de suppression, aucune entrée")
    }

    func test_overlayMenu_withoutDeleteHandler_doesNotOfferADeadDelete() {
        let own = make(message(mine: true), authority())
        let actions = MessageActionResolver.primaryActions(own)
        let wired = MessageOverlayMenu.reachable(actions, context: own, hasDeleteHandler: true, hasDeviceTranslationHandler: false)
        XCTAssertTrue(wired.contains(.deleteMessage))
        let unwired = MessageOverlayMenu.reachable(actions, context: own, hasDeleteHandler: false, hasDeviceTranslationHandler: false)
        XCTAssertFalse(unwired.contains(.deleteMessage), "un contrôle existe s'il a un effet")
    }

    // MARK: - 4. Traduire sur l'appareil

    func test_resolver_e2ee_offersTranslateOnDevice() {
        let e2ee = make(message(mine: false), authority(encryptionMode: "e2ee"))
        XCTAssertTrue(e2ee.translatesOnDevice)
        XCTAssertFalse(e2ee.canTranslate, "le serveur ne lit pas le clair")
        XCTAssertTrue(MessageActionResolver.primaryActions(e2ee).contains(.translate))

        let actions = MessageActionResolver.primaryActions(e2ee)
        XCTAssertTrue(MessageOverlayMenu.reachable(
            actions, context: e2ee, hasDeleteHandler: true, hasDeviceTranslationHandler: true).contains(.translate))
        XCTAssertFalse(MessageOverlayMenu.reachable(
            actions, context: e2ee, hasDeleteHandler: true, hasDeviceTranslationHandler: false).contains(.translate),
            "sans moteur câblé, la vue Langue serait refusée par le serveur : pas d'entrée")

        let served = make(message(mine: false), authority())
        XCTAssertTrue(MessageOverlayMenu.reachable(
            MessageActionResolver.primaryActions(served), context: served,
            hasDeleteHandler: true, hasDeviceTranslationHandler: false).contains(.translate),
            "hors E2EE, la vue Langue sert comme avant")
    }

    // MARK: - 5. Les formes protégées de l'aperçu

    func test_overlayPreviewProtection_encryptedEphemeralGone_haveDistinctForms() {
        let encrypted = OverlayPreviewProtection.form(for: message(mine: false, content: "", isEncrypted: true), now: now)
        let ephemeral = OverlayPreviewProtection.form(for: message(mine: false, expiresAt: now.addingTimeInterval(600)), now: now)
        let gone = OverlayPreviewProtection.form(for: message(mine: false, deletedAt: now), now: now)
        XCTAssertEqual(encrypted, .encrypted)
        XCTAssertEqual(ephemeral, .ephemeral)
        XCTAssertEqual(gone, .gone)
        XCTAssertEqual(Set([encrypted.chipSymbol, ephemeral.chipSymbol, gone.chipSymbol].compactMap { $0 }).count, 3,
                       "trois états, trois pictogrammes : on lit POURQUOI l'aperçu ne montre rien")
        XCTAssertNotEqual(ProtectedFormChip.label(for: .encrypted), ProtectedFormChip.label(for: .gone))
        XCTAssertNotEqual(ProtectedFormChip.label(for: .ephemeral), ProtectedFormChip.label(for: .gone))
    }

    func test_overlayPreviewProtection_expiredMessage_isGone_notEphemeral() {
        XCTAssertEqual(
            OverlayPreviewProtection.form(for: message(mine: false, expiresAt: now.addingTimeInterval(-1)), now: now), .gone)
    }

    func test_overlayPreviewProtection_decryptedEncryptedMessage_showsAsTheThreadDoes() {
        XCTAssertEqual(
            OverlayPreviewProtection.form(for: message(mine: false, content: "Salut", isEncrypted: true), now: now), .clear,
            "un message chiffré que l'appareil a déchiffré se montre comme le fil le montre")
        XCTAssertEqual(OverlayPreviewProtection.form(for: message(mine: false), now: now), .clear)
    }

    func test_pieceProtection_followsTheNewForms() {
        let ephemeral = message(mine: false, expiresAt: now.addingTimeInterval(600))
        XCTAssertTrue(MessagePieceTarget.messageIsProtected(ephemeral), "ce qui brûle ne se montre pas pièce par pièce")
    }

    // MARK: - 6. L'échelle a un plancher

    func test_fitScale_longMessage_neverBelowFloorAndScrollsInternally() {
        let long = MessageOverlayPreviewFit.resolve(naturalHeight: 3000, chromeHeight: 300, available: 700)
        XCTAssertEqual(long.scale, MessageOverlayPreviewFit.scaleFloor, accuracy: 0.0001)
        XCTAssertGreaterThanOrEqual(long.scale, 0.6)
        XCTAssertEqual(long.visibleHeight, 400, accuracy: 0.0001, "l'aperçu se borne à la place qui reste")
        XCTAssertTrue(long.scrollsInternally)

        let short = MessageOverlayPreviewFit.resolve(naturalHeight: 100, chromeHeight: 300, available: 700)
        XCTAssertEqual(short.scale, 1, accuracy: 0.0001)
        XCTAssertEqual(short.visibleHeight, 100, accuracy: 0.0001)
        XCTAssertFalse(short.scrollsInternally)

        let medium = MessageOverlayPreviewFit.resolve(naturalHeight: 600, chromeHeight: 300, available: 700)
        XCTAssertEqual(medium.scale, 400.0 / 600.0, accuracy: 0.0001)
        XCTAssertFalse(medium.scrollsInternally, "réduit, il tient : pas de défilement")
        XCTAssertGreaterThanOrEqual(medium.scale, MessageOverlayPreviewFit.scaleFloor)
    }

    func test_fitScale_noRoomAtAll_keepsAMinimumHeight() {
        let result = MessageOverlayPreviewFit.resolve(naturalHeight: 800, chromeHeight: 900, available: 700)
        XCTAssertEqual(result.visibleHeight, MessageOverlayPreviewFit.minimumRoom, accuracy: 0.0001)
        XCTAssertTrue(result.scrollsInternally)
    }

    func test_bubblePreview_hasTheSameSixteenPointMarginAsTheFlatRow() {
        XCTAssertEqual(MessageOverlayCellPreview.bubbleMargin, 16)
        XCTAssertEqual(MessageOverlayCellPreview.bubbleMargin, MessageOverlayCellPreview.flatRowMargin)
    }

    // MARK: - 7. Le menu d'une pièce

    func test_pieceMenu_closedConversation_hidesReplyAndReact() {
        let closed = make(message(mine: false), authority(closedAt: now.addingTimeInterval(-60)))
        let context = MessagePieceMenu.Context(isProtected: false, menu: closed)
        XCTAssertFalse(context.canReply)
        XCTAssertFalse(context.canReact)
        XCTAssertFalse(MessagePieceMenu.actions(context).contains(.replyToPiece), "on ne cite pas dans une conversation fermée")
        XCTAssertFalse(MessagePieceMenu.offersReaction(context))
        XCTAssertEqual(MessagePieceMenu.actions(context).last, .wholeMessage)

        let open = MessagePieceMenu.Context(isProtected: false, menu: make(message(mine: false), authority()))
        XCTAssertTrue(MessagePieceMenu.actions(open).contains(.replyToPiece))
        XCTAssertTrue(MessagePieceMenu.offersReaction(open))
    }

    func test_pieceMenu_minorInGlobal_hidesReply() {
        let user = MeeshyUser(id: viewerId, username: "lea")
        let minorAuthority = ConversationMenuAuthority.make(
            conversation: globalConversation(restriction: .minorGlobal), currentUser: user, guest: nil)
        let context = MessagePieceMenu.Context(isProtected: false, menu: make(message(mine: false), minorAuthority))
        XCTAssertFalse(MessagePieceMenu.actions(context).contains(.replyToPiece))
    }

    func test_pieceMenu_protectedPiece_neverOffersReaction() {
        let context = MessagePieceMenu.Context(isProtected: true, exits: .unrestricted, canDelete: false)
        XCTAssertFalse(MessagePieceMenu.offersReaction(context))
    }
}
