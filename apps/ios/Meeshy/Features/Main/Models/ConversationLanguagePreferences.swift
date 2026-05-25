import Foundation
import MeeshySDK

/// Strict Prisme Linguistique resolution for a single user.
///
/// `MeeshyUser.preferredContentLanguages` (SDK source of truth) appends a
/// `"fr"` fallback when nothing is configured. That fallback makes sense for
/// composing UI defaults, but it would FORCE selection of a French
/// translation in `ConversationViewModel.preferredTranslation(for:)` even
/// when the user has set no language preference at all. The Prisme rule
/// (`CLAUDE.md`) is "no match → display the original", not "no match →
/// French", so the conversation surface needs a stricter helper.
///
/// ### Why a struct, not a `MeeshyUser` extension
/// - The `"fr"` fallback contract on the SDK extension is intentional and
///   used elsewhere (composer language fill, country picker defaults). We
///   don't want to silently change that contract.
/// - This struct is `Equatable + Sendable` so it can be cached / diffed
///   inside the ViewModel without revalidating the underlying `MeeshyUser`
///   on every read.
///
/// ### First extraction step toward splitting `ConversationViewModel`
/// (cf. `tasks/todo.md` P4.2). The struct replaces the
/// `_cachedPreferredLanguages` ad-hoc memo inside the ViewModel.
struct ConversationLanguagePreferences: Equatable, Sendable {

    /// The user identity these preferences were derived from. Used by the
    /// ViewModel to invalidate its cache when a user switch happens.
    let userId: String?

    /// Configured primary content language (`systemLanguage` in the SDK).
    let systemLanguage: String?

    /// Configured secondary content language.
    let regionalLanguage: String?

    /// Optional per-conversation override that the user typed in. Lowest
    /// auto-priority — only consulted when neither of the configured
    /// languages produced a translation match.
    let customDestinationLanguage: String?

    init(user: MeeshyUser?) {
        self.userId = user?.id
        self.systemLanguage = user?.systemLanguage
        self.regionalLanguage = user?.regionalLanguage
        self.customDestinationLanguage = user?.customDestinationLanguage
    }

    /// Internal-only initializer used by tests so we don't have to assemble
    /// a full `MeeshyUser` for every fixture.
    init(
        userId: String?,
        systemLanguage: String?,
        regionalLanguage: String?,
        customDestinationLanguage: String?
    ) {
        self.userId = userId
        self.systemLanguage = systemLanguage
        self.regionalLanguage = regionalLanguage
        self.customDestinationLanguage = customDestinationLanguage
    }

    /// Ordered language priority for translation resolution.
    ///
    /// The order is `systemLanguage → regionalLanguage →
    /// customDestinationLanguage`, deduplicated case-insensitively. Empty
    /// when the user has no language configured at all — callers are
    /// expected to treat that as "show the original".
    ///
    /// Pure / O(1) (max 3 elements). No "fr" fallback by design — that is
    /// the difference with `MeeshyUser.preferredContentLanguages`.
    var resolved: [String] {
        var langs: [String] = []
        appendIfDistinct(systemLanguage, into: &langs)
        appendIfDistinct(regionalLanguage, into: &langs)
        appendIfDistinct(customDestinationLanguage, into: &langs)
        return langs
    }

    private func appendIfDistinct(_ candidate: String?, into langs: inout [String]) {
        guard let candidate, !candidate.isEmpty else { return }
        if langs.contains(where: { $0.caseInsensitiveCompare(candidate) == .orderedSame }) {
            return
        }
        langs.append(candidate)
    }
}
