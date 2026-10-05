import XCTest
import UIKit
import MeeshySDK
@testable import MeeshyUI

/// **La tuile d'une scène EST sa vignette** (#5009 + #5037, fusion actée par le
/// porteur le 2026-09-03 : « il faut que les rails de slide soient des vignettes
/// de scène »).
///
/// Trois questions, et chacune a sa réponse dans du code pur :
/// - **qu'y a-t-il sur la scène ?** Rien ⇒ la vignette est NOIRE, présente,
///   jamais absente ;
/// - **quand la recalculer ?** Quand son EMPREINTE change — les effets de la
///   scène, l'identité des bitmaps qu'elle peint, la taille de la tuile ;
/// - **qui la peint ?** Le composite partagé (`StorySlideRenderer`), à partir de
///   bitmaps RÉDUITS — jamais la photo de 1600 px peinte dans 44 points.
@MainActor
final class SceneThumbnailTests: XCTestCase {

    private let tuile = CGSize(width: 24, height: 44)

    private func sceneNeuve(_ id: String = "s") -> StorySlide {
        StorySlide(id: id)
    }

    private func couleur(_ image: UIImage, x: Int, y: Int) -> (r: Int, g: Int, b: Int) {
        guard let cg = image.cgImage,
              let data = cg.dataProvider?.data,
              let octets = CFDataGetBytePtr(data) else { return (-1, -1, -1) }
        let parPixel = cg.bitsPerPixel / 8
        let i = y * cg.bytesPerRow + x * parPixel
        let premier = Int(octets[i]), second = Int(octets[i + 1]), troisieme = Int(octets[i + 2])
        let bgra = cg.bitmapInfo.contains(.byteOrder32Little)
        return bgra ? (troisieme, second, premier) : (premier, second, troisieme)
    }

    // MARK: - Qu'y a-t-il sur la scène ?

    func test_isBlank_sceneNeuve_vrai() {
        XCTAssertTrue(SceneThumbnailContent.isBlank(sceneNeuve(), bgImage: nil),
                      "une scène qu'on vient de créer n'a rien : sa vignette est noire")
    }

    func test_isBlank_fondCouleur_faux() {
        var s = sceneNeuve()
        s.effects.background = "FF0000"
        XCTAssertFalse(SceneThumbnailContent.isBlank(s, bgImage: nil))
    }

    func test_isBlank_textePose_faux() {
        var s = sceneNeuve()
        s.effects.textObjects = [StoryTextObject(id: "t", text: "Bonjour")]
        XCTAssertFalse(SceneThumbnailContent.isBlank(s, bgImage: nil),
                       "un texte posé est sur la scène, la vignette le montre")
    }

    func test_isBlank_mediaPose_faux() {
        var s = sceneNeuve()
        s.effects.mediaObjects = [StoryMediaObject(id: "m", postMediaId: "p", aspectRatio: 1, isBackground: true)]
        XCTAssertFalse(SceneThumbnailContent.isBlank(s, bgImage: nil))
    }

    func test_isBlank_dessin_faux() {
        var s = sceneNeuve()
        s.effects.drawingStrokes = [StoryDrawingStroke(id: "a", colorHex: "FFFFFF", width: 8)]
        XCTAssertFalse(SceneThumbnailContent.isBlank(s, bgImage: nil))
    }

    func test_isBlank_fondLegacy_faux() {
        XCTAssertFalse(SceneThumbnailContent.isBlank(
            sceneNeuve(), bgImage: SceneImageDownsamplingTests.makeImage(width: 40, height: 70)))
    }

    // MARK: - Le rendu

    func test_thumbnail_sceneVide_estNoire_etALaTailleDeLaTuile() {
        let store = SceneThumbnailStore()
        let image = SceneThumbnailRenderer.thumbnail(
            slide: sceneNeuve(), bgImage: nil, loadedImages: [:],
            size: tuile, scale: 2, store: store, reductions: SceneThumbnailCache())
        XCTAssertEqual(SceneImageDownsamplingTests.pixelSize(image), CGSize(width: 48, height: 88))
        let c = couleur(image, x: 24, y: 44)
        XCTAssertEqual(c.r, 0); XCTAssertEqual(c.g, 0); XCTAssertEqual(c.b, 0)
    }

