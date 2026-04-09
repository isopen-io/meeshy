import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class VoiceProfileWizardViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        service: MockVoiceProfileService = MockVoiceProfileService()
    ) -> (sut: VoiceProfileWizardViewModel, service: MockVoiceProfileService) {
        let sut = VoiceProfileWizardViewModel(service: service)
        return (sut, service)
    }

    private static let consentGranted: VoiceConsentStatus = JSONStub.decode("""
    {"hasConsent":true,"consentedAt":"2026-01-01T00:00:00.000Z","ageVerified":true,"ageVerifiedAt":"2026-01-01T00:00:00.000Z","voiceCloningEnabled":false,"voiceCloningEnabledAt":null}
    """)

    private static let consentNotGranted: VoiceConsentStatus = JSONStub.decode("""
    {"hasConsent":false,"consentedAt":null,"ageVerified":false,"ageVerifiedAt":null,"voiceCloningEnabled":false,"voiceCloningEnabledAt":null}
    """)

    private static let stubConsentResponse: VoiceConsentResponse = JSONStub.decode("""
    {"success":true,"consentedAt":"2026-01-01T00:00:00.000Z"}
    """)

    private static let stubProfile: VoiceProfile = JSONStub.decode("""
    {"id":"vp-1","userId":"u1","status":"ready","sampleCount":3,"totalDurationMs":15000,"quality":0.85,"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}
    """)

    private static let stubUploadResponse: VoiceSampleUploadResponse = JSONStub.decode("""
    {"sampleId":"vs-new","profileId":"vp-1","durationMs":5000,"sampleCount":1}
    """)

    // MARK: - checkConsent

    func test_checkConsent_withExistingConsent_skipsToRecording() async {
        let (sut, mock) = makeSUT()
        mock.getConsentStatusResult = .success(Self.consentGranted)

        await sut.checkConsent()

        XCTAssertEqual(sut.currentStep, .recording)
        XCTAssertNotNil(sut.consentStatus)
        XCTAssertFalse(sut.isLoading)
    }

    func test_checkConsent_withoutConsent_staysOnConsent() async {
        let (sut, mock) = makeSUT()
        mock.getConsentStatusResult = .success(Self.consentNotGranted)

        await sut.checkConsent()

        XCTAssertEqual(sut.currentStep, .consent)
    }

    func test_checkConsent_error_staysOnConsent() async {
        let (sut, mock) = makeSUT()
        mock.getConsentStatusResult = .failure(NSError(domain: "test", code: 404))

        await sut.checkConsent()

        XCTAssertEqual(sut.currentStep, .consent)
        XCTAssertFalse(sut.isLoading)
    }

    // MARK: - grantConsent

    func test_grantConsent_success_movesToRecording() async {
        let (sut, mock) = makeSUT()
        mock.grantConsentResult = .success(Self.stubConsentResponse)
        sut.ageVerified = true

        await sut.grantConsent()

        XCTAssertEqual(sut.currentStep, .recording)
        XCTAssertNil(sut.error)
        XCTAssertEqual(mock.grantConsentCallCount, 1)
        XCTAssertEqual(mock.lastGrantConsentAgeVerification, true)
    }

    func test_grantConsent_error_setsError() async {
        let (sut, mock) = makeSUT()
        mock.grantConsentResult = .failure(NSError(domain: "test", code: 500))

        await sut.grantConsent()

        XCTAssertNotNil(sut.error)
        XCTAssertEqual(sut.currentStep, .consent)
    }

    // MARK: - confirmAgeVerification

    func test_confirmAgeVerification_setsAgeVerifiedAndMovesToConsent() {
        let (sut, _) = makeSUT()
        sut.currentStep = .ageVerification

        sut.confirmAgeVerification()

        XCTAssertTrue(sut.ageVerified)
        XCTAssertEqual(sut.currentStep, .consent)
    }

    // MARK: - uploadSamples

    func test_uploadSamples_success_movesToComplete() async {
        let (sut, mock) = makeSUT()
        mock.uploadSampleResult = .success(Self.stubUploadResponse)
        mock.getProfileResult = .success(Self.stubProfile)

        let audioData = [Data(repeating: 0, count: 16000), Data(repeating: 0, count: 16000)]
        await sut.uploadSamples(audioData)

        XCTAssertEqual(sut.currentStep, .complete)
        XCTAssertNotNil(sut.profile)
        XCTAssertEqual(sut.uploadedCount, 2)
        XCTAssertEqual(sut.totalToUpload, 2)
        XCTAssertFalse(sut.isUploading)
        XCTAssertEqual(mock.uploadSampleCallCount, 2)
    }

    func test_uploadSamples_error_goesBackToRecording() async {
        let (sut, mock) = makeSUT()
        mock.uploadSampleResult = .failure(NSError(domain: "test", code: 500))

        let audioData = [Data(repeating: 0, count: 16000)]
        await sut.uploadSamples(audioData)

        XCTAssertEqual(sut.currentStep, .recording)
        XCTAssertNotNil(sut.error)
        XCTAssertFalse(sut.isUploading)
    }

    func test_uploadSamples_tracksProgress() async {
        let (sut, mock) = makeSUT()
        mock.uploadSampleResult = .success(Self.stubUploadResponse)
        mock.getProfileResult = .success(Self.stubProfile)

        let audioData = [Data(repeating: 0, count: 32000), Data(repeating: 0, count: 32000), Data(repeating: 0, count: 32000)]
        await sut.uploadSamples(audioData)

        XCTAssertEqual(sut.totalToUpload, 3)
        XCTAssertEqual(sut.uploadedCount, 3)
    }

    // MARK: - initial state

    func test_initialState_isConsent() {
        let (sut, _) = makeSUT()
        XCTAssertEqual(sut.currentStep, .consent)
        XCTAssertNil(sut.consentStatus)
        XCTAssertNil(sut.profile)
        XCTAssertFalse(sut.isLoading)
        XCTAssertFalse(sut.isUploading)
        XCTAssertFalse(sut.ageVerified)
        XCTAssertNil(sut.error)
    }
}
