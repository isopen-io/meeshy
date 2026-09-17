import XCTest
@testable import MeeshySDK

/// #6624 — le consentement vocal passe par `PUT /me/consents/{purpose}`, la
/// seule adresse que la passerelle horodate elle-même.
final class ConsentServiceTests: XCTestCase {

    private func makeSUT() -> (service: ConsentService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (ConsentService(api: api), api)
    }

    private func grantedEntry(_ purpose: ConsentPurpose) -> ConsentEntry {
        ConsentEntry(
            purpose: purpose.rawValue, granted: true,
            grantedAt: "2026-09-15T10:00:00.000Z", policyVersion: ConsentPolicy.defaultVersion
        )
    }

    func test_setConsent_putsToThePurposeAddress() async throws {
        let (service, api) = makeSUT()
        api.stub("/me/consents/voice-cloning", result: APIResponse(success: true, data: grantedEntry(.voiceCloning), error: nil))

        _ = try await service.setConsent(.voiceCloning, granted: true)

        XCTAssertEqual(api.lastRequest?.method, "PUT")
        XCTAssertEqual(api.lastRequest?.endpoint, "/me/consents/voice-cloning")
    }

    func test_setConsent_bodyCarriesOnlyGrantedAndPolicyVersion_neverADate() async throws {
        let (service, api) = makeSUT()
        api.stub("/me/consents/voice-cloning", result: APIResponse(success: true, data: grantedEntry(.voiceCloning), error: nil))

        _ = try await service.setConsent(.voiceCloning, granted: true)

        let body = try XCTUnwrap(api.lastRequest?.bodyJSON)
        XCTAssertEqual(body.keys.sorted(), ["granted", "policyVersion"])
        XCTAssertEqual(body["granted"] as? Bool, true)
        XCTAssertEqual(body["policyVersion"] as? String, ConsentPolicy.defaultVersion)
    }

    func test_setConsent_returnsTheServerStampedEntry() async throws {
        let (service, api) = makeSUT()
        api.stub("/me/consents/voice-cloning", result: APIResponse(success: true, data: grantedEntry(.voiceCloning), error: nil))

        let entry = try await service.setConsent(.voiceCloning, granted: true)

        XCTAssertEqual(entry.consentPurpose, .voiceCloning)
        XCTAssertEqual(entry.grantedAt, "2026-09-15T10:00:00.000Z")
    }

    func test_setConsent_whenGatewayFails_propagatesTheError() async {
        let (service, api) = makeSUT()
        api.errorToThrow = MeeshyError.server(statusCode: 409, message: "CONSENT_POLICY_VERSION_MISMATCH")

        do {
            _ = try await service.setConsent(.voiceCloning, granted: true)
            XCTFail("un octroi refusé ne doit jamais passer pour enregistré")
        } catch {
            XCTAssertEqual(api.requestCount, 1)
        }
    }

    func test_consentsSnapshot_decodesTheGatewayShape_andKeepsUnknownPurposesDecodable() throws {
        let served = Data("""
        {"success":true,"data":{"consents":[
          {"purpose":"data-processing","granted":true,"grantedAt":"2026-09-15T10:00:00.000Z","policyVersion":"2026-08-30","source":"server"},
          {"purpose":"voice-cloning","granted":false,"revokedAt":null,"policyVersion":"2026-08-30","source":"server"},
          {"purpose":"a-future-purpose","granted":true,"grantedAt":"2026-09-15T10:00:00.000Z","policyVersion":"2026-08-30","source":"server"}
        ],"derived":{"canTranscribeAudio":false}}}
        """.utf8)

        let response = try JSONDecoder().decode(APIResponse<ConsentsSnapshot>.self, from: served)

        XCTAssertEqual(response.data.consents.map(\.consentPurpose), [.dataProcessing, .voiceCloning, nil])
        XCTAssertEqual(response.data.consents.map(\.granted), [true, false, true])
    }
}
