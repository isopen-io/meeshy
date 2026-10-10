import XCTest
import UIKit
import ImageIO
import UniformTypeIdentifiers
@testable import MeeshyUI
@testable import MeeshySDK

/// **Une scène ne décode plus une photo au-delà de ce qu'on publiera** (#6922).
///
/// Le composer gardait chaque photo d'un post décodée en PLEINE taille dans
/// `loadedImages`, pour TOUTES les scènes à la fois : une photo d'appareil de
/// 12 Mpx pèse 48 Mo une fois décodée, une de 48 Mpx près de 200 Mo. La
/// publication, elle, ne part jamais au-delà de 2 048 px de grand côté
/// (`MediaCompressor.compressImage`). Ces témoins tiennent les trois termes du
/// correctif : la taille de travail, le ratio, et l'ORIGINAL — le fichier copié
/// pour la pré-montée reste celui de l'auteur, octet pour octet.
@MainActor
final class SceneImageDownsamplingTests: XCTestCase {

    // MARK: - Taille cible (pure)

    func test_targetPixelSize_reduitLeGrandCote_etGardeLeRatio() {
        let cible = SceneImageDownsampling.targetPixelSize(
            source: CGSize(width: 4032, height: 3024), maxPixelSize: 2048)
        XCTAssertEqual(cible, CGSize(width: 2048, height: 1536))
    }

    func test_targetPixelSize_portrait_reduitLaHauteur() {
        let cible = SceneImageDownsampling.targetPixelSize(
            source: CGSize(width: 900, height: 1600), maxPixelSize: 1000)
        XCTAssertEqual(cible.height, 1000)
        XCTAssertEqual(cible.width / cible.height, 900.0 / 1600.0, accuracy: 0.002,
                       "le ratio d'une photo portrait survit à la réduction")
    }

    func test_targetPixelSize_nAgranditJamais() {
        let pano = CGSize(width: 1600, height: 400)
        XCTAssertEqual(SceneImageDownsampling.targetPixelSize(source: pano, maxPixelSize: 2048), pano,
                       "une mire de 1 600 px est déjà sous la taille de travail : elle reste telle quelle")
    }

    func test_targetPixelSize_tailleDegeneree_rendZero() {
        XCTAssertEqual(SceneImageDownsampling.targetPixelSize(source: .zero, maxPixelSize: 2048), .zero)
        XCTAssertEqual(SceneImageDownsampling.targetPixelSize(
            source: CGSize(width: CGFloat.nan, height: 10), maxPixelSize: 2048), .zero)
        XCTAssertEqual(SceneImageDownsampling.targetPixelSize(
            source: CGSize(width: 10, height: 10), maxPixelSize: 0), .zero)
    }

    func test_workingMaxPixelSize_estLePlafondDePublication() {
        XCTAssertEqual(SceneImageDownsampling.workingMaxPixelSize, 2048,
                       "la taille de travail est celle que la publication envoie — ni plus, ni moins")
    }

    // MARK: - Vignette qui REMPLIT une tuile (pure)

    func test_fillMaxPixelSize_panoramaDansUneTuile9x16() {
        let px = SceneImageDownsampling.fillMaxPixelSize(
            source: CGSize(width: 1600, height: 400),
            tile: CGSize(width: 25, height: 44), scale: 3)
        // Remplir 25×44 pt avec un 4:1 exige 176×44 pt, soit 528 px de grand côté.
        XCTAssertEqual(px, 528)
    }

    func test_fillMaxPixelSize_tailleDegeneree_rendZero() {
        XCTAssertEqual(SceneImageDownsampling.fillMaxPixelSize(
            source: CGSize(width: 100, height: 100), tile: .zero, scale: 3), 0)
        XCTAssertEqual(SceneImageDownsampling.fillMaxPixelSize(
            source: .zero, tile: CGSize(width: 10, height: 10), scale: 3), 0)
    }

