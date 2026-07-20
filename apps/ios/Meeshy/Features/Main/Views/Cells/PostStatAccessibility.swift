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
enum PostStatAccessibility {
    static func likesLabel(_ count: Int) -> String {
        String(
            localized: "feed.post.stat.likes",
            defaultValue: "\(count) \(count == 1 ? "like" : "likes")",
            bundle: .main
        )
    }

    static func commentsLabel(_ count: Int) -> String {
        String(
            localized: "feed.post.stat.comments",
            defaultValue: "\(count) \(count == 1 ? "comment" : "comments")",
            bundle: .main
        )
    }

    static func repostsLabel(_ count: Int) -> String {
        String(
            localized: "feed.post.stat.reposts",
            defaultValue: "\(count) \(count == 1 ? "repost" : "reposts")",
            bundle: .main
        )
    }
}
