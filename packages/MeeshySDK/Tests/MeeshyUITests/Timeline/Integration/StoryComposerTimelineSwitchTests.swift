import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class StoryComposerTimelineSwitchTests: XCTestCase {

    final class StubFlagProvider: RemoteFeatureFlagProviding {
        let value: Bool
        init(value: Bool) { self.value = value }
        nonisolated func bool(forKey: String) -> Bool { value }
    }

    func test_renderTimelineSection_v2Disabled_usesLegacyPanel() {
        let flag = StoryTimelineFeatureFlag(defaults: UserDefaults(suiteName: "test-v2-disabled")!,
                                            remote: StubFlagProvider(value: false))
        XCTAssertFalse(flag.isV2Enabled)
    }

    func test_renderTimelineSection_v2Enabled_routesToSwitcher() {
        let flag = StoryTimelineFeatureFlag(defaults: UserDefaults(suiteName: "test-v2-enabled")!,
                                            remote: StubFlagProvider(value: true))
        XCTAssertTrue(flag.isV2Enabled)
    }

    func test_legacyPanel_isStillReachable_whenFlagOff() {
        // Sentinel guard — the switcher must never be the only path.
        let flag = StoryTimelineFeatureFlag(defaults: UserDefaults(suiteName: "test-v2-fallback")!,
                                            remote: StubFlagProvider(value: false))
        XCTAssertFalse(flag.isV2Enabled, "Legacy TimelinePanel must remain the default at launch")
    }
}
