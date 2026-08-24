import XCTest
@testable import Meeshy

/// The status composer's publish affordance lives in the navigation bar and swaps
/// its label for a bare `ProgressView` while the mood is being published. A button
/// whose only child is an unlabelled `ProgressView` has no accessible name, so
/// VoiceOver announced nothing at the exact moment the action was running.
///
/// The fix pins the accessible name to the action (`status.composer.publish`) and
/// carries the transient/blocked states as value + hint — the same shape as the
/// create-tracking-link button.
///
/// **Cette suite mesure un écran que PLUS AUCUN SITE NE MONTE (lot 4.6).** Les
/// quatre présentations du mood ouvrent `MoodComposerDoor` → `MeeshyComposerHost`,
/// et `StatusComposerSheetPresentationTests`
/// `.test_noEntryPointStillMountsTheLegacyComposer` l'assère fichier par fichier. Ces quatre tests restent donc verts sur une affordance sans public :
/// c'est le motif d'extinction silencieuse RETOURNÉ — la garde n'a pas perdu sa
/// cible, sa cible a perdu son public.
///
/// L'affordance réellement livrée est `MeeshyComposerHost.publishButton`, et elle
/// a sa propre garde depuis le 2026-08-24 :
/// `MeeshyComposerHostGuardTests.test_laFlecheDuSocle_porteSonEtatAccessible`.
/// **Ne pas supprimer cette suite-ci avant le retrait de `StatusComposerView`**
/// (lot 4.8, conditionnel) : tant que le fichier existe, la retirer laisserait
/// son bouton sans mesure si une porte devait le remonter.
@MainActor
final class StatusComposerAccessibilityTests: XCTestCase {

    private func composerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/StatusComposerView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// The vicinity following a source anchor, so an assertion targets the modifiers
    /// attached to that construct rather than any same-key occurrence elsewhere.
    private func vicinity(after anchor: String, in source: String, span: Int = 700) throws -> String {
        guard let range = source.range(of: anchor) else {
            XCTFail("StatusComposerView must contain \(anchor)")
            return ""
        }
        let end = source.index(range.upperBound, offsetBy: span, limitedBy: source.endIndex) ?? source.endIndex
        return String(source[range.upperBound ..< end])
    }

    /// Anchored on the `disabled(...)` line of the publish button, which is unique
    /// in the file and immediately precedes the accessibility modifiers.
    private func publishButtonModifiers() throws -> String {
        let source = try composerSource()
        return try vicinity(after: ".disabled(selectedEmoji == nil || isPublishing)", in: source, span: 1000)
    }

    func test_publishButton_keepsAccessibleNameWhilePublishing() throws {
        XCTAssertTrue(
            try publishButtonModifiers().contains(".accessibilityLabel(String(localized: \"status.composer.publish\""),
            "The publish button must carry an explicit accessibilityLabel: while isPublishing its label " +
            "is a bare ProgressView, which leaves the button with no accessible name."
        )
    }

    func test_publishButton_announcesPublishingState() throws {
        XCTAssertTrue(
            try publishButtonModifiers().contains("a11y.status.publish.in-progress"),
            "The publish button must expose the in-flight state as an accessibility value so the busy " +
            "state is conveyed by more than the spinner's appearance."
        )
    }

    func test_publishButton_explainsWhyItIsDisabled() throws {
        let modifiers = try publishButtonModifiers()
        XCTAssertTrue(
            modifiers.contains("a11y.status.publish.disabled.hint"),
            "The publish button is disabled until an emoji is picked; that requirement must be stated " +
            "as an accessibility hint, since the dimmed gradient alone conveys it visually only."
        )
        XCTAssertTrue(
            modifiers.contains("selectedEmoji == nil"),
            "The disabled hint must be conditional on the missing emoji, so it is not announced once " +
            "the button is actionable."
        )
    }

    func test_newAccessibilityKeysAreFullyLocalized() throws {
        let catalogURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let data = try Data(contentsOf: catalogURL)
        let catalog = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let strings = catalog?["strings"] as? [String: Any] ?? [:]
        let supportedLocales: Set<String> = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

        for key in ["a11y.status.publish.in-progress", "a11y.status.publish.disabled.hint"] {
            let entry = strings[key] as? [String: Any]
            let localizations = entry?["localizations"] as? [String: Any] ?? [:]
            XCTAssertEqual(
                Set(localizations.keys), supportedLocales,
                "\(key) must ship translated in every locale the app supports — an accessibility string " +
                "left untranslated is read out in the wrong language by VoiceOver."
            )
        }
    }
}
