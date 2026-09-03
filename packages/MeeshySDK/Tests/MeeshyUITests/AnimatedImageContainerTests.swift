import XCTest
import ImageIO
import UniformTypeIdentifiers
import UIKit
@testable import MeeshyUI

/// **Le conteneur qui porte l'animation, et le mime sous lequel il repart**
/// (#3956).
///
/// La porte savait déjà répondre « peut-être » ; ce lot lui demande une seconde
/// chose que le collage d'un GIF rend nécessaire : **sous quel type ces octets
/// partent-ils au serveur ?** Un GIF téléversé en `image/png` arriverait mal
/// étiqueté chez les trois clients — l'animation aurait survécu au disque pour
/// mourir à l'en-tête, et aucun test d'animation ne l'aurait vu.
final class AnimatedImageContainerTests: XCTestCase {

    private func pixel(_ gray: CGFloat) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { context in
            UIColor(white: gray, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
    }

    private func makeGIF(frames: Int) throws -> Data {
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(
            data as CFMutableData, UTType.gif.identifier as CFString, frames, nil))
        for index in 0..<frames {
            let image = try XCTUnwrap(pixel(CGFloat(index) / CGFloat(max(frames - 1, 1))).cgImage)
            CGImageDestinationAddImage(destination, image, [
                kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFUnclampedDelayTime: 0.1]
            ] as CFDictionary)
        }
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    // MARK: - Le conteneur

    func test_unGIF_seNommeGIF_etPorteSonMime() throws {
        let container = try XCTUnwrap(AnimatedImageEligibility.container(try makeGIF(frames: 3)))

        XCTAssertEqual(container, .gif)
        XCTAssertEqual(container.mimeType, "image/gif")
        XCTAssertEqual(container.filenameExtension, "gif")
    }

    /// **Un APNG EST un PNG.** `image/apng` existe mais n'est pas servi partout,
    /// et les octets se décodent de la même façon : le mime de service est
    /// `image/png`, l'extension `png`. Le témoin fige la décision plutôt que de
    /// la laisser se redécider au prochain site d'envoi.
    func test_unAPNG_sertLeMimePNG() {
        XCTAssertEqual(AnimatedImageEligibility.Container.apng.mimeType, "image/png")
        XCTAssertEqual(AnimatedImageEligibility.Container.apng.filenameExtension, "png")
    }

    /// Chaque conteneur porte un mime d'IMAGE et une extension non vide. Un
    /// cinquième format ajouté sans les remplir ferait partir un fichier sous un
    /// type que le serveur refuserait — le genre d'échec qui ne se voit qu'en
    /// production.
    func test_chaqueConteneur_porteUnMimeImageEtUneExtension() {
        for container in AnimatedImageEligibility.Container.allCases {
            XCTAssertTrue(container.mimeType.hasPrefix("image/"),
                          "\(container) ne porte pas un mime d'image")
            XCTAssertFalse(container.filenameExtension.isEmpty,
                           "\(container) n'a pas d'extension de fichier")
        }
    }

    // MARK: - La parité avec la porte

    /// `mayBeAnimated` et `container` répondent à la MÊME question — la première
    /// est désormais une projection de la seconde. Deux implémentations
    /// divergeraient à la première signature ajoutée, et la divergence ne se
    /// verrait que sur le format ajouté.
    func test_laPorteEtLeConteneur_repondentPareil() throws {
        let animé = try makeGIF(frames: 3)
        let fixe = try XCTUnwrap(pixel(0.4).jpegData(compressionQuality: 0.8))

        XCTAssertEqual(AnimatedImageEligibility.mayBeAnimated(animé),
                       AnimatedImageEligibility.container(animé) != nil)
        XCTAssertEqual(AnimatedImageEligibility.mayBeAnimated(fixe),
                       AnimatedImageEligibility.container(fixe) != nil)
        XCTAssertNil(AnimatedImageEligibility.container(fixe))
    }

    // MARK: - `animates` : l'arbitre EXACT

