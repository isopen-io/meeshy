import SwiftUI
import MeeshySDK
import MeeshyUI

// Extrait de `BubbleStandardLayout.swift` (#8099) — l'hôte est hors budget, et
// la carte de conversation ne pouvait s'y ajouter qu'après en avoir retiré.

/// Ce que la bulle rend SOUS le texte pour sa première URL (déjà précalculée
/// par `BubbleContentBuilder`, plus de `NSDataDetector` ici) :
/// - une vidéo intégrable → sa façade de lecteur ;
/// - une conversation Meeshy → la carte qui fait rejoindre, quitter ou ouvrir ;
/// - toute autre URL → l'aperçu OpenGraph.
struct BubbleLinkEmbed: View {
    let text: BubbleContent.Text
    let accentColor: String
    let isDark: Bool
    @Environment(\.mountsLinkEmbeds) private var mountsLinkEmbeds

    var body: some View {
        if mountsLinkEmbeds {
            embed
        }
    }

    @ViewBuilder
    private var embed: some View {
        if let video = text.embeddedVideo {
            VideoEmbedContainer(video: video, accent: Color(hex: accentColor), trackedURL: text.embedTrackedURL)
                .padding(.top, MeeshySpacing.xs)
        } else if let url = text.firstLinkURL {
            Group {
                if let target = text.conversationCardTarget {
                    ConversationLinkCard(target: target, urlString: url, fallbackAccent: accentColor, isDark: isDark)
                        .id(target)
                } else {
                    LinkPreviewCard(urlString: url, accentColor: accentColor, isDark: isDark)
                }
            }
            .padding(.top, MeeshySpacing.xs)
        }
    }
}

private struct MountsLinkEmbedsKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    /// Faux là où le texte rendu vient d'un déchiffrement SUR L'APPAREIL
    /// (#11232, F3) : une carte de lien interrogerait un site tiers (OpenGraph)
    /// ou le serveur (`ConversationCardService.refresh`) avec une URL que seul
    /// l'appareil a lue. Posée par l'aperçu d'appui long, par message.
    var mountsLinkEmbeds: Bool {
        get { self[MountsLinkEmbedsKey.self] }
        set { self[MountsLinkEmbedsKey.self] = newValue }
    }
}
