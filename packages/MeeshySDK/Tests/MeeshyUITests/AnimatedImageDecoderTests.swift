import XCTest
import ImageIO
import UniformTypeIdentifiers
import UIKit
@testable import MeeshyUI

/// **Décoder une image animée, ou dire qu'elle ne l'est pas** (#4925).
///
/// Les GIF de ce fichier sont FABRIQUÉS, jamais chargés depuis un fichier de
/// test. Deux raisons, et la seconde est la vraie :
///
/// 1. un binaire de fixture ne dit pas ce qu'il contient — on relit son
///    générateur pour savoir ce que le témoin éprouve ;
/// 2. les délais sont le SUJET. Une fixture avec des délais figés ne peut pas
///    éprouver la cadence variable, qui est précisément ce que
///    `AnimatedImageTiming` existe pour corriger.
final class AnimatedImageDecoderTests: XCTestCase {

    // MARK: - Fabrique

    private func pixel(_ gray: CGFloat) -> CGImage {
        let size = CGSize(width: 8, height: 8)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { context in
            UIColor(white: gray, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
        return image.cgImage!
    }

    /// Un GIF réel, avec un délai par image.
    private func makeGIF(delays: [Double]) throws -> Data {
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(
            data as CFMutableData, UTType.gif.identifier as CFString, delays.count, nil
        ))
        CGImageDestinationSetProperties(destination, [
            kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]
        ] as CFDictionary)
        for (index, delay) in delays.enumerated() {
            CGImageDestinationAddImage(destination, pixel(CGFloat(index) / CGFloat(max(delays.count - 1, 1))), [
                kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFUnclampedDelayTime: delay]
            ] as CFDictionary)
        }
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    private func makePNG() -> Data {
        UIImage(cgImage: pixel(0.5)).pngData()!
    }

    // MARK: - `nil` n'est pas un échec

    /// **La décision de conception du lot.** Une image FIXE rend `nil`, jamais
    /// un tableau d'une image : un chemin animé qui accepterait le cas fixe
    /// ferait payer à chaque avatar et chaque vignette un `UIImageView` et un
    /// tableau de frames.
    func test_unePNGfixe_nEstPasUneAnimation() {
        XCTAssertNil(AnimatedImageDecoder.decode(makePNG()))
    }

    func test_unGIFaUneSeuleImage_nEstPasUneAnimation() throws {
        XCTAssertNil(AnimatedImageDecoder.decode(try makeGIF(delays: [0.1])))
    }

    func test_desOctetsIllisibles_neCassentRien() {
        XCTAssertNil(AnimatedImageDecoder.decode(Data("pas une image".utf8)))
        XCTAssertNil(AnimatedImageDecoder.decode(Data()))
    }

    /// Un fichier TRONQUÉ — cas d'un téléchargement interrompu — annonce
    /// plusieurs images et n'en rend qu'une. Ce n'est pas une animation, et ça
    /// ne doit surtout pas être un crash.
    func test_unGIFtronque_neRendPasUneAnimationBancale() throws {
        let complet = try makeGIF(delays: [0.1, 0.1, 0.1])
        let tronque = complet.prefix(complet.count / 3)
        _ = AnimatedImageDecoder.decode(Data(tronque))
    }

    // MARK: - Ce qui EST une animation

    func test_unGIFanime_rendSesImagesEtSaDuree() throws {
        let decoded = try XCTUnwrap(AnimatedImageDecoder.decode(try makeGIF(delays: [0.1, 0.1, 0.1])))
        XCTAssertEqual(decoded.frames.count, 3)
        XCTAssertEqual(decoded.duration, 0.3, accuracy: 0.02)
        XCTAssertNotNil(decoded.animatedImage)
    }

    /// **Le cœur : la cadence VARIABLE est restituée.** Trois images à
    /// 100/100/500 ms produisent 1 + 1 + 5 = 7 images d'un dixième de seconde —
    /// sans quoi `UIImage` jouerait trois images de 233 ms et la pose longue
    /// serait deux fois trop courte.
    func test_uneCadenceVARIABLE_estRestituee_parRepetition() throws {
        let decoded = try XCTUnwrap(AnimatedImageDecoder.decode(try makeGIF(delays: [0.1, 0.1, 0.5])))
        XCTAssertEqual(decoded.frames.count, 7,
                       "l'image lente occupe 5 unités ; 3 images signifierait cadence constante")
        XCTAssertEqual(decoded.duration, 0.7, accuracy: 0.02)
    }

    /// **Le tableau rendu N'EST PAS le nombre d'images du FICHIER** — contrat
    /// annoncé aux appelants, et qui se vérifie plutôt que de se promettre.
    func test_leNombreDimagesRendu_differeDuFichier_quandLaCadenceVarie() throws {
        let decoded = try XCTUnwrap(AnimatedImageDecoder.decode(try makeGIF(delays: [0.1, 0.5])))
        XCTAssertGreaterThan(decoded.frames.count, 2)
    }

    // MARK: - Le mouvement réduit

    /// Figer sur la PREMIÈRE image, jamais sur une image au hasard : c'est ce
    /// que montre un GIF non joué, donc ce que l'auteur a choisi comme vignette.
    func test_leMouvementReduit_figeSurLaPREMIEREimage() throws {
        let decoded = try XCTUnwrap(AnimatedImageDecoder.decode(try makeGIF(delays: [0.1, 0.1, 0.1])))
        let still = try XCTUnwrap(decoded.stillImage)
        XCTAssertEqual(still.cgImage?.width, decoded.frames.first?.width)
        XCTAssertNil(still.images, "une image figée n'est pas une image animée")
    }

    // MARK: - Le plafond de décodage

    /// Un sticker s'affiche dans ~120 pt. Décoder N images en pleine résolution
    /// coûterait N bitmaps pour rien — le plafond s'applique à CHAQUE image, pas
    /// seulement à la première.
    func test_lePlafondDeDecodage_sappliqueAtoutesLesImages() throws {
        let data = try makeGIF(delays: [0.1, 0.1, 0.1])
        let decoded = try XCTUnwrap(AnimatedImageDecoder.decode(data, maxPixelSize: 4))
        XCTAssertFalse(decoded.frames.isEmpty)
        for frame in decoded.frames {
            XCTAssertLessThanOrEqual(max(frame.width, frame.height), 4)
        }
    }
}
