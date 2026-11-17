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

    private var height: CGFloat {
        ContentLinkCardLayout.mediaHeight(aspectRatio: media.aspectRatio)
    }

    var body: some View {
        Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .overlay { image }
            .overlay {
                if media.kind == .video { playGlyph }
            }
            .overlay(alignment: .topLeading) {
                ContentLinkCardKindPill(kind: kind, accentColor: accentColor, onMedia: true)
                    .padding(MeeshySpacing.sm)
            }
            .overlay(alignment: .topTrailing) {
                if extraCount > 0 {
                    chip("+" + CompactCountLabel.text(extraCount))
                        .padding(MeeshySpacing.sm)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if media.kind == .video, let seconds = media.durationSeconds {
                    chip(MediaFormat.duration(seconds))
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

    private var playGlyph: some View {
        Image(systemName: "play.fill")
            .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .bold))
            .foregroundStyle(Color.white)
            .frame(width: MeeshyControlSize.regular, height: MeeshyControlSize.regular)
            .background(Circle().fill(Color.black.opacity(MeeshyOpacity.strong)))
    }

    private func chip(_ label: String) -> some View {
        Text(verbatim: label)
            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold, design: .monospaced))
            .foregroundStyle(Color.white)
            .padding(.horizontal, MeeshySpacing.xsPlus)
            .padding(.vertical, MeeshySpacing.xxs)
            .background(Capsule().fill(Color.black.opacity(MeeshyOpacity.strong)))
    }
}
