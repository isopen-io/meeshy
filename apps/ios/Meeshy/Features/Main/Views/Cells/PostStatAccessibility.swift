import Foundation

/// VoiceOver labels for the like / comment / repost stat controls shared by
/// `TextPostCell` and `MediaPostCell`. The visible button title shows only the
/// bare count (e.g. "5"); without these labels VoiceOver announces "5, button"
/// with no indication of what the number means.
///
/// The singular/plural form is resolved explicitly in the development language
/// (en). Inline Automatic Grammar Agreement markup (`^[…](inflect: true)`) is
/// NOT used here: without a String Catalog entry the localized lookup falls
/// back to `defaultValue`, and that fallback path does not resolve the inflect
/// markup at runtime on iOS 18.x — the raw markup would leak into VoiceOver.
/// Proper multi-language plurals would require a `.xcstrings` plural variant.
///
/// `bundle` et `locale` sont des paramètres plutôt que des valeurs en dur, pour
/// une raison de testabilité — et ils vont par PAIRE :
///   - `bundle` choisit la TABLE de traduction (`en.lproj` / `fr.lproj`) ;
///   - `locale` choisit la RÈGLE DE PLURIEL appliquée à cette table.
/// Les fixer séparément ne suffit pas : avec la seule table anglaise et un
/// simulateur français, `likesLabel(0)` rend « 0 like » (le français range 0
/// dans le singulier) au lieu de « 0 likes ». Sans les fixer du tout, le test
/// juge la langue du SIMULATEUR — vert en local (fr), rouge en CI (en).
enum PostStatAccessibility {
    static func likesLabel(_ count: Int,
                           bundle: Bundle = .main,
                           locale: Locale = .current) -> String {
        String(
            localized: "feed.post.stat.likes",
            defaultValue: "\(count) \(count == 1 ? "like" : "likes")",
            bundle: bundle,
            locale: locale
        )
    }

    static func commentsLabel(_ count: Int,
                              bundle: Bundle = .main,
                              locale: Locale = .current) -> String {
        String(
            localized: "feed.post.stat.comments",
            defaultValue: "\(count) \(count == 1 ? "comment" : "comments")",
            bundle: bundle,
            locale: locale
        )
    }

    static func repostsLabel(_ count: Int,
                             bundle: Bundle = .main,
                             locale: Locale = .current) -> String {
        String(
            localized: "feed.post.stat.reposts",
            defaultValue: "\(count) \(count == 1 ? "repost" : "reposts")",
            bundle: bundle,
            locale: locale
        )
    }
}
