import SwiftUI
import MeeshySDK
import MeeshyUI

/// Renders a feed POST that reposts a STORY: only the embedded story canvas
/// (read-only, muted by default for autoplay).
///
/// Used by `FeedPostCard` when `post.type == "POST"` AND
/// `post.repost?.type == "STORY"`.
///
/// The outer `FeedPostCard` already renders the post's own text
/// (`effectiveContent`, prism-translated) above this cell and the repost
/// attribution ("a republié de @handle") inline in the author header — so this
/// cell deliberately renders neither, to avoid the duplicated content line and
/// the redundant "Reposté de @handle" block (composer-based-story-repost MVP
/// kept both, which doubled the caption when the post text equals the story
/// caption). The full repost chain is still preserved server-side via
/// `RepostContent.originalRepostOfId`.
struct StoryRepostEmbedCell: View {
    let post: FeedPost
    let preferredContentLanguages: [String]?

    var body: some View {
        if let repost = post.repost {
            StoryReaderRepresentable(
                repost: repost,
                preferredContentLanguages: preferredContentLanguages,
                mute: true
            )
            .aspectRatio(9.0 / 16.0, contentMode: .fit)
            // Cap the embed width so on iPad it doesn't stretch into
            // a giant vertical column when the feed sits in a wide pane.
            .frame(maxWidth: 420)
            .frame(maxWidth: .infinity, alignment: .center)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(String(localized: "story.repost.by", defaultValue: "Story by", bundle: .main)) \(repost.author)")
            .accessibilityHint(String(localized: "story.repost.open.hint", defaultValue: "Double tap to open in fullscreen", bundle: .main))
            .accessibilityAddTraits(.isButton)
        }
    }
}
