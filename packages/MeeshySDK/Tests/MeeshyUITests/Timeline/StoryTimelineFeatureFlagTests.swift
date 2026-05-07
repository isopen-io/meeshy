import XCTest
@testable import MeeshyUI

final class StoryTimelineFeatureFlagTests: XCTestCase {

    private let key = "story_timeline_v2"

    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: key)
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: key)
        super.tearDown()
    }

    func test_isV2Enabled_defaultsToFalse_whenNoOverrideAndNoRemote() {
        let provider = MockRemoteFlagProvider(value: false)
        let flag = StoryTimelineFeatureFlag(remote: provider)
        XCTAssertFalse(flag.isV2Enabled)
    }

    func test_isV2Enabled_returnsTrue_whenUserDefaultsOverrideTrue() {
        UserDefaults.standard.set(true, forKey: key)
        let provider = MockRemoteFlagProvider(value: false)
        let flag = StoryTimelineFeatureFlag(remote: provider)
        XCTAssertTrue(flag.isV2Enabled)
    }

    func test_isV2Enabled_returnsFalse_whenUserDefaultsOverrideFalse_evenIfRemoteTrue() {
        UserDefaults.standard.set(false, forKey: key)
        let provider = MockRemoteFlagProvider(value: true)
        let flag = StoryTimelineFeatureFlag(remote: provider)
        XCTAssertFalse(flag.isV2Enabled)
    }

    func test_isV2Enabled_fallsBackToRemote_whenNoOverride() {
        let provider = MockRemoteFlagProvider(value: true)
        let flag = StoryTimelineFeatureFlag(remote: provider)
        XCTAssertTrue(flag.isV2Enabled)
    }
}

private struct MockRemoteFlagProvider: RemoteFeatureFlagProviding {
    let value: Bool
    func bool(forKey: String) -> Bool { value }
}
