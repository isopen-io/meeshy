import XCTest
import ImageIO
import UniformTypeIdentifiers
import UIKit
@testable import Meeshy
@testable import MeeshyUI

/// **Ce qu'une image devient en entrant dans « Mes stickers »** (#3956).
///
/// Le défaut fermé ici n'était pas un rendu : c'était une ÉCRITURE. Le collage
/// décodait une `UIImage` puis la ré-encodait en `pngData()`, si bien qu'un GIF
/// perdait ses images 2 à N **avant même d'atteindre le disque**. Aucun site en
/// aval ne pouvait le rattraper — les octets n'existaient plus.
///
/// > La planche disait « collage = image fixe » comme un constat. C'était la
/// > conséquence d'une ligne.
final class StickerLibraryArtworkTests: XCTestCase {

    // MARK: - Le cas nominal des deux côtés

    /// Un GIF animé garde ses octets D'ORIGINE : ré-encoder à 512 px
    /// reconstruirait le conteneur image par image, pour une perte de qualité et
    /// une seconde implémentation du format à tenir juste.
    func test_unGIFanime_gardeSesOctetsDOrigine() throws {
        let gif = try Self.makeGIF(frames: 4)
        let png = try XCTUnwrap(Self.pixel().pngData())

        let kept = try XCTUnwrap(StickerLibraryArtwork.keep(original: gif, stillPNG: png))

        XCTAssertTrue(kept.animates)
        XCTAssertEqual(kept.bytes, gif)
    }

    /// Une image FIXE garde le PNG déjà réduit au budget de la surface — le
    /// chemin d'avant ce lot, inchangé. C'est le cas de l'écrasante majorité des
    /// stickers, et il ne doit rien payer de neuf.
    func test_uneImageFIXE_gardeSonPNGreduit() throws {
        let jpeg = try XCTUnwrap(Self.pixel().jpegData(compressionQuality: 0.8))
        let png = try XCTUnwrap(Self.pixel().pngData())

        let kept = try XCTUnwrap(StickerLibraryArtwork.keep(original: jpeg, stillPNG: png))

        XCTAssertFalse(kept.animates)
        XCTAssertEqual(kept.bytes, png)
    }

    /// **L'arbitre est le décodeur, pas la porte.** `mayBeAnimated` répond
    /// « peut-être » à un GIF d'UNE seule image comme à toute photo HEIC : s'y
    /// fier rangerait des originaux de douze mégapixels dans un magasin borné à
    /// 64 Mo.
    func test_unGIFdUneSeuleImage_estGardeCommeUneImageFIXE() throws {
        let single = try Self.makeGIF(frames: 1)
        let png = try XCTUnwrap(Self.pixel().pngData())

        XCTAssertTrue(AnimatedImageEligibility.mayBeAnimated(single),
                      "prérequis : la porte le laisse passer, c'est bien l'arbitre qui tranche")

        let kept = try XCTUnwrap(StickerLibraryArtwork.keep(original: single, stillPNG: png))

        XCTAssertFalse(kept.animates)
        XCTAssertEqual(kept.bytes, png)
    }

    // MARK: - Le plafond d'octets

    /// **Un seul GIF ne peut pas vider la bibliothèque.** Le magasin est borné à
    /// 64 Mo avec éviction LRU : garder un original de vingt mégaoctets
    /// évincerait toute la collection de l'utilisateur, qui la perdrait en
    /// collant une image. Au-delà du plafond, on garde ce qu'on sait garder.
    func test_auDelaDuPlafond_onGardeLimageFIXE() throws {
        let énorme = Data(repeating: 0, count: StickerLibraryArtwork.animatedByteCeiling + 1)
        let png = try XCTUnwrap(Self.pixel().pngData())

        let kept = try XCTUnwrap(StickerLibraryArtwork.keep(original: énorme, stillPNG: png))

        XCTAssertFalse(kept.animates)
        XCTAssertEqual(kept.bytes, png)
    }

