import Foundation
import Testing
@testable import MeeshySDK

/// Un sticker ne se coupe jamais (#10915) — la loi de détection, la loi du cadre,
/// et ce que la mise en page en fait : un cadre à son rapport, sans arrondi, ajusté.
struct MessageCardStickerTests {

    private static func measure(_ text: String, _ font: MessageCardFont) -> Double { Double(text.count) * font.size * 0.5 }

    private static func layout(_ media: [MessageCardMedia], disposition: MessageCardDisposition = .standard) -> MessageCardLayout {
        let input = MessageCardInput(quoted: nil, reply: MessageCardPart(author: "Awa", text: "Voilà !"), template: MessageCardTemplates.defaultID,
                                     handle: "awa", media: media, disposition: disposition)
        return MessageCardLayout.make(input, measure: measure)
    }

    private static func mediaOps(_ layout: MessageCardLayout) -> [MessageCardMediaOp] {
        layout.ops.compactMap { if case let .media(op) = $0 { return op } else { return nil } }
    }

    // MARK: - La détection

    @Test func isSticker_aSmallTransparentImage_isASticker() {
        #expect(MessageCardSticker.isSticker(mimeType: "image/png", width: 512, height: 300))
        #expect(MessageCardSticker.isSticker(mimeType: "IMAGE/WEBP", width: 256, height: 256))
        #expect(MessageCardSticker.isSticker(mimeType: nil, fileName: "https://cdn/x/s.png?v=2", width: 200, height: 200))
    }

    @Test func isSticker_aPhotoIsNever_whateverItsSize() {
        #expect(!MessageCardSticker.isSticker(mimeType: "image/jpeg", width: 200, height: 200))
        #expect(!MessageCardSticker.isSticker(mimeType: "image/heic", width: 100, height: 100, flagged: false))
        #expect(!MessageCardSticker.isSticker(mimeType: "image/png", width: 1080, height: 1080))
        #expect(!MessageCardSticker.isSticker(mimeType: "image/png", width: 513, height: 100))
    }

    @Test func isSticker_withoutDeclaredSides_onlyADeclarationProvesIt() {
        #expect(!MessageCardSticker.isSticker(mimeType: "image/png", width: nil, height: nil))
        #expect(MessageCardSticker.isSticker(mimeType: "image/png", width: nil, height: nil, flagged: true))
        #expect(MessageCardSticker.isSticker(mimeType: "image/webp", width: 1024, height: 1024, flagged: true))
        #expect(!MessageCardSticker.isSticker(mimeType: "image/jpeg", width: 100, height: 100, flagged: true), "un format sans transparence n'est pas un découpage")
    }

    @Test func paintableMedia_aStickerMessageFlagsItsImages_andTheAspectStaysUnknownWithoutSides() {
        let png = MeeshyMessageAttachment(id: "s", mimeType: "image/png", fileUrl: "https://x/s.png")
        let photo = MeeshyMessageAttachment(id: "p", mimeType: "image/jpeg", fileUrl: "https://x/p.jpg", width: 100, height: 80)
        let flagged = MessageCardSubject.paintableMedia(of: [png, photo], stickerMessage: true)
        #expect(flagged.map(\.media.isSticker) == [true, false])
        #expect(flagged[0].media.aspectKnown == false)
        #expect(flagged[1].media.aspectKnown)
        let plain = MessageCardSubject.paintableMedia(of: [png], stickerMessage: false)
        #expect(plain[0].media.isSticker == false)
    }

    // MARK: - Les côtés

    @Test func aspect_isNilWithoutBothSides_neverASquareByDefault() {
        #expect(MessageCardSticker.declaredAspect(width: 300, height: nil) == nil)
        #expect(MessageCardSticker.declaredAspect(width: 0, height: 10) == nil)
        #expect(MessageCardSticker.declaredAspect(width: 300, height: 150) == 2)
        #expect(MessageCardSticker.aspect(pixelWidth: 100, pixelHeight: 400) == 0.25)
    }

    @Test func pixels_correctAnUnknownAspect_onlyOnce() {
        let sticker = MessageCardMedia(id: "s", kind: .image, isSticker: true, aspectKnown: false)
        #expect(sticker.aspect == 1)
        let measured = sticker.with(pixelWidth: 400, pixelHeight: 200)
        #expect(measured.aspect == 2 && measured.aspectKnown)
        #expect(measured.with(pixelWidth: 10, pixelHeight: 10).aspect == 2)
    }

    // MARK: - Le cadre

    @Test func frame_followsTheStickerRatio_atMostSixtyPercentOfTheColumn() {
        let wide = MessageCardSticker.frame(aspect: 2, width: 888, cap: 700)
        #expect(wide.width == 532 && wide.height == 266)
        let tall = MessageCardSticker.frame(aspect: 0.5, width: 888, cap: 700)
        #expect(tall.height == 700 && tall.width == 350)
    }

    @Test func frame_aTallStickerShrinks_itNeverCrops() {
        let frame = MessageCardSticker.frame(aspect: 0.5, width: 888, cap: 400)
        #expect(frame.height == 400 && frame.width == 200)
    }

    @Test func fit_containInscribesTheWholeImage_coverFillsTheFrame() {
        let frame = MessageCardFrame(x: 10, y: 20, width: 200, height: 100)
        let contained = MessageCardMediaFit.contain.drawn(pixelWidth: 100, pixelHeight: 100, in: frame)
        #expect(contained == MessageCardFrame(x: 60, y: 20, width: 100, height: 100))
        let covered = MessageCardMediaFit.cover.drawn(pixelWidth: 100, pixelHeight: 100, in: frame)
        #expect(covered == MessageCardFrame(x: 10, y: -30, width: 200, height: 200))
    }

    // MARK: - La mise en page

    @Test func layout_aStickerGetsItsOwnRatio_centered_withoutRoundedCornersOrCrop() throws {
        let sticker = MessageCardMedia(id: "s", kind: .image, aspect: 2, isSticker: true)
        let op = try #require(Self.mediaOps(Self.layout([sticker])).first)
        #expect(op.fit == .contain)
        #expect(op.radius == 0)
        #expect(abs(op.width / op.height - 2) < 0.02)
        #expect(op.width <= 888 * MessageCardSticker.displayShare + 0.5)
        let centre = op.x + op.width / 2
        #expect(abs(centre - (96 + 888 / 2)) <= 1)
    }

    @Test func layout_aPhotoIsUnchanged_fullColumn_roundedAndCropped() throws {
        let photo = MessageCardMedia(id: "p", kind: .image, aspect: 2)
        let op = try #require(Self.mediaOps(Self.layout([photo])).first)
        #expect(op.fit == .cover)
        #expect(op.radius == MessageCardMetrics.mediaRadius)
        #expect(op.width == 888)
        #expect(op.x == 96)
    }

    @Test func layout_aStickerInAGrid_staysContained() {
        let media = [MessageCardMedia(id: "a", kind: .image, aspect: 1, isSticker: true), MessageCardMedia(id: "b", kind: .image, aspect: 1)]
        let grid = MessageCardDisposition(mediaArrangement: .mosaic)
        let ops = Self.mediaOps(Self.layout(media, disposition: grid))
        #expect(ops.first { $0.mediaID == "a" }?.fit == .contain)
        #expect(ops.first { $0.mediaID == "a" }?.radius == 0)
        #expect(ops.first { $0.mediaID == "b" }?.fit == .cover)
    }
}
