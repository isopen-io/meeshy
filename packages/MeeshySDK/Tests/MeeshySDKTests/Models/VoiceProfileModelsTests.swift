import XCTest
@testable import MeeshySDK

final class VoiceProfileModelsTests: XCTestCase {

    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: dateString) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: dateString) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateString)")
        }
        return decoder
    }

    // MARK: - VoiceProfileStatus

    func test_voiceProfileStatus_allCases() {
        let cases = VoiceProfileStatus.allCases
        XCTAssertEqual(cases.count, 5)
        XCTAssertTrue(cases.contains(.pending))
        XCTAssertTrue(cases.contains(.processing))
        XCTAssertTrue(cases.contains(.ready))
        XCTAssertTrue(cases.contains(.failed))
        XCTAssertTrue(cases.contains(.expired))
    }

    func test_voiceProfileStatus_rawValues() {
        XCTAssertEqual(VoiceProfileStatus.pending.rawValue, "pending")
        XCTAssertEqual(VoiceProfileStatus.processing.rawValue, "processing")
        XCTAssertEqual(VoiceProfileStatus.ready.rawValue, "ready")
        XCTAssertEqual(VoiceProfileStatus.failed.rawValue, "failed")
        XCTAssertEqual(VoiceProfileStatus.expired.rawValue, "expired")
    }

    func test_voiceProfileStatus_decodesFromJSON() throws {
        let json = "\"ready\"".data(using: .utf8)!
        let status = try JSONDecoder().decode(VoiceProfileStatus.self, from: json)
        XCTAssertEqual(status, .ready)
    }

    // MARK: - VoiceProfile

    func test_voiceProfile_decodesFullPayload() throws {
        let json = """
        {
            "id": "vp1",
            "userId": "user1",
            "status": "ready",
            "sampleCount": 5,
            "totalDurationMs": 45000,
            "quality": 0.87,
            "createdAt": "2026-03-01T10:00:00.000Z",
            "updatedAt": "2026-03-15T14:30:00.000Z",
            "lastUsedAt": "2026-04-01T09:00:00.000Z"
        }
        """.data(using: .utf8)!

        let profile = try makeDecoder().decode(VoiceProfile.self, from: json)
        XCTAssertEqual(profile.id, "vp1")
        XCTAssertEqual(profile.userId, "user1")
        XCTAssertEqual(profile.status, .ready)
        XCTAssertTrue(profile.isReady)
        XCTAssertEqual(profile.sampleCount, 5)
        XCTAssertEqual(profile.totalDurationMs, 45000)
        XCTAssertEqual(profile.totalDurationSeconds, 45)
        XCTAssertEqual(profile.quality, 0.87, accuracy: 0.001)
        XCTAssertNotNil(profile.lastUsedAt)
    }

    func test_voiceProfile_decodesWithOptionalFieldsNull() throws {
        let json = """
        {
            "id": "vp2",
            "userId": "user2",
            "status": "pending",
            "sampleCount": 0,
            "totalDurationMs": 0,
            "quality": null,
            "createdAt": "2026-04-01T00:00:00.000Z",
            "updatedAt": "2026-04-01T00:00:00.000Z",
            "lastUsedAt": null
        }
        """.data(using: .utf8)!

        let profile = try makeDecoder().decode(VoiceProfile.self, from: json)
        XCTAssertEqual(profile.status, .pending)
        XCTAssertFalse(profile.isReady)
        XCTAssertNil(profile.quality)
        XCTAssertNil(profile.lastUsedAt)
        XCTAssertEqual(profile.totalDurationSeconds, 0)
    }

    // MARK: - VoiceSample

    func test_voiceSample_decodes() throws {
        let json = """
        {
            "id": "vs1",
            "profileId": "vp1",
            "durationMs": 12500,
            "fileUrl": "https://cdn.meeshy.me/voice/vs1.wav",
            "status": "processed",
            "createdAt": "2026-03-01T10:05:00.000Z"
        }
        """.data(using: .utf8)!

        let sample = try makeDecoder().decode(VoiceSample.self, from: json)
        XCTAssertEqual(sample.id, "vs1")
        XCTAssertEqual(sample.profileId, "vp1")
        XCTAssertEqual(sample.durationMs, 12500)
        XCTAssertEqual(sample.durationSeconds, 12)
        XCTAssertEqual(sample.fileUrl, "https://cdn.meeshy.me/voice/vs1.wav")
        XCTAssertEqual(sample.status, "processed")
    }

    func test_voiceSample_decodesWithNullFileUrl() throws {
        let json = """
        {
            "id": "vs2",
            "profileId": "vp1",
            "durationMs": 8000,
            "fileUrl": null,
            "status": "uploading",
            "createdAt": "2026-03-01T10:10:00.000Z"
        }
        """.data(using: .utf8)!

        let sample = try makeDecoder().decode(VoiceSample.self, from: json)
        XCTAssertNil(sample.fileUrl)
        XCTAssertEqual(sample.durationSeconds, 8)
    }

    // MARK: - VoiceConsentStatus

    func test_voiceConsentStatus_decodesAllFields() throws {
        let json = """
        {
            "hasConsent": true,
            "consentedAt": "2026-02-28T15:00:00.000Z",
            "ageVerified": true,
            "ageVerifiedAt": "2026-02-28T15:00:00.000Z",
            "voiceCloningEnabled": true,
            "voiceCloningEnabledAt": "2026-03-01T10:00:00.000Z"
        }
        """.data(using: .utf8)!

        let status = try makeDecoder().decode(VoiceConsentStatus.self, from: json)
        XCTAssertTrue(status.hasConsent)
        XCTAssertNotNil(status.consentedAt)
        XCTAssertTrue(status.ageVerified)
        XCTAssertNotNil(status.ageVerifiedAt)
        XCTAssertTrue(status.voiceCloningEnabled)
        XCTAssertNotNil(status.voiceCloningEnabledAt)
    }

    func test_voiceConsentStatus_decodesWithNullDates() throws {
        let json = """
        {
            "hasConsent": false,
            "consentedAt": null,
            "ageVerified": false,
            "ageVerifiedAt": null,
            "voiceCloningEnabled": false,
            "voiceCloningEnabledAt": null
        }
        """.data(using: .utf8)!

        let status = try makeDecoder().decode(VoiceConsentStatus.self, from: json)
        XCTAssertFalse(status.hasConsent)
        XCTAssertNil(status.consentedAt)
        XCTAssertFalse(status.voiceCloningEnabled)
    }

    // MARK: - VoiceConsentResponse

    func test_voiceConsentResponse_decodes() throws {
        let json = """
        { "success": true, "consentedAt": "2026-04-01T12:00:00.000Z" }
        """.data(using: .utf8)!

        let response = try makeDecoder().decode(VoiceConsentResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertNotNil(response.consentedAt)
    }

    func test_voiceConsentResponse_decodesWithNullDate() throws {
        let json = """
        { "success": false, "consentedAt": null }
        """.data(using: .utf8)!

        let response = try makeDecoder().decode(VoiceConsentResponse.self, from: json)
        XCTAssertFalse(response.success)
        XCTAssertNil(response.consentedAt)
    }

    // MARK: - VoiceSampleUploadResponse

    func test_voiceSampleUploadResponse_decodes() throws {
        let json = """
        {
            "sampleId": "vs-new",
            "profileId": "vp1",
            "durationMs": 15000,
            "sampleCount": 3
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(VoiceSampleUploadResponse.self, from: json)
        XCTAssertEqual(response.sampleId, "vs-new")
        XCTAssertEqual(response.profileId, "vp1")
        XCTAssertEqual(response.durationMs, 15000)
        XCTAssertEqual(response.sampleCount, 3)
    }

    // MARK: - VoiceProfileWizardStep

    func test_voiceProfileWizardStep_allCases() {
        let cases = VoiceProfileWizardStep.allCases
        XCTAssertEqual(cases.count, 5)
        XCTAssertEqual(VoiceProfileWizardStep.consent.rawValue, 0)
        XCTAssertEqual(VoiceProfileWizardStep.ageVerification.rawValue, 1)
        XCTAssertEqual(VoiceProfileWizardStep.recording.rawValue, 2)
        XCTAssertEqual(VoiceProfileWizardStep.processing.rawValue, 3)
        XCTAssertEqual(VoiceProfileWizardStep.complete.rawValue, 4)
    }

    // MARK: - VoiceProfileDeleteResponse

    func test_voiceProfileDeleteResponse_decodes() throws {
        let json = """
        { "deleted": true, "samplesDeleted": 5 }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(VoiceProfileDeleteResponse.self, from: json)
        XCTAssertTrue(response.deleted)
        XCTAssertEqual(response.samplesDeleted, 5)
    }

    func test_voiceProfileDeleteResponse_decodesWithNullSamplesDeleted() throws {
        let json = """
        { "deleted": false, "samplesDeleted": null }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(VoiceProfileDeleteResponse.self, from: json)
        XCTAssertFalse(response.deleted)
        XCTAssertNil(response.samplesDeleted)
    }
}
