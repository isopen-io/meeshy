import XCTest
import UIKit
import ImageIO
import QuartzCore
import UniformTypeIdentifiers
@testable import MeeshyUI
@testable import MeeshySDK

/// **Un sticker animé ANIME sur la scène** (#4925).
///
/// Le décodeur seul ne suffisait pas, et c'est ce que ce fichier éprouve : un
/// `CALayer` n'anime pas une `UIImage.animatedImage` comme le ferait un
/// `UIImageView` — il faut lui poser une `CAKeyframeAnimation` sur `contents`.
/// La scène ne passe par aucune vue SwiftUI, donc ce chemin ne partage avec les
/// bulles que le décodeur.
///
/// Le maillon qui manquait était plus haut : `StoryMediaImageLoading` ne servait
/// que des `UIImage`, c'est-à-dire UNE image. L'animation était perdue avant
/// qu'aucune couche puisse la demander.
@MainActor
final class StoryStickerLayerAnimatedTests: XCTestCase {

    // MARK: - Doublure

    /// Chargeur qui sert des OCTETS. Il compte ses appels pour que le témoin
    /// puisse affirmer l'ORDRE : les octets d'abord, l'image seulement en repli.
    private final class BytesLoader: StoryMediaImageLoading, @unchecked Sendable {
        let bytes: Data?
        let fallback: UIImage?
        private(set) nonisolated(unsafe) var dataCalls = 0
        private(set) nonisolated(unsafe) var imageCalls = 0

        init(bytes: Data?, fallback: UIImage? = nil) {
            self.bytes = bytes
            self.fallback = fallback
        }

        nonisolated func data(for urlString: String) async -> Data? {
            dataCalls += 1
            return bytes
        }

        nonisolated func image(for urlString: String) async -> UIImage? {
            imageCalls += 1
            return fallback
        }
    }

    // MARK: - Fabriques

    private let géométrie = CanvasGeometry(renderSize: CGSize(width: 402, height: 715))

