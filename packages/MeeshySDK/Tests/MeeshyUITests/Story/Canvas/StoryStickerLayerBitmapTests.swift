import XCTest
import UIKit
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// #4852 — **un sticker IMAGE collé se PEINT sur la scène.**
///
/// La couche rasterisait tout sticker sans gabarit en glyphe : un bitmap collé
/// depuis une autre app sortait sous son repli 🖼️ — canvas, lecteur, cover,
/// export. Trois ordres de rendu, dans cet ordre : le gabarit connu, le bitmap
/// (synchrone si le lecteur l'a en main, asynchrone sinon), le glyphe.
@MainActor
final class StoryStickerLayerBitmapTests: XCTestCase {

    // MARK: - Doublures

    /// Lecteur ASYNCHRONE — un type DISTINCT de `ComposerImageCacheReader`, pour
    /// que la couche prenne le chemin de la tâche et non le raccourci synchrone.
    /// `@MainActor` comme les lecteurs du module (isolation par défaut de
    /// `MeeshyUI`) : la couche l'interroge depuis sa tâche MainActor.
    @MainActor
    private struct AsyncStubReader: ImageCacheReader {
        let images: [String: UIImage]
        func cachedImage(for key: String) async -> UIImage? { images[key] }
    }

    /// Chargeur suspendu, résolu par le test — la doublure de
    /// `StoryMediaLayer_AsyncLoadTests`, réduite à ce qu'il faut ici.
    private actor StubLoader: StoryMediaImageLoading {
        private var pending: [String: [CheckedContinuation<UIImage?, Never>]] = [:]

        nonisolated func image(for urlString: String) async -> UIImage? {
            await suspend(urlString)
        }

        private func suspend(_ urlString: String) async -> UIImage? {
            await withCheckedContinuation { continuation in
                pending[urlString, default: []].append(continuation)
            }
        }

        func finish(_ urlString: String, with image: UIImage?) {
            guard var queue = pending[urlString], !queue.isEmpty else { return }
            let continuation = queue.removeFirst()
            pending[urlString] = queue
            continuation.resume(returning: image)
        }

        func drainAll() {
            for (_, queue) in pending {
                for continuation in queue { continuation.resume(returning: nil) }
            }
            pending.removeAll()
        }
    }

    // MARK: - Fabriques

    private let géométrie = CanvasGeometry(renderSize: CGSize(width: 402, height: 715))

