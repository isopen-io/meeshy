import XCTest
@testable import Meeshy

/// **Après la prise, la même interface retouche** (#9352, spec § 3.3).
@MainActor
final class ComposerCapturePhaseTests: XCTestCase {

    func test_isEditing_onlyInTheEditingPhase() {
        XCTAssertFalse(ComposerCapturePhase.capturing.isEditing)
        XCTAssertTrue(ComposerCapturePhase.editing(.photo).isEditing)
    }

    func test_stillSource_servesTheSameImage_andDrawsOnce() {
        let source = ComposerStillSource(Self.photo(width: 300, height: 400))
        XCTAssertEqual(source.latestImage()?.extent, CGRect(x: 0, y: 0, width: 300, height: 400))
        let dessin = expectation(description: "une image, une fois")
        source.setFrameHandler({ _ in dessin.fulfill() }, for: ObjectIdentifier(self))
        wait(for: [dessin], timeout: 1)
    }

    func test_beginEditingPhoto_freezesThePhoto_andTheTableSwitchesToEditing() {
        let session = ComposerCaptureSession(stage: .armed)
        session.beginEditing(photo: UIImage(cgImage: Self.photo(width: 300, height: 400)))
        XCTAssertEqual(session.phase, .editing(.photo))
        XCTAssertNotNil(session.editPhoto)
        XCTAssertEqual(session.framing, .identity)
        XCTAssertTrue(session.gestureContext(allowsPhoto: true, allowsVideo: true).editing)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .scene, gesture: .doubleTap,
                                                     context: session.gestureContext), .none,
                       "en édition, l'objectif est au repos : un double toucher ne photographie plus")
    }

    func test_beginEditingPhoto_foldsTheStrip() {
        let session = ComposerCaptureSession(stage: .armed)
        session.openFamily = .filters
        session.beginEditing(photo: UIImage(cgImage: Self.photo(width: 30, height: 40)))
        XCTAssertNil(session.openFamily, "la retouche s'ouvre bande repliée")
    }

    func test_reframe_followsTheFinger_withinTheSource() {
        let session = ComposerCaptureSession(stage: .armed)
        session.beginEditing(photo: UIImage(cgImage: Self.photo(width: 300, height: 400)))
        session.reframe(from: .identity, translation: CGSize(width: 40, height: 0), viewSize: CGSize(width: 200, height: 355))
        XCTAssertLessThan(session.framing.center.x, 0.5, "le média suit le doigt vers la droite")
        session.rezoom(from: session.framing, scale: 2)
        XCTAssertEqual(session.framing.scale, 2, accuracy: 0.001)
    }

    func test_reframe_whileCapturing_leavesTheFramingUntouched() {
        let session = ComposerCaptureSession(stage: .armed)
        session.reframe(from: .identity, translation: CGSize(width: 40, height: 0), viewSize: CGSize(width: 200, height: 355))
        session.rezoom(from: .identity, scale: 2)
        XCTAssertEqual(session.framing, .identity, "sans source éditée, rien ne se cadre")
    }

    func test_beginEditingPhoto_keepsTheTakeBytes_forTheirMetadata() {
        let session = ComposerCaptureSession(stage: .armed)
        let octets = Data([0xFF, 0xD8, 0xFF])
        session.beginEditing(photo: UIImage(cgImage: Self.photo(width: 30, height: 40)), data: octets)
        XCTAssertEqual(session.editPhotoData, octets)
        session.cancelEditing()
        XCTAssertNil(session.editPhotoData)
    }

    func test_framingAspect_followsTheFrameSlot_evenBeforeThePreviewCookedIt() {
        let session = ComposerCaptureSession(stage: .armed, scenes: ComposerLookSceneCache(countLimit: 1))
        XCTAssertEqual(session.framingAspect, 9.0 / 16.0, accuracy: 0.001, "sans cadre : le canevas 9:16")
        session.look = ComposerPhotoLook(frame: .montage(.classic(.polaroid)))
        XCTAssertGreaterThan(abs(session.framingAspect - 9.0 / 16.0), 0.01,
                             "la case d'un polaroïd n'est pas 9:16 : un cache froid ne doit pas fausser le cadrage")
    }

    func test_cancelEditing_returnsToCapture() {
        let session = ComposerCaptureSession(stage: .armed)
        session.beginEditing(photo: UIImage(cgImage: Self.photo(width: 30, height: 40)))
        session.reframe(from: .identity, translation: CGSize(width: 4, height: 0), viewSize: CGSize(width: 20, height: 35))
        session.cancelEditing()
        XCTAssertEqual(session.phase, .capturing)
        XCTAssertNil(session.editPhoto)
        XCTAssertNil(session.editSource)
        XCTAssertEqual(session.framing, .identity, "la prise suivante repart d'un cadrage neutre")
        XCTAssertFalse(session.gestureContext.editing)
    }

    func test_disarm_leavesEditing() {
        let session = ComposerCaptureSession(stage: .armed)
        session.beginEditing(photo: UIImage(cgImage: Self.photo(width: 30, height: 40)), data: Data([0xFF]))
        session.disarm()
        XCTAssertEqual(session.phase, .capturing)
        XCTAssertNil(session.editPhoto)
        XCTAssertNil(session.editPhotoData)
        XCTAssertNil(session.editSource)
    }

    static func photo(width: Int, height: Int) -> CGImage {
        let contexte = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(red: 0.3, green: 0.5, blue: 0.7, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return contexte.makeImage()!
    }
}
