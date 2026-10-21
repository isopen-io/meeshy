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
        sticker: MessageSticker? = MessageSticker(templateId: "pack.chats.c1", emoji: "🐱"),
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

    private func menu(isSticker: Bool, addable: Bool, favorite: Bool? = nil, attachments: Int = 1,
                      exits: MessageExitOffer = .unrestricted, isBlurred: Bool = false) -> MessageMenuContext {
        MessageMenuContext(isMine: false, canEdit: false, canDelete: false,
                           hasText: false, hasMedia: true, hasTimebasedMedia: false,
                           isPinned: false, isStarred: false, isEdited: false,
                           hasEditRevisions: false, saveableAttachmentCount: attachments,
                           stickerFavorite: favorite, isSticker: isSticker, stickerAddable: addable,
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

    // MARK: - Ce qu'on possède déjà (#10688)

    /// « Cœur, qui bat » est un gabarit du catalogue, embarqué dans l'app : on
    /// le possède déjà. Le déposer dans « Mes stickers » en ferait un doublon
    /// figé ; ce qu'on en veut, c'est le retrouver en tête de la palette.
    func test_offersAdd_aCatalogTemplate_isFalse_itIsAlreadyOwned() {
        let heart = makeMessage(sticker: MessageSticker(templateId: StickerTemplateCatalog.ID.loveHeartFrame, emoji: "💞"))
        XCTAssertFalse(ReceivedSticker.offersAdd(for: heart, known: []))
    }

    func test_offersAdd_anEmojiSticker_isFalse_itIsAlreadyOwned() {
        XCTAssertFalse(ReceivedSticker.offersAdd(for: makeMessage(sticker: MessageSticker(emoji: "🎉")), known: []))
    }

    func test_offersAdd_aMee_isFalse_itIsAlreadyOwned() {
        let mee = makeMessage(sticker: MessageSticker(templateId: "mee.mee-coucou", emoji: "👋"))
        XCTAssertFalse(ReceivedSticker.offersAdd(for: mee, known: []))
    }

    func test_offersAdd_aThirdPartyPackSticker_stillOffersIt() {
        XCTAssertTrue(ReceivedSticker.offersAdd(for: makeMessage(), known: []))
    }

    func test_menu_anOwnedSticker_offersTheFavorite_inTheQuickMenu() {
        let pin = MessageActionResolver.primaryActions(menu(isSticker: true, addable: false, favorite: false))
        XCTAssertTrue(pin.contains(.favoriteSticker))
        XCTAssertFalse(pin.contains(.addSticker))
        let unpin = MessageActionResolver.primaryActions(menu(isSticker: true, addable: false, favorite: true))
        XCTAssertTrue(unpin.contains(.unfavoriteSticker))
        XCTAssertFalse(unpin.contains(.favoriteSticker))
    }

    func test_menu_aStickerThatCannotBePinned_offersNoFavorite() {
        let actions = MessageActionResolver.primaryActions(menu(isSticker: true, addable: true, favorite: nil))
        XCTAssertFalse(actions.contains(.favoriteSticker))
        XCTAssertFalse(actions.contains(.unfavoriteSticker))
    }

    func test_menu_aBlurredSticker_neverOffersTheFavorite() {
        let actions = MessageActionResolver.primaryActions(menu(isSticker: true, addable: false, favorite: false, isBlurred: true))
        XCTAssertFalse(actions.contains(.favoriteSticker))
    }

    /// Les QUATRE modes de lecture lisent l'identifiant de bibliothèque sur le même
    /// `BubbleContent.Sticker` : Focal, Script et Rivière ne disent plus « Ajouter » pour
    /// un sticker que la bulle sait déjà rangé.
    func test_resolveSticker_carriesTheLibraryIdentifier() {
        let sticker = BubbleContent.resolveSticker(
            MessageSticker(emoji: "🎉", stickerId: "6a0ad86a6e21a483b4443d12"), attachments: [makeImage()])
        XCTAssertEqual(sticker?.libraryStickerId, "6a0ad86a6e21a483b4443d12")
    }

    /// #10655 — un sticker « Mes stickers » du web n'arrive que sous `{ stickerId }` : il se dessine
    /// par son image jointe (bulle sticker), jamais comme une photo ; sans image, rien à peindre.
    func test_resolveSticker_libraryStickerIdAlone_isDrawnFromItsAttachedPicture() {
        let sticker = BubbleContent.resolveSticker(
            MessageSticker(stickerId: "6a0ad86a6e21a483b4443d12"), attachments: [makeImage()])
        XCTAssertEqual(sticker?.picture?.attachmentId, "att1")
        XCTAssertEqual(sticker?.libraryStickerId, "6a0ad86a6e21a483b4443d12")
    }

    func test_resolveSticker_libraryStickerIdAlone_withoutPicture_isAbsent() {
        XCTAssertNil(BubbleContent.resolveSticker(MessageSticker(stickerId: "6a0ad86a6e21a483b4443d12"), attachments: []))
    }

    func test_bubbleContent_libraryStickerIdAlone_isAStickerBubble_notAPhotoGrid() {
        let message = makeMessage(sticker: MessageSticker(stickerId: "6a0ad86a6e21a483b4443d12"), isMe: false)
        let content = BubbleContent(message: message, translations: [], preferredTranslation: nil,
                                    currentUserId: "me", timeString: "12:00")
        XCTAssertNotNil(content.sticker)
        XCTAssertTrue(ReceivedSticker.isGalleryExcluded(message), "un sticker n'entre dans aucune galerie")
        XCTAssertTrue(ReceivedSticker.offersAdd(for: message, known: []), "« Ajouter à mes stickers », pas « Enregistrer »")
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

    func test_stickerSide_isTheSharedConstant_twoHundred() {
        XCTAssertEqual(BubbleSticker.side, 200)
        XCTAssertEqual(FocalMetrics.Sticker.side, 140)
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
