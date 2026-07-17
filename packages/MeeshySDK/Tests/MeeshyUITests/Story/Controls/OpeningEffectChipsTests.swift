import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("OpeningEffectChips.title(for:)")
@MainActor
struct OpeningEffectChipsTests {

    /// Locks the localized-title regression: `StoryTransitionEffect.label`
    /// used to live in the SDK core model and return hardcoded French
    /// literals regardless of device locale (same bug class as C12/C17).
    /// The title now resolves through `String(localized:bundle:.module)` in
    /// MeeshyUI, where the resource catalog actually lives. Assertions stay
    /// locale-independent (non-empty + distinct per case) rather than
    /// pinning exact text — the resolved string depends on the test host's
    /// simulator locale once catalog entries exist for more than one language.
    @Test("every case resolves to a non-empty title")
    func everyCaseHasATitle() {
        for effect in StoryTransitionEffect.allCases {
            #expect(!OpeningEffectChips.title(for: effect).isEmpty)
        }
    }

    @Test("every case resolves to a distinct title")
    func everyCaseIsDistinct() {
        let titles = StoryTransitionEffect.allCases.map(OpeningEffectChips.title(for:))
        #expect(Set(titles).count == titles.count)
    }
}
