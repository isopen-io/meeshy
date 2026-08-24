import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Un sticker importé porte une IMAGE INTÉGRÉE à l'entité publiée (même espace
/// d'ids que tout autre média du post). Le composite basse résolution
/// (miniature de tray, ThumbHash, cover de brouillon) ne connaissait que
/// l'emoji : un sticker image y sortait comme un glyphe de repli — ou, si
/// l'écrivain n'avait posé aucun emoji, comme rien du tout.
///
/// Le bitmap entre par le MÊME canal que les autres médias — `loadedImages`,
/// keyé par id d'élément — côté composer (bitmap local, avant upload) comme
/// côté lecteur (`ReceiverCoverPlan` charge le `PostMedia` publié sous ce même
/// id). Aucun second cache d'images.
@MainActor
final class StorySlideRendererStickerImageTests: XCTestCase {

    private let canvas = CGSize(width: 360, height: 640)
    private let backgroundHex = "0000FF"

    // MARK: - Fixtures

    private func makeSticker(
        id: String = "st-1",
        emoji: String = "🔥",
        postMediaId: String = "",
        x: Double = 0.5,
        y: Double = 0.5,
        scale: Double = 1,
        rotation: Double = 0
    ) -> StorySticker {
        StorySticker(id: id, emoji: emoji, postMediaId: postMediaId,
                     x: x, y: y, scale: scale, rotation: rotation)
    }

    private func makeSlide(_ sticker: StorySticker) -> StorySlide {
        var effects = StoryEffects(background: backgroundHex)
        effects.stickerObjects = [sticker]
        return StorySlide(effects: effects)
    }

