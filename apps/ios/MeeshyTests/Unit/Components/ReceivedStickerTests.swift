import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un sticker reçu se garde dans ses stickers, jamais comme une image** (#10630).
@MainActor
final class ReceivedStickerTests: XCTestCase {

    // MARK: - Fabriques

    private func makeImage(id: String = "att1", fileUrl: String = "https://cdn.example/sticker.png") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id, messageId: "m1", fileName: "sticker.png", originalName: "sticker.png",
            mimeType: "image/png", fileSize: 2048, filePath: "", fileUrl: fileUrl,
            uploadedBy: "u2", createdAt: Date(timeIntervalSince1970: 0)
        )
    }

    private func makeMessage(
        attachments: [MeeshyMessageAttachment]? = nil,
        sticker: MessageSticker? = MessageSticker(emoji: "🎉"),
        isMe: Bool = false
    ) -> MeeshyMessage {
        var message = MeeshyMessage(
            id: "m1", conversationId: "c1", senderId: "u2", content: "",
            originalLanguage: "fr", attachments: attachments ?? [makeImage()],
            senderName: "Bob", cachedTimeString: "12:34", sticker: sticker
        )
        message.isMe = isMe
        return message
    }

    private func menu(isSticker: Bool, addable: Bool, attachments: Int = 1,
                      exits: MessageExitOffer = .unrestricted, isBlurred: Bool = false) -> MessageMenuContext {
        MessageMenuContext(isMine: false, canEdit: false, canDelete: false,
                           hasText: false, hasMedia: true, hasTimebasedMedia: false,
                           isPinned: false, isStarred: false, isEdited: false,
                           hasEditRevisions: false, saveableAttachmentCount: attachments,
                           isSticker: isSticker, stickerAddable: addable,
                           exits: exits, isBlurred: isBlurred)
    }

    // MARK: - Ce qui s'ajoute

    func test_savable_aStickerWithAnImage_derivesAStableLibraryID() throws {
        let savable = try XCTUnwrap(ReceivedSticker.savable(in: makeMessage()))
        XCTAssertEqual(savable.id, "received-att1")
        XCTAssertEqual(savable.mediaURLString, "https://cdn.example/sticker.png")
    }

    func test_savable_aMessageWithoutSticker_isNil() {
        XCTAssertNil(ReceivedSticker.savable(in: makeMessage(sticker: nil)))
    }

    func test_savable_aStickerWithoutImage_isNil() {
        XCTAssertNil(ReceivedSticker.savable(in: makeMessage(attachments: [])),
                     "un sticker emoji ou gabarit sans image n'a rien à déposer : l'ajout n'est pas offert")
    }

    // MARK: - Ce qui est déjà rangé

    func test_offersAdd_whenTheDerivedEntryIsKnown_isFalse() {
        XCTAssertFalse(ReceivedSticker.offersAdd(for: makeMessage(), known: ["received-att1"]))
    }

    func test_offersAdd_whenAbsentFromTheLibrary_isTrue() {
        XCTAssertTrue(ReceivedSticker.offersAdd(for: makeMessage(), known: ["received-other"]))
    }

    func test_offersAdd_myOwnLibraryStickerSentBack_isFalse() {
        let mine = makeMessage(sticker: MessageSticker(stickerId: "6a0ad86a6e21a483b4443d12"), isMe: true)
        XCTAssertFalse(ReceivedSticker.offersAdd(for: mine, known: []))
    }

    func test_offersAdd_aLibraryStickerReceivedFromSomeoneElse_stillOffersIt() {
        let theirs = makeMessage(sticker: MessageSticker(stickerId: "6a0ad86a6e21a483b4443d12"), isMe: false)
        XCTAssertTrue(ReceivedSticker.offersAdd(for: theirs, known: []))
    }

    /// Les QUATRE modes de lecture lisent l'identifiant de bibliothèque sur le même
    /// `BubbleContent.Sticker` : Focal, Script et Rivière ne disent plus « Ajouter » pour
    /// un sticker que la bulle sait déjà rangé.
    func test_resolveSticker_carriesTheLibraryIdentifier() {
        let sticker = BubbleContent.resolveSticker(
            MessageSticker(emoji: "🎉", stickerId: "6a0ad86a6e21a483b4443d12"), attachments: [makeImage()])
        XCTAssertEqual(sticker?.libraryStickerId, "6a0ad86a6e21a483b4443d12")
    }

    // MARK: - Le menu

    /// Le menu RAPIDE de l'appui long l'offre, à la place qu'« Enregistrer » occupe pour une
    /// photo — comme le menu du web (`messageMenuItems`) : deux gestes, jamais trois.
    func test_menu_offersAddSticker_inTheQuickMenu_onlyWhenAddable() {
        XCTAssertTrue(MessageActionResolver.primaryActions(menu(isSticker: true, addable: true)).contains(.addSticker))
        XCTAssertFalse(MessageActionResolver.primaryActions(menu(isSticker: true, addable: false)).contains(.addSticker))
        XCTAssertFalse(MessageActionResolver.primaryActions(menu(isSticker: false, addable: false)).contains(.addSticker))
    }

    func test_menu_addSticker_takesTheSlotOfSave() throws {
        let actions = MessageActionResolver.primaryActions(menu(isSticker: true, addable: true))
        let add = try XCTUnwrap(actions.firstIndex(of: .addSticker))
        let select = try XCTUnwrap(actions.firstIndex(of: .select))
        XCTAssertGreaterThan(add, select)
        XCTAssertEqual(actions.last, .more)
    }

    func test_menu_aBlurredOrRetainedSticker_neverOffersTheAdd() {
        XCTAssertFalse(MessageActionResolver.primaryActions(
            menu(isSticker: true, addable: true, isBlurred: true)).contains(.addSticker))
        let blurredExit = MessageExitOffer(law: .ordinary, holdsBlur: true, isEncrypted: false)
        XCTAssertFalse(MessageActionResolver.primaryActions(
            menu(isSticker: true, addable: true, exits: blurredExit)).contains(.addSticker))
    }

    /// Une SEULE porte vers « Mes stickers » dans le menu : la feuille « Plus… » ne la double pas.
    func test_moreSheet_doesNotDoubleTheQuickMenuEntry() {
        let sections = MessageActionResolver.moreSections(menu(isSticker: true, addable: true))
        XCTAssertFalse(sections.contains { section in
            if case .actions(let items) = section { return items.map(\.rawValue).contains("addSticker") }
            return false
        })
    }

    func test_menu_aStickerNeverOffersSaveToPhotos() {
        let actions = MessageActionResolver.primaryActions(menu(isSticker: true, addable: true))
        XCTAssertFalse(actions.contains(.saveMedia), "l'image d'un sticker n'est pas une photo")
    }

    func test_menu_aPlainSingleImage_stillOffersSave() {
        let actions = MessageActionResolver.primaryActions(menu(isSticker: false, addable: false))
        XCTAssertTrue(actions.contains(.saveMedia))
    }

    // MARK: - La galerie

    func test_gallery_aStickerIsNotAdmitted_butAPhotoIs() {
        let sticker = makeMessage()
        let photo = makeMessage(sticker: nil)
        XCTAssertFalse(ConversationMediaRules.admits(sticker, now: Date(), isHidden: { _ in false }))
        XCTAssertTrue(ConversationMediaRules.admits(photo, now: Date(), isHidden: { _ in false }))
    }

    func test_mediaHub_aStickerCarriesNoVisualItem() {
        let items = ConversationMediaHubRules.items(
            of: [makeMessage()], kind: .visual, now: Date(), isHidden: { _ in false })
        XCTAssertTrue(items.isEmpty)
    }

    // MARK: - Le double toucher reste au menu

    func test_tapWindow_isShorterThanASecond_andPositive() {
        XCTAssertGreaterThan(ReceivedSticker.doubleTapWindow, 0)
        XCTAssertLessThan(ReceivedSticker.doubleTapWindow, 0.5)
    }
}

