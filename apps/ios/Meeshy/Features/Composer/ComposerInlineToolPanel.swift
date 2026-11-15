import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les propriétés du sous-outil ouvert, EN BAS** (#13957, #13974, spec R6).
///
/// Une feuille basse de verre teintée du plateau, posée dans les étages du bas
/// de la scène : la scène se réduit au-dessus d'elle, rien ne la recouvre. Elle
/// épouse son contenu jusqu'à 42 % de la fenêtre et défile au-delà
/// (`ComposerPropertiesSheetLayout`). Son en-tête dit le réglage ouvert, et OK
/// referme le niveau. Elle remplace le panneau qui s'ouvrait en haut à droite
/// (#9138) : une option d'édition n'a plus que trois places, et le haut de
/// l'écran n'en est pas une.
///
/// Le CONTENU de chaque sous-outil est celui que l'éditeur d'objet monte déjà —
/// `TextEditToolOptions` du SDK, `ComposerObjectTimingControls`,
/// `ComposerObjectPlanControls`, `ComposerMediaFilterGrid`, `ComposerMediaAdjustPanel`,
/// `ComposerMediaTrimBand`, `ComposerMediaActionRow`, `MediaAltTextField` :
/// aucune copie, donc aucune divergence au premier réglage. Chaque réglage
/// s'écrit sur la slide au fil du geste : il se voit en temps réel sur la scène.
struct ComposerInlineToolPanel: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let edit: ComposerInlineEdit
    /// `nil` ⇒ la feuille ne montre que son en-tête : aucune puce ouverte.
    let section: ComposerObjectEditorSection?
    let plateauTint: Color
    /// La description d'un média vit au MEUBLE (#4756) ; `nil` ⇒ aucun champ
    /// qui n'écrirait nulle part (loi 4).
    var altText: Binding<String>?
    /// Le nom du réglage et OK, qui referme le niveau.
    var header: ComposerPropertiesHeader?
    /// Le plan 2D désigne un autre objet : l'édition en place le reprend.
    var onSelectObject: (String) -> Void = { _ in }
    /// L'appui maintenu sur « Comparer » des réglages (#9175) : le meuble
    /// montre l'original de l'image dans la scène tant qu'il dure.
    var onCompareLook: ((Bool) -> Void)?

    @State private var planHoldsGesture = false

    var body: some View {
        ComposerPropertiesSheetPlate(plateauTint: plateauTint, holdsGesture: planHoldsGesture) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                if let header { header }
                content
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(section.map(ComposerObjectEditorCopy.entry) ?? ComposerSelectionCopy.bar))
        .accessibilityIdentifier("composer.properties.sheet")
    }

    @ViewBuilder
    private var content: some View {
        switch section {
        case nil:
            EmptyView()
        case .tool(let outil):
            if let binding = viewModel.textObjectBinding(for: edit.objectId) {
                TextEditToolOptions(tool: outil, textObject: binding, layout: .column)
            }
        case .timing:
            ComposerObjectTimingControls(viewModel: viewModel, objectId: edit.objectId)
        case .plan:
            ComposerObjectPlanControls(viewModel: viewModel,
                                       objectId: edit.objectId,
                                       onSelectObject: onSelectObject,
                                       holdsGesture: $planHoldsGesture)
        case .media(.look):
            ComposerMediaLookPanel(viewModel: viewModel, mediaId: edit.objectId)
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
}

/// **La plaque des propriétés, en bas** — pleine largeur de la colonne de la
/// scène, à la marge des rails ; son contenu jusqu'au plafond de
/// `ComposerPropertiesSheetLayout`, puis il défile.
struct ComposerPropertiesSheetPlate<Content: View>: View {
    let plateauTint: Color
    var holdsGesture: Bool = false
    @ViewBuilder let content: () -> Content

    @State private var contentHeight: CGFloat = 0

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(ComposerInlinePanelLayout.contentPadding)
                .background {
                    GeometryReader { mesure in
                        Color.clear.preference(key: ComposerInlinePanelHeightKey.self, value: mesure.size.height)
                    }
                }
        }
        .scrollDisabled(holdsGesture)
        // Un toucher dans la feuille ne termine pas la saisie en ligne (#9146).
        .scrollDismissesKeyboard(.never)
        .frame(height: ComposerPropertiesSheetLayout.height(
            content: contentHeight, windowHeight: WindowMetrics.activeWindowFrameInScreen?.height ?? 0))
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous),
                       tint: plateauTint.opacity(0.55))
        .padding(.horizontal, ComposerRailGeometry.outerMargin)
        .padding(.bottom, MeeshySpacing.xsPlus)
        .onPreferenceChange(ComposerInlinePanelHeightKey.self) { contentHeight = $0 }
    }
}

/// **La plaque d'options À DROITE, depuis le haut** (#9138) — celle de
/// l'édition en place d'un objet ET celle du dessin (#9145 : « même
/// grammaire »). Une plaque de verre teintée du plateau, posée à gauche de la
/// colonne des sous-outils, qui épouse son contenu jusqu'à la hauteur libre et
/// défile au-delà. Le côté et la hauteur viennent de
/// `ComposerInlinePanelLayout.placement` : sans objet à laisser voir, le haut,
/// toute la hauteur.
struct ComposerTrailingOptionsPlate<Content: View>: View {
    let plateauTint: Color
    /// Le côté pris quand aucun objet n'est à laisser voir.
    var preferredEdge: ComposerInlinePanelEdge = .top
    var holdsGesture: Bool = false
    /// Le cadre, dans le repère de la plaque, de ce qu'elle ne doit pas couvrir.
    var objectFrame: @MainActor (CGRect) -> CGRect? = { _ in nil }
    @ViewBuilder let content: () -> Content

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var contentHeight: CGFloat = 0

    private var roomy: Bool { horizontalSizeClass == .regular }

    var body: some View {
        GeometryReader { geo in
            let place = ComposerInlinePanelLayout.placement(object: objectFrame(geo.frame(in: .global)),
                                                            free: geo.size,
                                                            panelHeight: contentHeight,
                                                            roomy: roomy,
                                                            preferredEdge: preferredEdge)
            let cote = place.edge
            ScrollView(.vertical, showsIndicators: false) {
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(ComposerInlinePanelLayout.contentPadding)
                    .background {
                        GeometryReader { mesure in
                            Color.clear.preference(key: ComposerInlinePanelHeightKey.self,
                                                   value: mesure.size.height)
                        }
                    }
            }
            .scrollDisabled(holdsGesture)
            // **Un toucher dans le panneau ne termine pas la saisie en ligne**
            // (#9146) : une `ScrollView` renvoie le clavier au premier glissé,
            // et le canvas, privé de son répondant, refermerait le texte.
            .scrollDismissesKeyboard(.never)
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
    ///
    /// **Un texte EN SAISIE se lit là où le canvas le montre** (#9146) : le
    /// temps de la frappe, `StoryCanvasUIView.anchorInlineEditing` le recentre
    /// sur la carte, sans rotation, sans toucher au modèle. Clavier levé, un
    /// texte posé bas serait lu sous le clavier, et le panneau couvrirait le
    /// bloc que l'auteur tape.
    @MainActor
    static func sceneFrame(of objet: MeeshySceneObject, card: CGRect, container: CGRect,
                           typing: Bool = false) -> CGRect? {
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
            if typing {
                return objectFrame(center: CGPoint(x: card.width / 2, y: card.height / 2),
                                   size: CGSize(width: card.width, height: hauteur),
                                   anchor: CGPoint(x: 0.5, y: 0.5), rotationDegrees: 0,
                                   card: card, container: container)
            }
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
