import XCTest
import UIKit

/// Banc de CAPTURE (#8858) — l'instantané de carte que l'extension attache à
/// une position partagée. `xcrun simctl push` n'exécute pas la NSE : le rendu
/// se photographie donc ici, par le même code. Il demande des tuiles réseau,
/// d'où un banc inerte par défaut (`TEST_RUNNER_MEESHY_CAPTURE_DIR=…`) plutôt
/// qu'un témoin qui dépendrait du réseau de la CI.
final class NSELocationSnapshotCaptureTests: XCTestCase {

    func test_capture_pinnedMapSnapshot() async throws {
        guard let dir = ProcessInfo.processInfo.environment["MEESHY_CAPTURE_DIR"] else {
            throw XCTSkip("capture désactivée")
        }
        let rendered = await NSELocationSnapshot.render(latitude: 48.8584, longitude: 2.2945, timeout: 8)

        let url = try XCTUnwrap(rendered, "l'instantané doit rendre un PNG dans le délai")
        let image = try XCTUnwrap(UIImage(contentsOfFile: url.path))
        XCTAssertEqual(image.size.width * image.scale, NSELocationSnapshot.size.width * 2, accuracy: 1)
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let target = URL(fileURLWithPath: dir).appendingPathComponent("nse-carte-position.png")
        try? FileManager.default.removeItem(at: target)
        try FileManager.default.moveItem(at: url, to: target)
    }

    /// Un délai nul rend la main SANS image : la bannière part avec son texte.
    func test_zeroTimeout_completesSilentlyWithoutImage() async {
        let rendered = await NSELocationSnapshot.render(latitude: 48.8584, longitude: 2.2945, timeout: 0)

        XCTAssertNil(rendered)
    }
}
