import XCTest
import SwiftUI
import UIKit
import MeeshySDK
@testable import Meeshy

/// #13906 — **l'espace réservé d'une photo qui entre montre sa vignette**,
/// avant la fin de la préparation, comme Android (`IncomingMediaPlaceholder`) ;
/// une vidéo garde la forme neutre.
@MainActor
final class ComposerSceneIntakePreviewTests: XCTestCase {

    private func ajout(foundsScene: Bool = true) -> ComposerSceneIntake {
        ComposerSceneIntake.starting(kind: .media, total: 1, isOffline: false, foundsScene: foundsScene)
    }

    private func rouge(_ side: CGFloat = 40) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: side, height: side))
        }
    }

    // MARK: - Ce que l'espace réservé montre

    func test_aPhoto_showsItsThumbnail_aVideoOrASticker_stayNeutral() {
        XCTAssertTrue(ComposerSceneIntakePreview.showsThumbnail(kind: .media, isVideo: false))
        XCTAssertFalse(ComposerSceneIntakePreview.showsThumbnail(kind: .media, isVideo: true))
        XCTAssertFalse(ComposerSceneIntakePreview.showsThumbnail(kind: .sticker, isVideo: false))
    }

    func test_theThumbnail_staysWhileItsIntakePrepares() {
        let entree = ajout().showing(rouge(), for: ajout().id)
        let vue = ajout()
        let montree = vue.showing(rouge(), for: vue.id)

        XCTAssertNil(entree.thumbnail, "la vignette d'un autre ajout ne se pose pas")
        XCTAssertNotNil(montree.thumbnail)
        XCTAssertNotNil(montree.advanced(done: 0).thumbnail, "la vignette reste pendant toute la préparation")
    }

    func test_theFirstThumbnail_stays() {
        let vue = ajout()
        let premiere = rouge()
        let montree = vue.showing(premiere, for: vue.id).showing(rouge(80), for: vue.id)

        XCTAssertTrue(montree.thumbnail === premiere, "la première arrivée reste")
    }

    func test_aFailure_dropsTheThumbnail_andALateOneIsRefused() {
        let vue = ajout()
        let echec = vue.showing(rouge(), for: vue.id).failing()

        XCTAssertNil(echec.thumbnail, "un échec ne garde que sa ligne discrète")
        XCTAssertNil(vue.failing().showing(rouge(), for: vue.id).thumbnail, "échoué : trop tard")
    }

    // MARK: - La vignette elle-même

    func test_theThumbnailOfAStagedPhoto_isReduced() throws {
        let photo = UIGraphicsImageRenderer(size: CGSize(width: 3000, height: 2000)).image { context in
            UIColor.blue.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 3000, height: 2000))
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("intake-preview-\(UUID().uuidString).jpg")
        try XCTUnwrap(photo.jpegData(compressionQuality: 0.8)).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }

        let vignette = try XCTUnwrap(ComposerSceneIntakePreview.thumbnail(at: url))
        XCTAssertLessThanOrEqual(max(vignette.size.width * vignette.scale, vignette.size.height * vignette.scale),
                                 ComposerSceneIntakePreview.maxPixel + 1)
    }

    func test_anUnreadableFile_hasNoThumbnail() {
        XCTAssertNil(ComposerSceneIntakePreview.thumbnail(at: URL(fileURLWithPath: "/nulle-part.jpg")))
    }

    // MARK: - Le dessin

    func test_theGhost_paintsTheThumbnail() throws {
        let vue = ajout()
        let rendu = ImageRenderer(content: ComposerSceneIntakeGhost(intake: vue.showing(rouge(), for: vue.id),
                                                                   onCancel: {}, onRetry: {}, onDismissFailure: {})
            .frame(width: 180, height: 320))
        rendu.scale = 1
        let image = try XCTUnwrap(rendu.cgImage)
        let pixel = try XCTUnwrap(Self.rgba(of: image, at: CGPoint(x: 90, y: 60)))
        XCTAssertGreaterThan(pixel.red, 0.4, "la vignette se voit dans l'espace réservé")
        XCTAssertLessThan(pixel.green, 0.2)
    }

    // MARK: - Le branchement

    func test_thePhotoLibraryIntake_offersTheThumbnail_beforeItEnds() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        let corps = try XCTUnwrap(Self.body(of: "func ingestPhotoLibraryItems", in: source))
        let offre = try XCTUnwrap(corps.range(of: "ComposerSceneIntakePreview.request(items.first, for: ajout"),
                                  "aucune vignette n'est demandée au choix")
        let fin = try XCTUnwrap(corps.range(of: "finishSceneIntake(ajout)"))
        XCTAssertLessThan(offre.lowerBound, fin.lowerBound, "la vignette arrive avant la fin de la préparation")
        XCTAssertTrue(source.contains("photoLibrary: .shared()"),
                      "sans la photothèque partagée, le sélecteur ne donne aucun identifiant d'image")
        XCTAssertTrue(corps.contains("ComposerSceneIntakePreview.request(staged: url, of: item, for: ajout"),
                      "sans accès à la photothèque, le fichier copié ne donne aucune vignette")
    }

    private static func rgba(of image: CGImage, at point: CGPoint) -> (red: CGFloat, green: CGFloat)? {
        var octets = [UInt8](repeating: 0, count: 4)
        guard let context = CGContext(data: &octets, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.draw(image, in: CGRect(x: -point.x, y: -(CGFloat(image.height) - point.y - 1),
                                       width: CGFloat(image.width), height: CGFloat(image.height)))
        return (CGFloat(octets[0]) / 255, CGFloat(octets[1]) / 255)
    }

    private static func body(of signature: String, in source: String) -> Substring? {
        guard let debut = source.range(of: signature),
              let ouverture = source[debut.upperBound...].firstIndex(of: "{") else { return nil }
        var profondeur = 0
        var index = ouverture
        while index < source.endIndex {
            switch source[index] {
            case "{": profondeur += 1
            case "}":
                profondeur -= 1
                if profondeur == 0 { return source[ouverture...index] }
            default: break
            }
            index = source.index(after: index)
        }
        return nil
    }
}
