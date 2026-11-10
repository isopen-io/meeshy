import XCTest
@testable import MeeshySDK

/// La conformité de l'interopérabilité WhatsApp (#17120) : ce qui part sur le
/// fil — la version de l'information que ce client montre, jamais une date ;
/// le texte d'un signalement seulement s'il a été joint — et ce qu'un ancien
/// client fait d'une entrée inconnue de la liste (il l'ignore).
final class ExternalInteropServiceTests: XCTestCase {

    private static let repositoryRoot: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }()

    private func makeStatus(current: Bool, disclosures: [String] = ["phone-number", "encrypted-content"]) -> ExternalInteropConsentStatus {
        ExternalInteropConsentStatus(
            network: "whatsapp",
            noticeVersion: ExternalInteropNotice.version,
            disclosures: disclosures,
            retentionDays: 90,
            consent: current ? .init(grantedAt: "2026-11-10T09:00:00.000Z", noticeVersion: ExternalInteropNotice.version) : nil,
            current: current
        )
    }

    func test_consentStatus_readsWhatsAppConsent() async throws {
        let mock = MockAPIClient()
        mock.stub("/conversations/external/consent", result: APIResponse(success: true, data: makeStatus(current: false), error: nil))
        let service = ExternalInteropService(api: mock)

        let status = try await service.consentStatus()

        XCTAssertFalse(status.current)
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/external/consent")
        XCTAssertEqual(mock.lastRequest?.queryItems, [URLQueryItem(name: "network", value: "whatsapp")])
    }

    func test_recordConsent_sendsNoticeVersionAndNoDate() async throws {
        let mock = MockAPIClient()
        mock.stub("/conversations/external/consent", result: APIResponse(success: true, data: makeStatus(current: true), error: nil))
        let service = ExternalInteropService(api: mock)

        let status = try await service.recordConsent(granted: true)

        XCTAssertTrue(status.current)
        XCTAssertEqual(mock.lastRequest?.method, "PUT")
        let body = try XCTUnwrap(mock.lastRequest?.bodyJSON)
        XCTAssertEqual(body["network"] as? String, "whatsapp")
        XCTAssertEqual(body["noticeVersion"] as? String, ExternalInteropNotice.version)
        XCTAssertEqual(body["granted"] as? Bool, true)
        XCTAssertEqual(Set(body.keys), ["network", "noticeVersion", "granted"])
    }

    func test_reportExternalContent_withoutJoinedText_sendsNoText() async throws {
        let mock = MockAPIClient()
        let ack = ExternalReportAcknowledgement(reportId: "r-1", peerBlocked: true, orientation: "meta-reporting")
        mock.stub("/conversations/6730c0ffee0000000000abcd/external/report", result: APIResponse(success: true, data: ack, error: nil))
        let service = ExternalInteropService(api: mock)

        let result = try await service.reportExternalContent(conversationId: "6730c0ffee0000000000abcd", reportType: "spam", disclosedText: "   ", blockPeer: true)

        XCTAssertEqual(result, ack)
        let body = try XCTUnwrap(mock.lastRequest?.bodyJSON)
        XCTAssertEqual(Set(body.keys), ["reportType", "blockPeer"])
        XCTAssertEqual(body["blockPeer"] as? Bool, true)
    }

    func test_reportExternalContent_withJoinedText_sendsTrimmedText() async throws {
        let mock = MockAPIClient()
        let ack = ExternalReportAcknowledgement(reportId: "r-2", peerBlocked: false, orientation: "meta-reporting")
        mock.stub("/conversations/6730c0ffee0000000000abcd/external/report", result: APIResponse(success: true, data: ack, error: nil))
        let service = ExternalInteropService(api: mock)

        _ = try await service.reportExternalContent(conversationId: "6730c0ffee0000000000abcd", reportType: "harassment", disclosedText: "  texte fictif  ", blockPeer: false)

        let body = try XCTUnwrap(mock.lastRequest?.bodyJSON)
        XCTAssertEqual(body["disclosedText"] as? String, "texte fictif")
        XCTAssertEqual(body["blockPeer"] as? Bool, false)
    }

    func test_knownDisclosures_ignoresAnEntryThisClientDoesNotKnow() {
        let status = makeStatus(current: false, disclosures: ["phone-number", "future-entry", "delivery-metadata"])

        XCTAssertEqual(status.knownDisclosures, [.phoneNumber, .deliveryMetadata])
    }

    func test_noticeVersion_mirrorsTheSharedVersion() throws {
        let shared = try String(
            contentsOf: Self.repositoryRoot.appendingPathComponent("packages/shared/types/external-interop-compliance.ts"),
            encoding: .utf8
        )

        XCTAssertTrue(shared.contains("EXTERNAL_INTEROP_NOTICE_VERSION = '\(ExternalInteropNotice.version)'"))
        for disclosure in ExternalInteropDisclosure.allCases {
            XCTAssertTrue(shared.contains("'\(disclosure.rawValue)'"), disclosure.rawValue)
        }
    }
}
