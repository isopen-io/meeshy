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

    var body: some View {
        if let video = text.embeddedVideo {
            VideoEmbedContainer(video: video, accent: Color(hex: accentColor), trackedURL: text.embedTrackedURL)
                .padding(.top, 4)
        } else if let url = text.firstLinkURL {
            Group {
                if let target = text.conversationCardTarget {
                    ConversationLinkCard(target: target, urlString: url, fallbackAccent: accentColor, isDark: isDark)
                        .id(target)
                } else {
                    LinkPreviewCard(urlString: url, accentColor: accentColor, isDark: isDark)
                }
            }
            .padding(.top, 4)
        }
    }
}
