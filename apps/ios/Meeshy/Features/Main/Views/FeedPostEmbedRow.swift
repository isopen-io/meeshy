import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from FeedPostCard.swift

/// Embed vidéo (YouTube) détecté dans le contenu d'un post : player façade
/// (vignette → lecture inline), hors du geste d'ouverture du post — sinon la
/// carte vivante du premier post, réel, story ou humeur Meeshy que le texte
/// cite (#19332), à la même place. Montée par le fil ET par le détail.
///
/// Isolée de `FeedPostCard` pour que les balayages `NSDataDetector`
/// (résolution vidéo, liens du texte) ne tournent qu'à la création de
/// cette ligne : `.equatable()` court-circuite les re-renders de la carte
/// parente déclenchés par ses propres `@State` (animation du cœur, panneau de
/// traduction, feuilles…) qui ne changent ni le contenu ni les liens trackés.
struct FeedPostEmbedRow: View {
    let content: String
    let accentHex: String
    let trackedLinks: [String: String]
    /// Le post qui porte ce texte : il ne se cite jamais lui-même.
    let postId: String?
    @Environment(\.colorScheme) private var colorScheme

    /// Vidéo embeddable (YouTube) détectée dans le contenu affiché.
    private var embeddedVideo: EmbeddedVideo? {
        EmbeddableVideoResolver.resolve(in: content)
    }

    /// Le premier lien de CONTENU Meeshy du texte affiché — jamais une carte
    /// dans une carte : la carte de contenu ne déplie pas les liens de son texte.
    private var contentLink: ContentLinkMatch? {
        ContentLinkMatch.first(among: LinkPreviewFetcher.urls(in: content), excludingPostId: postId)
    }

    /// Destination trackée `/l/<token>` pour la façade vidéo, dérivée de la
    /// première URL du contenu via `trackedLinks`. `nil` → watchURL.
    private var embedTrackedURL: URL? {
        guard let raw = LinkPreviewFetcher.firstURL(in: content),
              let token = trackedLinks[raw] else { return nil }
        return TrackedLink.redirectURL(token: token)
    }

    var body: some View {
        if let embeddedVideo {
            VideoEmbedContainer(video: embeddedVideo, accent: Color(hex: accentHex), trackedURL: embedTrackedURL)
                .padding(.top, MeeshySpacing.sm)
        } else if let contentLink {
            ContentLinkCard(match: contentLink, accentColor: accentHex, isDark: colorScheme == .dark,
                            fallback: .nothing, excludedPostId: postId)
                .id(contentLink)
                .padding(.top, MeeshySpacing.sm)
        }
    }
}

// MARK: - Equatable (évite de rejouer NSDataDetector quand contenu/liens sont inchangés)
extension FeedPostEmbedRow: Equatable {
    nonisolated static func == (lhs: FeedPostEmbedRow, rhs: FeedPostEmbedRow) -> Bool {
        lhs.content == rhs.content
            && lhs.accentHex == rhs.accentHex
            && lhs.trackedLinks == rhs.trackedLinks
            && lhs.postId == rhs.postId
    }
}
