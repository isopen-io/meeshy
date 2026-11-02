import XCTest
@preconcurrency import CallKit
@testable import Meeshy

/// Ce que CallKit sait des appels Meeshy (#11522) : vidéo, deux groupes,
/// poignée générique, Recents, icône de marque et sonnerie.
@MainActor
final class CallKitProviderConfigurationTests: XCTestCase {

    func test_make_declaresVideoGroupsHandlesAndRecents() {
        let config = CallKitProviderConfiguration.make()

        XCTAssertTrue(config.supportsVideo)
        XCTAssertEqual(config.maximumCallsPerCallGroup, 1)
        XCTAssertEqual(config.maximumCallGroups, 2)
        XCTAssertEqual(config.supportedHandleTypes, [.generic])
        XCTAssertTrue(config.includesCallsInRecents)
    }

    func test_make_carriesTheBrandIconAndTheRingtone() {
        let config = CallKitProviderConfiguration.make()

        XCTAssertEqual(config.ringtoneSound, "Ringtone.caf")
        XCTAssertNotNil(config.iconTemplateImageData)
    }
}
