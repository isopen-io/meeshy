import SwiftUI
import ImageIO
import MeeshySDK
import MeeshyUI

/// **« Ce qui part » quand une autre app remet des fichiers** (V1, V9).
///
/// L'aperçu de chaque pièce dans l'ordre d'envoi, numérotée ; la croix retire,
/// « Avancer » et « Reculer » réordonnent sans glisser (actions d'accessibilité).
/// Ce qui dépasse les plafonds communs (D10) est marqué : le bouton Envoyer dit
/// quoi faire, et « Retirer les N derniers » le fait d'un geste.
///
/// Les vignettes sont décodées RÉDUITES (ImageIO, 160 px) depuis le fichier
/// copié : l'extension de partage vit sous un plafond mémoire, et une photo de
/// 48 Mpx décodée entière le crèverait à elle seule.
struct ShareIncomingStrip: View {
    let media: [ShareIncomingMedia]
    /// Les pièces au-delà de ce rang dépassent les plafonds.
    let fittingCount: Int
    let accentColor: String
    let isDark: Bool
    let onRemove: (String) -> Void
    let onMove: (String, Int) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(Array(media.enumerated()), id: \.element.id) { index, piece in
                    tile(piece, index: index)
                }
            }
            .padding(.vertical, MeeshySpacing.xs)
        }
    }

    private func tile(_ piece: ShareIncomingMedia, index: Int) -> some View {
        let isOver = index >= fittingCount
        return ZStack(alignment: .topTrailing) {
            ShareIncomingThumbnail(piece: piece, accentColor: accentColor)
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .stroke(isOver ? MeeshyColors.error : Color.clear, lineWidth: 2)
                )
                .overlay(alignment: .bottomLeading) {
                    Text("\(index + 1)")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, MeeshySpacing.xs)
                        .background(Capsule().fill(Color.black.opacity(0.55)))
                        .padding(MeeshySpacing.xxs)
                        .accessibilityHidden(true)
                }
                .opacity(isOver ? 0.6 : 1)
            if media.count > 1 {
                Button { onRemove(piece.id) } label: {
                    Image(systemName: "xmark.circle.fill")
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, Color.black.opacity(0.6))
                        .font(.title3)
                        .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget, alignment: .topTrailing)
                }
                .buttonStyle(.plain)
                .offset(x: MeeshySpacing.xs, y: -MeeshySpacing.xs)
                .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel(piece, index: index, isOver: isOver))
        .accessibilityAction(named: Text(ShareSheetCopy.moveForward)) { onMove(piece.id, -1) }
        .accessibilityAction(named: Text(ShareSheetCopy.moveBackward)) { onMove(piece.id, 1) }
        .accessibilityAction(named: Text(ShareSheetCopy.remove)) { onRemove(piece.id) }
    }

    private func spokenLabel(_ piece: ShareIncomingMedia, index: Int, isOver: Bool) -> String {
        var parts = [ShareSheetCopy.pieceNumber(index + 1), Self.kindLabel(piece.kind)]
        if isOver { parts.append(ShareSheetCopy.overLimit) }
        return parts.joined(separator: ", ")
    }

    static func kindLabel(_ kind: AttachmentKind) -> String {
        switch kind {
        case .image: return String(localized: "forward.preview.image", defaultValue: "Photo", bundle: .meeshyShare)
        case .video: return String(localized: "forward.preview.video", defaultValue: "Vidéo", bundle: .meeshyShare)
        case .audio: return String(localized: "forward.preview.audio", defaultValue: "Audio", bundle: .meeshyShare)
        default: return String(localized: "forward.preview.file", defaultValue: "Fichier", bundle: .meeshyShare)
        }
    }
}

/// La vignette d'une pièce copiée : réduite pour une image, un glyphe sinon.
struct ShareIncomingThumbnail: View {
    let piece: ShareIncomingMedia
    let accentColor: String

    @State private var image: UIImage?

    var body: some View {
        ZStack {
            Color(hex: accentColor).opacity(MeeshyOpacity.light)
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
            } else {
                Image(systemName: Self.symbol(for: piece.kind))
                    .font(.title2)
                    .foregroundColor(Color(hex: accentColor))
            }
        }
        .task(id: piece.id) {
            guard piece.kind == .image, let url = piece.fileURL else { return }
            image = await Self.downsampled(url, maxPixel: 160)
        }
    }

    static func symbol(for kind: AttachmentKind) -> String {
        switch kind {
        case .image: return "photo"
        case .video: return "video.fill"
        case .audio: return "waveform"
        default: return "doc.fill"
        }
    }

    /// ImageIO réduit SANS décoder l'image entière — c'est ce qui tient le
    /// plafond mémoire de l'extension.
    nonisolated static func downsampled(_ url: URL, maxPixel: Int) async -> UIImage? {
        await Task.detached(priority: .userInitiated) {
            guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceShouldCacheImmediately: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixel,
            ]
            guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
            return UIImage(cgImage: thumbnail)
        }.value
    }
}
