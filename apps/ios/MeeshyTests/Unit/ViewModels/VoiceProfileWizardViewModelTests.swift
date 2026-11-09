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

    // Wire format gateway (trois timestamps ; booléens dérivés côté SDK).
    private static let consentGranted: VoiceConsentStatus = JSONStub.decode("""
    {"voiceRecordingConsentAt":"2026-01-01T00:00:00.000Z","ageVerificationConsentAt":"2026-01-01T00:00:00.000Z","voiceCloningEnabledAt":null}
    """)

    private static let consentNotGranted: VoiceConsentStatus = JSONStub.decode("""
    {"voiceRecordingConsentAt":null,"ageVerificationConsentAt":null,"voiceCloningEnabledAt":null}
    """)

    private static let stubConsentResponse: VoiceConsentResponse = JSONStub.decode("""
    {"voiceRecordingConsentAt":"2026-01-01T00:00:00.000Z","ageVerificationConsentAt":null,"voiceCloningEnabledAt":null}
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
        sut.birthDate = Self.adultBirthDate

        await sut.grantConsent()

        XCTAssertEqual(sut.currentStep, .recording)
        XCTAssertNil(sut.error)
        XCTAssertEqual(mock.grantConsentCallCount, 1)
        XCTAssertEqual(mock.lastGrantConsentVoiceCloning, false)
    }

    func test_grantConsent_sendsFormattedBirthDateFromPicker() async {
        let (sut, mock) = makeSUT()
        mock.grantConsentResult = .success(Self.stubConsentResponse)
        // 1990-05-15 dans le calendrier du sélecteur — part au serveur en YYYY-MM-DD.
        var comps = DateComponents()
        comps.year = 1990; comps.month = 5; comps.day = 15
        sut.birthDate = Calendar.current.date(from: comps)!

        await sut.grantConsent()

        XCTAssertEqual(mock.lastGrantConsentBirthDate, "1990-05-15")
        XCTAssertTrue(sut.ageVerified)
    }

    // MARK: - Âge du clonage vocal (#17309)

    private static let adultBirthDate = Calendar.current.date(from: DateComponents(year: 1990, month: 5, day: 15))!

    private static func calendar(_ identifier: String) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: identifier)!
        return calendar
    }

    func test_init_birthDateDefaultsToTheVoiceCloningLimit_notToday() {
        let calendar = Self.calendar("Europe/Paris")
        let today = calendar.date(from: DateComponents(year: 2026, month: 11, day: 9, hour: 14))!
        let sut = VoiceProfileWizardViewModel(service: MockVoiceProfileService(), calendar: calendar, today: today)

        XCTAssertEqual(sut.birthDate, calendar.date(from: DateComponents(year: 2008, month: 11, day: 9)))
        XCTAssertEqual(sut.latestAdmittedBirthDate, sut.birthDate)
    }

    func test_latestAdmittedBirthDate_onLeapDay_isFebruaryTwentyEighth() {
        let calendar = Self.calendar("Europe/Paris")
        let today = calendar.date(from: DateComponents(year: 2028, month: 2, day: 29, hour: 9))!
        let sut = VoiceProfileWizardViewModel(service: MockVoiceProfileService(), calendar: calendar, today: today)

        XCTAssertEqual(sut.latestAdmittedBirthDate, calendar.date(from: DateComponents(year: 2010, month: 2, day: 28)))
    }

    func test_formatBirthDate_keepsThePickedDay_eastOfGreenwich() {
        let calendar = Self.calendar("Pacific/Auckland")
        let pickedMidnight = calendar.date(from: DateComponents(year: 2008, month: 11, day: 9))!

        XCTAssertEqual(VoiceProfileWizardViewModel.formatBirthDate(pickedMidnight, calendar: calendar), "2008-11-09")
    }

    func test_grantConsent_untouchedPicker_declaresNothing() async {
        let calendar = Self.calendar("Pacific/Auckland")
        let today = calendar.date(from: DateComponents(year: 2026, month: 11, day: 9, hour: 8))!
        let mock = MockVoiceProfileService()
        mock.grantConsentResult = .success(Self.stubConsentResponse)
        let sut = VoiceProfileWizardViewModel(service: mock, calendar: calendar, today: today)

        await sut.grantConsent()

        XCTAssertEqual(mock.grantConsentCallCount, 0)
        XCTAssertFalse(sut.ageVerified)
        XCTAssertNotEqual(sut.currentStep, .recording)
    }

    func test_grantConsent_limitDayChosen_sendsIt() async {
        let calendar = Self.calendar("Pacific/Auckland")
        let today = calendar.date(from: DateComponents(year: 2026, month: 11, day: 9, hour: 8))!
        let mock = MockVoiceProfileService()
        mock.grantConsentResult = .success(Self.stubConsentResponse)
        let sut = VoiceProfileWizardViewModel(service: mock, calendar: calendar, today: today)
        sut.birthDate = sut.latestAdmittedBirthDate

        await sut.grantConsent()

        XCTAssertEqual(mock.lastGrantConsentBirthDate, "2008-11-09")
    }

    func test_grantConsent_error_setsError() async {
        let (sut, mock) = makeSUT()
        mock.grantConsentResult = .failure(NSError(domain: "test", code: 500))
        sut.birthDate = Self.adultBirthDate

        await sut.grantConsent()

        XCTAssertNotNil(sut.error)
        XCTAssertEqual(sut.currentStep, .consent)
    }

    // MARK: - proceedToAgeVerification

    func test_proceedToAgeVerification_movesConsentToAgeVerificationStep() {
        let (sut, _) = makeSUT()
        sut.currentStep = .consent

        sut.proceedToAgeVerification()

        XCTAssertEqual(sut.currentStep, .ageVerification)
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
