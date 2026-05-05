import SwiftUI
import MeeshySDK
import MeeshyUI

/// Renders a feed POST that reposts a STORY: the outer post's text (if any)
/// plus the embedded story canvas (read-only, muted by default for autoplay).
///
/// Used by `FeedPostCard` when `post.type == "POST"` AND
/// `post.repost?.type == "STORY"`.
///
/// Phase C.3 — composer-based-story-repost. Double-attribution (Original par @x)
/// is handled by C.4 in this same view; for the MVP only the intermediate
/// re-poster is shown ("Reposté de @intermediate").
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

    @ViewBuilder
    private var attributionHeader: some View {
        if let repost = post.repost {
            let handle = repost.authorUsername ?? repost.author
            Text("Reposté de @\(handle)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.bottom, 4)
        }
    }
}
