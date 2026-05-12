import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Prisme Linguistique regression tests for the composer source language.
///
/// CLAUDE.md (root) is explicit: the device locale (`Locale.current`) and the
/// active keyboard (`UITextInputMode.activeInputModes`) MUST NEVER be used to
/// resolve the language of *content* the user authors — they describe the
/// interface, not the content. A French speaker typing on an English keyboard
/// still produces French content, and the gateway pipeline relies on this
/// invariant to route translations correctly (`systemLanguage` →
/// `regionalLanguage` → `"fr"`, identical to `resolveUserLanguage()` in
/// `packages/shared/utils/conversation-helpers.ts`).
///
/// These tests exercise the pure resolver `StoryComposerViewModel
/// .resolveComposerSourceLanguage(user:)` which is the single source of truth
/// shared between the composer View (`@State storyLanguage`) and the ViewModel
/// (`detectedKeyboardLanguage` used by `addText`, `addMediaObject`,
/// `addAudioObject` as the element's `sourceLanguage`).
final class StoryComposerView_LanguageResolutionTests: XCTestCase {

    // MARK: - Helpers

    /// Factory: builds a `MeeshyUser` with the two language fields that drive
    /// the Prisme Linguistique resolution order. All other fields are nil/empty
    /// to keep the test focused on language behaviour.
    private func makeUser(
        systemLanguage: String? = nil,
        regionalLanguage: String? = nil
    ) -> MeeshyUser {
        MeeshyUser(
            id: "u-test",
            username: "test",
            systemLanguage: systemLanguage,
            regionalLanguage: regionalLanguage
        )
    }

    // MARK: - resolveComposerSourceLanguage (pure helper)

    func test_storyLanguage_usesSystemLanguage_fromAuthManager() {
        let user = makeUser(systemLanguage: "es", regionalLanguage: "en")

        let resolved = StoryComposerViewModel.resolveComposerSourceLanguage(user: user)

        XCTAssertEqual(
            resolved, "es",
            "systemLanguage must win when present, regardless of any other input"
        )
    }

    func test_storyLanguage_fallsBack_toRegionalLanguage_whenSystemNil() {
        let user = makeUser(systemLanguage: nil, regionalLanguage: "de")

        let resolved = StoryComposerViewModel.resolveComposerSourceLanguage(user: user)

        XCTAssertEqual(
            resolved, "de",
            "regionalLanguage is the documented second-tier fallback"
        )
    }

    func test_storyLanguage_finalFallback_to_fr_whenAllNil() {
        let resolved = StoryComposerViewModel.resolveComposerSourceLanguage(user: nil)

        XCTAssertEqual(
            resolved, "fr",
            "When no user is logged in, the composer must default to French"
        )

        let blankUser = makeUser(systemLanguage: nil, regionalLanguage: nil)
        XCTAssertEqual(
            StoryComposerViewModel.resolveComposerSourceLanguage(user: blankUser),
            "fr",
            "A user with neither systemLanguage nor regionalLanguage must also default to French"
        )
    }

    func test_storyLanguage_ignoresKeyboardLocale() {
        // Regression: previously the composer read
        // `UITextInputMode.activeInputModes.first?.primaryLanguage`, so a
        // French user typing on an English keyboard would tag the story as
        // English. The resolver MUST be a pure function of the in-app
        // preferences and must not depend on UIKit input modes at all — we
        // assert this indirectly by proving the resolver never observes them:
        // whatever the simulator's keyboard is, a user whose systemLanguage is
        // "fr" gets "fr".
        let frenchUser = makeUser(systemLanguage: "fr", regionalLanguage: "fr")

        let resolved = StoryComposerViewModel.resolveComposerSourceLanguage(user: frenchUser)

        XCTAssertEqual(
            resolved, "fr",
            "A French user must get 'fr' regardless of the active keyboard locale"
        )
    }

    // MARK: - Empty-string defence

    /// The MeeshyUser model exposes `systemLanguage` / `regionalLanguage` as
    /// `String?`, but at the JSON boundary an empty string can sneak through
    /// (e.g. legacy account migration). The resolver must treat `""` as
    /// "no preference" and fall through, otherwise an empty source language
    /// would land in the gateway and break NLLB routing.
    func test_storyLanguage_skipsEmptyStrings_andFallsThrough() {
        let user = makeUser(systemLanguage: "", regionalLanguage: "")
        XCTAssertEqual(
            StoryComposerViewModel.resolveComposerSourceLanguage(user: user),
            "fr",
            "Empty systemLanguage and regionalLanguage must fall through to 'fr'"
        )

        let regionalOnly = makeUser(systemLanguage: "", regionalLanguage: "it")
        XCTAssertEqual(
            StoryComposerViewModel.resolveComposerSourceLanguage(user: regionalOnly),
            "it",
            "Empty systemLanguage must skip to regionalLanguage"
        )
    }
}
