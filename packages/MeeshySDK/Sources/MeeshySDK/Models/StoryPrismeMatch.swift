import CoreGraphics
import Foundation

/// Tolerant language-code matching for the Prisme Linguistique reader chain.
/// `preferredContentLanguages` preserves the original casing of the in-app
/// system/regional/custom codes, while translation keys are ISO 639-1 — so an
/// exact match can miss ("en-US" preferred vs "en" key, "FR" vs "fr"), leaving
/// another user's story text in the AUTHOR's language. These helpers collapse
/// casing + region qualifiers to a base code for a per-language fallback that
/// still honours the chain's priority order.
enum StoryPrismeMatch {
    /// Base language code (lowercased ISO 639-1) for tolerant comparison. Falls
    /// back to a lowercased region-stripped split when the normalizer rejects an
    /// unknown code, so casing/region is still collapsed.
    ///
    /// Delegates to the SSOT `MeeshyUser.normalizeLanguageForDedup` — the same
    /// case-fold + region-strip (with primary-subtag fallback) used by the
    /// last-message-preview resolver and mirrored on TS/Kotlin. Kept as a thin
    /// alias rather than a second hand-rolled split: this used to inline its own
    /// `.split(...).first ?? code.lowercased()`, a divergent twin of the
    /// preview resolver's canon that the Prisme forbids (one rule, one site).
    static func base(_ code: String) -> String {
        MeeshyUser.normalizeLanguageForDedup(code)
    }
}