    // MARK: - Recadrage : décoder juste assez grand (pure)

    func test_decodeMaxPixelSize_demiCadre_garderLesPixelsPublies() {
        // Une photo 4 032 × 3 024 recadrée à la moitié de sa largeur : le cadre
        // pleine taille fait 2 016 × 3 024, soit 2 048 px de haut une fois
        // publié. Décoder la source à 2 731 px de grand côté rend ce cadre.
        let px = SceneImageDownsampling.decodeMaxPixelSize(
            forCrop: CGSize(width: 0.5, height: 1),
            sourcePixelSize: CGSize(width: 4032, height: 3024), cap: 2048)
        XCTAssertEqual(px, 2731)
    }

    func test_decodeMaxPixelSize_sansCadreValide_rendLePlafond() {
        XCTAssertEqual(SceneImageDownsampling.decodeMaxPixelSize(
            forCrop: .zero, sourcePixelSize: CGSize(width: 4032, height: 3024), cap: 2048), 2048)
        XCTAssertEqual(SceneImageDownsampling.decodeMaxPixelSize(
            forCrop: CGSize(width: 1, height: 1), sourcePixelSize: .zero, cap: 2048), 2048)
    }

    func test_pixelSize_litLesMetadonnees_orientationAppliquee() throws {
        let droite = try Self.writeJPEG(width: 300, height: 100, exifOrientation: .right)
        XCTAssertEqual(SceneImageDownsampling.pixelSize(fileAt: droite), CGSize(width: 100, height: 300))
        let pano = try Self.writeJPEG(width: 1600, height: 400)
        XCTAssertEqual(SceneImageDownsampling.pixelSize(fileAt: pano), CGSize(width: 1600, height: 400))
    }

    // MARK: - Décodage depuis un fichier (ImageIO)

    func test_imageFileAt_decodeAuPlafond_sansToucherAuFichier() throws {
        let url = try Self.writeJPEG(width: 3000, height: 1000)
        let avant = try Data(contentsOf: url)

        let image = try XCTUnwrap(SceneImageDownsampling.image(fileAt: url, maxPixelSize: 1200))

        XCTAssertEqual(Self.pixelSize(image), CGSize(width: 1200, height: 400))
        XCTAssertEqual(try Data(contentsOf: url), avant,
                       "le décodage réduit LIT l'original, il ne le réécrit jamais")
    }

    func test_imageFileAt_petiteImage_resteASaTaille() throws {
        let url = try Self.writeJPEG(width: 800, height: 600)
        let image = try XCTUnwrap(SceneImageDownsampling.image(fileAt: url, maxPixelSize: 2048))
        XCTAssertEqual(Self.pixelSize(image), CGSize(width: 800, height: 600),
                       "aucun agrandissement : une image sous le plafond garde ses pixels")
    }

    func test_imageFileAt_appliqueLOrientationExif() throws {
        let url = try Self.writeJPEG(width: 300, height: 100, exifOrientation: .right)
        let image = try XCTUnwrap(SceneImageDownsampling.image(fileAt: url, maxPixelSize: 2048))
        XCTAssertEqual(image.imageOrientation, .up,
                       "l'orientation est CUITE : le canvas n'a plus de copie redressée à fabriquer")
        XCTAssertEqual(Self.pixelSize(image), CGSize(width: 100, height: 300))
    }

    func test_imageFileAt_fichierAbsent_rendNil() {
        let absent = FileManager.default.temporaryDirectory
            .appendingPathComponent("absent-\(UUID().uuidString).jpg")
        XCTAssertNil(SceneImageDownsampling.image(fileAt: absent, maxPixelSize: 2048))
    }

    // MARK: - Réduction d'une image déjà en mémoire

