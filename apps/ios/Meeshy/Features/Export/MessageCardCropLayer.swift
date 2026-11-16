import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **RECADRER UNE PHOTO DE LA CARTE** (#18805) — ce que le mode « Recadrer »
/// offre, décidé sans vue : quelles photos se recadrent, et ce que chaque
/// action du lecteur d'écran fait du cadrage.
///
/// Pincer une zone de l'aperçu règle l'ÉCHELLE de sa partie ; le recadrage est
/// un MODE explicite, pour que les deux gestes ne se volent jamais l'un l'autre.
enum MessageCardCropRule {

    /// Le côté de la photo qu'une action du lecteur d'écran fait apparaître.
    enum Side: CaseIterable {
        case top, bottom, left, right
    }

    /// Ce qu'une action du lecteur d'écran déplace : un cinquième du cadre.
    static let revealStep = 0.2
    /// Ce qu'une action du lecteur d'écran zoome ou dézoome.
    static let zoomStep = 1.25

    /// « Recadrer » s'offre dès que la carte a une photo, une vidéo ou un fond
    /// recadrable dont les pixels sont là — sans avoir à toucher la photo
    /// d'abord (#18810), quelle que soit l'entrée qui a ouvert l'atelier.
    static func offers(framed: [MessageCardFramedMedia], pictured: Set<String>) -> Bool {
        !usable(framed, pictured: pictured).isEmpty
    }

    /// Les photos qu'on recadre, une fois le mode ouvert : toutes celles de la carte dont les pixels sont là.
    static func usable(_ framed: [MessageCardFramedMedia], pictured: Set<String>) -> [MessageCardFramedMedia] {
        framed.filter { pictured.contains($0.mediaID) }
    }

    /// Faire apparaître un côté de la photo : elle glisse vers le côté opposé.
    static func revealed(_ side: Side, from framing: MessageCardFraming, media: MessageCardFramedMedia,
                         pixelWidth: Double, pixelHeight: Double) -> MessageCardFraming.Move {
        let dx = media.frame.width * revealStep
        let dy = media.frame.height * revealStep
        let shift: (x: Double, y: Double)
        switch side {
        case .top: shift = (0, dy)
        case .bottom: shift = (0, -dy)
        case .left: shift = (dx, 0)
        case .right: shift = (-dx, 0)
        }
        return framing.panned(dx: shift.x, dy: shift.y, pixelWidth: pixelWidth, pixelHeight: pixelHeight, in: media.frame)
    }

    /// Ce qui distingue les cadrages dans une clé de peinture : changer de cadrage repeint la carte.
    static func key(_ framings: [String: MessageCardFraming]) -> String {
        framings.filter { !$0.value.isCentered }.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value.key)" }.joined(separator: ",")
    }
}

/// Une photo recadrable et ses pixels.
struct MessageCardCropTarget {
    let media: MessageCardFramedMedia
    let picture: CGImage
}

/// Le cadrage en cours sous les doigts.
private struct MessageCardLiveFraming: Equatable {
    let mediaID: String
    let base: MessageCardFraming
    var framing: MessageCardFraming
    var edged: Bool
}

/// **La couche de recadrage** posée sur l'aperçu : chaque photo recadrable se
/// glisse (la photo suit le doigt dans son cadre), se pince (zoom et dézoom),
/// se recentre par un double toucher. Pendant le geste, la photo se peint ici,
/// sous le doigt, sans attendre la carte ; elle reste peinte jusqu'à ce que la
/// carte repeinte soit là. Toucher hors des photos referme le mode.
struct MessageCardCropLayer: View {
    let targets: [MessageCardCropTarget]
    let framings: [String: MessageCardFraming]
    let scale: CGFloat
    /// La carte affichée porte déjà les derniers cadrages.
    let settled: Bool
    let commit: (String, MessageCardFraming) -> Void
    let finish: () -> Void

