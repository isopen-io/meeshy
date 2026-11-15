import XCTest

/// **Le déclencheur répond tout de suite** (#16482) — recette, hors de tout gate.
///
/// Au simulateur, sur la fausse caméra (`-MeeshyCaptureFixture
/// -MeeshyRetoucheRecette`), le toucher du déclencheur est filmé par
/// `simctl io recordVideo` pendant que ce test le joue : la vidéo montre le
/// flash du cadre et la contraction du bouton, et le test relève le délai
/// toucher → retouche ouverte.
///
/// ```
/// xcodebuild test -project apps/ios/Meeshy.xcodeproj -scheme MeeshyDeviceMetrics \
///   -destination "platform=iOS Simulator,id=<udid>" \
///   -only-testing:MeeshyUIDeviceTests/CaptureShutterFeedbackTests
/// ```
nonisolated final class CaptureShutterFeedbackTests: XCTestCase {

    func test_shutterTap_opensTheTakeInRetouche() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-MeeshyCaptureFixture", "-MeeshyRetoucheRecette",
                               "-AppleLanguages", "(fr)", "-AppleLocale", "fr_FR"]
        app.launch()
        let declencheur = app.buttons["Prendre une photo"].firstMatch
        XCTAssertTrue(declencheur.waitForExistence(timeout: 20), "le déclencheur est exposé à VoiceOver")
        Thread.sleep(forTimeInterval: 2)
        let touche = Date()
        declencheur.tap()
        XCTAssertTrue(app.buttons["Recadrer"].waitForExistence(timeout: 10), "la photo s'ouvre en retouche")
        let delai = Int(Date().timeIntervalSince(touche) * 1000)
        print("RECETTE shutter→retouche \(delai) ms")
        Thread.sleep(forTimeInterval: 1)
    }
}