    /// **La porte dit « peut-être », `animates` tranche.** C'est la distinction
    /// dont dépend ce que la bibliothèque GARDE : sans elle, toute photo HEIC
    /// d'iPhone serait rangée entière dans un magasin borné à 64 Mo.
    func test_animates_estVraiPourUnGIF_etFauxPourUneImageFixe() throws {
        XCTAssertTrue(AnimatedImageDecoder.animates(try makeGIF(frames: 4)))

        let png = try XCTUnwrap(pixel(0.6).pngData())
        XCTAssertFalse(AnimatedImageDecoder.animates(png))
    }

    /// Un GIF d'UNE SEULE image n'anime pas — et c'est `animates` qui doit le
    /// dire, pas la porte, qui ne lit que la signature.
    func test_unGIFdUneSeuleImage_nAnimePas_memeSiLaPorteLeLaissePasser() throws {
        let single = try makeGIF(frames: 1)

        XCTAssertTrue(AnimatedImageEligibility.mayBeAnimated(single),
                      "la porte lit la signature GIF : elle laisse passer")
        XCTAssertFalse(AnimatedImageDecoder.animates(single),
                       "…et l'arbitre exact refuse, comme `decode` le ferait")
        XCTAssertNil(AnimatedImageDecoder.decode(single),
                     "les deux doivent rendre le même verdict")
    }

    /// `animates` et `decode` ne peuvent pas diverger : le premier existe pour
    /// répondre SANS décoder, jamais pour répondre AUTREMENT.
    func test_animates_etDecode_rendentLeMemeVerdict() throws {
        for frames in [1, 2, 6] {
            let data = try makeGIF(frames: frames)
            XCTAssertEqual(AnimatedImageDecoder.animates(data),
                           AnimatedImageDecoder.decode(data) != nil,
                           "verdicts divergents pour \(frames) image(s)")
        }
    }

    // MARK: - La mémoire

    /// Décoder deux fois les mêmes octets sous la même clé et le même budget
    /// doit rendre le même CYCLE — sinon la mémoire ne mémorise rien, et
    /// `configure` re-décode un GIF à chaque image d'un déplacement.
    func test_laMemoire_rendLeMemeCycle_pourLaMemeCle() throws {
        AnimatedImageMemo.removeAll()
        let data = try makeGIF(frames: 4)

        let first = try XCTUnwrap(AnimatedImageMemo.decoded(key: "s1", bytes: data, maxPixelSize: 64))
        let second = try XCTUnwrap(AnimatedImageMemo.decoded(key: "s1", bytes: data, maxPixelSize: 64))

        XCTAssertEqual(first.frames.count, second.frames.count)
        XCTAssertEqual(first.duration, second.duration)
        XCTAssertTrue(first.frames.first === second.frames.first,
                      "un second décodage aurait produit d'autres images : rien n'est mémorisé")
    }

    /// **Le budget fait partie de la clé.** La même image servie à une vignette
    /// de 52 pt et à une scène de 1080 px n'est pas le même objet ; les
    /// confondre peindrait l'une des deux à la mauvaise résolution.
    func test_laMemoire_separeLesBudgets() throws {
        AnimatedImageMemo.removeAll()
        let data = try makeGIF(frames: 3)

        XCTAssertNotEqual(AnimatedImageMemo.cacheKey(key: "s1", byteCount: data.count, maxPixelSize: 64),
                          AnimatedImageMemo.cacheKey(key: "s1", byteCount: data.count, maxPixelSize: 512))
    }

    /// Une image FIXE rend `nil` par la mémoire comme par le décodeur : la
    /// mémoire ne doit pas inventer une animation pour ce qui n'en a pas.
    func test_laMemoire_rendNilPourUneImageFixe() throws {
        AnimatedImageMemo.removeAll()
        let png = try XCTUnwrap(pixel(0.5).pngData())

        XCTAssertNil(AnimatedImageMemo.decoded(key: "fixe", bytes: png, maxPixelSize: 128))
    }
}
