import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le média cité d'une bulle de rivière (#8283)

/// **Ce que la citation d'une bulle de rivière montre de son média** — la face
/// élue par la règle partagée (`QuotedReplyPresentation.mediaFace(for:)`,
/// qui tranche la protection d'abord) et la citation qui sait rouvrir la pièce.
///
/// Résolu par la PROJECTION (`RiverConversationMapping`), jamais par la vue :
/// `nil` ⇒ la citation reste la ligne de texte d'avant.
struct RiverQuotedMedia: Equatable {
    let face: QuotedReplyPresentation.MediaFace
    let reference: ReplyReference

    /// La face d'une citation AFFICHÉE, ou `nil` : texte seul, story, humeur,
    /// média protégé.
    static func resolve(_ reference: ReplyReference) -> RiverQuotedMedia? {
        QuotedReplyPresentation.mediaFace(for: reference).map { RiverQuotedMedia(face: $0, reference: reference) }
    }
}

/// **La zone média de la citation d'une rivière** — les MÊMES atomes que les
/// autres modes (#8230) : la vignette servie, le poster d'une vidéo sans
/// vignette (`QuotedVideoPoster`), l'aperçu d'un vocal (`QuotedAudioPreview`).
///
/// Le geste n'est pas posé ici : c'est `RiverBubbleView` qui décide d'ouvrir le
/// plein écran ou de retomber sur le saut au message cité (une zone = un site).
struct RiverQuotedMediaFace: View, Equatable {
    let media: RiverQuotedMedia
    let tint: Color
    let audioTint: Color
    /// Vrai quand toucher la zone ouvre vraiment le plein écran : l'aperçu
    /// vocal ne promet la lecture que dans ce cas (loi 4).
    let isArmed: Bool

    private var reference: ReplyReference { media.reference }

    /// Une image ou une vidéo citée prend la largeur d'une scène citée et SON
    /// rapport d'aspect, exactement comme dans Focal et Script.
    private var size: CGSize {
        QuotedReplyPresentation.mediaThumbnailSize(for: reference) ?? CGSize(width: 36, height: 36)
    }

    private var radius: CGFloat {
        QuotedReplyPresentation.mediaThumbnailSize(for: reference) == nil ? 6 : MeeshyRadius.lg
    }

    var body: some View {
        switch media.face {
        case .thumbnail:
            if let url = reference.attachmentThumbnailUrl {
                CachedAsyncImage(url: url, thumbHash: QuotedReplyPresentation.thumbHash(for: reference)) {
                    RoundedRectangle(cornerRadius: radius).fill(tint.opacity(0.18))
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: radius))
                .overlay { playBadge }
            }
        case .videoPoster:
            if let attachment = reference.quotedAttachment {
                QuotedVideoPoster(
                    attachment: attachment,
                    size: size,
                    cornerRadius: radius,
                    placeholder: tint.opacity(0.18)
                )
                .overlay { playBadge }
            }
        case .audio:
            QuotedAudioPreview(seed: reference.messageId, tint: audioTint, showsPlayGlyph: isArmed)
        }
    }

    /// Le bouton play d'une piste temporelle, par le GENRE résolu (le MIME
    /// comme le rawValue court) — le même glyphe que les autres modes.
    @ViewBuilder
    private var playBadge: some View {
        if BubbleQuotedReply.resolveAttachmentKind(reference.attachmentType)?.hasTimebasedTrack == true {
            Image(systemName: "play.circle.fill")
                .font(MeeshyFont.relative(16, weight: .bold))
                .foregroundStyle(.white)
                .shadow(radius: 2)
                .accessibilityHidden(true)
        }
    }
}
