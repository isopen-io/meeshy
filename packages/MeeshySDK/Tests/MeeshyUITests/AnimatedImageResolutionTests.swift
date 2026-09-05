import XCTest
import ImageIO
import UniformTypeIdentifiers
import UIKit
@testable import MeeshyUI

/// **Le maillon qui manquait entre le décodeur et une vue SwiftUI** (#4925).
///
/// Le lot d'origine a livré DEUX moitiés : `AnimatedImageDecoder` (les octets →
/// des images) et `AnimatedImageView` (des images → du mouvement). La scène a
/// été câblée par `StoryStickerLayer`. **`AnimatedImageView` n'avait, lui,
/// aucun consommateur** — un relevé du 2026-09-03 le confirme : zéro montage
/// dans `apps/ios/` comme dans `packages/MeeshySDK/Sources/`.
///
/// Un sticker de MESSAGE et une image de COMMENTAIRE arrivaient donc figés,
/// avec un décodeur parfait et une vue parfaite dans le même paquet. C'est la
/// forme la plus discrète du défaut : rien n'est en panne, personne ne rougit,
/// et la feature n'existe nulle part.
///
/// Ce que ce fichier éprouve est la RÈGLE, pas la vue : quand tente-t-on le
/// chemin animé, et que rend-il ? La vue s'en déduit, et se vérifie à l'écran.
final class AnimatedImageResolutionTests: XCTestCase {

    // MARK: - Fabrique

    private func pixel(_ gray: CGFloat) -> CGImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8))
        return renderer.image { context in
            UIColor(white: gray, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }.cgImage!
    }

    private func makeAnimatedGIF() throws -> Data {
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(
            data as CFMutableData, UTType.gif.identifier as CFString, 3, nil
        ))
        for index in 0..<3 {
            CGImageDestinationAddImage(destination, pixel(CGFloat(index) / 2), [
                kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFUnclampedDelayTime: 0.1]
            ] as CFDictionary)
        }
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    private func makePNG() -> Data { UIImage(cgImage: pixel(0.5)).pngData()! }

    /// Compte les lectures d'octets. Le nombre EST le sujet d'un des témoins :
    /// une seconde lecture serait un second téléchargement.
    private final class Reads: @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0
        var value: Int { lock.lock(); defer { lock.unlock() }; return count }
        func note() { lock.lock(); count += 1; lock.unlock() }
    }

    // MARK: - Quand on ne tente RIEN

    /// Une surface qui déclare ne pas animer (une capture, un aperçu figé) ne
    /// paie pas une lecture d'octets pour l'apprendre.
    func test_uneSurfaceQuiNAnimePas_neLitAucunOctet() async throws {
        let reads = Reads()
        let decoded = await AnimatedImageResolution.resolve(
            urlString: "https://cdn.test/sticker.gif", animates: false, reduceMotion: false,
            maxPixelSize: 120
        ) { _ in reads.note(); return try? self.makeAnimatedGIF() }

        XCTAssertNil(decoded)
        XCTAssertEqual(reads.value, 0, "aucune lecture ne doit partir quand l'hôte a dit non")
    }

    /// **Le mouvement réduit fige AVANT de décoder.** Décoder trente images pour
    /// n'en montrer qu'une serait la dimension 3 payée pour rien : le repli fixe
    /// de l'appelant montre déjà la première image, qui est ce qu'un GIF non
    /// joué affiche.
    func test_mouvementReduit_neDecodeRien() async throws {
        let reads = Reads()
        let decoded = await AnimatedImageResolution.resolve(
            urlString: "https://cdn.test/sticker.gif", animates: true, reduceMotion: true,
            maxPixelSize: 120
        ) { _ in reads.note(); return try? self.makeAnimatedGIF() }

        XCTAssertNil(decoded)
        XCTAssertEqual(reads.value, 0)
    }

    func test_uneURLvide_neLitAucunOctet() async {
        let reads = Reads()
        let decoded = await AnimatedImageResolution.resolve(
            urlString: "", animates: true, reduceMotion: false, maxPixelSize: 120
        ) { _ in reads.note(); return nil }

        XCTAssertNil(decoded)
        XCTAssertEqual(reads.value, 0)
    }

    // MARK: - Ce que rend le chemin animé

    func test_unGIFanime_rendSesImages() async throws {
        let bytes = try makeAnimatedGIF()
        let decoded = await AnimatedImageResolution.resolve(
            urlString: "https://cdn.test/sticker.gif", animates: true, reduceMotion: false,
            maxPixelSize: 120
        ) { _ in bytes }

        let resolved = try XCTUnwrap(decoded)
        XCTAssertGreaterThan(resolved.frames.count, 1)
        XCTAssertGreaterThan(resolved.duration, 0)
    }

    /// **`nil` n'est pas un échec** : c'est le signal que l'appelant garde son
    /// chemin actuel — le repli progressif, avec son thumbHash et son cache.
    func test_unePNGfixe_rendNil_etLaisseLeRepli() async {
        let decoded = await AnimatedImageResolution.resolve(
            urlString: "https://cdn.test/sticker.png", animates: true, reduceMotion: false,
            maxPixelSize: 120
        ) { _ in self.makePNG() }

        XCTAssertNil(decoded)
    }

    /// Les octets sont demandés UNE fois. La pile de cache qui les sert est la
    /// même que celle de l'image (L1 NSCache, L2 disque) : une seconde lecture
    /// serait un second téléchargement, jamais une optimisation.
    func test_lesOctetsNeSontLusQuUneFois() async throws {
        let reads = Reads()
        let bytes = try makeAnimatedGIF()
        _ = await AnimatedImageResolution.resolve(
            urlString: "https://cdn.test/sticker.gif", animates: true, reduceMotion: false,
            maxPixelSize: 120
        ) { _ in reads.note(); return bytes }

        XCTAssertEqual(reads.value, 1)
    }

    /// Le budget de décodage est un PLAFOND en pixels, pas une taille imposée :
    /// une couche de 120 pt ne doit pas porter trente bitmaps pleine résolution.
    func test_leBudgetDeDecodage_bornelaTailleDesImages() async throws {
        let bytes = try makeAnimatedGIF()
        let resolved = await AnimatedImageResolution.resolve(
            urlString: "https://cdn.test/sticker.gif", animates: true, reduceMotion: false,
            maxPixelSize: 4
        ) { _ in bytes }
        let decoded = try XCTUnwrap(resolved)

        for frame in decoded.frames {
            XCTAssertLessThanOrEqual(max(frame.width, frame.height), 4)
        }
    }
}
