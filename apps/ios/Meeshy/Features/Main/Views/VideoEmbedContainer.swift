import SwiftUI
import MeeshySDK
import MeeshyUI

/// Décision UX produit (app-side) : quelle URL ouvrir pour un embed vidéo.
/// Priorité au lien de tracking `/l/token` (capture + redirection) quand il existe,
/// sinon la `watchURL` canonique. Helper pur → testable sans SwiftUI.
enum VideoEmbedDestination {
    static func url(for video: EmbeddedVideo, trackedURL: URL?) -> URL {
        trackedURL ?? video.watchURL
    }
}

/// Façade d'aperçu vidéo (YouTube) dans les messages & posts.
///
/// On PRÉSERVE l'aperçu riche (`VideoEmbedThumbnail` : vignette 16:9 + bouton play + badge
/// provider). Seul le geste change : au tap on **ouvre la vidéo via un lien** plutôt que de
/// tenter une lecture inline en `WKWebView`.
///
/// Pourquoi pas de lecture inline : YouTube bloque l'IFrame Player embarqué par vérification
/// d'origine/referrer (erreurs 15x — `onerror:152` prouvé sur simulateur pour TOUTES les
/// vidéos, et `153` même dans Safari du simulateur). L'ancien player donnait donc une boîte
/// noire morte sans recours. Ouvrir le lien (Safari / app YouTube) lit la vidéo de façon fiable.
///
/// URL ouverte : le lien de tracking `/l/<token>` (minté côté gateway à l'envoi) quand il est
/// disponible — il capture le clic puis redirige vers la page finale ; sinon la `watchURL`
/// canonique reconstruite depuis le `videoId`.
struct VideoEmbedContainer: View {
    let video: EmbeddedVideo
    let accent: Color
    /// Lien de tracking `https://meeshy.me/l/<token>` associé à cette vidéo (capture + 302).
    /// `nil` → fallback direct sur la `watchURL` (avant câblage du tracking gateway).
    let trackedURL: URL?

    @Environment(\.openURL) private var openURL

    init(video: EmbeddedVideo, accent: Color, trackedURL: URL? = nil) {
        self.video = video
        self.accent = accent
        self.trackedURL = trackedURL
    }

    /// Destination ouverte au tap : lien tracké si fourni, sinon la watch URL canonique.
    private var destinationURL: URL { VideoEmbedDestination.url(for: video, trackedURL: trackedURL) }

    var body: some View {
        VideoEmbedThumbnail(
            thumbnailURLString: video.thumbnailURL().absoluteString,
            providerLabel: "YouTube",
            accent: accent
        ) {
            HapticFeedback.light()
            openURL(destinationURL)
        }
    }
}
