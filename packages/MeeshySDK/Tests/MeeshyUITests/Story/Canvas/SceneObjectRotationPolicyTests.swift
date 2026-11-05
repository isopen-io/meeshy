import XCTest
@testable import MeeshyUI

/// **La puce sonore tourne comme tout objet de la scène** (#16294) : une seule
/// loi de rotation pour le canvas et la puce posée par-dessus.
final class SceneObjectRotationPolicyTests: XCTestCase {

    func test_settled_unDemiTourDeDoigts_tourneDUnQuart() {
        XCTAssertEqual(SceneObjectRotationPolicy.settled(base: 0, gestureRadians: .pi), 90, accuracy: 1e-9)
    }

    func test_settled_partDeLaRotationPosee() {
        XCTAssertEqual(SceneObjectRotationPolicy.settled(base: 30, gestureRadians: -.pi / 2), -15, accuracy: 1e-9)
    }

    func test_settled_gesteNonFini_laisseLObjetEnPlace() {
        XCTAssertEqual(SceneObjectRotationPolicy.settled(base: 12, gestureRadians: .nan), 12)
        XCTAssertEqual(SceneObjectRotationPolicy.settled(base: 12, gestureRadians: .infinity), 12)
    }

    func test_leCanvasEtLaPuce_passentParLaMemeLoi() throws {
        let canvas = try source("Canvas/StoryCanvasUIView+Gestures.swift")
        let puce = try source("Controls/AudioForegroundChip.swift")
        XCTAssertTrue(canvas.contains("SceneObjectRotationPolicy.settled("))
        XCTAssertTrue(puce.contains("SceneObjectRotationPolicy.settled("))
        XCTAssertTrue(puce.contains(".simultaneously(with: rotationGesture)"),
                      "la rotation se joint au déplacement et au pincement")
    }

    func test_laPuce_annonceSonNomEtSaDuree() throws {
        let puce = try source("Controls/AudioForegroundChip.swift")
        XCTAssertTrue(puce.contains("\"story.audio.chip.a11y.duration\""))
        XCTAssertFalse(puce.contains("\"Audio foreground\""))
    }

    private func source(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/\(relative)")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
