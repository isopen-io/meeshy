import XCTest
@testable import MeeshySDK

final class VoiceProfileServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: VoiceProfileService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = VoiceProfileService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeConsentStatus(hasConsent: Bool = true) -> VoiceConsentStatus {
        let json: [String: Any] = [
            "hasConsent": hasConsent,
            "ageVerified": true,
            "voiceCloningEnabled": false
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(VoiceConsentStatus.self, from: data)
    }

    private func makeConsentResponse() -> VoiceConsentResponse {
        let json: [String: Any] = ["success": true]
        let data = try! JSONSerialization.data(withJSONObject: json)
        return try! JSONDecoder().decode(VoiceConsentResponse.self, from: data)
    }

    private func makeVoiceProfile() -> VoiceProfile {
        let json: [String: Any] = [
            "id": "vp-1",
            "userId": "user-1",
            "status": "ready",
            "sampleCount": 3,
            "totalDurationMs": 45000,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-02T00:00:00Z"
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(VoiceProfile.self, from: data)
    }

    private func makeVoiceSample(id: String = "vs-1") -> VoiceSample {
        let json: [String: Any] = [
            "id": id,
            "profileId": "vp-1",
            "durationMs": 15000,
            "status": "processed",
            "createdAt": "2026-01-01T00:00:00Z"
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(VoiceSample.self, from: data)
    }

    // MARK: - getConsentStatus

    func test_getConsentStatus_success_returnsStatus() async throws {
        let status = makeConsentStatus(hasConsent: true)
        let response = APIResponse<VoiceConsentStatus>(success: true, data: status, error: nil)
        mock.stub("/voice-profile/consent", result: response)

        let result = try await service.getConsentStatus()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice-profile/consent")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertTrue(result.hasConsent)
    }

    func test_getConsentStatus_networkError_throws() async {
        mock.errorToThrow = MeeshyError.network(.timeout)

        do {
            _ = try await service.getConsentStatus()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.timeout) = error { } else {
                XCTFail("Expected network timeout, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    // MARK: - grantConsent

    func test_grantConsent_success_callsPostEndpoint() async throws {
        let consentResponse = makeConsentResponse()
        let response = APIResponse<VoiceConsentResponse>(success: true, data: consentResponse, error: nil)
        mock.stub("/voice-profile/consent", result: response)

        let result = try await service.grantConsent(ageVerification: true, birthDate: "2000-01-01")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice-profile/consent")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertTrue(result.success)
    }

    // MARK: - revokeConsent

    func test_revokeConsent_success_callsPostEndpoint() async throws {
        let consentResponse = makeConsentResponse()
        let response = APIResponse<VoiceConsentResponse>(success: true, data: consentResponse, error: nil)
        mock.stub("/voice-profile/consent", result: response)

        try await service.revokeConsent()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice-profile/consent")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - getProfile

    func test_getProfile_success_returnsProfile() async throws {
        let profile = makeVoiceProfile()
        let response = APIResponse<VoiceProfile?>(success: true, data: profile, error: nil)
        mock.stub("/voice-profile", result: response)

        let result = try await service.getProfile()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice-profile")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.id, "vp-1")
        XCTAssertEqual(result?.status, .ready)
        XCTAssertTrue(result?.isReady == true)
    }

    func test_getProfile_noProfile_returnsNil() async throws {
        let response = APIResponse<VoiceProfile?>(success: true, data: nil, error: nil)
        mock.stub("/voice-profile", result: response)

        let result = try await service.getProfile()

        XCTAssertNil(result)
    }

    // MARK: - getSamples

    func test_getSamples_success_returnsSamples() async throws {
        let samples = [makeVoiceSample(id: "vs-1"), makeVoiceSample(id: "vs-2")]
        let response = APIResponse<[VoiceSample]>(success: true, data: samples, error: nil)
        mock.stub("/voice-profile/samples", result: response)

        let result = try await service.getSamples()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice-profile/samples")
        XCTAssertEqual(result.count, 2)
    }

    // MARK: - toggleVoiceCloning

    func test_toggleVoiceCloning_enabled_callsCorrectEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["enabled": true], error: nil)
        mock.stub("/voice-profile/toggle-cloning", result: response)

        try await service.toggleVoiceCloning(enabled: true)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice-profile/toggle-cloning")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - deleteProfile

    func test_deleteProfile_success_callsDeleteEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["deleted": true], error: nil)
        mock.stub("/voice-profile", result: response)

        try await service.deleteProfile()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice-profile")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    func test_deleteProfile_serverError_throws() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 500, message: "Internal error")

        do {
            try await service.deleteProfile()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 500)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    // MARK: - deleteSample

    func test_deleteSample_success_callsDeleteEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["deleted": true], error: nil)
        mock.stub("/voice-profile/samples/vs-123", result: response)

        try await service.deleteSample(sampleId: "vs-123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice-profile/samples/vs-123")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }
}
