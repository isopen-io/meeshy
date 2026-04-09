import Foundation
import MeeshySDK
import XCTest

@MainActor
final class MockVoiceProfileService: VoiceProfileServiceProviding, @unchecked Sendable {
    nonisolated init() {}

    // MARK: - Stubbing

    var getConsentStatusResult: Result<VoiceConsentStatus, Error> = .failure(NSError(domain: "test", code: 0))
    var grantConsentResult: Result<VoiceConsentResponse, Error> = .failure(NSError(domain: "test", code: 0))
    var revokeConsentResult: Result<Void, Error> = .success(())
    var getProfileResult: Result<VoiceProfile?, Error> = .success(nil)
    var getSamplesResult: Result<[VoiceSample], Error> = .success([])
    var uploadSampleResult: Result<VoiceSampleUploadResponse, Error> = .failure(NSError(domain: "test", code: 0))
    var toggleVoiceCloningResult: Result<Void, Error> = .success(())
    var deleteProfileResult: Result<Void, Error> = .success(())
    var deleteSampleResult: Result<Void, Error> = .success(())

    // MARK: - Call Tracking

    var getConsentStatusCallCount = 0
    var grantConsentCallCount = 0
    var lastGrantConsentAgeVerification: Bool?
    var revokeConsentCallCount = 0
    var getProfileCallCount = 0
    var getSamplesCallCount = 0
    var uploadSampleCallCount = 0
    var lastUploadSampleDurationMs: Int?
    var toggleVoiceCloningCallCount = 0
    var lastToggleEnabled: Bool?
    var deleteProfileCallCount = 0
    var deleteSampleCallCount = 0
    var lastDeleteSampleId: String?

    // MARK: - Protocol Conformance

    nonisolated func getConsentStatus() async throws -> VoiceConsentStatus {
        await MainActor.run { getConsentStatusCallCount += 1 }
        return try await MainActor.run { try getConsentStatusResult.get() }
    }

    nonisolated func grantConsent(ageVerification: Bool, birthDate: String?) async throws -> VoiceConsentResponse {
        await MainActor.run {
            grantConsentCallCount += 1
            lastGrantConsentAgeVerification = ageVerification
        }
        return try await MainActor.run { try grantConsentResult.get() }
    }

    nonisolated func revokeConsent() async throws {
        await MainActor.run { revokeConsentCallCount += 1 }
        try await MainActor.run { try revokeConsentResult.get() }
    }

    nonisolated func getProfile() async throws -> VoiceProfile? {
        await MainActor.run { getProfileCallCount += 1 }
        return try await MainActor.run { try getProfileResult.get() }
    }

    nonisolated func getSamples() async throws -> [VoiceSample] {
        await MainActor.run { getSamplesCallCount += 1 }
        return try await MainActor.run { try getSamplesResult.get() }
    }

    nonisolated func uploadSample(audioData: Data, durationMs: Int) async throws -> VoiceSampleUploadResponse {
        await MainActor.run {
            uploadSampleCallCount += 1
            lastUploadSampleDurationMs = durationMs
        }
        return try await MainActor.run { try uploadSampleResult.get() }
    }

    nonisolated func toggleVoiceCloning(enabled: Bool) async throws {
        await MainActor.run {
            toggleVoiceCloningCallCount += 1
            lastToggleEnabled = enabled
        }
        try await MainActor.run { try toggleVoiceCloningResult.get() }
    }

    nonisolated func deleteProfile() async throws {
        await MainActor.run { deleteProfileCallCount += 1 }
        try await MainActor.run { try deleteProfileResult.get() }
    }

    nonisolated func deleteSample(sampleId: String) async throws {
        await MainActor.run {
            deleteSampleCallCount += 1
            lastDeleteSampleId = sampleId
        }
        try await MainActor.run { try deleteSampleResult.get() }
    }

    // MARK: - Reset

    func reset() {
        getConsentStatusCallCount = 0
        grantConsentCallCount = 0
        lastGrantConsentAgeVerification = nil
        revokeConsentCallCount = 0
        getProfileCallCount = 0
        getSamplesCallCount = 0
        uploadSampleCallCount = 0
        lastUploadSampleDurationMs = nil
        toggleVoiceCloningCallCount = 0
        lastToggleEnabled = nil
        deleteProfileCallCount = 0
        deleteSampleCallCount = 0
        lastDeleteSampleId = nil
    }
}
