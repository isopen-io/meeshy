import SwiftUI
import MeeshySDK
import MeeshyUI

/// Renders a feed POST that reposts a STORY: only the embedded story canvas
/// (read-only, muted).
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
///
/// **Depuis le 2026-09-05, sa lecture obéit au viewport** (directive porteur :
/// « repartage ou non, les scènes sont comme les vidéos »). Cette cellule était
/// la seule surface du fil à jouer INCONDITIONNELLEMENT : `isPaused` restait à
/// `false`, sans élection ni call-awareness, si bien que toutes les stories
/// repartagées visibles décodaient en même temps — pendant qu'une scène COMPOSÉE
/// à côté restait gelée. `isActive`, élu par `ReelFeedAutoplayCoordinator` et
/// câblé par `StoryRepostEmbedContainer`, met les deux sous la même loi.
struct StoryRepostEmbedCell: View {
    let post: FeedPost
    let preferredContentLanguages: [String]?
    /// Élu par le coordinateur du fil. `false` — le défaut — laisse la scène en
    /// pause : une surface montée sans coordinateur (aperçu, hôte de test) ne
    /// doit pas se mettre à jouer toute seule.
    var isActive: Bool = false

    var body: some View {
        if let repost = post.repost {
            StoryReaderRepresentable(
                repost: repost,
                preferredContentLanguages: preferredContentLanguages,
                mute: true,
                isPaused: !isActive
            )
            .aspectRatio(9.0 / 16.0, contentMode: .fit)
            // Cap the embed width so on iPad it doesn't stretch into
            // a giant vertical column when the feed sits in a wide pane.
            .frame(maxWidth: 420)
            .frame(maxWidth: .infinity, alignment: .center)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .reportReelFrame(id: post.id, kind: .scene)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(String(localized: "story.repost.by", defaultValue: "Story de", bundle: .main)) \(repost.author)")
            .accessibilityHint(String(localized: "story.repost.open.hint", defaultValue: "Appuyez deux fois pour ouvrir en plein écran", bundle: .main))
            .accessibilityAddTraits(.isButton)
        }
    }
}

extension StoryRepostEmbedCell: Equatable {
    /// Ne se re-rend que si son élection ou la story citée change — le churn
    /// d'élection des autres cellules du fil la laisse intacte.
    nonisolated static func == (lhs: StoryRepostEmbedCell, rhs: StoryRepostEmbedCell) -> Bool {
        lhs.post.id == rhs.post.id
            && lhs.isActive == rhs.isActive
            && lhs.preferredContentLanguages == rhs.preferredContentLanguages
            && lhs.post.repost?.id == rhs.post.repost?.id
            && lhs.post.repost?.content == rhs.post.repost?.content
    }
}