    @State private var live: MessageCardLiveFraming?
    @State private var lastEdited: String?

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.white.opacity(0.001)
                .contentShape(Rectangle())
                .onTapGesture(perform: finish)
                .accessibilityHidden(true)
            ForEach(targets, id: \.media.mediaID) { target in
                zone(target)
            }
        }
    }

    private func framing(of id: String) -> MessageCardFraming {
        if let live, live.mediaID == id { return live.framing }
        return framings[id] ?? .centered
    }

    private func zone(_ target: MessageCardCropTarget) -> some View {
        let media = target.media
        let id = media.mediaID
        let width = CGFloat(media.frame.width) * scale
        let height = CGFloat(media.frame.height) * scale
        let corner = CGFloat(media.radius) * scale
        let showsLive = live?.mediaID == id || (!settled && lastEdited == id)
        return ZStack(alignment: .topLeading) {
            if showsLive {
                livePicture(target, framing: framing(of: id))
            }
            RoundedRectangle(cornerRadius: corner, style: .continuous)
                .strokeBorder(Color.white.opacity(0.9), style: StrokeStyle(lineWidth: MeeshyBorder.strong, dash: [6, 4]))
        }
        .frame(width: max(width, 1), height: max(height, 1), alignment: .topLeading)
        .clipShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
        .contentShape(Rectangle())
        .gesture(cropGesture(target))
        .onTapGesture(count: 2) { recenter(target) }
        .rotationEffect(.radians(media.rotation), anchor: Self.pivot(of: media))
        .offset(x: CGFloat(media.frame.x) * scale, y: CGFloat(media.frame.y) * scale)
        .modifier(MessageCardCropAccessibility(
            isBackdrop: media.isBackdrop,
            zoom: framing(of: id).zoom,
            act: { act($0, on: target) }
        ))
    }

    /// Le pivot de l'inclinaison d'une carte (#18810), relatif au cadre de la photo :
    /// la zone tourne avec la photo peinte, autour du même point.
    static func pivot(of media: MessageCardFramedMedia) -> UnitPoint {
        guard media.rotation != 0, media.frame.width > 0, media.frame.height > 0 else { return .center }
        return UnitPoint(x: (media.pivotX - media.frame.x) / media.frame.width,
                         y: (media.pivotY - media.frame.y) / media.frame.height)
    }

    /// La photo telle que le cadrage la pose, en points de l'aperçu, relative au coin du cadre.
    private func livePicture(_ target: MessageCardCropTarget, framing: MessageCardFraming) -> some View {
        let frame = target.media.frame
        let drawn = framing.drawn(pixelWidth: Double(target.picture.width), pixelHeight: Double(target.picture.height), in: frame)
        return Image(decorative: target.picture, scale: 1)
            .resizable()
            .frame(width: CGFloat(drawn.width) * scale, height: CGFloat(drawn.height) * scale)
            .offset(x: CGFloat(drawn.x - frame.x) * scale, y: CGFloat(drawn.y - frame.y) * scale)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    // MARK: - Gestes

    private func cropGesture(_ target: MessageCardCropTarget) -> some Gesture {
        DragGesture(minimumDistance: 1)
            .simultaneously(with: MagnificationGesture())
            .onChanged { value in
                follow(target, translation: value.first?.translation ?? .zero, magnification: value.second ?? 1)
            }
            .onEnded { _ in conclude() }
    }

    /// Le doigt pilote le cadrage, image par image : d'abord le zoom autour du
    /// milieu du cadre, puis le glissement — une butée se fait sentir une fois.
    private func follow(_ target: MessageCardCropTarget, translation: CGSize, magnification: CGFloat) {
        let id = target.media.mediaID
        let base = live?.mediaID == id ? live?.base ?? framing(of: id) : framing(of: id)
        let pixels = (width: Double(target.picture.width), height: Double(target.picture.height))
        let zoomed = base.zoomed(by: Double(magnification), pixelWidth: pixels.width, pixelHeight: pixels.height, in: target.media.frame)
        let panned = zoomed.framing.panned(dx: Double(translation.width / max(scale, 0.0001)),
                                          dy: Double(translation.height / max(scale, 0.0001)),
                                          pixelWidth: pixels.width, pixelHeight: pixels.height, in: target.media.frame)
        let edged = zoomed.hitEdge || panned.hitEdge
        if edged && live?.edged != true { HapticFeedback.soft() }
        live = MessageCardLiveFraming(mediaID: id, base: base, framing: panned.framing, edged: edged)
    }

    private func conclude() {
        guard let live else { return }
        lastEdited = live.mediaID
        commit(live.mediaID, live.framing)
        self.live = nil
    }

    private func recenter(_ target: MessageCardCropTarget) {
        HapticFeedback.light()
        lastEdited = target.media.mediaID
        commit(target.media.mediaID, .centered)
    }

    /// Une action du lecteur d'écran, appliquée au cadrage enregistré.
    private func act(_ action: MessageCardCropAction, on target: MessageCardCropTarget) {
        let id = target.media.mediaID
        let current = framings[id] ?? .centered
        let pixels = (width: Double(target.picture.width), height: Double(target.picture.height))
        let move: MessageCardFraming.Move
        switch action {
        case .zoomIn:
            move = current.zoomed(by: MessageCardCropRule.zoomStep, pixelWidth: pixels.width, pixelHeight: pixels.height, in: target.media.frame)
        case .zoomOut:
            move = current.zoomed(by: 1 / MessageCardCropRule.zoomStep, pixelWidth: pixels.width, pixelHeight: pixels.height, in: target.media.frame)
        case .recenter:
            move = MessageCardFraming.Move(framing: .centered, hitEdge: false)
        case let .reveal(side):
            move = MessageCardCropRule.revealed(side, from: current, media: target.media, pixelWidth: pixels.width, pixelHeight: pixels.height)
        }
        move.hitEdge ? HapticFeedback.soft() : HapticFeedback.light()
        lastEdited = id
        commit(id, move.framing)
    }
}

