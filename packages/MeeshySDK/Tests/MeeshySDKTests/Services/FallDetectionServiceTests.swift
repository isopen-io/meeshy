import XCTest
@testable import MeeshySDK

/// `FallDetectionService` (#18748) : un instant rapporté, les refus lus par leur statut, « Je vais bien », l'accord et
/// le réglage par personne.
final class FallDetectionServiceTests: XCTestCase {

    private func makeSUT() -> (service: FallDetectionService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (FallDetectionService(api: api), api)
    }

    private let instant = Date(timeIntervalSince1970: 1_800_000_000)

    func test_report_postsOneInstant_andReadsRecorded() async {
        let (service, api) = makeSUT()
        api.stubWire("/me/health/fall", json: #"{"success":true,"data":{"recorded":true}}"#)
        let outcome = await service.report(detectedAt: instant)
        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(api.lastRequest?.bodyJSON?.keys.sorted(), ["detectedAt"])
        XCTAssertEqual(outcome, .recorded)
    }

    func test_report_aDuplicateIsDeduplicated() async {
        let (service, api) = makeSUT()
        api.stubWire("/me/health/fall", json: #"{"success":true,"data":{"recorded":false}}"#)
        let outcome = await service.report(detectedAt: instant)
        XCTAssertEqual(outcome, .deduplicated)
    }

    func test_report_aRefusalWithoutConsentIsConsentRequired_aBadInstantIsRejected_andOfflineFails() async {
        let (forbidden, forbiddenAPI) = makeSUT()
        forbiddenAPI.stubError("/me/health/fall", error: MeeshyError.forbidden(reason: "Accord requis", body: nil))
        let consentOutcome = await forbidden.report(detectedAt: instant)
        XCTAssertEqual(consentOutcome, .consentRequired)

        let (old, oldAPI) = makeSUT()
        oldAPI.stubError("/me/health/fall", error: MeeshyError.server(statusCode: 400, message: "Chute trop ancienne"))
        let rejectedOutcome = await old.report(detectedAt: instant)
        XCTAssertEqual(rejectedOutcome, .rejected)

        let (offline, offlineAPI) = makeSUT()
        offlineAPI.stubError("/me/health/fall", error: URLError(.notConnectedToInternet))
        let failedOutcome = await offline.report(detectedAt: instant)
        XCTAssertEqual(failedOutcome, .failed)
    }

    func test_answerOk_readsCleared() async {
        let (service, api) = makeSUT()
        api.stubWire("/me/health/fall/ok", json: #"{"success":true,"data":{"cleared":true}}"#)
        let cleared = await service.answerOk()
        XCTAssertTrue(cleared)
        XCTAssertEqual(api.lastRequest?.method, "POST")
    }

    func test_updateConsent_savesOrReadsTheRefusal() async {
        let (service, api) = makeSUT()
        api.stubWire("/me/health/fall/settings", json: #"{"success":true,"data":{"consentedAt":"2026-11-19T10:00:00.000Z","consentVersion":"2026-11-19","currentVersion":"2026-11-19"}}"#)
        let saved = await service.updateConsent(.consent(version: "2026-11-19"))
        XCTAssertEqual(api.lastRequest?.method, "PUT")
        guard case .saved(let settings) = saved else { return XCTFail("attendu .saved") }
        XCTAssertTrue(settings.isConsented)

        let (minor, minorAPI) = makeSUT()
        minorAPI.stubError("/me/health/fall/settings", error: MeeshyError.forbidden(reason: "Accord réservé aux 15 ans et plus", body: nil))
        let minorOutcome = await minor.updateConsent(.consent(version: "2026-11-19"))
        XCTAssertEqual(minorOutcome, .minor)

        let (stale, staleAPI) = makeSUT()
        staleAPI.stubError("/me/health/fall/settings", error: MeeshyError.server(statusCode: 400, message: "Texte d’accord périmé"))
        let staleOutcome = await stale.updateConsent(.consent(version: "2026-01-01"))
        XCTAssertEqual(staleOutcome, .staleVersion)
    }

    func test_snapshotAndPersonSettings() async throws {
        let (service, api) = makeSUT()
        api.stubWire("/relations/falls", json: #"{"success":true,"data":{"items":[{"userId":"u1","detectedAt":"2026-11-19T16:42:00.000Z","expiresAt":"2026-11-19T22:42:00.000Z"}]}}"#)
        let items = try await service.snapshot()
        XCTAssertEqual(items.map(\.userId), ["u1"])

        api.stubWire("/relations/u1/fall/settings", json: #"{"success":true,"data":{"userId":"u1","shared":true}}"#)
        let read = try await service.personSettings(userId: "u1")
        XCTAssertTrue(read.isShared)
        _ = try await service.updatePersonSettings(userId: "u1", isShared: false)
        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(api.lastRequest?.bodyJSON?.keys.sorted(), ["shared"])
    }
}
