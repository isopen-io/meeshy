import Foundation

/// VoiceOver labels for the like / comment / repost stat controls shared by
/// `TextPostCell` and `MediaPostCell`. The visible button title shows only the
/// bare count (e.g. "5"); without these labels VoiceOver announces "5, button"
/// with no indication of what the number means. Automatic Grammar Agreement
/// (`^[…](inflect: true)`) yields the singular/plural form at runtime in the
/// development language (en), with no `.stringsdict` required.
enum PostStatAccessibility {
    static func likesLabel(_ count: Int) -> String {
        String(
            localized: "feed.post.stat.likes",
            defaultValue: "^[\(count) like](inflect: true)",
            bundle: .main
        )
    }

    static func commentsLabel(_ count: Int) -> String {
        String(
            localized: "feed.post.stat.comments",
            defaultValue: "^[\(count) comment](inflect: true)",
            bundle: .main
        )
    }

    static func repostsLabel(_ count: Int) -> String {
        String(
            localized: "feed.post.stat.reposts",
            defaultValue: "^[\(count) repost](inflect: true)",
            bundle: .main
        )
    }
}
