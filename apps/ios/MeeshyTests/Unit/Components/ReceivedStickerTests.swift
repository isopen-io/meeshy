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

    private func menu(isSticker: Bool, addable: Bool, attachments: Int = 1) -> MessageMenuContext {
        MessageMenuContext(isMine: false, canEdit: false, canDelete: false,
                           hasText: false, hasMedia: true, hasTimebasedMedia: false,
                           isPinned: false, isStarred: false, isEdited: false,
                           hasEditRevisions: false, saveableAttachmentCount: attachments,
                           isSticker: isSticker, stickerAddable: addable)
    }

    private func moreActions(_ ctx: MessageMenuContext) -> [MoreItem] {
        MessageActionResolver.moreSections(ctx).flatMap { section -> [MoreItem] in
            if case .actions(let items) = section { return items }
            return []
        }
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

    // MARK: - Le menu

    func test_menu_offersAddSticker_onlyWhenAddable() {
        XCTAssertTrue(moreActions(menu(isSticker: true, addable: true)).contains(.addSticker))
        XCTAssertFalse(moreActions(menu(isSticker: true, addable: false)).contains(.addSticker))
        XCTAssertFalse(moreActions(menu(isSticker: false, addable: false)).contains(.addSticker))
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
