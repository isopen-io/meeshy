import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #4823, moitié RENDU — une bulle affiche un sticker de conversation.
///
/// Un message-sticker arrive avec `content == ""`, UNE pièce jointe image (le
/// PNG rendu, repli des lecteurs qui ne dessinent pas le gabarit) et
/// `message.sticker`. Ces témoins mesurent le ROUTAGE du builder (le sticker
/// est projeté, son PNG retiré de la grille, l'emoji-only n'est pas
/// déclenché), la PRIORITÉ de rendu de la feuille (gabarit → PNG → emoji),
/// ses mesures, son calendrier de mouvement et son étiquette VoiceOver.
@MainActor
final class BubbleStickerRenderingTests: XCTestCase {

    // MARK: - Fabriques

    private func makeAttachment(
        id: String = UUID().uuidString,
        type: MeeshyMessageAttachment.AttachmentType,
        fileUrl: String = "https://cdn.example/sticker.png"
    ) -> MeeshyMessageAttachment {
        let mime: String = {
            switch type {
            case .image: return "image/png"
            case .video: return "video/mp4"
            case .audio: return "audio/m4a"
            case .file: return "application/octet-stream"
            case .location: return "application/x-location"
            }
        }()
        return MeeshyMessageAttachment(
            id: id,
            messageId: "m1",
            fileName: "sticker.png",
            originalName: "sticker.png",
            mimeType: mime,
            fileSize: 2048,
            filePath: "",
            fileUrl: fileUrl,
            uploadedBy: "u2",
            createdAt: Date(timeIntervalSince1970: 0)
        )
    }