    func test_thumbnail_fondCouleur_peintLaCouleur() {
        var s = sceneNeuve()
        s.effects.background = "FF0000"
        let image = SceneThumbnailRenderer.thumbnail(
            slide: s, bgImage: nil, loadedImages: [:], size: tuile, scale: 2,
            store: SceneThumbnailStore(), reductions: SceneThumbnailCache())
        let c = couleur(image, x: 24, y: 44)
        XCTAssertGreaterThan(c.r, 200); XCTAssertLessThan(c.g, 40); XCTAssertLessThan(c.b, 40)
    }

    func test_thumbnail_fondPhoto_peintLaPhoto_pasLeNoir() {
        var s = sceneNeuve()
        s.effects.mediaObjects = [StoryMediaObject(id: "m", postMediaId: "p", aspectRatio: 1600.0 / 900,
                                                   isBackground: true)]
        let photo = SceneImageDownsamplingTests.makeImage(width: 1600, height: 900)
        let image = SceneThumbnailRenderer.thumbnail(
            slide: s, bgImage: nil, loadedImages: ["m": photo], size: tuile, scale: 2,
            store: SceneThumbnailStore(), reductions: SceneThumbnailCache())
        let c = couleur(image, x: 40, y: 80)
        XCTAssertFalse(c.r == 0 && c.g == 0 && c.b == 0, "la photo de fond se voit dans la vignette")
    }

    /// **Un son POSÉ se voit dans la vignette** (#5037 : « tout ce qui est sur
    /// la scène ») — le composite partagé ne peint pas la pastille audio.
    func test_thumbnail_sonPose_marqueSaPlace() {
        var s = sceneNeuve()
        s.effects.background = "FFFFFF"
        s.effects.audioPlayerObjects = [StoryAudioPlayerObject(id: "a", x: 0.5, y: 0.5)]
        let image = SceneThumbnailRenderer.thumbnail(
            slide: s, bgImage: nil, loadedImages: [:], size: CGSize(width: 90, height: 160), scale: 2,
            store: SceneThumbnailStore(), reductions: SceneThumbnailCache())
        let centre = couleur(image, x: 90, y: 160)
        let coin = couleur(image, x: 4, y: 4)
        XCTAssertGreaterThan(coin.r, 240, "le fond blanc reste blanc loin de la pastille")
        XCTAssertLessThan(min(centre.r, centre.g, centre.b), 200, "la pastille du son se voit à sa place")
    }

    /// **Jamais la photo entière dans 44 points** (#6922) : ce que le composite
    /// reçoit est réduit à la tuile.
    func test_reducedImages_plafonneChaqueBitmapALaTuile() {
        var s = sceneNeuve()
        s.effects.mediaObjects = [StoryMediaObject(id: "m", postMediaId: "p", aspectRatio: 1600.0 / 900,
                                                   isBackground: true)]
        let photo = SceneImageDownsamplingTests.makeImage(width: 1600, height: 900)
        let reduites = SceneThumbnailRenderer.reducedImages(
            slide: s, loadedImages: ["m": photo, "etranger": photo],
            size: tuile, scale: 2, reductions: SceneThumbnailCache())
        let m = try? XCTUnwrap(reduites["m"])
        XCTAssertNotNil(m)
        XCTAssertLessThanOrEqual(SceneImageDownsamplingTests.pixelSize(m!).height, 88 + 1)
        XCTAssertNil(reduites["etranger"], "un bitmap d'une AUTRE scène n'est pas réduit pour celle-ci")
    }

    // MARK: - L'empreinte : quand recalculer

    func test_fingerprint_memeScene_egale() {
        var s = sceneNeuve()
        s.effects.background = "00FF00"
        let a = SceneThumbnailFingerprint(slide: s, bgImage: nil, loadedImages: [:], size: tuile, scale: 2)
        let b = SceneThumbnailFingerprint(slide: s, bgImage: nil, loadedImages: [:], size: tuile, scale: 2)
        XCTAssertEqual(a, b)
    }