    func test_downsampled_rendUneNouvelleImage_etLaisseLaSourceIntacte() {
        let source = Self.makeImage(width: 3000, height: 1000)
        let reduite = SceneImageDownsampling.downsampled(source, maxPixelSize: 1200)

        XCTAssertFalse(reduite === source)
        XCTAssertEqual(Self.pixelSize(reduite), CGSize(width: 1200, height: 400))
        XCTAssertEqual(Self.pixelSize(source), CGSize(width: 3000, height: 1000),
                       "la source — celle qu'on publiera — garde tous ses pixels")
    }

    func test_downsampled_imageDejaPetite_rendLaMemeInstance() {
        let source = Self.makeImage(width: 400, height: 200)
        XCTAssertTrue(SceneImageDownsampling.downsampled(source, maxPixelSize: 2048) === source)
    }

    // MARK: - Le composer pose ses photos à la taille publiée

    func test_applyContentMedia_tientLaPhotoALaTaillePubliee_etCopieLOriginal() throws {
        let vm = StoryComposerViewModel()
        let url = try Self.writeJPEG(width: 4000, height: 1000)
        let original = try Data(contentsOf: url)

        let poses = vm.applyContentMedia([ComposerContentMedia(sourceURL: url, kind: .image)])

        let objectId = try XCTUnwrap(poses[url])
        let tenue = try XCTUnwrap(vm.loadedImages[objectId])
        XCTAssertEqual(Self.pixelSize(tenue), CGSize(width: 2048, height: 512),
                       "la scène tient la photo à la taille publiée, plus jamais pleine taille")
        let media = try XCTUnwrap(vm.currentSlide.effects.mediaObjects?.first { $0.id == objectId })
        XCTAssertEqual(media.aspectRatio, 4.0, accuracy: 0.001,
                       "le ratio déclaré est celui de la photo")
        let copie = try XCTUnwrap(media.mediaURL.flatMap(URL.init(string:)))
        XCTAssertEqual(try Data(contentsOf: copie), original,
                       "le fichier que la pré-montée enverra est l'original, octet pour octet")
    }

    func test_troisScenesDeMires_chacuneTenueEntiereSousLePlafond() throws {
        let vm = StoryComposerViewModel()
        let mires = [(1600, 400), (900, 1600), (1600, 900)]
        for (index, (w, h)) in mires.enumerated() {
            if index > 0 { vm.addSlide() }
            let url = try Self.writeJPEG(width: w, height: h)
            let poses = vm.applyContentMedia([ComposerContentMedia(sourceURL: url, kind: .image)],
                                             intoSlideId: vm.currentSlide.id)
            let id = try XCTUnwrap(poses[url])
            XCTAssertEqual(Self.pixelSize(try XCTUnwrap(vm.loadedImages[id])),
                           CGSize(width: w, height: h),
                           "une mire sous le plafond garde tous ses pixels")
        }
        XCTAssertEqual(vm.slides.count, 3)
    }

    // MARK: - Fabriques

    static func makeImage(width: Int, height: Int) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
            .image { ctx in
                UIColor.systemOrange.setFill()
                ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
                UIColor.systemIndigo.setFill()
                ctx.fill(CGRect(x: 0, y: 0, width: width / 2, height: height / 2))
            }
    }

    static func pixelSize(_ image: UIImage) -> CGSize {
        CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
    }

    static func writeJPEG(width: Int, height: Int,
                          exifOrientation: CGImagePropertyOrientation = .up) throws -> URL {
        let cgImage = try XCTUnwrap(makeImage(width: width, height: height).cgImage)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("downsampling-\(UUID().uuidString).jpg")
        let destination = try XCTUnwrap(CGImageDestinationCreateWithURL(
            url as CFURL, UTType.jpeg.identifier as CFString, 1, nil))
        let properties: [CFString: Any] = [
            kCGImagePropertyOrientation: exifOrientation.rawValue,
            kCGImageDestinationLossyCompressionQuality: 0.9
        ]
        CGImageDestinationAddImage(destination, cgImage, properties as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return url
    }
}