    private func render(_ sticker: StorySticker,
                        loadedImages: [String: UIImage] = [:]) throws -> UIImage {
        try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: makeSlide(sticker), bgImage: nil,
            loadedImages: loadedImages, size: canvas))
    }

    private func solidImage(_ color: UIColor, side: CGFloat = 40) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { ctx in
            color.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))
        }
    }

    // MARK: - Lecture des pixels

    private struct Painted {
        /// Nombre de pixels retenus, dans le bitmap brut.
        let count: Int
        /// Boîte englobante, en POINTS de la surface logique.
        let box: CGRect
    }

    /// Boîte et surface des pixels satisfaisant `matches`, mesurées en points :
    /// `UIGraphicsImageRenderer` rend à l'échelle de l'écran, compter le bitmap
    /// brut donnerait des valeurs multipliées par cette échelle.
    private func painted(in image: UIImage,
                         matching matches: (UInt8, UInt8, UInt8) -> Bool) throws -> Painted {
        let cg = try XCTUnwrap(image.cgImage)
        let w = cg.width, h = cg.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = try XCTUnwrap(CGContext(data: &data, width: w, height: h,
                                          bitsPerComponent: 8, bytesPerRow: w * 4,
                                          space: CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))

        var count = 0
        var minX = w, maxX = -1, minY = h, maxY = -1
        for y in 0..<h {
            for x in 0..<w {
                let i = (y * w + x) * 4
                guard matches(data[i], data[i + 1], data[i + 2]) else { continue }
                count += 1
                minX = min(minX, x); maxX = max(maxX, x)
                minY = min(minY, y); maxY = max(maxY, y)
            }
        }
        guard count > 0 else { return Painted(count: 0, box: .zero) }
        let pixelScale = CGFloat(w) / canvas.width
        return Painted(
            count: count,
            box: CGRect(x: CGFloat(minX) / pixelScale,
                        y: CGFloat(minY) / pixelScale,
                        width: CGFloat(maxX - minX + 1) / pixelScale,
                        height: CGFloat(maxY - minY + 1) / pixelScale)
        )
    }

    private func red(in image: UIImage) throws -> Painted {
        try painted(in: image) { r, g, b in r > 180 && g < 90 && b < 90 }
    }

    /// Tout ce qui n'est PAS le fond bleu uni : la preuve qu'un sticker a été
    /// peint, quelle qu'en soit la forme (glyphe ou image).
    private func nonBackground(in image: UIImage) throws -> Painted {
        try painted(in: image) { r, g, b in !(b > 180 && r < 70 && g < 70) }
    }

    // MARK: - Le sticker emoji ne bouge pas

    func test_emojiSticker_stillPaintsItsGlyph_andIgnoresBitmapsOfOtherElements() throws {
        let alone = try render(makeSticker())
        let withOtherMedia = try render(makeSticker(),
                                        loadedImages: ["some-other-element": solidImage(.red)])

        XCTAssertGreaterThan(try nonBackground(in: alone).count, 0,
                             "le glyphe doit toujours être peint dans le composite")
        XCTAssertEqual(alone.pngData(), withOtherMedia.pngData(),
                       "un bitmap keyé par un AUTRE élément ne doit rien changer au sticker emoji")
    }

    // MARK: - Le sticker image dessine son image

    func test_imageSticker_drawsItsBitmap_insteadOfTheGlyph() throws {
        let sticker = makeSticker()
        let asEmoji = try render(sticker)
        let asImage = try render(sticker, loadedImages: [sticker.id: solidImage(.red)])

        XCTAssertGreaterThan(try red(in: asImage).count, 0,
                             "l'image du sticker doit être peinte")
        XCTAssertNotEqual(asEmoji.pngData(), asImage.pngData(),
                          "avec son bitmap, le sticker ne peut pas rendre comme son glyphe")
    }

    /// Le bitmap arrive sous l'id d'ÉLÉMENT, pas sous `postMediaId` : pendant
    /// la composition ce dernier est encore vide (c'est le prédicat que lit la
    /// boucle d'upload), et le sticker doit pourtant déjà montrer son image.
    func test_imageSticker_drawsItsBitmapBeforeUpload_whenPostMediaIdIsStillEmpty() throws {
        let sticker = makeSticker(postMediaId: "")
        let composed = try render(sticker, loadedImages: [sticker.id: solidImage(.red)])

        XCTAssertGreaterThan(try red(in: composed).count, 0,
                             "le composer doit peindre le bitmap local avant tout téléversement")
    }

    // MARK: - Même géométrie que l'emoji

    func test_imageSticker_occupiesTheSameBoxAsTheGlyphWouldHave() throws {
        let sticker = makeSticker()
        let composed = try render(sticker, loadedImages: [sticker.id: solidImage(.red)])
        let box = try red(in: composed).box
        let side = CanvasGeometry.stickerFontSize(baseSize: sticker.baseSize,
                                                  scale: sticker.scale,
                                                  canvasWidth: canvas.width)

        XCTAssertEqual(box.width, side, accuracy: 2,
                       "la boîte du sticker image est celle de la règle partagée (\(side) pt)")
        XCTAssertEqual(box.height, side, accuracy: 2)
        XCTAssertEqual(box.midX, canvas.width * CGFloat(sticker.x), accuracy: 2,
                       "centré sur la position normalisée, comme le glyphe")
        XCTAssertEqual(box.midY, canvas.height * CGFloat(sticker.y), accuracy: 2)
    }

    func test_imageSticker_honoursScaleAndPosition() throws {
        let base = makeSticker()
        let doubled = makeSticker(x: 0.25, y: 0.75, scale: 2)

        let boxBase = try red(in: render(base, loadedImages: [base.id: solidImage(.red)])).box
        let boxDoubled = try red(in: render(doubled, loadedImages: [doubled.id: solidImage(.red)])).box

        XCTAssertEqual(boxDoubled.width, boxBase.width * 2, accuracy: 3,
                       "doubler `scale` double le côté rendu")
        XCTAssertEqual(boxDoubled.midX, canvas.width * 0.25, accuracy: 2)
        XCTAssertEqual(boxDoubled.midY, canvas.height * 0.75, accuracy: 2)
    }

    func test_imageSticker_honoursRotation_aroundItsOwnCentre() throws {
        let straight = makeSticker()
        let tilted = makeSticker(rotation: 45)

        let straightImage = try render(straight, loadedImages: [straight.id: solidImage(.red)])
        let tiltedImage = try render(tilted, loadedImages: [tilted.id: solidImage(.red)])

        let straightBox = try red(in: straightImage).box
        let tiltedBox = try red(in: tiltedImage).box

        XCTAssertNotEqual(straightImage.pngData(), tiltedImage.pngData(),
                          "un sticker image pivoté ne peut pas rendre comme un sticker droit")
        XCTAssertGreaterThan(tiltedBox.width, straightBox.width * 1.3,
                             "un carré pivoté de 45° a une boîte englobante ≈ √2 fois plus large")
        XCTAssertEqual(tiltedBox.midX, canvas.width * 0.5, accuracy: 2,
                       "la rotation tourne autour du centre du sticker, elle ne le déplace pas")
        XCTAssertEqual(tiltedBox.midY, canvas.height * 0.5, accuracy: 2)
    }

    // MARK: - Jamais un trou

    func test_publishedImageSticker_withoutItsBitmap_fallsBackToTheGlyph() throws {
        let published = makeSticker(postMediaId: "pm-1")
        let withoutBitmap = try render(published)

        XCTAssertGreaterThan(try nonBackground(in: withoutBitmap).count, 0,
                             "image introuvable : on peint l'emoji, jamais un trou")
        XCTAssertEqual(withoutBitmap.pngData(), try render(makeSticker()).pngData(),
                       "le repli est EXACTEMENT le rendu emoji d'aujourd'hui")
    }

    /// Un sticker image écrit par un client qui n'a posé aucun emoji : sans le
    /// repli de `wireEmoji`, la chaîne vide ne peindrait rien du tout.
    func test_imageSticker_withoutEmojiNorBitmap_paintsTheFallbackGlyph() throws {
        let orphan = makeSticker(emoji: "", postMediaId: "pm-1")
        let composed = try render(orphan)

        XCTAssertGreaterThan(try nonBackground(in: composed).count, 0,
                             "aucun emoji ET aucun bitmap : le glyphe de repli comble le trou")
        XCTAssertEqual(composed.pngData(),
                       try render(makeSticker(emoji: StorySticker.imageFallbackEmoji)).pngData(),
                       "c'est bien `wireEmoji` qui est peint")
    }
}