    private func bitmap(_ color: UIColor) -> UIImage {
        let size = CGSize(width: 6, height: 4)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    private func imageSticker(id: String = "st", postMediaId: String = "") -> StorySticker {
        StorySticker(id: id, emoji: StorySticker.imageFallbackEmoji, postMediaId: postMediaId,
                     scale: StorySticker.posedScale)
    }

    private func paints(_ layer: CALayer, _ image: UIImage) -> Bool {
        guard let contents = layer.contents, let cgImage = image.cgImage else { return false }
        // swiftlint:disable:next force_cast
        return CFEqual(contents as! CGImage, cgImage)
    }

    private func expectedSide(for sticker: StorySticker) -> CGFloat {
        CanvasGeometry.stickerFontSize(baseSize: sticker.baseSize, scale: sticker.scale,
                                       canvasWidth: géométrie.renderSize.width)
    }

    // MARK: - Chemin SYNCHRONE (composer, cover, export)

    /// Le bitmap du composer vit sous l'id de l'ÉLÉMENT, `postMediaId` vide.
    func test_composerReader_paintsTheBitmap_underTheStickerId() {
        let sticker = imageSticker()
        let collé = bitmap(.red)
        let layer = StoryStickerLayer()
        layer.configure(with: sticker, geometry: géométrie, mode: .edit, renderScale: 2,
                        imageCache: ComposerImageCacheReader(images: ["st": collé], version: 0))

        XCTAssertTrue(paints(layer, collé), "la couche doit porter le bitmap, pas le glyphe 🖼️")
        XCTAssertEqual(layer.contentsGravity, .resizeAspect, "le bitmap s'ajuste sans déformation")
        XCTAssertNil(layer._currentImageLoadTaskForTesting(), "rien à aller chercher : le bitmap est là")
    }

    /// Le bitmap tient dans le CARRÉ du sticker — la même boîte que le glyphe.
    func test_bitmapBounds_areTheStickerSquare() {
        let sticker = imageSticker()
        let layer = StoryStickerLayer()
        layer.configure(with: sticker, geometry: géométrie, mode: .edit, renderScale: 2,
                        imageCache: ComposerImageCacheReader(images: ["st": bitmap(.red)], version: 0))
        let side = expectedSide(for: sticker)
        XCTAssertEqual(layer.bounds.width, side, accuracy: 0.01)
        XCTAssertEqual(layer.bounds.height, side, accuracy: 0.01)
    }

    /// Une fois publié, le sticker porte un `postMediaId` — et c'est la clé
    /// qu'un lecteur d'export connaît.
    func test_composerReader_paintsTheBitmap_underThePostMediaId() {
        let sticker = imageSticker(postMediaId: "pm1")
        let publié = bitmap(.green)
        let layer = StoryStickerLayer()
        layer.configure(with: sticker, geometry: géométrie, mode: .play, renderScale: 2,
                        imageCache: ComposerImageCacheReader(images: ["pm1": publié], version: 0))
        XCTAssertTrue(paints(layer, publié))
    }

    /// **La cover d'après publication** : les effets publiés (`postMediaId`
    /// stampé) rencontrent un dictionnaire que le composer a keyé par id et
    /// n'a jamais re-rangé. Une clé unique aurait raté ce bitmap.
    func test_composerReader_fallsBackToTheStickerId_afterPublication() {
        let sticker = imageSticker(postMediaId: "pm1")
        let collé = bitmap(.blue)
        let layer = StoryStickerLayer()
        layer.configure(with: sticker, geometry: géométrie, mode: .edit, renderScale: 2,
                        imageCache: ComposerImageCacheReader(images: ["st": collé], version: 0))
        XCTAssertTrue(paints(layer, collé))
    }

    func test_bitmapCacheKeys_prefersThePostMediaId_thenTheId() {
        XCTAssertEqual(StoryStickerLayer.bitmapCacheKeys(for: imageSticker(postMediaId: "pm1")),
                       ["pm1", "st"])
        XCTAssertEqual(StoryStickerLayer.bitmapCacheKeys(for: imageSticker()), ["st"])
    }

    // MARK: - Ce qui NE change pas

    /// Sans bitmap, le glyphe — inchangé.
    func test_withoutBitmap_paintsTheGlyph() {
        let sticker = imageSticker()
        let layer = StoryStickerLayer()
        layer.configure(with: sticker, geometry: géométrie, mode: .edit, renderScale: 2,
                        imageCache: ComposerImageCacheReader(images: [:], version: 0))
        XCTAssertNotNil(layer.contents, "le repli 🖼️ tient la place")
        XCTAssertFalse(paints(layer, bitmap(.red)))
        XCTAssertNil(layer._currentImageLoadTaskForTesting(),
                     "un sticker qui n'adresse rien ne lance aucune tâche")
    }

    /// Un gabarit CONNU gagne sur un bitmap : une décoration se dessine.
    func test_knownTemplate_winsOverABitmap() {
        let ruban = StorySticker(id: "st", emoji: "\u{1F550}",
                                 templateId: StickerTemplateCatalog.ID.timeRibbon,
                                 slots: [StickerSlotFiller.timeSlot: "21:33",
                                         StickerSlotFiller.hourSlot: "21",
                                         StickerSlotFiller.minuteSlot: "33"])
        let collé = bitmap(.red)
        let layer = StoryStickerLayer()
        layer.configure(with: ruban, geometry: géométrie, mode: .play, renderScale: 2,
                        imageCache: ComposerImageCacheReader(images: ["st": collé], version: 0))
        XCTAssertFalse(paints(layer, collé))
        XCTAssertNotEqual(layer.bounds.width, layer.bounds.height, accuracy: 1,
                          "la boîte mesurée du ruban, pas le carré du bitmap")
    }

    /// Les appelants historiques compilent et rendent comme avant.
    func test_legacyCallSite_stillRendersTheGlyph() {
        let layer = StoryStickerLayer()
        layer.configure(with: StorySticker(emoji: "\u{2764}\u{FE0F}"), geometry: géométrie,
                        mode: .play, renderScale: 2)
        XCTAssertNotNil(layer.contents)
        XCTAssertNil(layer._currentImageLoadTaskForTesting())
    }

    // MARK: - Chemin ASYNCHRONE (lecteur, preview)

    /// Le resolver rend l'URL du `PostMedia`, le chargeur rend l'image : le
    /// glyphe tient la place, puis le bitmap le remplace.
    func test_resolverAndLoader_paintTheBitmap_onceLoaded() async {
        let sticker = imageSticker(postMediaId: "pm1")
        let publié = bitmap(.green)
        let stub = StubLoader()
        let layer = StoryStickerLayer()
        layer._setImageLoaderForTesting(stub)
        let url = "https://cdn.example.test/pm1.png"

        layer.configure(with: sticker, geometry: géométrie, mode: .play, renderScale: 2,
                        imageCache: nil, resolver: { $0 == "pm1" ? URL(string: url) : nil })

        XCTAssertNotNil(layer.contents, "en attendant le bitmap, le repli 🖼️")
        XCTAssertFalse(paints(layer, publié))
        let task = layer._currentImageLoadTaskForTesting()
        XCTAssertNotNil(task, "un sticker publié va chercher son bitmap")

        await stub.finish(url, with: publié)
        _ = await task?.value
        XCTAssertTrue(paints(layer, publié))
        XCTAssertEqual(layer.contentsGravity, .resizeAspect)
        await stub.drainAll()
    }

    /// Un lecteur ASYNCHRONE (`PreloadedImageCacheReader` en preview) sert le
    /// bitmap sous l'id, sans resolver ni chargeur.
    func test_asynchronousReader_paintsTheBitmap() async {
        let sticker = imageSticker()
        let collé = bitmap(.red)
        let layer = StoryStickerLayer()
        layer._setImageLoaderForTesting(StubLoader())

        layer.configure(with: sticker, geometry: géométrie, mode: .play, renderScale: 2,
                        imageCache: AsyncStubReader(images: ["st": collé]))

        let task = layer._currentImageLoadTaskForTesting()
        XCTAssertNotNil(task)
        _ = await task?.value
        XCTAssertTrue(paints(layer, collé))
    }

    /// Reconfigurer pendant un chargement annule l'ancienne tâche : le bitmap
    /// du sticker précédent ne doit jamais atterrir sur la couche recyclée.
    func test_reconfigureDuringLoad_cancelsThePreviousTask() async {
        let stub = StubLoader()
        let layer = StoryStickerLayer()
        layer._setImageLoaderForTesting(stub)
        let urlA = "https://cdn.example.test/a.png"
        let urlB = "https://cdn.example.test/b.png"
        let resolver: @Sendable (String) -> URL? = {
            switch $0 {
            case "a": return URL(string: urlA)
            case "b": return URL(string: urlB)
            default: return nil
            }
        }
        let imageA = bitmap(.red)
        let imageB = bitmap(.green)

        layer.configure(with: imageSticker(id: "sa", postMediaId: "a"), geometry: géométrie,
                        mode: .play, renderScale: 2, resolver: resolver)
        let taskA = layer._currentImageLoadTaskForTesting()
        XCTAssertNotNil(taskA)

        layer.configure(with: imageSticker(id: "sb", postMediaId: "b"), geometry: géométrie,
                        mode: .play, renderScale: 2, resolver: resolver)
        let taskB = layer._currentImageLoadTaskForTesting()
        XCTAssertNotNil(taskB)
        XCTAssertTrue(taskA?.isCancelled == true, "la seconde configuration annule la première")

        await stub.finish(urlA, with: imageA)
        _ = await taskA?.value
        XCTAssertFalse(paints(layer, imageA), "une tâche annulée ne pose rien")

        await stub.finish(urlB, with: imageB)
        _ = await taskB?.value
        XCTAssertTrue(paints(layer, imageB))
        await stub.drainAll()
    }

    /// La pose d'une animation est une transformation de la COUCHE : elle
    /// s'applique au bitmap exactement comme au glyphe.
    func test_animationPose_appliesToABitmap() {
        let layer = StoryStickerLayer()
        layer.configure(with: imageSticker(), geometry: géométrie, mode: .play, renderScale: 2,
                        imageCache: ComposerImageCacheReader(images: ["st": bitmap(.red)], version: 0))
        layer.applyAnimationPose(StickerAnimation.spin.pose(at: 1.0), baseRotationDegrees: 0)
        XCTAssertEqual(Double(layer.transform.m12), 1, accuracy: 1e-6, "sin 90° — un quart de tour")
    }
}
