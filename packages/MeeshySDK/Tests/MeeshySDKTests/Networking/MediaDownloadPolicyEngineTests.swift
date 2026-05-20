import XCTest
@testable import MeeshySDK

final class MediaDownloadPolicyEngineTests: XCTestCase {

    // MARK: - Offline gate

    func test_shouldAutoDownload_offline_returnsFalse() {
        let prefs = MediaDownloadPreferences(
            image: .always, audio: .always, audioTranslation: .always, video: .always
        )
        for kind in [MediaKind.image, .audio, .audioTranslation, .video] {
            let result = MediaDownloadPolicyEngine.shouldAutoDownload(
                kind: kind, condition: .offline, prefs: prefs
            )
            XCTAssertFalse(result, "kind=\(kind) doit retourner false offline")
        }
    }

    // MARK: - Policy .always

    func test_shouldAutoDownload_always_inWifi_returnsTrue() {
        let prefs = MediaDownloadPreferences(
            image: .always, audio: .always, audioTranslation: .always, video: .always
        )
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: .wifi, prefs: prefs))
    }

    func test_shouldAutoDownload_always_inGoodCellular_returnsTrue() {
        let prefs = MediaDownloadPreferences(
            image: .always, audio: .always, audioTranslation: .always, video: .always
        )
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: .goodCellular, prefs: prefs))
    }

    func test_shouldAutoDownload_always_inBadCellular_returnsTrue() {
        let prefs = MediaDownloadPreferences(
            image: .always, audio: .always, audioTranslation: .always, video: .always
        )
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: .badCellular, prefs: prefs))
    }

    // MARK: - Policy .wifiAndGoodCellular

    func test_shouldAutoDownload_wifiAndGood_inWifi_returnsTrue() {
        let prefs = MediaDownloadPreferences(
            image: .wifiAndGoodCellular, audio: .wifiAndGoodCellular,
            audioTranslation: .wifiAndGoodCellular, video: .wifiAndGoodCellular
        )
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: .wifi, prefs: prefs))
    }

    func test_shouldAutoDownload_wifiAndGood_inGoodCellular_returnsTrue() {
        let prefs = MediaDownloadPreferences(
            image: .wifiAndGoodCellular, audio: .wifiAndGoodCellular,
            audioTranslation: .wifiAndGoodCellular, video: .wifiAndGoodCellular
        )
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: .goodCellular, prefs: prefs))
    }

    func test_shouldAutoDownload_wifiAndGood_inBadCellular_returnsFalse() {
        let prefs = MediaDownloadPreferences(
            image: .wifiAndGoodCellular, audio: .wifiAndGoodCellular,
            audioTranslation: .wifiAndGoodCellular, video: .wifiAndGoodCellular
        )
        XCTAssertFalse(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: .badCellular, prefs: prefs))
    }

    // MARK: - Policy .wifiOnly

    func test_shouldAutoDownload_wifiOnly_inWifi_returnsTrue() {
        let prefs = MediaDownloadPreferences(
            image: .wifiOnly, audio: .wifiOnly, audioTranslation: .wifiOnly, video: .wifiOnly
        )
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: .wifi, prefs: prefs))
    }

    func test_shouldAutoDownload_wifiOnly_inGoodCellular_returnsFalse() {
        let prefs = MediaDownloadPreferences(
            image: .wifiOnly, audio: .wifiOnly, audioTranslation: .wifiOnly, video: .wifiOnly
        )
        XCTAssertFalse(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: .goodCellular, prefs: prefs))
    }

    func test_shouldAutoDownload_wifiOnly_inBadCellular_returnsFalse() {
        let prefs = MediaDownloadPreferences(
            image: .wifiOnly, audio: .wifiOnly, audioTranslation: .wifiOnly, video: .wifiOnly
        )
        XCTAssertFalse(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audioTranslation, condition: .badCellular, prefs: prefs))
    }

    // MARK: - Policy .never

    func test_shouldAutoDownload_never_inAnyCondition_returnsFalse() {
        let prefs = MediaDownloadPreferences(
            image: .never, audio: .never, audioTranslation: .never, video: .never
        )
        for condition in [NetworkCondition.wifi, .goodCellular, .badCellular] {
            XCTAssertFalse(
                MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: condition, prefs: prefs),
                "condition=\(condition) doit retourner false pour .never"
            )
        }
    }

    // MARK: - Discrimination par kind

    func test_shouldAutoDownload_discriminatesByKind() {
        let prefs = MediaDownloadPreferences(
            image: .never, audio: .always, audioTranslation: .wifiOnly, video: .never
        )
        XCTAssertFalse(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: .wifi, prefs: prefs))
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: .badCellular, prefs: prefs))
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audioTranslation, condition: .wifi, prefs: prefs))
        XCTAssertFalse(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: .wifi, prefs: prefs))
    }
}