/// Taille, ombre et flottement d'un sticker (#10630).
@MainActor
final class StickerFloatAndSizeTests: XCTestCase {

    func test_stickerSide_isInTheTwoHundredToTwoTwentyRange() {
        XCTAssertGreaterThanOrEqual(BubbleSticker.side, 200)
        XCTAssertLessThanOrEqual(BubbleSticker.side, 220)
    }

    func test_focalSticker_keepsTheBubbleRatio() {
        XCTAssertEqual(FocalMetrics.Sticker.side / BubbleSticker.side, 112.0 / 160.0, accuracy: 0.01)
    }

    func test_templateBox_isProportionalToTheSide() {
        XCTAssertEqual(BubbleSticker.templateBox.height, BubbleSticker.side)
        XCTAssertEqual(BubbleSticker.templateBox.width, BubbleSticker.side * 1.5)
    }

    func test_float_liftsWhenMotionAllowed() {
        XCTAssertEqual(StickerFloatLaw.offsetY(isLifted: true, reduceMotion: false), -StickerFloatLaw.lift)
        XCTAssertEqual(StickerFloatLaw.offsetY(isLifted: false, reduceMotion: false), 0)
    }

    func test_float_isCutByReduceMotion() {
        XCTAssertEqual(StickerFloatLaw.offsetY(isLifted: true, reduceMotion: true), 0)
    }
}
