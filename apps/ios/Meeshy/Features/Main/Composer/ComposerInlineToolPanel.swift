import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les options du sous-outil ouvert, À DROITE, depuis le haut** (#9138,
/// directive porteur 2026-10-02 : « les options des outils qui s'ouvrent à
/// droite partant du haut »).
///
/// Une plaque de verre teintée du plateau, posée à gauche de la colonne des
/// sous-outils et alignée sur son haut. Elle prend la largeur que la colonne
/// gauche, vide pendant l'édition, libère, et la hauteur que son contenu
/// demande jusqu'à toute la hauteur libre — au-delà, elle défile. La règle de
/// place vit dans `ComposerInlinePanelLayout` ; cette vue la lit.
///
/// Le CONTENU de chaque sous-outil est celui que l'éditeur d'objet monte déjà —
/// `TextEditToolOptions` du SDK, `ComposerObjectTimingControls`,
/// `ComposerObjectPlanControls`, `ComposerMediaFilterGrid`,
/// `ComposerMediaTrimBand`, `ComposerMediaActionRow`, `MediaAltTextField` :
/// aucune copie, donc aucune divergence au premier réglage.
struct ComposerInlineToolPanel: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let edit: ComposerInlineEdit
    let section: ComposerObjectEditorSection
    let plateauTint: Color
    /// La description d'un média vit au MEUBLE (#4756) ; `nil` ⇒ aucun champ
    /// qui n'écrirait nulle part (loi 4).
    var altText: Binding<String>?
    /// Le plan 2D désigne un autre texte : l'édition en place le reprend.
    var onSelectText: (String) -> Void = { _ in }

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var contentHeight: CGFloat = 0
    @State private var planHoldsGesture = false

    private var roomy: Bool { horizontalSizeClass == .regular }

    var body: some View {
        GeometryReader { geo in
            ScrollView(.vertical, showsIndicators: false) {
                content
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(ComposerInlinePanelLayout.contentPadding)
                    .background {
                        GeometryReader { mesure in
                            Color.clear.preference(key: ComposerInlinePanelHeightKey.self,
                                                   value: mesure.size.height)
                        }
                    }
            }
            .scrollDisabled(planHoldsGesture)
            .frame(width: ComposerInlinePanelLayout.width(freeWidth: geo.size.width, roomy: roomy),
                   height: ComposerInlinePanelLayout.height(content: contentHeight,
                                                            freeHeight: geo.size.height))
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous),
                           tint: plateauTint.opacity(0.55))
            .padding(.top, ComposerRailGeometry.gutter)
            .padding(.trailing, ComposerRailGeometry.edgeMargin(roomy: roomy)
                                + ComposerRailGeometry.railWidth + ComposerRailGeometry.gutter)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        }
        .onPreferenceChange(ComposerInlinePanelHeightKey.self) { contentHeight = $0 }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerObjectEditorCopy.entry(section)))
    }

    @ViewBuilder
    private var content: some View {
        switch section {
        case .tool(let outil):
            if let binding = viewModel.textObjectBinding(for: edit.objectId) {
                TextEditToolOptions(tool: outil, textObject: binding, layout: .column)
            }
        case .timing:
            ComposerObjectTimingControls(viewModel: viewModel, objectId: edit.objectId)
        case .plan:
            ComposerObjectPlanControls(viewModel: viewModel,
                                       objectId: edit.objectId,
                                       onSelectText: onSelectText,
                                       holdsGesture: $planHoldsGesture)
        case .media(.filter):
            if let media {
                ComposerMediaFilterGrid(viewModel: viewModel, media: media,
                                        isBackground: edit.family.isBackground)
            }
        case .media(.trim):
            if let source = viewModel.sourceTrim(id: edit.objectId) {
                ComposerMediaTrimBand(viewModel: viewModel, objectId: edit.objectId, source: source,
                                      waveform: ComposerMediaTrimBand.waveform(viewModel: viewModel,
                                                                               objectId: edit.objectId))
            }
        case .media(.actions):
            if let media {
                ComposerMediaActionRow(viewModel: viewModel, media: media)
            }
        case .media(.altText):
            if let altText {
                MediaAltTextField(kind: .alt, text: altText.wrappedValue) { saisi in
                    altText.wrappedValue = saisi
                }
            }
        case .media(.crop):
            // Servi au seul fond image d'une retouche (#9136).
            if let media {
                ComposerMediaCropPads(viewModel: viewModel, media: media)
            }
        case .media(.split):
            // Hors de `MediaEditTool.served` : aucune famille ne l'offre.
            EmptyView()
        }
    }

    private var media: StoryMediaObject? {
        viewModel.currentEffects.mediaObjects?.first { $0.id == edit.objectId }
    }
}

/// La hauteur du contenu du panneau, mesurée en FOND — un `GeometryReader` en
/// overlay imposerait sa taille au contenu qu'il mesure.
struct ComposerInlinePanelHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
