import CoreGraphics
import CoreImage
import XCTest
@testable import Meeshy

/// LE COMPOSITEUR DU CADRE EN DIRECT (#9214) — les passages de repère entre la toile du peintre
/// (y vers le bas) et Core Image (y vers le haut), le budget par image, et la scène cuite : une
/// case par personne, une vidéo posée DANS sa case, le visage de repli quand la caméra est coupée.
final class CallLiveFrameCompositorTests: XCTestCase {
    private let texts = CallFrameTexts(groupName: nil, isGroup: false, date: "3 oct. 2026", accentHex: nil)
    private let people = [
        CallFramePerson(id: "me", name: "Awa", handle: "awa", isSelf: true),
        CallFramePerson(id: "you", name: "Karim", handle: "karim", isSelf: false),
    ]

    private func makeScene(size: CGSize = CGSize(width: 180, height: 320)) throws -> (sut: CallLiveFrameCompositor, scene: CallLiveFrameScene) {
        let design = try XCTUnwrap(CallLiveFrameRule.frames().first { $0.look.slot.tone == .color })
        let sut = CallLiveFrameCompositor()
        let inputs = CallLiveFrameLayerInputs(frameId: design.id, people: people, texts: texts, size: size)
        let scene = try XCTUnwrap(sut.paint(design: design, inputs: inputs))
        return (sut, scene)
    }

    private func pixel(_ image: CIImage, at point: CGPoint) -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: 4)
        CIContext(options: [.workingColorSpace: NSNull()]).render(
            image,
            toBitmap: &bytes,
            rowBytes: 4,
            bounds: CGRect(x: point.x, y: point.y, width: 1, height: 1),
            format: .RGBA8,
            colorSpace: nil
        )
        return bytes
    }

    // MARK: - Repères

    func test_flipped_topBandOfTheCanvas_isTheTopBandForCoreImage() {
        let rect = CallLiveFrameGeometry.flipped(CGRect(x: 10, y: 0, width: 50, height: 20), canvasHeight: 100)
        XCTAssertEqual(rect, CGRect(x: 10, y: 80, width: 50, height: 20))
    }

    func test_videoTransform_landscapeVideo_fillsThePhotoCentered() {
        let transform = CallLiveFrameGeometry.videoTransform(
            source: CGRect(x: 0, y: 0, width: 640, height: 480),
            photo: CGRect(x: 0, y: 0, width: 100, height: 200),
            degrees: 0,
            canvasHeight: 200
        )
        let drawn = CGRect(x: 0, y: 0, width: 640, height: 480).applying(transform)
        XCTAssertEqual(drawn.height, 200, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(drawn.width, 100)
        XCTAssertEqual(drawn.midX, 50, accuracy: 0.001)
        XCTAssertEqual(drawn.midY, 100, accuracy: 0.001)
    }

    func test_videoTransform_tiltedSlot_turnsAroundTheSlotCenter() {
        let photo = CGRect(x: 20, y: 40, width: 60, height: 60)
        let transform = CallLiveFrameGeometry.videoTransform(
            source: CGRect(x: 0, y: 0, width: 60, height: 60),
            photo: photo,
            degrees: 8,
            canvasHeight: 200
        )
        let center = CGPoint(x: 30, y: 30).applying(transform)
        XCTAssertEqual(center.x, 50, accuracy: 0.001)
        XCTAssertEqual(center.y, 200 - 70, accuracy: 0.001)
    }

    func test_videoTransform_emptySource_isIdentity() {
        XCTAssertEqual(CallLiveFrameGeometry.videoTransform(source: .zero, photo: CGRect(x: 0, y: 0, width: 10, height: 10), degrees: 0, canvasHeight: 10), .identity)
    }

    func test_fit_sceneIntoALargerDrawable_scalesWithoutDistortion() {
        let transform = CallLiveFrameGeometry.fit(scene: CGSize(width: 100, height: 200), into: CGSize(width: 300, height: 600))
        let drawn = CGRect(x: 0, y: 0, width: 100, height: 200).applying(transform)
        XCTAssertEqual(drawn, CGRect(x: 0, y: 0, width: 300, height: 600))
    }

    // MARK: - Budget

    func test_limitMs_lightOrUndeclared_isHalfAMillisecond() {
        XCTAssertEqual(CallLiveFrameBudget.limitMs(for: nil), 0.5)
        XCTAssertEqual(CallLiveFrameBudget.limitMs(for: .light), 0.5)
        XCTAssertEqual(CallLiveFrameBudget.limitMs(for: .rich), 2.5)
    }

    func test_percentile95_window_returnsTheHighRank() {
        let samples = (1...100).map(Double.init)
        XCTAssertEqual(CallLiveFrameBudget.percentile95(samples), 95)
        XCTAssertNil(CallLiveFrameBudget.percentile95([]))
        XCTAssertEqual(CallLiveFrameBudget.percentile95([0.3]), 0.3)
    }

    // MARK: - La scène cuite

    func test_paint_duo_bakesOneSlotPerPerson() throws {
        let (_, scene) = try makeScene()
        XCTAssertEqual(scene.slots.map(\.personId), ["me", "you"])
        XCTAssertEqual(scene.backdrop.extent.size, scene.size)
        XCTAssertEqual(scene.overlay.extent.size, scene.size)
    }

    func test_paint_emptySize_paintsNothing() throws {
        let design = try XCTUnwrap(CallLiveFrameRule.frames().first)
        let inputs = CallLiveFrameLayerInputs(frameId: design.id, people: people, texts: texts, size: .zero)
        XCTAssertNil(CallLiveFrameCompositor().paint(design: design, inputs: inputs))
    }

    func test_compose_withoutVideo_coversExactlyTheScene() throws {
        let (sut, scene) = try makeScene()
        XCTAssertEqual(sut.compose(scene, videos: [:]).extent, scene.extent)
    }

    func test_compose_video_landsInsideItsSlot() throws {
        let (sut, scene) = try makeScene()
        let slot = try XCTUnwrap(scene.slots.first)
        let video = CIImage(color: CIColor(red: 0, green: 1, blue: 0)).cropped(to: CGRect(x: 0, y: 0, width: 640, height: 480))
        let center = CGPoint(x: slot.photo.midX, y: scene.size.height - slot.photo.midY)

        let withVideo = pixel(sut.compose(scene, videos: [slot.personId: video]), at: center)
        let without = pixel(sut.compose(scene, videos: [:]), at: center)

        XCTAssertNotEqual(withVideo, without)
        XCTAssertGreaterThan(withVideo[1], withVideo[0])
    }
}
