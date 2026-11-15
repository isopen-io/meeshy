import XCTest
import ImageIO
import UniformTypeIdentifiers
import UIKit
@testable import MeeshyUI

/// **La porte posée AVANT le décodeur** (#4925).
///
/// Sur un fil, la quasi-totalité des images sont des JPEG et des PNG fixes.
/// Construire un `CGImageSource` par avatar et par vignette pour apprendre à
/// chaque fois qu'ils ne sont pas animés est la lenteur que la dimension 2 de
/// la roadmap appelle un bug.
///
/// **La direction de l'erreur est choisie** : un faux « peut-être » coûte un
/// décodage inutile ; un faux « non » ferait un sticker définitivement figé,
/// sans aucun site où le remarquer. Les témoins ci-dessous éprouvent les deux
/// sens SÉPARÉMENT, parce que seul le second est inacceptable.
final class AnimatedImageEligibilityTests: XCTestCase {

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
            CGImageDestinationAddImage(destination, pixel(CGFloat(index) / CGFloat(max(frames - 1, 1))).cgImage!, [
                kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFUnclampedDelayTime: 0.1]
            ] as CFDictionary)
        }
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    // MARK: - Le sens INACCEPTABLE : jamais « non » pour un animé

    /// **Le témoin qui compte.** Un GIF animé doit toujours passer la porte —
    /// sinon le décodeur n'est jamais appelé et le sticker reste figé pour
    /// toujours, sans site où le remarquer.
    func test_unGIFanime_passeTOUJOURSlaPorte() throws {
        XCTAssertTrue(AnimatedImageEligibility.mayBeAnimated(try makeGIF(frames: 4)))
    }

    /// Et le témoin de bout en bout qui lie la porte au décodeur : tout ce que
    /// le décodeur sait décoder doit d'abord franchir la porte. C'est
    /// l'assertion qui tombe si l'une des deux évolue sans l'autre.
    func test_toutCeQueLeDecodeurACCEPTE_franchitLaPorte() throws {
        let data = try makeGIF(frames: 3)
        XCTAssertNotNil(AnimatedImageDecoder.decode(data), "prérequis du témoin")
        XCTAssertTrue(AnimatedImageEligibility.mayBeAnimated(data),
                      "la porte refuserait une image que le décodeur sait animer")
    }

    // MARK: - Le sens RENTABLE : « non » pour ce qui ne peut pas animer

    /// **JPEG ne peut pas animer**, et c'est ce qui rend la porte rentable :
    /// c'est le format le plus fréquent du produit.
    func test_unJPEG_estRefuseSansOuvrirDeSource() {
        let jpeg = try! XCTUnwrap(pixel(0.4).jpegData(compressionQuality: 0.8))
        XCTAssertFalse(AnimatedImageEligibility.mayBeAnimated(jpeg))
    }

    /// Un PNG FIXE est refusé — c'est le pas de plus que le PNG mérite : un
    /// sticker fixe est très souvent un PNG, et s'arrêter à la signature
    /// `\x89PNG` rendrait « peut-être » pour chacun d'eux.
    func test_unPNGfixe_estRefuse_carIlNaPasDacTL() {
        let png = try! XCTUnwrap(pixel(0.5).pngData())
        XCTAssertFalse(AnimatedImageEligibility.mayBeAnimated(png),
                       "un PNG sans chunk acTL n'est pas un APNG")
    }

    /// Et le fusible du PNG : la porte doit s'ouvrir dès que l'`acTL` est là,
    /// sinon la branche PNG refuserait TOUS les PNG et ce serait le sens
    /// inacceptable. On fabrique l'en-tête, la spec imposant `acTL` avant le
    /// premier `IDAT`.
    func test_unPNGavecACTL_passeLaPorte() {
        var apng = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        apng.append(Data([0, 0, 0, 13]))
        apng.append(Data("IHDR".utf8))
        apng.append(Data(repeating: 0, count: 17))
        apng.append(Data([0, 0, 0, 8]))
        apng.append(Data("acTL".utf8))
        apng.append(Data(repeating: 0, count: 12))
        XCTAssertTrue(AnimatedImageEligibility.mayBeAnimated(apng))
    }

    // MARK: - Ce qui n'est pas une image

    func test_desOctetsCourtsOuVides_sontRefuses() {
        XCTAssertFalse(AnimatedImageEligibility.mayBeAnimated(Data()))
        XCTAssertFalse(AnimatedImageEligibility.mayBeAnimated(Data([0x89, 0x50])))
        XCTAssertFalse(AnimatedImageEligibility.mayBeAnimated(Data("pas une image".utf8)))
    }

    // MARK: - Le coût

    /// La porte lit un PRÉFIXE BORNÉ, jamais tout le fichier : c'est sa raison
    /// d'être. Un fichier de 8 Mo dont l'en-tête n'est pas éligible se refuse
    /// au même prix qu'un fichier de 8 Ko.
    func test_laPorte_neLitQuUnPrefixeBorne() {
        var gros = try! XCTUnwrap(pixel(0.3).jpegData(compressionQuality: 1))
        gros.append(Data(repeating: 0x47, count: 8 * 1024 * 1024))
        XCTAssertFalse(AnimatedImageEligibility.mayBeAnimated(gros),
                       "les octets « GIF » plus loin dans le fichier ne doivent pas l'ouvrir")
        XCTAssertLessThanOrEqual(AnimatedImageEligibility.inspectedPrefix, 4096)
    }
}
