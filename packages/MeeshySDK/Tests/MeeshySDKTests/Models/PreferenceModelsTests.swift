import XCTest
@testable import MeeshySDK

final class PreferenceModelsTests: XCTestCase {

    // MARK: - CodableValue

    func testCodableValueCasesAndGetters() {
        XCTAssertEqual(CodableValue.bool(true).boolValue, true)
        XCTAssertNil(CodableValue.bool(true).intValue)

        XCTAssertEqual(CodableValue.int(42).intValue, 42)
        XCTAssertNil(CodableValue.int(42).stringValue)

        XCTAssertEqual(CodableValue.double(3.14).doubleValue, 3.14)
        XCTAssertNil(CodableValue.double(3.14).boolValue)

        XCTAssertEqual(CodableValue.string("hello").stringValue, "hello")
        XCTAssertNil(CodableValue.string("hello").doubleValue)

        XCTAssertNil(CodableValue.null.boolValue)
        XCTAssertNil(CodableValue.null.intValue)
        XCTAssertNil(CodableValue.null.doubleValue)
        XCTAssertNil(CodableValue.null.stringValue)
    }

    func testCodableValueRoundtripBool() throws {
        let original = CodableValue.bool(false)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CodableValue.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testCodableValueRoundtripString() throws {
        let original = CodableValue.string("test")
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CodableValue.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testCodableValueRoundtripNull() throws {
        let original = CodableValue.null
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CodableValue.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    // MARK: - PreferenceCategory

    func testPreferenceCategoryAllCasesExist() {
        let cases = PreferenceCategory.allCases
        XCTAssertTrue(cases.contains(.privacy))
        XCTAssertTrue(cases.contains(.audio))
        XCTAssertTrue(cases.contains(.message))
        XCTAssertTrue(cases.contains(.notification))
        XCTAssertTrue(cases.contains(.video))
        XCTAssertTrue(cases.contains(.document))
        XCTAssertTrue(cases.contains(.application))
        XCTAssertEqual(cases.count, 7)
    }

    // MARK: - EncryptionPreference

    func testEncryptionPreferenceAllCases() {
        let cases = EncryptionPreference.allCases
        XCTAssertEqual(cases.count, 3)
        XCTAssertTrue(cases.contains(.disabled))
        XCTAssertTrue(cases.contains(.optional))
        XCTAssertTrue(cases.contains(.always))
    }

    // MARK: - AudioQuality

    func testAudioQualityAllCases() {
        let cases = AudioQuality.allCases
        XCTAssertEqual(cases.count, 4)
        XCTAssertTrue(cases.contains(.low))
        XCTAssertTrue(cases.contains(.medium))
        XCTAssertTrue(cases.contains(.high))
        XCTAssertTrue(cases.contains(.lossless))
    }

    // MARK: - AppThemeMode

    func testAppThemeModeAllCases() {
        let cases = AppThemeMode.allCases
        XCTAssertEqual(cases.count, 3)
        XCTAssertTrue(cases.contains(.light))
        XCTAssertTrue(cases.contains(.dark))
        XCTAssertTrue(cases.contains(.auto))
    }

    // MARK: - VideoQuality, VideoResolution, VideoCodec, VideoFrameRate

    func testVideoQualityAllCases() {
        let cases = VideoQuality.allCases
        XCTAssertEqual(cases.count, 4)
        XCTAssertTrue(cases.contains(.low))
        XCTAssertTrue(cases.contains(.medium))
        XCTAssertTrue(cases.contains(.high))
        XCTAssertTrue(cases.contains(.auto))
    }

    func testVideoResolutionAllCases() {
        let cases = VideoResolution.allCases
        XCTAssertEqual(cases.count, 4)
        XCTAssertEqual(VideoResolution.r480p.rawValue, "480p")
        XCTAssertEqual(VideoResolution.r720p.rawValue, "720p")
        XCTAssertEqual(VideoResolution.r1080p.rawValue, "1080p")
        XCTAssertEqual(VideoResolution.auto.rawValue, "auto")
    }

    func testVideoCodecAllCases() {
        let cases = VideoCodec.allCases
        XCTAssertEqual(cases.count, 5)
        XCTAssertEqual(VideoCodec.vp8.rawValue, "VP8")
        XCTAssertEqual(VideoCodec.h264.rawValue, "H264")
        XCTAssertEqual(VideoCodec.av1.rawValue, "AV1")
    }

    func testVideoFrameRateAllCases() {
        let cases = VideoFrameRate.allCases
        XCTAssertEqual(cases.count, 4)
        XCTAssertEqual(VideoFrameRate.fps15.rawValue, "15")
        XCTAssertEqual(VideoFrameRate.fps24.rawValue, "24")
        XCTAssertEqual(VideoFrameRate.fps30.rawValue, "30")
        XCTAssertEqual(VideoFrameRate.fps60.rawValue, "60")
    }

    // MARK: - PrivacyPreferences

    func testPrivacyPreferencesDefaults() {
        let defaults = PrivacyPreferences.defaults

        XCTAssertTrue(defaults.showOnlineStatus)
        XCTAssertTrue(defaults.showLastSeen)
        XCTAssertTrue(defaults.showReadReceipts)
        XCTAssertTrue(defaults.showTypingIndicator)
        XCTAssertTrue(defaults.allowContactRequests)
        XCTAssertFalse(defaults.allowCallsFromNonContacts)
        XCTAssertFalse(defaults.saveMediaToGallery)
        XCTAssertFalse(defaults.blockScreenshots)
        XCTAssertEqual(defaults.encryptionPreference, .optional)
    }

    func testPrivacyPreferencesCodableRoundtrip() throws {
        let original = PrivacyPreferences.defaults
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(PrivacyPreferences.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    // MARK: - AudioPreferences

    func testAudioPreferencesDefaults() {
        let defaults = AudioPreferences.defaults

        XCTAssertTrue(defaults.transcriptionEnabled)
        XCTAssertEqual(defaults.transcriptionSource, .auto)
        XCTAssertFalse(defaults.autoTranscribeIncoming)
        XCTAssertFalse(defaults.audioTranslationEnabled)
        XCTAssertEqual(defaults.translatedAudioFormat, .mp3)
        XCTAssertFalse(defaults.ttsEnabled)
        XCTAssertNil(defaults.ttsVoice)
        XCTAssertEqual(defaults.ttsSpeed, 1.0)
        XCTAssertEqual(defaults.ttsPitch, 1.0)
        XCTAssertEqual(defaults.audioQuality, .high)
        XCTAssertTrue(defaults.noiseSuppression)
        XCTAssertTrue(defaults.echoCancellation)
        XCTAssertFalse(defaults.voiceProfileEnabled)
        XCTAssertEqual(defaults.voiceCloneQuality, .balanced)
    }

    // MARK: - MessagePreferences

    func testMessagePreferencesDefaults() {
        let defaults = MessagePreferences.defaults

        XCTAssertTrue(defaults.sendOnEnter)
        XCTAssertTrue(defaults.enableMarkdown)
        XCTAssertTrue(defaults.enableEmoji)
        XCTAssertEqual(defaults.emojiSkinTone, .default)
        XCTAssertFalse(defaults.autoCorrectEnabled)
        XCTAssertTrue(defaults.linkPreviewEnabled)
        XCTAssertEqual(defaults.draftExpirationDays, 30)
        XCTAssertEqual(defaults.defaultFontSize, .medium)
        XCTAssertEqual(defaults.maxCharacterLimit, 5000)
    }

    // MARK: - UserPreferences

    func testUserPreferencesDefaultsHasAllCategories() {
        let defaults = UserPreferences.defaults

        XCTAssertEqual(defaults.privacy, PrivacyPreferences.defaults)
        XCTAssertEqual(defaults.audio, AudioPreferences.defaults)
        XCTAssertEqual(defaults.message, MessagePreferences.defaults)
        XCTAssertEqual(defaults.notification, UserNotificationPreferences.defaults)
        XCTAssertEqual(defaults.video, VideoPreferences.defaults)
        XCTAssertEqual(defaults.document, DocumentPreferences.defaults)
        XCTAssertEqual(defaults.application, ApplicationPreferences.defaults)
    }

    func testUserPreferencesCodableRoundtrip() throws {
        let original = UserPreferences.defaults
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(UserPreferences.self, from: data)
        XCTAssertEqual(decoded, original)
    }
}
