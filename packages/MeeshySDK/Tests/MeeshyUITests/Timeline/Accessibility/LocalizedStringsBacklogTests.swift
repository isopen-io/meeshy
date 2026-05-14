import XCTest
@testable import MeeshyUI

/// Backlog cleanup — covers two hardcoded-string regressions caught in the
/// May 2026 audit:
///
///   1. `AudioClipBar.accessibilityValueDescription` previously appended a
///      raw French `", muet"` suffix when the clip was muted, which leaked
///      through to VoiceOver in any locale.
///   2. `TransitionInspector.easingDisabledNotice` rendered a hardcoded
///      English `"Easing: linear"` label when advanced easings were gated.
///
/// Both surfaces now route through `Bundle.module` and the
/// `Localizable.xcstrings` catalog. These tests prove the wiring resolves
/// real translations rather than echoing the key back, and that every new
/// key ships translations for the 5 product locales (fr/en/de/es/pt-BR).
///
/// `Bundle.module` is `@MainActor`-isolated under MeeshyUI's
/// `defaultIsolation(MainActor)` (see `feedback_bundle_module_mainactor_isolation.md`);
/// the test class is therefore `@MainActor`.
@MainActor
final class LocalizedStringsBacklogTests: XCTestCase {

    // MARK: - Constants

    /// The 5 product locales every catalog key MUST ship translations for.
    /// Source of truth: language picker in `Auth/LanguageSelector.swift` +
    /// `MeeshyUserPreferences.supportedContentLocales`.
    private static let requiredLocales: Set<String> = [
        "fr", "en", "de", "es", "pt-BR"
    ]

    /// Keys added in this backlog sweep — must each resolve via `Bundle.module`
    /// and carry the 5 required locales in `Localizable.xcstrings`.
    private static let backlogKeys: [String] = [
        "story.timeline.a11y.audio.muted_suffix",
        "story.timeline.inspector.easing.label",
        "story.timeline.inspector.easing.linear",
    ]

    // MARK: - Helpers

    private func resolved(_ key: String) -> String {
        String(localized: String.LocalizationValue(key), bundle: .module)
    }

    private func assertResolvedNonRaw(
        _ key: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let value = resolved(key)
        XCTAssertNotEqual(
            value, key,
            "Key '\(key)' returned itself raw — translation missing in Localizable.xcstrings",
            file: file, line: line
        )
        XCTAssertFalse(
            value.isEmpty,
            "Key '\(key)' resolved to an empty string",
            file: file, line: line
        )
    }

    // MARK: - Surface tests

    /// `AudioClipBar.accessibilityValueDescription` previously hardcoded
    /// `", muet"`. It now appends the localized suffix, prefixed by a comma,
    /// so VoiceOver reads e.g. `Volume 80%, muted` in en and `Volume 80%,
    /// muet` in fr.
    func test_audioClipBar_mutedSuffix_resolvesViaBundle() {
        assertResolvedNonRaw("story.timeline.a11y.audio.muted_suffix")
        let suffix = resolved("story.timeline.a11y.audio.muted_suffix")
        // Defensive: each locale starts its suffix with a comma so the
        // sentence reads `Volume X%<suffix>` cleanly.
        XCTAssertTrue(
            suffix.hasPrefix(","),
            "Muted suffix '\(suffix)' must start with ',' for sentence continuity"
        )
    }

    /// `TransitionInspector.easingDisabledNoticeText(easingName:)` injects a
    /// localized easing name into a `%@` placeholder. The static helpers are
    /// exposed precisely so this test can drive them without mounting the
    /// SwiftUI view (which `defaultIsolation(MainActor)` makes awkward).
    func test_transitionInspector_easingLabel_resolvesViaBundle() {
        assertResolvedNonRaw("story.timeline.inspector.easing.label")
        assertResolvedNonRaw("story.timeline.inspector.easing.linear")

        let linearName = TransitionInspector.linearEasingName
        XCTAssertFalse(linearName.isEmpty)
        XCTAssertNotEqual(linearName, "story.timeline.inspector.easing.linear")

        let composed = TransitionInspector.easingDisabledNoticeText(easingName: linearName)
        XCTAssertFalse(composed.isEmpty)
        // The composed notice must actually interpolate the easing name —
        // catches `%@` being dropped or the format string returning raw.
        XCTAssertTrue(
            composed.contains(linearName),
            "Composed notice '\(composed)' must contain interpolated easing name '\(linearName)'"
        )
        // And it must not be the bare format string echoed back.
        XCTAssertNotEqual(composed, "story.timeline.inspector.easing.label")
    }

    // MARK: - Catalog completeness probe

    /// Loads `Localizable.xcstrings` directly out of `Bundle.module` and
    /// asserts every backlog key carries translations for all 5 required
    /// locales. This catches the case where a key resolves through the
    /// bundle (so the surface tests above pass) yet some locale is missing
    /// — `String(localized:)` would silently fall back to the source
    /// language.
    func test_locale_keys_present_in_all_5_locales() throws {
        let bundle = Bundle.module
        guard let url = bundle.url(
            forResource: "Localizable",
            withExtension: "xcstrings"
        ) else {
            XCTFail("Localizable.xcstrings not found in Bundle.module")
            return
        }

        let data = try Data(contentsOf: url)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let strings = json?["strings"] as? [String: Any] ?? [:]

        for key in Self.backlogKeys {
            guard let entry = strings[key] as? [String: Any],
                  let localizations = entry["localizations"] as? [String: Any] else {
                XCTFail("Key '\(key)' missing or malformed in Localizable.xcstrings")
                continue
            }

            let presentLocales = Set(localizations.keys)
            let missing = Self.requiredLocales.subtracting(presentLocales)
            XCTAssertTrue(
                missing.isEmpty,
                "Key '\(key)' is missing locales: \(missing.sorted().joined(separator: ", "))"
            )

            for locale in Self.requiredLocales {
                guard let loc = localizations[locale] as? [String: Any],
                      let unit = loc["stringUnit"] as? [String: Any],
                      let value = unit["value"] as? String else {
                    XCTFail("Key '\(key)' locale '\(locale)' missing stringUnit.value")
                    continue
                }
                XCTAssertFalse(
                    value.isEmpty,
                    "Key '\(key)' locale '\(locale)' has empty value"
                )
            }
        }
    }
}
