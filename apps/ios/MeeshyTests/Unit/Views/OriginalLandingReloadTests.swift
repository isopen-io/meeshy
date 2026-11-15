import XCTest
import SwiftUI
@testable import Meeshy

/// #11550 — chaque surface qui montre une photo et son bouton « télécharger »
/// (grille de bulle, rangée Focal, carrousel) recharge sa case quand
/// l'original arrive, sans attendre le plein écran ni un défilement.
@MainActor
final class OriginalLandingReloadTests: XCTestCase {
    private final class Recorder {
        var landedValues: [Bool] = []
    }

    private func host(_ view: some View) -> UIWindow {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 200, height: 200))
        window.rootViewController = UIHostingController(rootView: view)
        window.makeKeyAndVisible()
        return window
    }

    private func spin(until condition: () -> Bool, timeout: TimeInterval = 2) {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(), Date() < deadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.02))
        }
    }

    func test_finishedDownloadOfTheOriginal_handsTheContentALandedToken() {
        let fileUrl = "2025/10/x/landing-\(UUID().uuidString).jpg"
        let center = AttachmentDownloadCenter(haptics: { _ in })
        let recorder = Recorder()
        let window = host(OriginalLandingReload(fileUrl: fileUrl, center: center) { landed in
            let _ = recorder.landedValues.append(landed)
            Color.clear
        })
        defer { window.isHidden = true }
        spin(until: { !recorder.landedValues.isEmpty })
        RunLoop.main.run(until: Date().addingTimeInterval(0.1))

        let key = AttachmentDownloadCenter.key(for: fileUrl)
        center.publish(.progress(.init(downloadedBytes: 100, totalBytes: 100)), for: key)
        center.publish(.finished(totalBytes: 100), for: key)
        spin(until: { recorder.landedValues.last == true })

        XCTAssertEqual(recorder.landedValues.first, false)
        XCTAssertEqual(recorder.landedValues.last, true, "la case ne s'est pas rechargée : la photo resterait floue")
    }

    func test_failedDownload_keepsTheContentWaiting() {
        let fileUrl = "2025/10/x/landing-\(UUID().uuidString).jpg"
        let center = AttachmentDownloadCenter(haptics: { _ in })
        let recorder = Recorder()
        let window = host(OriginalLandingReload(fileUrl: fileUrl, center: center) { landed in
            let _ = recorder.landedValues.append(landed)
            Color.clear
        })
        defer { window.isHidden = true }
        spin(until: { !recorder.landedValues.isEmpty })
        RunLoop.main.run(until: Date().addingTimeInterval(0.1))

        center.publish(.failed, for: AttachmentDownloadCenter.key(for: fileUrl))
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))

        XCTAssertFalse(recorder.landedValues.contains(true))
    }
}
