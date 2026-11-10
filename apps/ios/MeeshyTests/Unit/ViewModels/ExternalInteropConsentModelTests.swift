import XCTest
@testable import Meeshy
import MeeshySDK

/// #17118 × #17120 — l'information sur ce qui part chez Meta, montrée avant la
/// première conversation WhatsApp. Un consentement déjà donné sous la version
/// en vigueur ne redemande rien ; accepter l'enregistre ; chaque refus se dit.
@MainActor
final class ExternalInteropConsentModelTests: XCTestCase {

    private final class MockExternalInteropService: ExternalInteropServiceProviding, @unchecked Sendable {
        var statusResult: Result<ExternalInteropConsentStatus, Error> = .success(status(current: false))
        var recordResult: Result<ExternalInteropConsentStatus, Error> = .success(status(current: true))
        private(set) var recorded: [Bool] = []

        func consentStatus() async throws -> ExternalInteropConsentStatus { try statusResult.get() }

        func recordConsent(granted: Bool) async throws -> ExternalInteropConsentStatus {
            recorded.append(granted)
            return try recordResult.get()
        }

        func reportExternalContent(conversationId: String, reportType: String, disclosedText: String?, blockPeer: Bool) async throws -> ExternalReportAcknowledgement {
            throw URLError(.unsupportedURL)
        }
    }

    private static func status(current: Bool, retentionDays: Int = 45) -> ExternalInteropConsentStatus {
        let consent = current ? #"{"grantedAt":"2026-11-10T09:00:00.000Z","noticeVersion":"\#(ExternalInteropNotice.version)"}"# : "null"
        let json = """
        {"network":"whatsapp","noticeVersion":"\(ExternalInteropNotice.version)","disclosures":["phone-number","profile-name","public-keys","encrypted-content","delivery-metadata"],"retentionDays":\(retentionDays),"consent":\(consent),"current":\(current)}
        """
        // swiftlint:disable:next force_try
        return try! JSONDecoder().decode(ExternalInteropConsentStatus.self, from: Data(json.utf8))
    }

    private func makeSUT() -> (model: ExternalInteropConsentModel, service: MockExternalInteropService) {
        let service = MockExternalInteropService()
        return (ExternalInteropConsentModel(service: service), service)
    }

    func test_load_alreadyConsented_handsBackWithoutAsking() async {
        let (model, service) = makeSUT()
        service.statusResult = .success(Self.status(current: true))

        await model.load()

        XCTAssertTrue(model.consented)
        XCTAssertEqual(service.recorded, [])
    }

    func test_load_notConsented_saysTheServedRetention() async {
        let (model, _) = makeSUT()

        await model.load()

        XCTAssertFalse(model.consented)
        XCTAssertEqual(model.retentionDays, 45)
    }

    func test_load_unreachable_stillShowsTheListWithALimitedRetention() async {
        let (model, service) = makeSUT()
        service.statusResult = .failure(URLError(.notConnectedToInternet))

        await model.load()

        XCTAssertFalse(model.consented)
        XCTAssertNil(model.retentionDays)
        XCTAssertEqual(model.disclosures, ExternalInteropDisclosure.allCases)
    }

    func test_accept_recordsTheConsentAndHandsBack() async {
        let (model, service) = makeSUT()

        await model.accept()

        XCTAssertEqual(service.recorded, [true])
        XCTAssertTrue(model.consented)
        XCTAssertNil(model.answer)
    }

    func test_accept_outdatedNotice_saysSoAndDoesNotHandBack() async {
        let (model, service) = makeSUT()
        service.recordResult = .failure(MeeshyError.server(statusCode: 409, message: "outdated"))

        await model.accept()

        XCTAssertFalse(model.consented)
        XCTAssertEqual(model.answer, .outdated)
        XCTAssertNotNil(ExternalInteropConsentCopy.answer(.outdated))
    }

    func test_everyAnswer_isSaidInWords() {
        for answer in ExternalInteropConsentAnswer.allCases {
            XCTAssertFalse(ExternalInteropConsentCopy.answer(answer).isEmpty, "réponse muette : \(answer)")
        }
        for disclosure in ExternalInteropDisclosure.allCases {
            XCTAssertFalse(ExternalInteropConsentCopy.disclosure(disclosure).isEmpty, "élément muet : \(disclosure)")
        }
    }
}
