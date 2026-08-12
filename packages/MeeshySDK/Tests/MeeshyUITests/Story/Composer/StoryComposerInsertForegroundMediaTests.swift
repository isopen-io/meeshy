import XCTest
import MeeshySDK
@testable import MeeshyUI

/// S5 — l'insertion d'un média en premier plan devient une opération du
/// ViewModel, testable, et donc UNIQUE.
///
/// Elle vivait enfermée dans deux blocs `await MainActor.run { … }` de la View
/// (`StoryComposerView+Media.swift`), ce qui obligeait tout nouveau chemin
/// d'entrée (caméra, pellicule) à en écrire un JUMEAU. Chaque test ci-dessous
/// épingle un des cinq points fragiles documentés du chemin historique :
/// bump de `loadedImagesVersion` (sans lui : canvas noir, bug 2026-07-20),
/// `mediaURL` (sans elle : le CALayer n'a pas de source), `aspectRatio` (sans
/// lui : rendu carré 540×540), nettoyage des entrées provisoires quand l'id
/// généré diffère, et `autoExtendDuration` pour la vidéo.
@MainActor
final class StoryComposerInsertForegroundMediaTests: XCTestCase {

    private func makeImage(width: CGFloat = 200, height: CGFloat = 100) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height))
        return renderer.image { ctx in
            UIColor.systemPink.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    private func makeSUT() -> StoryComposerViewModel {
        StoryComposerViewModel()
    }

    // MARK: - Image

    func test_insertForegroundImage_posesAMediaObjectOnTheTargetSlide() {
        let sut = makeSUT()
        let slideId = sut.currentSlide.id

        let object = sut.insertForegroundImage(
            makeImage(), fileURL: nil, intoSlideId: slideId, objectId: "obj-1")

        XCTAssertNotNil(object)
        XCTAssertEqual(sut.slides.first?.effects.mediaObjects?.count, 1)
    }

    func test_insertForegroundImage_registersTheBitmapUnderTheObjectIdAndBumpsTheVersion() {
        let sut = makeSUT()
        let before = sut.loadedImagesVersion

        let object = sut.insertForegroundImage(
            makeImage(), fileURL: nil, intoSlideId: sut.currentSlide.id, objectId: "obj-2")

        let id = try? XCTUnwrap(object?.id)
        XCTAssertNotNil(sut.loadedImages[id ?? ""])
        XCTAssertGreaterThan(
            sut.loadedImagesVersion, before,
            "Sans bump, le lecteur de cache du canvas reste périmé et le bitmap frais n'est jamais stampé (canvas noir)."
        )
    }

    func test_insertForegroundImage_writesTheMediaURLAndTheNativeAspectRatio() throws {
        let sut = makeSUT()
        let fileURL = URL(fileURLWithPath: "/tmp/obj-3.jpg")

        let object = try XCTUnwrap(sut.insertForegroundImage(
            makeImage(width: 200, height: 100),
            fileURL: fileURL,
            intoSlideId: sut.currentSlide.id,
            objectId: "obj-3"))

        let stored = try XCTUnwrap(
            sut.slides.first?.effects.mediaObjects?.first { $0.id == object.id })
        XCTAssertEqual(stored.mediaURL, fileURL.absoluteString)
        XCTAssertEqual(try XCTUnwrap(stored.aspectRatio), 2.0, accuracy: 0.001)
    }

    func test_insertForegroundImage_onASlideAtTheMediaCap_returnsNil() {
        let sut = makeSUT()
        let slideId = sut.currentSlide.id
        for index in 0..<10 {
            _ = sut.insertForegroundImage(
                makeImage(), fileURL: nil, intoSlideId: slideId, objectId: "cap-\(index)")
        }

        XCTAssertNil(
            sut.insertForegroundImage(
                makeImage(), fileURL: nil, intoSlideId: slideId, objectId: "overflow"),
            "Le plafond `canAddMedia` reste la seule autorité — l'insertion ne le contourne pas."
        )
    }

    // MARK: - Vidéo

    func test_insertForegroundVideo_setsURLThumbnailDurationAndExtendsTheSlide() throws {
        let sut = makeSUT()
        let url = URL(fileURLWithPath: "/tmp/obj-4.mp4")

        let object = try XCTUnwrap(sut.insertForegroundVideo(
            url: url,
            thumbnail: makeImage(),
            aspectRatio: 1.777,
            duration: 9,
            intoSlideId: sut.currentSlide.id,
            objectId: "obj-4"))

        XCTAssertEqual(sut.loadedVideoURLs[object.id], url)
        XCTAssertNotNil(sut.loadedImages[object.id])
        let stored = try XCTUnwrap(
            sut.slides.first?.effects.mediaObjects?.first { $0.id == object.id })
        XCTAssertEqual(stored.mediaURL, url.absoluteString)
        XCTAssertEqual(try XCTUnwrap(stored.aspectRatio), 1.777, accuracy: 0.001)
        XCTAssertEqual(try XCTUnwrap(stored.duration), 9, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(
            try XCTUnwrap(sut.slides.first?.duration), 9,
            "La slide s'étend à la durée native, sinon la vidéo disparaît avant sa fin."
        )
    }

    func test_insertForegroundVideo_atTheMediaCap_returnsNilAndLeavesNoProvisionalEntry() {
        let sut = makeSUT()
        let slideId = sut.currentSlide.id
        for index in 0..<10 {
            _ = sut.insertForegroundImage(
                makeImage(), fileURL: nil, intoSlideId: slideId, objectId: "cap-\(index)")
        }

        let refused = sut.insertForegroundVideo(
            url: URL(fileURLWithPath: "/tmp/refused.mp4"),
            thumbnail: makeImage(),
            aspectRatio: 1,
            duration: 3,
            intoSlideId: slideId,
            objectId: "refused")

        XCTAssertNil(refused)
        XCTAssertNil(
            sut.loadedVideoURLs["refused"],
            "Un refus ne doit laisser AUCUNE entrée provisoire derrière lui."
        )
        XCTAssertNil(sut.loadedImages["refused"])
    }
}
