import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le bloc média de la carte (contrat § 4.1) : la vignette recadrée en
/// remplissage, ThumbHash puis couleur d'accent pendant le chargement ; le ▶
/// et la durée d'une vidéo ; la pastille du type en haut, « +N » quand le
/// contenu porte d'autres médias. Décoratif pour VoiceOver : la carte se dit
/// en une phrase.
struct ContentLinkCardMedia: View, Equatable {
    let media: ContentCard.Media
    let kind: PostType
    let extraCount: Int
    let accentColor: String
    /// Le diaporama pose sa propre pastille, une fois pour toutes ses pages.
    var showsKindPill: Bool = true
    /// La hauteur commune des pages d'un diaporama.
    var fixedHeight: CGFloat? = nil

    private var height: CGFloat {
        fixedHeight ?? ContentLinkCardLayout.mediaHeight(aspectRatio: media.aspectRatio)
    }

    var body: some View {
        Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .overlay { image }
            .overlay {
                if media.kind == .video { ContentLinkCardPlayGlyph() }
            }
            .overlay(alignment: .topLeading) {
                if showsKindPill {
                    ContentLinkCardKindPill(kind: kind, accentColor: accentColor, onMedia: true)
                        .padding(MeeshySpacing.sm)
                }
            }
            .overlay(alignment: .topTrailing) {
                if extraCount > 0 {
                    ContentLinkCardChip(label: "+" + CompactCountLabel.text(extraCount))
                        .padding(MeeshySpacing.sm)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if media.kind == .video, let seconds = media.durationSeconds {
                    ContentLinkCardChip(label: MediaFormat.duration(seconds))
                        .padding(MeeshySpacing.sm)
                }
            }
            .clipped()
            .accessibilityHidden(true)
    }

    private var image: some View {
        ProgressiveCachedImage(
            thumbHash: media.thumbHash,
            thumbnailUrl: nil,
            fullUrl: media.imageURL,
            autoLoad: true,
            targetSize: CGSize(width: ContentLinkCardLayout.maxWidth, height: height)
        ) {
            Color(hex: accentColor).opacity(MeeshyOpacity.light)
        }
        .aspectRatio(contentMode: .fill)
    }
}

/// Le signe lecture d'une vidéo ou d'une scène qui bouge : on la joue en
/// l'ouvrant.
struct ContentLinkCardPlayGlyph: View {
    var body: some View {
        Image(systemName: "play.fill")
            .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .bold))
            .foregroundStyle(Color.white)
            .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
            .background(Circle().fill(Color.black.opacity(MeeshyOpacity.strong)))
            .accessibilityHidden(true)
    }
}

/// Une étiquette posée sur l'image : durée, « +N », « 2/5 ».
struct ContentLinkCardChip: View {
    let label: String

    var body: some View {
        Text(verbatim: label)
            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold, design: .monospaced))
            .foregroundStyle(Color.white)
            .padding(.horizontal, MeeshySpacing.xsPlus)
            .padding(.vertical, MeeshySpacing.xxs)
            .background(Capsule().fill(Color.black.opacity(MeeshyOpacity.strong)))
            .accessibilityHidden(true)
    }
}