    func test_fingerprint_texteDeplace_differe() {
        var s = sceneNeuve()
        s.effects.textObjects = [StoryTextObject(id: "t", text: "Bonjour", x: 0.5, y: 0.5)]
        let avant = SceneThumbnailFingerprint(slide: s, bgImage: nil, loadedImages: [:], size: tuile, scale: 2)
        s.effects.textObjects[0].y = 0.2
        let apres = SceneThumbnailFingerprint(slide: s, bgImage: nil, loadedImages: [:], size: tuile, scale: 2)
        XCTAssertNotEqual(avant, apres, "la scène a changé : la vignette se recalcule")
    }

    func test_fingerprint_bitmapRemplace_differe() {
        var s = sceneNeuve()
        s.effects.mediaObjects = [StoryMediaObject(id: "m", postMediaId: "p", aspectRatio: 1, isBackground: true)]
        let a = SceneImageDownsamplingTests.makeImage(width: 40, height: 40)
        let b = SceneImageDownsamplingTests.makeImage(width: 40, height: 40)
        XCTAssertNotEqual(
            SceneThumbnailFingerprint(slide: s, bgImage: nil, loadedImages: ["m": a], size: tuile, scale: 2),
            SceneThumbnailFingerprint(slide: s, bgImage: nil, loadedImages: ["m": b], size: tuile, scale: 2))
    }

    func test_fingerprint_bitmapDUneAutreScene_neChangeRien() {
        let s = sceneNeuve()
        let ailleurs = SceneImageDownsamplingTests.makeImage(width: 40, height: 40)
        XCTAssertEqual(
            SceneThumbnailFingerprint(slide: s, bgImage: nil, loadedImages: [:], size: tuile, scale: 2),
            SceneThumbnailFingerprint(slide: s, bgImage: nil, loadedImages: ["x": ailleurs], size: tuile, scale: 2),
            "poser une photo sur la scène 2 ne repeint pas la vignette de la scène 1")
    }

    // MARK: - Le cache par empreinte

    func test_store_memeEmpreinte_rendLaMemeInstance() {
        let store = SceneThumbnailStore()
        var s = sceneNeuve()
        s.effects.background = "0000FF"
        let premiere = SceneThumbnailRenderer.thumbnail(slide: s, bgImage: nil, loadedImages: [:], size: tuile,
                                                        scale: 2, store: store, reductions: SceneThumbnailCache())
        let empreinte = SceneThumbnailFingerprint(slide: s, bgImage: nil, loadedImages: [:], size: tuile, scale: 2)
        XCTAssertTrue(store.cached(empreinte) === premiere, "la même scène ne se repeint pas")
    }

    func test_store_sourceLiberee_neSertPlusLaVignette() {
        let store = SceneThumbnailStore()
        var s = sceneNeuve()
        s.effects.mediaObjects = [StoryMediaObject(id: "m", postMediaId: "p", aspectRatio: 1, isBackground: true)]
        var empreinte: SceneThumbnailFingerprint?
        autoreleasepool {
            let photo = SceneImageDownsamplingTests.makeImage(width: 40, height: 40)
            _ = SceneThumbnailRenderer.thumbnail(slide: s, bgImage: nil, loadedImages: ["m": photo], size: tuile,
                                                 scale: 2, store: store, reductions: SceneThumbnailCache())
            empreinte = SceneThumbnailFingerprint(slide: s, bgImage: nil, loadedImages: ["m": photo],
                                                  size: tuile, scale: 2)
        }
        XCTAssertNil(store.cached(empreinte!),
                     "une adresse réutilisée par un bitmap neuf ne doit pas hériter de la vignette")
    }

    func test_store_estBorne() {
        let store = SceneThumbnailStore()
        XCTAssertGreaterThan(store.countLimit, 0)
        XCTAssertLessThanOrEqual(store.totalCostLimit, 8 * 1024 * 1024)
    }
}
