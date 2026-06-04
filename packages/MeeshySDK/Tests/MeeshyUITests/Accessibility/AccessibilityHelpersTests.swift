import XCTest
import SwiftUI
@testable import MeeshyUI

/// Phase 0 accessibility infrastructure: pure helpers + version-adaptive wrapper
/// smoke tests. The announcement wrappers route through real `#available`
/// branches whose audible behaviour is only observable with an assistive
/// technology running, so a headless run can only assert they don't crash and
/// that the deterministic helpers (`MeeshyMotion`, `MeeshyFont`, the preferences
/// store, identifiers) behave correctly.
@MainActor
final class AccessibilityHelpersTests: XCTestCase {

    // MARK: - MeeshyMotion.shouldReduce (override can only strengthen the OS)

    func test_shouldReduce_systemOn_isTrue() {
        XCTAssertTrue(MeeshyMotion.shouldReduce(system: true, userForced: false))
    }

    func test_shouldReduce_userForced_isTrue() {
        XCTAssertTrue(MeeshyMotion.shouldReduce(system: false, userForced: true))
    }

    func test_shouldReduce_bothOn_isTrue() {
        XCTAssertTrue(MeeshyMotion.shouldReduce(system: true, userForced: true))
    }

    func test_shouldReduce_neither_isFalse() {
        XCTAssertFalse(MeeshyMotion.shouldReduce(system: false, userForced: false))
    }

    // MARK: - MeeshyFont.textStyle(for:) legacy-size mapping

    func test_textStyle_mapsLegacyBucketsToScalingStyles() {
        XCTAssertEqual(MeeshyFont.textStyle(for: 10), .caption2)
        XCTAssertEqual(MeeshyFont.textStyle(for: 11), .caption2)
        XCTAssertEqual(MeeshyFont.textStyle(for: 12), .caption)
        XCTAssertEqual(MeeshyFont.textStyle(for: 13), .footnote)
        XCTAssertEqual(MeeshyFont.textStyle(for: 14), .subheadline)
        XCTAssertEqual(MeeshyFont.textStyle(for: 15), .subheadline)
        XCTAssertEqual(MeeshyFont.textStyle(for: 16), .callout)
        XCTAssertEqual(MeeshyFont.textStyle(for: 17), .body)
        XCTAssertEqual(MeeshyFont.textStyle(for: 18), .body)
        XCTAssertEqual(MeeshyFont.textStyle(for: 20), .title3)
        XCTAssertEqual(MeeshyFont.textStyle(for: 22), .title2)
        XCTAssertEqual(MeeshyFont.textStyle(for: 28), .title)
        XCTAssertEqual(MeeshyFont.textStyle(for: 34), .largeTitle)
        XCTAssertEqual(MeeshyFont.textStyle(for: 40), .largeTitle)
    }

    func test_relativeFont_buildsForAnySize() {
        // Smoke: every legacy bucket produces a Font without trapping.
        for size in stride(from: CGFloat(8), through: 48, by: 1) {
            _ = MeeshyFont.relative(size, weight: .semibold, design: .rounded)
        }
    }

    // MARK: - MeeshyAccessibilityPreferences persistence (configurable)

    func test_preferences_defaults_reduceMotionOff() {
        XCTAssertFalse(MeeshyAccessibilitySettings.defaults.reduceMotion)
    }

    func test_preferences_saveLoad_roundtrip() {
        let suite = "a11y.test.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }

        var settings = MeeshyAccessibilitySettings.defaults
        settings.reduceMotion = true
        MeeshyAccessibilityPreferences.save(settings, userDefaults: defaults)

        let loaded = MeeshyAccessibilityPreferences.load(userDefaults: defaults)
        XCTAssertTrue(loaded.reduceMotion)
    }

    func test_preferences_load_returnsDefaults_whenEmpty() {
        let suite = "a11y.test.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }

        XCTAssertEqual(MeeshyAccessibilityPreferences.load(userDefaults: defaults), .defaults)
    }

    // MARK: - Identifiers (UI/E2E hooks)

    func test_a11yIDs_areNonEmptyAndUnique() {
        let ids = [
            MeeshyA11yID.loginSubmit,
            MeeshyA11yID.composerSend,
            MeeshyA11yID.composerTextField,
            MeeshyA11yID.conversationMessageList,
            MeeshyA11yID.conversationScrollToBottom,
            MeeshyA11yID.conversationRow,
            MeeshyA11yID.toastContainer,
            MeeshyA11yID.callControlEnd,
            MeeshyA11yID.callControlAnswer,
            MeeshyA11yID.callControlDecline,
            MeeshyA11yID.callControlMute,
            MeeshyA11yID.callControlSpeaker,
            MeeshyA11yID.joinSubmit,
            MeeshyA11yID.communityCreateSubmit
        ]
        XCTAssertTrue(ids.allSatisfy { !$0.isEmpty })
        XCTAssertEqual(Set(ids).count, ids.count, "Accessibility identifiers must be unique")
    }

    // MARK: - AdaptiveAccessibility smoke (no assistive tech in headless run)

    func test_announce_emptyOrWhitespace_isNoOp() {
        AdaptiveAccessibility.announce("")
        AdaptiveAccessibility.announce("   \n\t")
    }

    func test_announce_message_allPriorities_doNotCrash() {
        AdaptiveAccessibility.announce("Erreur réseau", priority: .high)
        AdaptiveAccessibility.announce("Message envoyé", priority: .normal)
        AdaptiveAccessibility.announce("Synchronisation", priority: .low)
    }

    func test_screenAndLayoutChanged_doNotCrash() {
        AdaptiveAccessibility.screenChanged("Nouvelle étape")
        AdaptiveAccessibility.layoutChanged("Élément ajouté")
        AdaptiveAccessibility.screenChanged()
        AdaptiveAccessibility.layoutChanged()
    }

    func test_isAssistiveTechRunning_returnsBool() {
        _ = AdaptiveAccessibility.isAssistiveTechRunning
    }
}
