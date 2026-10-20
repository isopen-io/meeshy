import XCTest

/// **« Abandonner la photo ? » abandonne la photo** (#10930, recette iPhone du
/// 2026-10-20 : l'alerte se fermait, la photo restait en retouche et les outils
/// se cachaient — le toucher passait à la prise).
///
/// Au simulateur, sur la fausse caméra : `-MeeshyCaptureFixture
/// -MeeshyRetoucheRecette` ouvre le viseur plein écran sans compte. Hors de tout
/// gate (cible `MeeshyUIDeviceTests`, scheme `MeeshyDeviceMetrics`) :
///
/// ```
/// xcodebuild test -project apps/ios/Meeshy.xcodeproj -scheme MeeshyDeviceMetrics \
///   -destination "platform=iOS Simulator,id=<udid>" \
///   -only-testing:MeeshyUIDeviceTests/CaptureDiscardAlertTests
/// ```
nonisolated final class CaptureDiscardAlertTests: XCTestCase {

    private func launchedInRetouche() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-MeeshyCaptureFixture", "-MeeshyRetoucheRecette",
                               "-AppleLanguages", "(fr)", "-AppleLocale", "fr_FR"]
        app.launch()
        let photo = app.buttons["Prendre une photo"].firstMatch
        if photo.waitForExistence(timeout: 20) {
            photo.tap()
        } else {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)).doubleTap()
        }
        let ouverte = app.buttons["Recadrer"].waitForExistence(timeout: 20)
        XCTAssertTrue(ouverte, "la photo s'ouvre en retouche : \(app.debugDescription)")
        return app
    }

    private func askToDiscard(_ app: XCUIApplication) -> XCUIElement {
        app.buttons["Annuler"].firstMatch.tap()
        let alerte = app.alerts.firstMatch
        XCTAssertTrue(alerte.waitForExistence(timeout: 5), "l'alerte « Abandonner la photo ? » paraît")
        return alerte
    }

    /// La visée revenue : ni « Terminé » ni outil de retouche. Des outils
    /// seulement CACHÉS (le défaut de l'iPhone) laisseraient « Terminé ».
    private func assertBackToTheViewfinder(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let parti = NSPredicate(format: "exists == false")
        let attentes = [app.buttons["Terminé"], app.buttons["Recadrer"]]
            .map { XCTNSPredicateExpectation(predicate: parti, object: $0) }
        XCTAssertEqual(XCTWaiter.wait(for: attentes, timeout: 5), .completed,
                       "« Abandonner » ramène la visée : \(app.debugDescription)", file: file, line: line)
    }

    func test_discardButton_byElement_returnsToTheViewfinder() {
        let app = launchedInRetouche()
        let alerte = askToDiscard(app)
        alerte.buttons["Abandonner"].tap()
        assertBackToTheViewfinder(app)
    }

    func test_discardButton_byCoordinates_returnsToTheViewfinder() {
        let app = launchedInRetouche()
        let alerte = askToDiscard(app)
        let bouton = alerte.buttons["Abandonner"]
        XCTAssertTrue(bouton.waitForExistence(timeout: 3))
        let cadre = bouton.frame
        app.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: cadre.midX, dy: cadre.midY)).tap()
        assertBackToTheViewfinder(app)
    }
}
