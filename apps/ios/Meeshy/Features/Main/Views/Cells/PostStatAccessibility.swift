import Foundation

/// VoiceOver labels for the like / comment / repost stat controls shared by
/// `TextPostCell` and `MediaPostCell`. The visible button title shows only the
/// bare count (e.g. "5"); without these labels VoiceOver announces "5, button"
/// with no indication of what the number means.
///
/// Singular/plural is selected explicitly per count and routed through
/// `String(localized:)` so each form stays localizable. (Automatic Grammar
/// Agreement `^[…](inflect: true)` only resolves when the value is loaded from a
/// compiled string catalog; with a bare inline `defaultValue` and no catalog
/// entry Foundation returns the markup verbatim — so an explicit form is used.)
enum PostStatAccessibility {
    static func likesLabel(_ count: Int) -> String {
        count == 1
            ? String(localized: "feed.post.stat.likes.one", defaultValue: "1 like", bundle: .main)
            : String(localized: "feed.post.stat.likes.other", defaultValue: "\(count) likes", bundle: .main)
    }

    static func commentsLabel(_ count: Int) -> String {
        count == 1
            ? String(localized: "feed.post.stat.comments.one", defaultValue: "1 comment", bundle: .main)
            : String(localized: "feed.post.stat.comments.other", defaultValue: "\(count) comments", bundle: .main)
    }

    static func repostsLabel(_ count: Int) -> String {
        count == 1
            ? String(localized: "feed.post.stat.reposts.one", defaultValue: "1 repost", bundle: .main)
            : String(localized: "feed.post.stat.reposts.other", defaultValue: "\(count) reposts", bundle: .main)
    }
}