    private func pixel(_ gray: CGFloat) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { context in
            UIColor(white: gray, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 24, height: 24))
        }
    }

    private func animatedGIF(delays: [Double]) throws -> Data {
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(
            data as CFMutableData, UTType.gif.identifier as CFString, delays.count, nil))
        for (index, delay) in delays.enumerated() {
            CGImageDestinationAddImage(destination, pixel(CGFloat(index) / CGFloat(max(delays.count - 1, 1))).cgImage!, [
                kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFUnclampedDelayTime: delay]
            ] as CFDictionary)
        }
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    /// Même fabrique que `StoryStickerLayerBitmapTests` — un sticker IMAGE
    /// publié, donc adressable par son `postMediaId`.
    private func imageSticker(postMediaId: String = "pm1") -> StorySticker {
        StorySticker(id: "st", emoji: StorySticker.imageFallbackEmoji,
                     postMediaId: postMediaId,
                     scale: StorySticker.posedScale)
    }

    private func makeLayer(_ loader: BytesLoader) async -> StoryStickerLayer {
        let layer = StoryStickerLayer()
        layer._setImageLoaderForTesting(loader)
        layer.configure(with: imageSticker(), geometry: géométrie, mode: .play, renderScale: 2,
                        imageCache: nil,
                        resolver: { _ in URL(string: "https://cdn.test/sticker") })
        await layer._currentImageLoadTaskForTesting()?.value
        return layer
    }

    // MARK: - Le cœur

    /// **Le témoin qui compte** : un GIF animé pose une animation de CONTENU sur
    /// la couche. Sans elle, la couche porte une image et une seule — le défaut
    /// que ce lot corrige, et qui ne rougissait nulle part.
    func test_unGIFanime_poseUneAnimationDeContenu() async throws {
        let loader = BytesLoader(bytes: try animatedGIF(delays: [0.1, 0.1, 0.1]))
        let layer = await makeLayer(loader)

        let clé = try XCTUnwrap(layer.animationKeys()?.first,
                                "la couche ne joue aucune animation — le sticker est figé")
        let animation = try XCTUnwrap(layer.animation(forKey: clé) as? CAKeyframeAnimation)
        XCTAssertEqual(animation.keyPath, "contents")
        XCTAssertEqual(animation.values?.count, 3)
        XCTAssertEqual(animation.duration, 0.3, accuracy: 0.02)
    }

    /// **`.discrete` est la ligne qui décide.** Sans elle, Core Animation
    /// INTERPOLE entre deux images et rend un fondu enchaîné permanent au lieu
    /// d'un défilement — un défaut visible mais difficile à nommer (« le GIF est
    /// flou » plutôt que « les images se mélangent »).
    func test_lesImages_neSInterpolentPAS() async throws {
        let loader = BytesLoader(bytes: try animatedGIF(delays: [0.1, 0.1]))
        let layer = await makeLayer(loader)
        let clé = try XCTUnwrap(layer.animationKeys()?.first)
        let animation = try XCTUnwrap(layer.animation(forKey: clé) as? CAKeyframeAnimation)
        XCTAssertEqual(animation.calculationMode, .discrete)
    }

    /// **La rasterisation doit tomber** — et c'est le piège du lot. `configure`
    /// pose `shouldRasterize` en mode `.play` pour un sticker statique ; une
    /// couche rasterisée peint son CACHE, donc la première image, pour toujours.
    /// Une optimisation juste qui annule silencieusement la feature.
    func test_laRasterisation_tombe_quandLaCoucheAnime() async throws {
        let loader = BytesLoader(bytes: try animatedGIF(delays: [0.1, 0.1]))
        let layer = await makeLayer(loader)
        XCTAssertFalse(layer.shouldRasterize,
                       "une couche rasterisée peindrait son cache — donc l'image 1, pour toujours")
    }

    /// La cadence VARIABLE survit jusqu'à la couche : 100/100/500 ms donnent
    /// SEPT images d'un dixième, pas trois. Le témoin lie le rééchantillonnage
    /// au rendu, là où les deux pourraient diverger.
    func test_laCadenceVARIABLE_survitJusquALaCouche() async throws {
        let loader = BytesLoader(bytes: try animatedGIF(delays: [0.1, 0.1, 0.5]))
        let layer = await makeLayer(loader)
        let clé = try XCTUnwrap(layer.animationKeys()?.first)
        let animation = try XCTUnwrap(layer.animation(forKey: clé) as? CAKeyframeAnimation)
        XCTAssertEqual(animation.values?.count, 7)
    }

    // MARK: - L'ordre, et le repli

    /// **Les octets d'abord.** Si la couche demandait l'image en premier,
    /// l'animation serait perdue avant même d'être cherchée — c'est très
    /// exactement le défaut d'origine, reproduit un étage plus bas.
    func test_laCouche_demandeLesOCTETS_avantLimage() async throws {
        let loader = BytesLoader(bytes: try animatedGIF(delays: [0.1, 0.1]))
        _ = await makeLayer(loader)
        XCTAssertEqual(loader.dataCalls, 1)
        XCTAssertEqual(loader.imageCalls, 0, "une animation trouvée ne doit pas relire l'image")
    }

    /// Une image FIXE retombe sur le chemin habituel — le contrat de `decode`,
    /// tenu jusqu'ici : rien ne change pour l'immense majorité des stickers.
    func test_uneImageFIXE_retombeSurLeCheminHabituel() async throws {
        let fixe = pixel(0.5)
        let loader = BytesLoader(bytes: try XCTUnwrap(fixe.pngData()), fallback: fixe)
        let layer = await makeLayer(loader)

        XCTAssertEqual(loader.imageCalls, 1, "le chemin habituel doit être emprunté")
        XCTAssertNil(layer.animationKeys()?.first(where: { $0.hasPrefix("meeshy.sticker") }),
                     "une image fixe ne pose aucune animation de contenu")
    }

    /// Un chargeur qui ne sert AUCUN octet — le repli par défaut du protocole —
    /// n'empêche pas le sticker de paraître : il retombe sur l'image. C'est ce
    /// qui rend le repli acceptable pour les bouchons de test.
    func test_unChargeurSansOctets_sertQuandMemeLimage() async throws {
        let fixe = pixel(0.3)
        let loader = BytesLoader(bytes: nil, fallback: fixe)
        let layer = await makeLayer(loader)
        XCTAssertEqual(loader.imageCalls, 1)
        XCTAssertNotNil(layer.contents)
    }
}
