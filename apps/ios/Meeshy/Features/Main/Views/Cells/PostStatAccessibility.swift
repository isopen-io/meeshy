import Foundation

/// VoiceOver labels for the like / comment / repost stat controls shared by
/// `TextPostCell` and `MediaPostCell`. The visible button title shows only the
/// bare count (e.g. "5"); without these labels VoiceOver announces "5, button"
/// with no indication of what the number means.
///
/// The default value carries the explicit singular/plural form in the
/// development language (en). Automatic Grammar Agreement (`^[…](inflect: true)`)
/// is intentionally NOT used here: its inline markup is only resolved when the
/// key exists in the compiled string catalog, and these keys are not present —
/// so it shipped the raw `^[…](inflect: true)` markup to VoiceOver at runtime.
/// Localized plural agreement remains available per-language via the catalog
/// entries keyed below.
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
