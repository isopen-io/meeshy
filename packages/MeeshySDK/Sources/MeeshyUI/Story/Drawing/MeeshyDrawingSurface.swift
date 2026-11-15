import SwiftUI
import UIKit
import MeeshySDK

/// **La surface de DESSIN, extraite pour être montée deux fois** (#4092).
///
/// ## Pourquoi elle naît
///
/// Le dessin est le premier outil de la vue `3b` (« Outils de scène — dessin,
/// sticker, collage, mention, lieu »), et le composer unifié n'en avait
/// aucun : la scène incrustée ne portait ni capture de trait, ni rendu live.
/// L'atelier, lui, l'a — mais composé À LA MAIN dans son `overlay`, en cinq
/// vues et sept lectures de ViewModel.
///
/// Recopier ces cinq vues dans le plateau aurait produit deux surfaces de
/// dessin à faire diverger au premier réglage ajouté. La règle d'emprunt du
/// #4035 tranche : **un corps, deux montages, jamais de copie** — et « le corps
/// sort dans une vue partagée, que l'ancien site consomme LUI AUSSI ».
///
/// ## Ce qu'elle assemble, et dans cet ordre
///
/// | couche | rôle |
/// |---|---|
/// | `MeeshyStrokeCanvas(strokes:)` | les traits COMMITÉS, avec halo sur le sélectionné |
/// | `MeeshyStrokeCanvas(strokes: [preview])` | le trait EN COURS, par-dessus |
/// | `StrokeCaptureLayer` | la capture, au-dessus de tout |
///
/// L'aperçu est rendu par le MÊME moteur largeur-variable que le trait
/// commité : c'est ce qui rend le geste WYSIWYG, un aperçu dessiné autrement
/// mentirait sur le trait qu'on obtient au lever du doigt.
///
/// ## Ce qu'elle ne décide pas
///
/// Ni QUAND la surface paraît (l'hôte le sait : mode immersif pour l'atelier,
/// bande d'outils pour le plateau), ni ce que le canvas SOUS elle doit faire —
/// c'est à l'hôte de poser `isDrawingOverlayActive` sur son canvas, faute de
/// quoi le trait s'affiche DEUX fois : une par le calque persisté du canvas,
/// une par cette surface (défaut « écrit en double », 2026-05-27).
public struct MeeshyDrawingSurface: View {

    @ObservedObject private var viewModel: StoryComposerViewModel

    /// **Le zoom d'inspection PENDANT le dessin** — un pincement à deux doigts
    /// sur la couche de capture, que seul l'atelier sert aujourd'hui.
    ///
    /// Il est reçu, jamais décidé ici : le plateau n'a pas de viewport à
    /// déplacer, l'atelier oui. Extraire la surface SANS ce relais aurait
    /// silencieusement retiré le geste à l'atelier — une extraction qui perd
    /// une capacité de son site d'origine n'est pas une extraction, c'est une
    /// réécriture.
    private let onViewportPinch: ((CGFloat, CGSize, UIGestureRecognizer.State) -> Void)?

    public init(viewModel: StoryComposerViewModel,
                onViewportPinch: ((CGFloat, CGSize, UIGestureRecognizer.State) -> Void)? = nil) {
        self.viewModel = viewModel
        self.onViewportPinch = onViewportPinch
    }

    public var body: some View {
        ZStack {
            MeeshyStrokeCanvas(
                strokes: viewModel.drawingStrokes,
                selectedId: viewModel.drawingEditingMode.selectedStrokeId
            )
            .equatable()

            if let preview = viewModel.activeStrokePreview {
                MeeshyStrokeCanvas(strokes: [preview], selectedId: nil)
            }

            StrokeCaptureLayer(
                activeTool: viewModel.activeBrushTool,
                activeColorHex: DrawingEditToolOptions.hex(of: viewModel.drawingColor),
                activeWidth: Double(viewModel.drawingWidth),
                activeSmoothing: viewModel.activeBrushSmoothing,
                onStrokeInProgress: { viewModel.activeStrokePreview = $0 },
                onStrokeCommitted: { stroke in
                    // `commitStroke` ajoute le trait ET vide la pile de redo :
                    // un nouveau trait rend le « rétablir » caduc.
                    viewModel.commitStroke(stroke)
                    viewModel.activeStrokePreview = nil
                },
                onEraseGesture: { points in
                    viewModel.eraseStrokes(near: points)
                    // L'aperçu du trait en cours est effacé AVEC : la gomme
                    // interrompt le tracé, et laisser l'aperçu à l'écran
                    // afficherait un trait que rien ne commettra.
                    viewModel.activeStrokePreview = nil
                },
                onViewportPinch: { scale, translation, state in
                    onViewportPinch?(scale, translation, state)
                }
            )
        }
    }
}
