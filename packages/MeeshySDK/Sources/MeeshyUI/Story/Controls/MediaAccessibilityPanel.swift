import SwiftUI
import MeeshySDK

/// Panneau accessibilité d'UN média du composer — texte alternatif
/// uniquement. Ouvert INLINE sous sa row par
/// `ComposerToolPanelHost.mediaItemRow` : ce n'est pas un second panneau
/// d'inspection média, juste l'extension de celui qui existe déjà — l'unique
/// point d'entrée d'édition média reste `onOpenMediaCrop` pour le
/// recadrage/filtres, ce panneau ne couvre que le champ d'accessibilité
/// qu'aucune UI ne collectait.
///
/// `allowSoundExtraction` n'a PAS sa place ici : c'est un flag UNIQUE sur le
/// post entier (`Post.allowSoundExtraction`, `schema.prisma:3125`), pas un
/// champ par média — son interrupteur vit une seule fois, dans
/// `ComposerToolPanelHost.mediaPanel` (cf. `SoundExtractionToggle`).
struct MediaAccessibilityPanel: View {
    let mediaId: String
    let altText: String
    let onAltCommitted: (String) -> Void
    /// La LÉGENDE du média (#4055) — collectée dans le MÊME panneau que le
    /// texte alternatif parce qu'elle a le même porteur et le même cycle de
    /// vie, et distinguée par son libellé parce qu'elle ne dit pas la même
    /// chose (`PostMediaText`).
    let captionText: String
    let onCaptionCommitted: (String) -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            MediaAltTextField(kind: .alt, text: altText, onCommit: onAltCommitted)
            MediaAltTextField(kind: .caption, text: captionText, onCommit: onCaptionCommitted)
        }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(colorScheme == .dark ? Color.white.opacity(0.05) : MeeshyColors.indigo950.opacity(0.04))
            )
    }
}
