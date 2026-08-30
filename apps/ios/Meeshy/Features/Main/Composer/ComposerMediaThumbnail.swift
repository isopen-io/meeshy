import SwiftUI
import MeeshySDK
import MeeshyUI
import UIKit
import ImageIO

// **Extraite de `ComposerDocumentSurface.swift` le 2026-08-30** — un type par
// fichier (directive de budget 2026-08-28).
//
// Cette vignette est un ATOME : elle prend un média, un côté, deux drapeaux, et
// rend. Elle ne connaît ni la surface qui la monte ni le composer — c'est
// exactement ce qui la rendait déplaçable sans rien changer d'autre.

/// Interne depuis #4070 : la barre haute, qui la monte, vit désormais dans
/// `ComposerTopBar`. Elle n'a pas été DÉPLACÉE avec elle — la bande de médias
/// d'une slide la réemploie aussi, et la suivre l'aurait rendue privée à une
/// barre plutôt que partagée par ce qui montre des médias.
struct ComposerMediaThumbnail: View {
    let media: ComposerDocumentMedia
    /// **Le rail de la barre haute est PLUS PETIT que la bande d'origine.** Une
    /// vignette de 64 pt y volerait la moitié de la rangée qui porte aussi la
    /// fermeture ; 40 pt tient la ligne sans descendre sous la cible tactile,
    /// qui reste servie par la zone de tap du chip entier (44 pt avec son
    /// espacement).
    var side: CGFloat = 64
    /// **La slide qu'on REGARDE porte un anneau.** Sans lui, le rail dit ce que
    /// le post contient mais jamais où l'on est : taper une vignette changerait
    /// la scène sans que rien, dans le rail, ne le confirme — un contrôle dont
    /// l'effet est ailleurs et invisible ici.
    var isSelected: Bool = false
    /// **Le ✕ ne se peint que sur le chip SÉLECTIONNÉ, et c'est un correctif de
    /// PIXEL, pas de goût.** À 64 pt (l'ancienne bande basse) le ✕ occupait un
    /// coin ; à 40 pt il mange le quart du chip, et le test au simulateur l'a
    /// montré sans appel : viser une vignette pour NAVIGUER la supprime. Le
    /// rail deviendrait un champ de mines — le geste le plus fréquent
    /// déclenchant le plus destructeur.
    ///
    /// Sélectionner reste donc à UN geste sur tout chip ; supprimer en demande
    /// deux (sélectionner, puis ✕), ce qui est l'ordre juste pour une action
    /// irréversible.
    var showsRemove: Bool = true
    let onRemove: () -> Void

    @State private var preview: UIImage?

    private var isImage: Bool { media.mimeType.hasPrefix("image") }
    private var isVideo: Bool { media.mimeType.hasPrefix("video") }
    private var isAudio: Bool { media.mimeType.hasPrefix("audio") }

    private var symbole: String {
        if isVideo { return "play.rectangle.fill" }
        if isImage { return "photo" }
        if isAudio { return "waveform" }
        return "doc.fill"
    }

    private var corner: CGFloat { side >= 56 ? 12 : 8 }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            base
                .frame(width: side, height: side)
                .clipShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: corner, style: .continuous)
                        .strokeBorder(.white, lineWidth: isSelected ? 2 : 0)
                )
            if showsRemove {
                Button(action: onRemove) {
                    Image(systemName: "xmark.circle.fill")
                        .font(side >= 56 ? .body : .caption)
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, .black.opacity(0.55))
                }
                .padding(side >= 56 ? 4 : 2)
                .accessibilityLabel(Text(String(
                    localized: "composer.a11y.removeAttachment",
                    defaultValue: "Retirer la pièce jointe", bundle: .main
                )))
            }
        }
        .task(id: media.url) {
            guard isImage else { return }
            let url = media.url
            preview = await Task.detached(priority: .utility) {
                ComposerThumbnailDecoder.thumbnail(url: url, maxPixelSize: 256)
            }.value
        }
    }

    @ViewBuilder
    private var base: some View {
        if let preview {
            Image(uiImage: preview)
                .resizable()
                .scaledToFill()
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: corner, style: .continuous)
                    .fill(.ultraThinMaterial)
                // **Le son a son icône (#4052)** : il devient la BANDE-SON de la
                // scène, et un fond audio ne peint aucune pastille sur le canvas
                // (par construction — « pas de UI pill draggable »). Ce chip est
                // donc le SEUL témoin à l'écran qu'un post a une bande-son ;
                // `doc.fill` n'en disait rien.
                Image(systemName: symbole)
                    .font(side >= 56 ? .title3 : .footnote)
                    .symbolRenderingMode(.hierarchical)
                    .foregroundColor(MeeshyColors.textSecondary(isDark: true))
            }
        }
    }
}

// **Le décodeur suit la vignette** — il était `private` dans le fichier
// d'origine, donc invisible dès qu'elle en est sortie. C'est le piège d'un
// découpage par type : la visibilité au niveau FICHIER ne survit pas au
// déplacement, et le compilateur ne le dit qu'au site d'appel, jamais au site
// de déclaration.
//
// Il perd son `private` en changeant de maison : `nonisolated enum`, visible du
// module, mais son seul appelant reste cette vignette.
/// **Décodage NONISOLÉ d'une vignette locale, pour tourner hors du main thread.**
///
/// La jumelle `AttachmentPreparationService.downsampledPreview(from:)` est
/// `@MainActor` (elle sert la zone d'attachement du fil, sur `Data` déjà en
/// mémoire) : inappelable depuis une tâche détachée. Ici, même passe ImageIO,
/// mais depuis l'URL — `CGImageSourceCreateWithURL` lit paresseusement, sans
/// jamais charger le fichier entier en mémoire, exactement ce qu'il faut pour
/// une miniature de 256 px issue d'une photo pleine résolution.
nonisolated enum ComposerThumbnailDecoder {
    static func thumbnail(url: URL, maxPixelSize: CGFloat) -> UIImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: false
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
}
