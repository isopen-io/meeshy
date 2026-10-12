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
/// **Le panneau ne couvre jamais l'objet qu'il règle** (#9495, #9143) : il
/// descend au bas quand le haut le cacherait, et se réduit quand les deux le
/// cacheraient — on juge une police sur son texte comme un filtre sur son
/// image. La surface remet le cadre de la carte (`composerSceneCardFrame`) ; la
/// règle choisit le côté et la hauteur.
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
            let place = placement(container: geo.frame(in: .global))
            let cote = place.edge
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
                   height: ComposerInlinePanelLayout.height(content: contentHeight, placement: place))
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous),
                           tint: plateauTint.opacity(0.55))
            .padding(cote == .top ? .top : .bottom, ComposerRailGeometry.gutter)
            .padding(.trailing, ComposerRailGeometry.edgeMargin(roomy: roomy)
                                + ComposerRailGeometry.railWidth + ComposerRailGeometry.gutter)
            .frame(maxWidth: .infinity, maxHeight: .infinity,
                   alignment: cote == .top ? .topTrailing : .bottomTrailing)
            .animation(ComposerToolFocus.transition(reduceMotion: reduceMotion), value: place)
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
        case .media(.effects):
            ComposerMediaAdjustPanel(viewModel: viewModel, mediaId: edit.objectId, family: .effect,
                                     onCompare: onCompareLook)
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
            // Servi à l'image posée (#9499) et au fond image d'une retouche (#9136).
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

    /// **Le côté et la hauteur qui laissent voir l'objet réglé** (#9495,
    /// #9143) — pour TOUT sous-outil de TOUT objet posé : la police d'un texte
    /// se juge sur le texte comme un filtre sur l'image. Le cadre de l'objet
    /// vient de la géométrie même du calque qui le peint, ramenée dans le
    /// repère du panneau ; un fond couvre la carte entière, il n'a rien à
    /// éviter.
    private func placement(container: CGRect) -> ComposerInlinePanelPlacement {
        let objet: CGRect? = edit.family.isBackground || sceneCard.isNull || sceneCard.width <= 0
            ? nil
            : viewModel.currentSlide.sceneObject(id: edit.objectId).flatMap {
                ComposerInlinePanelLayout.sceneFrame(of: $0, card: sceneCard, container: container)
            }
        return ComposerInlinePanelLayout.placement(object: objet, free: container.size,
                                                   panelHeight: contentHeight, roomy: roomy)
    }
}

extension ComposerInlinePanelLayout {

    /// La hauteur de ligne d'un texte peint, rapportée à sa taille de police.
    static let textLineHeightFactor: CGFloat = 1.25

    /// Le côté d'une puce de son, que la scène ne mesure pas hors du calque.
    static let audioChipSide: CGFloat = 64

    /// **Le cadre d'un objet de la scène, dans le repère du panneau** — la
    /// boîte englobante de ce que son calque peint, rotation comprise. Le
    /// média et le lieu ont leur géométrie exacte (`renderedPose`,
    /// `badgeFrame`) ; le sticker son côté rendu ; le texte la hauteur de ses
    /// lignes sur la largeur de la carte ; la puce de son un carré nominal.
    /// `nil` pour un fond : il occupe toute la carte.
    @MainActor
    static func sceneFrame(of objet: MeeshySceneObject, card: CGRect, container: CGRect) -> CGRect? {
        guard !objet.isBackground, card.width > 0, card.height > 0 else { return nil }
        let geometrie = CanvasGeometry(renderSize: card.size)
        let centre = geometrie.render(geometrie.designPoint(forNormalized: CGPoint(x: objet.x, y: objet.y)))
        switch objet {
        case .media(let media):
            let pose = StoryMediaLayer.renderedPose(for: media, geometry: geometrie)
            return objectFrame(center: pose.center, size: pose.size, anchor: media.anchor,
                               rotationDegrees: media.rotation, card: card, container: container)
        case .place(let lieu):
            let badge = StoryLocationLayer.badgeFrame(for: lieu, canvasSize: card.size)
            return objectFrame(center: CGPoint(x: badge.minX + lieu.anchor.x * badge.width,
                                               y: badge.minY + lieu.anchor.y * badge.height),
                               size: badge.size, anchor: lieu.anchor,
                               rotationDegrees: lieu.rotation, card: card, container: container)
        case .sticker(let sticker):
            let cote = CanvasGeometry.stickerFontSize(baseSize: sticker.baseSize, scale: sticker.scale,
                                                      canvasWidth: card.width)
            return objectFrame(center: centre, size: CGSize(width: cote, height: cote),
                               anchor: sticker.anchor, rotationDegrees: sticker.rotation,
                               card: card, container: container)
        case .text(let texte):
            let lignes = CGFloat(max(1, texte.text.components(separatedBy: .newlines).count))
            let hauteur = StoryTextLayer.renderedFontSize(of: texte, in: geometrie)
                * textLineHeightFactor * lignes * CGFloat(max(0.1, texte.scale))
            return objectFrame(center: centre, size: CGSize(width: card.width, height: hauteur),
                               anchor: CGPoint(x: 0.5, y: texte.anchor.y),
                               rotationDegrees: texte.rotation, card: card, container: container)
        case .audio(let son):
            let cote = audioChipSide * CGFloat(max(0.1, son.scale ?? 1))
            return objectFrame(center: centre, size: CGSize(width: cote, height: cote),
                               anchor: CGPoint(x: 0.5, y: 0.5), rotationDegrees: son.rotation ?? 0,
                               card: card, container: container)
        }
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