    /// Le plafond est une FRACTION du budget du magasin, jamais un nombre écrit
    /// à la main : monter le budget sans monter le plafond rendrait la borne
    /// arbitraire, et la baisser sans la baisser la rendrait inopérante.
    func test_lePlafond_estUneFractionDuBudgetDuMagasin() {
        XCTAssertEqual(StickerLibraryArtwork.animatedByteCeiling,
                       StickerLibraryStore.defaultBudgetBytes / 8)
        XCTAssertLessThan(StickerLibraryArtwork.animatedByteCeiling,
                          StickerLibraryStore.defaultBudgetBytes)
    }

    // MARK: - La moitié ANIMÉE, interrogeable seule

    /// Les deux granularités de la règle doivent rendre le MÊME verdict : la
    /// moitié animée n'est pas une seconde condition, c'est la même, isolée
    /// pour que les appelants ne paient pas ce dont ils n'ont pas besoin.
    func test_lesDeuxGranularites_rendentLeMemeVerdict() throws {
        let png = try XCTUnwrap(Self.pixel().pngData())
        for original in [try Self.makeGIF(frames: 4),
                         try Self.makeGIF(frames: 1),
                         png,
                         Data(repeating: 0, count: StickerLibraryArtwork.animatedByteCeiling + 1)] {
            let entier = StickerLibraryArtwork.keep(original: original, stillPNG: png)
            let animé = StickerLibraryArtwork.animatedBytesToKeep(original: original)

            XCTAssertEqual(entier?.animates ?? false, animé != nil,
                           "les deux moitiés de la règle divergent")
            if let animé { XCTAssertEqual(entier?.bytes, animé) }
        }
    }

    // MARK: - Rien de gardable

    /// `nil` quand il n'y a NI animation admissible NI image fixe : l'appelant
    /// annonce alors l'échec. Rendre des octets vides ferait entrer dans la
    /// bibliothèque une vignette que rien ne peut peindre.
    func test_sansAnimationNiImageFixe_rienNestGarde() {
        let illisible = Data([0x00, 0x01, 0x02, 0x03])

        XCTAssertNil(StickerLibraryArtwork.keep(original: illisible, stillPNG: nil))
    }

    // MARK: - La relecture

    /// **Relire, c'est redécouvrir l'animation.** Rien n'est persisté à côté des
    /// octets pour dire qu'ils animent : un drapeau posé là mentirait dès qu'un
    /// fichier serait remplacé. Les octets se décrivent eux-mêmes.
    @MainActor
    func test_relireUnGIF_rendUneEntreeANIMEE_avecSonImageFixe() throws {
        let gif = try Self.makeGIF(frames: 3)

        let item = try XCTUnwrap(StickerLibraryArtwork.item(id: "s1", bytes: gif))

        XCTAssertEqual(item.id, "s1")
        XCTAssertEqual(item.animatedData, gif)
        XCTAssertGreaterThan(item.thumbnail.size.width, 0,
                             "l'image fixe est la PREMIÈRE image du cycle, pas rien")
    }

    @MainActor
    func test_relireUnPNG_rendUneEntreeFIXE() throws {
        let png = try XCTUnwrap(Self.pixel().pngData())

        let item = try XCTUnwrap(StickerLibraryArtwork.item(id: "s2", bytes: png))

        XCTAssertNil(item.animatedData)
        XCTAssertGreaterThan(item.thumbnail.size.width, 0)
    }

    @MainActor
    func test_relireDesOctetsIllisibles_neRendRien() {
        XCTAssertNil(StickerLibraryArtwork.item(id: "s3", bytes: Data([0x00, 0x01])))
    }

    // MARK: - Helpers

    private static func pixel() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
    }

    private static func makeGIF(frames: Int) throws -> Data {
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(
            data as CFMutableData, UTType.gif.identifier as CFString, frames, nil))
        for index in 0..<frames {
            let image = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { context in
                UIColor(white: CGFloat(index) / CGFloat(max(frames - 1, 1)), alpha: 1).setFill()
                context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
            }
            CGImageDestinationAddImage(destination, try XCTUnwrap(image.cgImage), [
                kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFUnclampedDelayTime: 0.1]
            ] as CFDictionary)
        }
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }
}