/// Ce que le lecteur d'écran peut faire d'une photo en mode recadrage.
enum MessageCardCropAction {
    case zoomIn, zoomOut, recenter
    case reveal(MessageCardCropRule.Side)
}

/// Chaque photo recadrable est UN élément pour le lecteur d'écran : son nom,
/// son zoom, et les actions Zoomer, Dézoomer, Recentrer, Montrer le haut / le
/// bas / la gauche / la droite.
private struct MessageCardCropAccessibility: ViewModifier {
    let isBackdrop: Bool
    let zoom: Double
    let act: (MessageCardCropAction) -> Void

    func body(content: Content) -> some View {
        content
            .accessibilityElement()
            .accessibilityLabel(isBackdrop
                ? MessageCardExportText.text("export.card.crop.backdrop", "Fond à recadrer")
                : MessageCardExportText.text("export.card.crop.photo", "Photo à recadrer"))
            .accessibilityValue(Text(zoom, format: .percent.precision(.fractionLength(0))))
            .accessibilityAction(named: Text(MessageCardExportText.text("export.card.crop.zoomIn", "Zoomer"))) { act(.zoomIn) }
            .accessibilityAction(named: Text(MessageCardExportText.text("export.card.crop.zoomOut", "Dézoomer"))) { act(.zoomOut) }
            .accessibilityAction(named: Text(MessageCardExportText.text("export.card.crop.recenter", "Recentrer"))) { act(.recenter) }
            .accessibilityAction(named: Text(MessageCardExportText.text("export.card.crop.showTop", "Montrer le haut"))) { act(.reveal(.top)) }
            .accessibilityAction(named: Text(MessageCardExportText.text("export.card.crop.showBottom", "Montrer le bas"))) { act(.reveal(.bottom)) }
            .accessibilityAction(named: Text(MessageCardExportText.text("export.card.crop.showLeft", "Montrer la gauche"))) { act(.reveal(.left)) }
            .accessibilityAction(named: Text(MessageCardExportText.text("export.card.crop.showRight", "Montrer la droite"))) { act(.reveal(.right)) }
    }
}

// MARK: - La feuille : le mode « Recadrer »

extension MessageCardExportSheet {

    /// Les photos recadrables de la carte affichée, avec leurs pixels.
    func cropTargets(_ rendered: Rendered) -> [MessageCardCropTarget] {
        let pictures = paintedPictures.images
        return MessageCardCropRule.usable(rendered.framedMedia, pictured: Set(pictures.keys)).compactMap { media in
            pictures[media.mediaID].map { MessageCardCropTarget(media: media, picture: $0) }
        }
    }

    /// « Recadrer » s'offre dès que la carte a de quoi recadrer, sans toucher la photo d'abord (#18810).
    func offersCrop(_ rendered: Rendered) -> Bool {
        MessageCardCropRule.offers(framed: rendered.framedMedia, pictured: Set(paintedPictures.images.keys))
    }

    func cropLayer(_ rendered: Rendered, scale: CGFloat) -> MessageCardCropLayer {
        MessageCardCropLayer(
            targets: cropTargets(rendered),
            framings: framings,
            scale: scale,
            settled: ready,
            commit: { id, framing in framings[id] = framing.isCentered ? nil : framing },
            finish: endCrop
        )
    }

    func endCrop() {
        HapticFeedback.light()
        withAnimation(MeeshyAnimation.springDefault) { cropping = false }
    }

    /// Le bouton du mode : « Recadrer » dès qu'une photo se recadre, « OK » pendant le recadrage.
    @ViewBuilder
    func cropControl(_ rendered: Rendered) -> some View {
        if cropping {
            cropButton(MessageCardExportText.text("export.card.crop.done", "OK"), systemImage: "checkmark", action: endCrop)
                .accessibilityIdentifier("export.card.crop.done")
        } else if offersCrop(rendered) && pinch == nil {
            cropButton(MessageCardExportText.text("export.card.crop", "Recadrer"), systemImage: "crop", action: beginCrop)
                .accessibilityIdentifier("export.card.crop")
        }
    }

    func beginCrop() {
        HapticFeedback.light()
        withAnimation(MeeshyAnimation.springDefault) {
            touched = true
            cropping = true
        }
    }

    private func cropButton(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .frame(minHeight: 44)
                .meeshyGlass(in: Capsule(), tone: .theme, isInteractive: true)
        }
        .buttonStyle(MeeshyGlassPressStyle())
        .padding(MeeshySpacing.sm)
    }
}
