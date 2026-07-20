import Foundation

/// VoiceOver labels for the like / comment / repost stat controls shared by
/// `TextPostCell` and `MediaPostCell`. The visible button title shows only the
/// bare count (e.g. "5"); without these labels VoiceOver announces "5, button"
/// with no indication of what the number means.
///
/// Singular/plural agreement uses an explicit `one` / `other` key split rather
/// than inline Automatic Grammar Agreement (`^[…](inflect: true)`): that markup
/// is only resolved when the string is a String Catalog entry processed at build
/// time, so as a raw inline `defaultValue:` it is returned **literally**
/// (VoiceOver would announce "^[5 like](inflect: true)"). The two keys keep the
/// label fully localizable — translators can override `…one` / `…other` per
/// language in the catalog.
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
