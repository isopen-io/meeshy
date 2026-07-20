import Foundation

/// VoiceOver labels for the like / comment / repost stat controls shared by
/// `TextPostCell` and `MediaPostCell`. The visible button title shows only the
/// bare count (e.g. "5"); without these labels VoiceOver announces "5, button"
/// with no indication of what the number means.
///
/// The singular/plural form is selected in Swift and resolved through
/// `String(localized:)` on a per-form key. Inline Automatic Grammar Agreement
/// (`^[…](inflect: true)`) is deliberately NOT used here: it only resolves when
/// the string is backed by a compiled String Catalog, so an inline `defaultValue`
/// alone leaves the raw `^[…]` markup at runtime. Explicit per-form keys keep the
/// labels localizable (translators can localize each form) without depending on a
/// catalog or `.stringsdict`.
enum PostStatAccessibility {
    static func likesLabel(_ count: Int) -> String {
        count == 1
            ? String(localized: "feed.post.stat.likes.one", defaultValue: "\(count) like", bundle: .main)
            : String(localized: "feed.post.stat.likes.other", defaultValue: "\(count) likes", bundle: .main)
    }

    static func commentsLabel(_ count: Int) -> String {
        count == 1
            ? String(localized: "feed.post.stat.comments.one", defaultValue: "\(count) comment", bundle: .main)
            : String(localized: "feed.post.stat.comments.other", defaultValue: "\(count) comments", bundle: .main)
    }

    static func repostsLabel(_ count: Int) -> String {
        count == 1
            ? String(localized: "feed.post.stat.reposts.one", defaultValue: "\(count) repost", bundle: .main)
            : String(localized: "feed.post.stat.reposts.other", defaultValue: "\(count) reposts", bundle: .main)
    }
}
