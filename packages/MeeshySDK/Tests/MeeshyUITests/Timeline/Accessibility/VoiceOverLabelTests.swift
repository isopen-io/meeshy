import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 59 — Every interactive element has a non-empty VoiceOver label.
///
/// Strategy: each key referenced by `TransportBar` via
/// `.accessibilityLabel(LocalizedStringKey(...))` is resolved through
/// `Bundle.module` (the MeeshyUI resource bundle that ships
/// `Localizable.xcstrings`). If the bundle has no translation for a key,
/// `String(localized:)` returns the key string itself raw — so asserting that
/// the resolved value differs from the key proves a translation exists.
///
/// `Bundle.module` is `@MainActor`-isolated under MeeshyUI's
/// `defaultIsolation(MainActor)`; the test class is therefore `@MainActor`.
@MainActor
final class VoiceOverLabelTests: XCTestCase {

    // MARK: - Helpers

    /// Resolve `key` through `Bundle.module` and assert the bundle returned a
    /// real translation (i.e. the returned string is not just the key echoed
    /// back). Catches keys that exist in source but are missing from
    /// `Localizable.xcstrings`.
    private func assertLocalized(
        _ key: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let resolved = String(
            localized: String.LocalizationValue(key),
            bundle: .module
        )
        XCTAssertNotEqual(
            resolved,
            key,
            "Key '\(key)' should be resolved by Bundle.module, but returned itself raw — translation missing in Localizable.xcstrings",
            file: file,
            line: line
        )
        XCTAssertFalse(
            resolved.isEmpty,
            "Key '\(key)' resolved to an empty string",
            file: file,
            line: line
        )
    }

    // MARK: - TransportBar static label helpers

    func test_transportBar_playLabel_nonEmpty() {
        assertLocalized("story.timeline.transport.play")
        assertLocalized("story.timeline.transport.pause")
    }

    func test_transportBar_zoomLabels_nonEmpty() {
        assertLocalized("story.timeline.transport.zoomOut")
        assertLocalized("story.timeline.transport.zoomIn")
        assertLocalized("story.timeline.transport.zoomReset")
    }

    func test_transportBar_muteLabels_nonEmpty() {
        assertLocalized("story.timeline.transport.mute")
        assertLocalized("story.timeline.transport.unmute")
    }


    // MARK: - Snap chip static label helpers (transport bar, vue unifiée)

    func test_toolbar_snapAccessibilityKey_nonEmpty() {
        let onKey = TransportBar.snapAccessibilityKey(isOn: true)
        let offKey = TransportBar.snapAccessibilityKey(isOn: false)
        // Keys must differ so VoiceOver conveys state change
        XCTAssertNotEqual(onKey, offKey)
        // And both keys must resolve to real localized strings
        assertLocalized(onKey)
        assertLocalized(offKey)
    }

    func test_toolbar_undoRedoKeys_nonEmpty() {
        let undoKey = "story.timeline.toolbar.undo"
        let redoKey = "story.timeline.toolbar.redo"
        XCTAssertNotEqual(undoKey, redoKey)
        assertLocalized(undoKey)
        assertLocalized(redoKey)
    }

    // MARK: - TransportBar body renders without crash (smoke)

    func test_transportBar_body_doesNotCrash() {
        let bar = TransportBar(
            isPlaying: false, currentTime: 1.0, duration: 10.0,
            zoomScale: 1.0, isMuted: false,
            onPlayToggle: {}, onMuteToggle: {},
            onZoomIn: {}, onZoomOut: {}, onZoomReset: {}
        )
        _ = bar.body
    }

}