    private func makeMessage(
        content: String = "",
        attachments: [MeeshyMessageAttachment] = [],
        sticker: MessageSticker? = nil
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: "m1",
            conversationId: "c1",
            senderId: "u2",
            content: content,
            originalLanguage: "fr",
            attachments: attachments,
            senderName: "Bob",
            cachedTimeString: "12:34",
            sticker: sticker
        )
    }

    private func build(_ msg: MeeshyMessage) -> BubbleContent {
        BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")
    }

    private func makeSticker(
        templateId: String? = nil,
        slots: [String: String] = [:],
        animation: StickerAnimation? = nil,
        emoji: String? = nil,
        picture: BubbleContent.Sticker.Picture? = nil
    ) -> BubbleContent.Sticker {
        BubbleContent.Sticker(
            templateId: templateId, slots: slots, animation: animation, emoji: emoji, picture: picture
        )
    }

    private func makePicture(id: String = "a1", fileUrl: String = "https://cdn.example/s.png") -> BubbleContent.Sticker.Picture {
        BubbleContent.Sticker.Picture(
            attachmentId: id, fileUrl: fileUrl, thumbnailUrl: nil, thumbHash: nil, thumbnailColor: "4ECDC4"
        )
    }

    // MARK: - Le builder

    /// Le cas nominal : le sticker est projeté avec son PNG, et le PNG QUITTE
    /// la grille — sinon la bulle rendrait le sticker natif et, dessous, son
    /// propre repli en photo.
    func test_build_stickerWithPicture_projectsStickerAndRemovesPictureFromGrid() {
        let png = makeAttachment(type: .image)
        let content = build(makeMessage(attachments: [png], sticker: .emoji("❤️")))

        XCTAssertEqual(content.sticker?.emoji, "❤️")
        XCTAssertEqual(content.sticker?.picture?.attachmentId, png.id)
        XCTAssertEqual(content.sticker?.picture?.fileUrl, png.fileUrl)
        XCTAssertEqual(content.attachments, .none,
                       "le PNG du sticker ne doit pas partir dans la grille visuelle")
        XCTAssertFalse(content.isEmojiOnly)
        XCTAssertEqual(content.kind, .standard)
    }

    /// Un gabarit voyage avec ses emplacements et son mouvement — tout ce que
    /// la feuille a besoin de savoir pour redessiner en vectoriel.
    func test_build_templateSticker_carriesSlotsAndAnimation() {
        let sticker = MessageSticker(templateId: StickerTemplateCatalog.ID.loveSince,
                                     slots: [StickerSlotFiller.dateSlot: "12 mai"],
                                     animation: .heartbeat,
                                     emoji: "💞")
        let content = build(makeMessage(attachments: [makeAttachment(type: .image)], sticker: sticker))

        XCTAssertEqual(content.sticker?.templateId, StickerTemplateCatalog.ID.loveSince)
        XCTAssertEqual(content.sticker?.slots, [StickerSlotFiller.dateSlot: "12 mai"])
        XCTAssertEqual(content.sticker?.animation, .heartbeat)
        XCTAssertEqual(content.sticker?.emoji, "💞")
    }

    /// Seul le PNG du sticker est retiré : une vidéo qui l'accompagnerait
    /// reste rendue par la grille.
    func test_build_stickerWithExtraVideo_keepsTheVideoInTheGrid() {
        let png = makeAttachment(type: .image)
        let video = makeAttachment(type: .video, fileUrl: "https://cdn.example/v.mp4")
        let content = build(makeMessage(attachments: [png, video], sticker: .emoji("🔥")))

        guard case .visualGrid(let items) = content.attachments else {
            return XCTFail("la vidéo doit rester en .visualGrid, obtenu \(content.attachments)")
        }
        XCTAssertEqual(items.map(\.id), [video.id])
        XCTAssertEqual(content.sticker?.picture?.attachmentId, png.id)
    }

    /// Un sticker sans PNG (upload perdu) reste rendable : la feuille servira
    /// le gabarit ou l'emoji.
    func test_build_stickerWithoutPicture_isStillProjected() {
        let content = build(makeMessage(sticker: .emoji("🎉")))

        XCTAssertEqual(content.sticker?.emoji, "🎉")
        XCTAssertNil(content.sticker?.picture)
        XCTAssertEqual(content.attachments, .none)
    }

    /// Un sticker NON rendable (ni gabarit ni emoji) vaut ABSENT, et son PNG
    /// retombe dans la grille — mieux vaut la photo qu'un vide.
    func test_build_nonRenderableSticker_isDroppedAndPictureStaysInGrid() {
        let png = makeAttachment(type: .image)
        let content = build(makeMessage(attachments: [png], sticker: MessageSticker(templateId: "", emoji: "")))

        XCTAssertNil(content.sticker)
        guard case .visualGrid(let items) = content.attachments else {
            return XCTFail("le PNG doit rester en .visualGrid, obtenu \(content.attachments)")
        }
        XCTAssertEqual(items.map(\.id), [png.id])
    }

    /// Un message ordinaire est inchangé — aucun sticker fabriqué.
    func test_build_messageWithoutSticker_hasNoSticker() {
        let content = build(makeMessage(content: "Salut", attachments: [makeAttachment(type: .image)]))

        XCTAssertNil(content.sticker)
        guard case .visualGrid = content.attachments else {
            return XCTFail("un message sans sticker garde sa grille, obtenu \(content.attachments)")
        }
    }

    /// Le sticker participe à l'égalité du value model : un contenu qui gagne
    /// un sticker ne doit pas être court-circuité par le cache de hauteur.
    /// Sans pièce jointe des deux côtés, SEUL `sticker` distingue les deux.
    func test_equatable_stickerDifference_makesContentsDiffer() {
        let with = build(makeMessage(sticker: .emoji("❤️")))
        let without = build(makeMessage())

        XCTAssertEqual(with.attachments, without.attachments)
        XCTAssertNotEqual(with, without)
    }

    // MARK: - La priorité de rendu

    func test_renderSource_knownTemplate_rendersTheTemplate() {
        let sticker = makeSticker(templateId: "love.since", emoji: "💞", picture: makePicture())

        let source = BubbleSticker.RenderSource.resolve(sticker: sticker) { $0 == "love.since" }

        XCTAssertEqual(source, .template(id: "love.since"))
    }

    func test_renderSource_unknownTemplate_fallsBackToThePicture() {
        let picture = makePicture()
        let sticker = makeSticker(templateId: "future.template", emoji: "✨", picture: picture)

        let source = BubbleSticker.RenderSource.resolve(sticker: sticker) { _ in false }

        XCTAssertEqual(source, .picture(picture))
    }

    func test_renderSource_unknownTemplateWithoutPicture_fallsBackToTheEmoji() {
        let sticker = makeSticker(templateId: "future.template", emoji: "✨")

        let source = BubbleSticker.RenderSource.resolve(sticker: sticker) { _ in false }

        XCTAssertEqual(source, .emoji("✨"))
    }

    /// Le PNG passe avant l'emoji : c'est l'ordre de la priorité (2) puis (3).
    /// Un sticker EMOJI se rend en glyphe natif même quand son PNG est là :
    /// le glyphe est net à toute échelle et suit Dynamic Type ; le PNG n'est
    /// que le repli des clients qui ne dessinent pas.
    func test_renderSource_emojiStickerWithPicture_rendersTheNativeGlyph() {
        let sticker = makeSticker(emoji: "❤️", picture: makePicture())

        XCTAssertEqual(BubbleSticker.RenderSource.resolve(sticker: sticker) { _ in false }, .emoji("❤️"))
    }

    /// Un PNG à l'URL vide n'est pas un repli : on descend à l'emoji.
    func test_renderSource_pictureWithEmptyUrl_isSkipped() {
        let sticker = makeSticker(emoji: "❤️", picture: makePicture(fileUrl: ""))

        XCTAssertEqual(BubbleSticker.RenderSource.resolve(sticker: sticker) { _ in false }, .emoji("❤️"))
    }

    /// Le repli emoji ne rend JAMAIS un vide : celui du fil, sinon celui du
    /// gabarit au catalogue, sinon le repli générique.
    func test_fallbackEmoji_descendsFromWireToCatalogToGeneric() {
        XCTAssertEqual(BubbleSticker.RenderSource.fallbackEmoji(for: makeSticker(emoji: "🎉")), "🎉")
        XCTAssertEqual(
            BubbleSticker.RenderSource.fallbackEmoji(for: makeSticker(templateId: StickerTemplateCatalog.ID.loveSince)),
            StickerTemplateCatalog.fallbackEmoji(forTemplateID: StickerTemplateCatalog.ID.loveSince)
        )
        XCTAssertEqual(
            BubbleSticker.RenderSource.fallbackEmoji(for: makeSticker(templateId: "future.template")),
            StorySticker.imageFallbackEmoji
        )
    }

    /// Le registre RÉEL sait dessiner les gabarits du catalogue : la branche
    /// vectorielle n'est pas un cas d'école.
    func test_renderSource_catalogTemplate_isKnownToTheRealRegistry() {
        let sticker = makeSticker(templateId: StickerTemplateCatalog.ID.loveSince, emoji: "💞")

        let source = BubbleSticker.RenderSource.resolve(sticker: sticker) {
            StickerTemplateRenderer.drawer(for: $0) != nil
        }

        XCTAssertEqual(source, .template(id: StickerTemplateCatalog.ID.loveSince))
    }

    // MARK: - Les mesures

    func test_fittedSize_neverUpscales() {
        let fitted = BubbleSticker.fittedSize(CGSize(width: 80, height: 40), within: CGSize(width: 240, height: 160))

        XCTAssertEqual(fitted, CGSize(width: 80, height: 40))
    }

    func test_fittedSize_downscalesKeepingTheRatio() {
        let fitted = BubbleSticker.fittedSize(CGSize(width: 480, height: 160), within: CGSize(width: 240, height: 160))

        XCTAssertEqual(fitted.width, 240, accuracy: 0.001)
        XCTAssertEqual(fitted.height, 80, accuracy: 0.001)
    }

    func test_fittedSize_degenerateSize_isZero() {
        XCTAssertEqual(BubbleSticker.fittedSize(.zero, within: CGSize(width: 240, height: 160)), .zero)
    }

    // MARK: - Le calendrier du mouvement

    /// Un coup unique a un calendrier FINI qui part de l'apparition et dépasse
    /// la période — la dernière image rend l'identité, puis plus rien.
    func test_oneShotDates_coverTheWholeShotAndStop() {
        let start = Date(timeIntervalSince1970: 1_000)

        let dates = BubbleSticker.oneShotDates(from: start, animation: .pop, framesPerSecond: 60)

        XCTAssertEqual(dates.first, start)
        XCTAssertEqual(dates.count, Int((StickerAnimation.pop.period * 60).rounded(.up)) + 2,
                       "une image par 1/60 s sur la période, plus UNE au-delà")
        XCTAssertGreaterThan(dates.last!.timeIntervalSince(start), StickerAnimation.pop.period)
        XCTAssertEqual(StickerAnimation.pop.pose(at: dates.last!.timeIntervalSince(start)), .identity)
    }

    /// Une animation continue ne passe pas par le calendrier fini.
    func test_oneShotDates_periodicAnimation_isEmpty() {
        XCTAssertTrue(BubbleSticker.oneShotDates(from: Date(), animation: .pulse).isEmpty)
    }

    // MARK: - L'accessibilité

    /// La MÊME règle que la scène de story — vérifié contre la même résolution,
    /// pas un littéral, pour rester indépendant de la locale du simulateur.
    func test_accessibilityLabel_emojiSticker_matchesStoryStickerRule() {
        let label = BubbleSticker.accessibilityLabel(for: makeSticker(emoji: "❤️"))

        XCTAssertEqual(label, StoryStickerAccessibility.description(for: StorySticker(emoji: "❤️")))
        XCTAssertTrue(label.contains("❤️"))
    }

    func test_accessibilityLabel_templateSticker_namesTemplateSlotsAndMotion() {
        let sticker = makeSticker(templateId: StickerTemplateCatalog.ID.loveSince,
                                  slots: [StickerSlotFiller.dateSlot: "12 mai"],
                                  animation: .heartbeat,
                                  emoji: "💞")

        let label = BubbleSticker.accessibilityLabel(for: sticker)

        XCTAssertEqual(label, StoryStickerAccessibility.description(for: BubbleSticker.storyProjection(of: sticker)))
        XCTAssertTrue(label.contains("12 mai"), "la valeur de l'emplacement se dit : \(label)")
        XCTAssertTrue(label.contains(StickerAnimation.heartbeat.localizedName), "le mouvement se dit : \(label)")
    }

    /// La projection garde le RANG des kinds de `StorySticker` : gabarit avant
    /// emoji — un gabarit ne se présente jamais comme « Autocollant 💞 ».
    func test_storyProjection_templateSticker_isATemplateKind() {
        let projection = BubbleSticker.storyProjection(of: makeSticker(templateId: "love.since", emoji: "💞"))

        XCTAssertEqual(projection.kind, .template)
        XCTAssertEqual(BubbleSticker.storyProjection(of: makeSticker(emoji: "💞")).kind, .emoji)
    }
}
