import XCTest
import MeeshySDK
@testable import Meeshy

/// L'accord explicite de la chute détectée (#18748) : jamais coché par défaut, cocher ouvre le texte d'accord sans rien
/// enregistrer, « J'accepte » enregistre l'accord sur la version lue PUIS demande Santé, décocher retire l'accord et
/// coupe l'observateur ; un refus (mineur, réseau) se dit et rend l'état d'avant.
@MainActor
final class FallConsentSettingsViewModelTests: XCTestCase {

    private final class Observer {
        var enableCalls = 0
        var stopCalls = 0
        var grants = true
    }

    private func makeSUT() -> (FallConsentSettingsViewModel, MockFallDetectionService, Observer) {
        let service = MockFallDetectionService()
        let observer = Observer()
        let sut = FallConsentSettingsViewModel(
            service: service,
            enableObserver: {
                observer.enableCalls += 1
                return observer.grants
            },
            stopObserver: { observer.stopCalls += 1 }
        )
        return (sut, service, observer)
    }

    func test_load_isOffByDefault() async {
        let (sut, _, _) = makeSUT()
        await sut.load()
        XCTAssertFalse(sut.isConsented)
    }

    func test_switchingOn_opensTheConsentText_andSavesNothing() async {
        let (sut, service, observer) = makeSUT()
        await sut.load()
        await sut.toggle(true)
        XCTAssertTrue(sut.isConsentSheetPresented)
        XCTAssertTrue(service.updateConsentCalls.isEmpty)
        XCTAssertEqual(observer.enableCalls, 0)
    }

    func test_accept_savesTheReadVersion_thenAsksHealth() async {
        let (sut, service, observer) = makeSUT()
        await sut.load()
        await sut.toggle(true)
        await sut.accept()
        XCTAssertEqual(service.updateConsentCalls, [.consent(version: "2026-11-19")])
        XCTAssertTrue(sut.isConsented)
        XCTAssertEqual(observer.enableCalls, 1)
        XCTAssertFalse(sut.isConsentSheetPresented)
    }

    func test_accept_aMinorIsRefused_andHealthIsNeverAsked() async {
        let (sut, service, observer) = makeSUT()
        service.updateConsentResult = .minor
        await sut.load()
        await sut.accept()
        XCTAssertFalse(sut.isConsented)
        XCTAssertEqual(observer.enableCalls, 0)
        XCTAssertEqual(sut.notice, FallDetectionWording.consentMinor)
    }

    func test_accept_aRefusedHealthAuthorizationIsSaid() async {
        let (sut, _, observer) = makeSUT()
        observer.grants = false
        await sut.load()
        await sut.accept()
        XCTAssertEqual(sut.notice, FallDetectionWording.healthDenied)
    }

    func test_switchingOff_withdrawsTheConsent_andStopsTheObserver() async {
        let (sut, service, observer) = makeSUT()
        await sut.load()
        await sut.accept()
        await sut.toggle(false)
        XCTAssertEqual(service.updateConsentCalls.last, .withdraw)
        XCTAssertEqual(observer.stopCalls, 1)
        XCTAssertFalse(sut.isConsented)
    }

    func test_switchingOff_aFailureRestoresTheConsent_andSaysIt() async {
        let (sut, service, _) = makeSUT()
        await sut.load()
        await sut.accept()
        service.updateConsentResult = .failed
        await sut.toggle(false)
        XCTAssertTrue(sut.isConsented)
        XCTAssertEqual(sut.notice, FallDetectionWording.saveFailed)
    }
}
