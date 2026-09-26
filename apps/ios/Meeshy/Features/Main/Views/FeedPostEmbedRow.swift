import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from FeedPostCard.swift

/// Embed vidéo (YouTube) détecté dans le contenu d'un post : player façade
/// (vignette → lecture inline), hors du geste d'ouverture du post.
///
/// Isolée de `FeedPostCard` pour que les deux balayages `NSDataDetector`
/// (résolution vidéo + première URL trackée) ne tournent qu'à la création de
/// cette ligne : `.equatable()` court-circuite les re-renders de la carte
/// parente déclenchés par ses propres `@State` (animation du cœur, panneau de
/// traduction, feuilles…) qui ne changent ni le contenu ni les liens trackés.
struct FeedPostEmbedRow: View {
    let content: String
    let accentHex: String
    let trackedLinks: [String: String]

    /// Vidéo embeddable (YouTube) détectée dans le contenu affiché.
    private var embeddedVideo: EmbeddedVideo? {
        EmbeddableVideoResolver.resolve(in: content)
    }

    /// Destination trackée `/l/<token>` pour la façade vidéo, dérivée de la
    /// première URL du contenu via `trackedLinks`. `nil` → watchURL.
    private var embedTrackedURL: URL? {
        guard let raw = LinkPreviewFetcher.firstURL(in: content),
              let token = trackedLinks[raw] else { return nil }
        return URL(string: "https://meeshy.me/l/\(token)")
    }

    var body: some View {
        if let embeddedVideo {
            VideoEmbedContainer(video: embeddedVideo, accent: Color(hex: accentHex), trackedURL: embedTrackedURL)
                .padding(.top, 8)
        }
    }
}

// MARK: - Equatable (évite de rejouer NSDataDetector quand contenu/liens sont inchangés)
extension FeedPostEmbedRow: Equatable {
    nonisolated static func == (lhs: FeedPostEmbedRow, rhs: FeedPostEmbedRow) -> Bool {
        lhs.content == rhs.content
            && lhs.accentHex == rhs.accentHex
            && lhs.trackedLinks == rhs.trackedLinks
    }
}
