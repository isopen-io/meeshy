import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class VoiceProfileManageViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        service: MockVoiceProfileService = MockVoiceProfileService()
    ) -> (sut: VoiceProfileManageViewModel, service: MockVoiceProfileService) {
        let sut = VoiceProfileManageViewModel(service: service)
        return (sut, service)
    }

    private static let stubConsentStatus: VoiceConsentStatus = JSONStub.decode("""
    {"hasConsent":true,"consentedAt":"2026-01-01T00:00:00.000Z","ageVerified":true,"ageVerifiedAt":"2026-01-01T00:00:00.000Z","voiceCloningEnabled":true,"voiceCloningEnabledAt":"2026-01-01T00:00:00.000Z"}
    """)

    private static let stubProfile: VoiceProfile = JSONStub.decode("""
    {"id":"vp-1","userId":"u1","status":"ready","sampleCount":3,"totalDurationMs":15000,"quality":0.85,"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}
    """)

    private static let stubSample: VoiceSample = JSONStub.decode("""
    {"id":"vs-1","profileId":"vp-1","durationMs":5000,"fileUrl":"https://example.com/sample.m4a","status":"processed","createdAt":"2026-01-01T00:00:00.000Z"}
    """)

    // MARK: - loadProfile

    func test_loadProfile_success_setsProfileAndSamples() async {
        let (sut, mock) = makeSUT()
        mock.getProfileResult = .success(Self.stubProfile)
        mock.getSamplesResult = .success([Self.stubSample])
        mock.getConsentStatusResult = .success(Self.stubConsentStatus)

        await sut.loadProfile()

        XCTAssertNotNil(sut.profile)
        XCTAssertEqual(sut.profile?.id, "vp-1")
        XCTAssertEqual(sut.samples.count, 1)
        XCTAssertTrue(sut.isCloningEnabled)
        XCTAssertFalse(sut.isLoading)
        XCTAssertNil(sut.error)
        XCTAssertEqual(mock.getProfileCallCount, 1)
        XCTAssertEqual(mock.getSamplesCallCount, 1)
        XCTAssertEqual(mock.getConsentStatusCallCount, 1)
    }

    func test_loadProfile_error_setsError() async {
        let (sut, mock) = makeSUT()
        mock.getProfileResult = .failure(NSError(domain: "test", code: 500))

        await sut.loadProfile()

        XCTAssertNil(sut.profile)
        XCTAssertNotNil(sut.error)
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadProfile_setsIsLoadingDuringFetch() async {
        let (sut, mock) = makeSUT()
        mock.getProfileResult = .success(nil)
        mock.getSamplesResult = .success([])
        mock.getConsentStatusResult = .success(Self.stubConsentStatus)

        XCTAssertFalse(sut.isLoading)
        await sut.loadProfile()
        XCTAssertFalse(sut.isLoading)
    }

    // MARK: - toggleCloning

    func test_toggleCloning_success_updatesState() async {
        let (sut, mock) = makeSUT()
        sut.isCloningEnabled = false

        await sut.toggleCloning(enabled: true)

        XCTAssertTrue(sut.isCloningEnabled)
        XCTAssertEqual(mock.toggleVoiceCloningCallCount, 1)
        XCTAssertEqual(mock.lastToggleEnabled, true)
        XCTAssertNil(sut.error)
    }

    func test_toggleCloning_error_rollsBack() async {
        let (sut, mock) = makeSUT()
        sut.isCloningEnabled = true
        mock.toggleVoiceCloningResult = .failure(NSError(domain: "test", code: 500))

        await sut.toggleCloning(enabled: false)

        XCTAssertTrue(sut.isCloningEnabled)
        XCTAssertNotNil(sut.error)
    }

    // MARK: - deleteSample

    func test_deleteSample_success_removesFromList() async {
        let (sut, mock) = makeSUT()
        mock.getProfileResult = .success(Self.stubProfile)
        let sample2: VoiceSample = JSONStub.decode("""
        {"id":"vs-2","profileId":"vp-1","durationMs":3000,"status":"processed","createdAt":"2026-01-01T00:00:00.000Z"}
        """)
        mock.getSamplesResult = .success([Self.stubSample, sample2])
        mock.getConsentStatusResult = .success(Self.stubConsentStatus)
        await sut.loadProfile()

        await sut.deleteSample(id: "vs-1")

        XCTAssertEqual(sut.samples.count, 1)
        XCTAssertEqual(sut.samples[0].id, "vs-2")
        XCTAssertEqual(mock.deleteSampleCallCount, 1)
        XCTAssertEqual(mock.lastDeleteSampleId, "vs-1")
    }

    func test_deleteSample_error_rollsBack() async {
        let (sut, mock) = makeSUT()
        mock.getProfileResult = .success(Self.stubProfile)
        mock.getSamplesResult = .success([Self.stubSample])
        mock.getConsentStatusResult = .success(Self.stubConsentStatus)
        await sut.loadProfile()

        mock.deleteSampleResult = .failure(NSError(domain: "test", code: 500))
        await sut.deleteSample(id: "vs-1")

        XCTAssertEqual(sut.samples.count, 1)
        XCTAssertNotNil(sut.error)
    }

    // MARK: - deleteProfile

    func test_deleteProfile_success_clearsAll() async {
        let (sut, mock) = makeSUT()
        mock.getProfileResult = .success(Self.stubProfile)
        mock.getSamplesResult = .success([Self.stubSample])
        mock.getConsentStatusResult = .success(Self.stubConsentStatus)
        await sut.loadProfile()

        await sut.deleteProfile()

        XCTAssertNil(sut.profile)
        XCTAssertTrue(sut.samples.isEmpty)
        XCTAssertFalse(sut.isCloningEnabled)
        XCTAssertEqual(mock.deleteProfileCallCount, 1)
    }

    func test_deleteProfile_error_setsError() async {
        let (sut, mock) = makeSUT()
        mock.deleteProfileResult = .failure(NSError(domain: "test", code: 500))

        await sut.deleteProfile()

        XCTAssertNotNil(sut.error)
    }
}
