import XCTest
@testable import MeeshySDK

/// Tests du réalignement `VoiceProfileService` ↔ API gateway réelle
/// (`services/gateway/src/routes/voice-profile.ts`) : profil unique
/// (`/register` + `PUT /:profileId`), lecture `VoiceProfileDetails` mappée vers
/// le domaine, pas de collection d'échantillons ni de route toggle-cloning.
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

    private func decode<T: Decodable>(_ json: [String: Any]) -> T {
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(T.self, from: data)
    }

    private func makeConsentStatus(hasConsent: Bool = true) -> VoiceConsentStatus {
        var json: [String: Any] = [
            "voiceCloningEnabledAt": NSNull(),
            "ageVerificationConsentAt": "2026-01-01T00:00:00Z"
        ]
        json["voiceRecordingConsentAt"] = hasConsent ? "2026-01-01T00:00:00Z" : NSNull()
        return decode(json)
    }

    private func makeConsentResponse() -> VoiceConsentResponse {
        decode(["voiceRecordingConsentAt": "2026-01-01T00:00:00Z"])
    }

    /// Forme wire `VoiceProfileDetails` du gateway (noms `qualityScore`,
    /// `audioCount`, `audioDurationMs`, `exists`…).
    private func makeProfileDetails(exists: Bool = true, needsCalibration: Bool = false) -> VoiceProfileDetails {
        decode([
            "profileId": exists ? "vp-1" : NSNull(),
            "userId": "user-1",
            "exists": exists,
            "qualityScore": 85,
            "audioDurationMs": 45000,
            "audioCount": 3,
            "version": 1,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-02T00:00:00Z",
            "needsCalibration": needsCalibration
        ])
    }

    private func makeRegisterResponse() -> VoiceProfileRegisterResponse {
        decode([
            "profileId": "vp-1",
            "qualityScore": 85,
            "audioDurationMs": 15000,
            "needsCalibration": false
        ])
    }

    // MARK: - getConsentStatus

    func test_getConsentStatus_success_returnsStatus() async throws {
        let response = APIResponse<VoiceConsentStatus>(success: true, data: makeConsentStatus(hasConsent: true), error: nil)
        mock.stub("/voice/profile/consent", result: response)

        let result = try await service.getConsentStatus()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice/profile/consent")
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

    // MARK: - grantConsent / revokeConsent

    func test_grantConsent_success_callsPostConsent() async throws {
        let response = APIResponse<VoiceConsentResponse>(success: true, data: makeConsentResponse(), error: nil)
        mock.stub("/voice/profile/consent", result: response)

        let result = try await service.grantConsent(voiceCloningConsent: true, birthDate: "2000-01-01")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice/profile/consent")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["voiceRecordingConsent"] as? Bool, true)
        XCTAssertNotNil(result.consentedAt)
    }

    func test_revokeConsent_success_callsPostConsent() async throws {
        let response = APIResponse<VoiceConsentResponse>(success: true, data: makeConsentResponse(), error: nil)
        mock.stub("/voice/profile/consent", result: response)

        try await service.revokeConsent()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice/profile/consent")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["voiceRecordingConsent"] as? Bool, false)
    }

    // MARK: - getProfile (mappe VoiceProfileDetails → VoiceProfile)

    func test_getProfile_exists_mapsGatewayFieldsToDomain() async throws {
        let response = APIResponse<VoiceProfileDetails>(success: true, data: makeProfileDetails(exists: true), error: nil)
        mock.stub("/voice/profile", result: response)

        let result = try await service.getProfile()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice/profile")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result?.id, "vp-1")
        XCTAssertEqual(result?.status, .ready)
        XCTAssertEqual(result?.sampleCount, 3)          // ← audioCount
        XCTAssertEqual(result?.totalDurationMs, 45000)  // ← audioDurationMs
        XCTAssertEqual(result?.quality ?? 0, 0.85, accuracy: 0.001) // qualityScore/100
        XCTAssertTrue(result?.isReady == true)
    }

    func test_getProfile_notExists_returnsNil() async throws {
        let response = APIResponse<VoiceProfileDetails>(success: true, data: makeProfileDetails(exists: false), error: nil)
        mock.stub("/voice/profile", result: response)

        let result = try await service.getProfile()

        XCTAssertNil(result)
    }

    func test_getProfile_needsCalibration_statusExpired() async throws {
        let response = APIResponse<VoiceProfileDetails>(success: true, data: makeProfileDetails(exists: true, needsCalibration: true), error: nil)
        mock.stub("/voice/profile", result: response)

        let result = try await service.getProfile()

        XCTAssertEqual(result?.status, .expired)
    }

    // MARK: - getSamples (aucune route gateway → vide, sans requête)

    func test_getSamples_returnsEmptyWithoutRequest() async throws {
        let result = try await service.getSamples()

        XCTAssertTrue(result.isEmpty)
        XCTAssertEqual(mock.requestCount, 0)
    }

    // MARK: - uploadSample (register si pas de profil, PUT sinon)

    func test_uploadSample_noProfile_createsViaRegister() async throws {
        mock.stub("/voice/profile", result: APIResponse<VoiceProfileDetails>(success: true, data: makeProfileDetails(exists: false), error: nil))
        mock.stub("/voice/profile/register", result: APIResponse<VoiceProfileRegisterResponse>(success: true, data: makeRegisterResponse(), error: nil))

        let result = try await service.uploadSample(audioData: Data(repeating: 0, count: 16000), durationMs: 10000)

        XCTAssertEqual(result.profileId, "vp-1")
        XCTAssertEqual(result.sampleCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice/profile/register")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func test_uploadSample_existingProfile_calibratesViaPut() async throws {
        mock.stub("/voice/profile", result: APIResponse<VoiceProfileDetails>(success: true, data: makeProfileDetails(exists: true), error: nil))
        mock.stub("/voice/profile/vp-1", result: APIResponse<VoiceProfileRegisterResponse>(success: true, data: makeRegisterResponse(), error: nil))

        let result = try await service.uploadSample(audioData: Data(repeating: 0, count: 16000), durationMs: 10000)

        XCTAssertEqual(result.profileId, "vp-1")
        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice/profile/vp-1")
        XCTAssertEqual(mock.lastRequest?.method, "PUT")
    }

    // MARK: - toggleVoiceCloning (piloté par le consentement)

    func test_toggleVoiceCloning_enabled_postsConsentWithFlag() async throws {
        mock.stub("/voice/profile/consent", result: APIResponse<VoiceConsentResponse>(success: true, data: makeConsentResponse(), error: nil))

        try await service.toggleVoiceCloning(enabled: true)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice/profile/consent")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["voiceCloningConsent"] as? Bool, true)
    }

    func test_toggleVoiceCloning_disabled_sendsExplicitFalse() async throws {
        mock.stub("/voice/profile/consent", result: APIResponse<VoiceConsentResponse>(success: true, data: makeConsentResponse(), error: nil))

        try await service.toggleVoiceCloning(enabled: false)

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["voiceCloningConsent"] as? Bool, false)
    }

    // MARK: - deleteProfile

    func test_deleteProfile_success_callsDeleteEndpoint() async throws {
        mock.stub("/voice/profile", result: APIResponse<[String: Bool]>(success: true, data: ["deleted": true], error: nil))

        try await service.deleteProfile()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/voice/profile")
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

    // MARK: - deleteSample (aucune route gateway → no-op)

    func test_deleteSample_isNoOpWithoutRequest() async throws {
        try await service.deleteSample(sampleId: "vs-123")

        XCTAssertEqual(mock.requestCount, 0)
    }
}
