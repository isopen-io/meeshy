import SwiftUI
import MeeshySDK
import MeeshyUI

/// Renders a feed POST that reposts a STORY: the outer post's text (if any)
/// plus the embedded story canvas (read-only, muted by default for autoplay).
///
/// Used by `FeedPostCard` when `post.type == "POST"` AND
/// `post.repost?.type == "STORY"`.
///
/// Phase C.4 — composer-based-story-repost. The attribution header is
/// intentionally single-level for the MVP: only the immediate re-poster is
/// displayed ("Reposté de @intermediate"). The full repost chain is
/// preserved server-side via `RepostContent.originalRepostOfId`; a future
/// "trace lineage" feature can fetch the upstream authors on demand without
/// changing this cell's layout.
struct StoryRepostEmbedCell: View {
    let post: FeedPost
    let preferredContentLanguages: [String]?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            attributionHeader

            if !post.content.isEmpty {
                Text(post.content)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let repost = post.repost {
                StoryCanvasReaderView(
                    repost: repost,
                    preferredContentLanguages: preferredContentLanguages,
                    mute: true
                )
                .aspectRatio(9.0 / 16.0, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Story de \(repost.author)")
                .accessibilityHint("Appuyez deux fois pour ouvrir en plein écran")
                .accessibilityAddTraits(.isButton)
            }
        }
    }

    /// Single-level attribution for the MVP: shows only the immediate
    /// re-poster's handle. Falls back to the display name (`author`) when
    /// the username is missing — defensive only; backend always provides
    /// `authorUsername` for non-anonymous posts.
    @ViewBuilder
    private var attributionHeader: some View {
        if let repost = post.repost {
            let handle = repost.authorUsername ?? repost.author
            Text("Reposté de @\(handle)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.bottom, 4)
                .accessibilityLabel("Reposté de \(handle)")
        }
    }
}
