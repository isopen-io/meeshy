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
/// **Filtre et réglages descendent au bas quand le haut cacherait l'objet**
/// (#9495) : on juge un rendu à l'œil, et un panneau qui couvre l'image réglée
/// rend le geste aveugle et « Comparer » inutile. La surface remet le cadre de
/// la carte (`composerSceneCardFrame`) ; la règle choisit le côté.
///
/// Le CONTENU de chaque sous-outil est celui que l'éditeur d'objet monte déjà —
/// `TextEditToolOptions` du SDK, `ComposerObjectTimingControls`,
/// `ComposerObjectPlanControls`, `ComposerMediaFilterGrid`, `ComposerMediaAdjustPanel`,
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
    /// L'appui maintenu sur « Comparer » des réglages (#9175) : le meuble
    /// montre l'original de l'image dans la scène tant qu'il dure.
    var onCompareLook: ((Bool) -> Void)?

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.composerSceneCardFrame) private var sceneCard
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var contentHeight: CGFloat = 0
    @State private var planHoldsGesture = false

    private var roomy: Bool { horizontalSizeClass == .regular }

    var body: some View {
        GeometryReader { geo in
            let cote = edge(container: geo.frame(in: .global))
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
            .padding(cote == .top ? .top : .bottom, ComposerRailGeometry.gutter)
            .padding(.trailing, ComposerRailGeometry.edgeMargin(roomy: roomy)
                                + ComposerRailGeometry.railWidth + ComposerRailGeometry.gutter)
            .frame(maxWidth: .infinity, maxHeight: .infinity,
                   alignment: cote == .top ? .topTrailing : .bottomTrailing)
            .animation(ComposerToolFocus.transition(reduceMotion: reduceMotion), value: cote)
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
        case .media(.adjust):
            ComposerMediaAdjustPanel(viewModel: viewModel, mediaId: edit.objectId, onCompare: onCompareLook)
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

    /// **Le côté qui laisse voir l'objet réglé** (#9495) — pour les sous-outils
    /// qu'on juge à l'œil (filtre, réglages) d'un média POSÉ. Le cadre de
    /// l'objet vient de la géométrie même du calque qui le peint
    /// (`StoryMediaLayer.renderedPose`), ramenée dans le repère du panneau.
    private func edge(container: CGRect) -> ComposerInlinePanelEdge {
        guard ComposerInlinePanelLayout.keepsObjectInSight(section),
              let media, !media.isBackground,
              !sceneCard.isNull, sceneCard.width > 0 else { return .top }
        let pose = StoryMediaLayer.renderedPose(for: media, geometry: CanvasGeometry(renderSize: sceneCard.size))
        let objet = ComposerInlinePanelLayout.objectFrame(center: pose.center, size: pose.size,
                                                          anchor: media.anchor, rotationDegrees: media.rotation,
                                                          card: sceneCard, container: container)
        return ComposerInlinePanelLayout.edge(object: objet, free: container.size,
                                              panelHeight: contentHeight, roomy: roomy)
    }
}

/// Le cadre du DESSIN de la scène, dans l'écran — remis par la surface au
/// panneau d'options, qui s'y repère pour ne pas couvrir l'objet (#9495).
private struct ComposerSceneCardFrameEnvironmentKey: EnvironmentKey {
    static let defaultValue: CGRect = .null
}

extension EnvironmentValues {
    var composerSceneCardFrame: CGRect {
        get { self[ComposerSceneCardFrameEnvironmentKey.self] }
        set { self[ComposerSceneCardFrameEnvironmentKey.self] = newValue }
    }
}

/// Le cadre du dessin, mesuré par la surface en repère global.
struct ComposerSceneCardFrameKey: PreferenceKey {
    static let defaultValue: CGRect = .null
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let suivant = nextValue()
        if !suivant.isNull { value = suivant }
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
