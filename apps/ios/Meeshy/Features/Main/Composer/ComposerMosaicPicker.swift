import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Comment les scènes se disposeront dans le fil** — le contrôle qui manquait
/// à l'auteur (écart composer ↔ reader, 2026-09-06).
///
/// ## Où il vit, et pourquoi là
///
/// Dans le COULOIR bas, sur la même ligne que les pastilles de slides. Les deux
/// disent la même chose à deux niveaux : les pastilles disent **combien** de
/// scènes la publication porte, celui-ci dit **comment** elles s'arrangeront.
/// C'est une zone de CONSTAT — jamais sur la scène, où un contrôle se peindrait
/// dans l'aperçu et volerait les touches du canvas (loi 6).
///
/// Il apparaît et disparaît avec les pastilles, parce que la condition est la
/// même : sans plusieurs scènes, il n'y a rien à disposer.
///
/// ## Ce qu'il montre avant d'être ouvert
///
/// Le glyphe de la disposition COURANTE, pas une icône générique de réglage.
/// L'auteur doit pouvoir lire ce que sa publication fera sans ouvrir le menu —
/// un contrôle qui ne dit son état qu'une fois déplié oblige à l'ouvrir pour
/// savoir s'il faut l'ouvrir.
///
/// ## Ce qu'il ne fait pas
///
/// Il ne pré-visualise pas. Peindre les cinq dispositions demanderait autant de
/// canvas montés que de modes, dans un écran qui en tient déjà un vivant — la
/// même dette que les vignettes de `ComposerSlideStrip`, assumée pour la même
/// raison et à rouvrir si le porteur la demande.
struct ComposerMosaicPicker: View {

    /// La disposition demandée. `nil` ⇒ l'auteur n'a rien imposé, et c'est le
    /// repli du modèle qui s'affichera — l'état montré est donc celui de
    /// `ComposerMosaicChoice.fallback`, jamais un vide.
    let selection: MosaicLayoutMode?
    let accentColor: Color
    let onSelect: (MosaicLayoutMode) -> Void

    private var courante: MosaicLayoutMode { selection ?? ComposerMosaicChoice.fallback }

    var body: some View {
        Menu {
            ForEach(ComposerMosaicChoice.ordered, id: \.self) { mode in
                Button {
                    onSelect(mode)
                } label: {
                    Label(ComposerMosaicChoice.label(mode),
                          systemImage: ComposerMosaicChoice.symbol(mode))
                }
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: ComposerMosaicChoice.symbol(courante))
                    .font(.system(size: 12, weight: .semibold))
                Text(ComposerMosaicChoice.label(courante))
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
            }
            .foregroundStyle(accentColor)
            .padding(.horizontal, 10)
            // La CIBLE fait 44 pt de haut alors que le dessin en fait ~22 :
            // c'est la borne d'accessibilité, et elle ne se négocie pas contre
            // la densité d'un couloir.
            .frame(height: 44)
            .contentShape(Rectangle())
        }
        // Le libellé DIT l'état courant ; l'indice dit ce que le doigt fera.
        // Les fondre donnerait à VoiceOver une phrase qui décrit une action là
        // où l'œil lit une valeur.
        .accessibilityLabel(Text(String(
            localized: "composer.mosaic.a11y",
            defaultValue: "Disposition des scènes : \(ComposerMosaicChoice.label(courante))",
            bundle: .main)))
        .accessibilityHint(Text(String(
            localized: "composer.mosaic.a11y.hint",
            defaultValue: "Touche deux fois pour changer la disposition",
            bundle: .main)))
    }
}
