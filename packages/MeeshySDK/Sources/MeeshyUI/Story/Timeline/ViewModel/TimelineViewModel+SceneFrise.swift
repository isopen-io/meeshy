import Foundation
import MeeshySDK

/// **Une piste de la frise de SCÈNE** (#8370, lot 6 — maquette
/// `docs/product/composer-plein-ecran/Main.dc.html`, « chaque objet a sa
/// piste »).
///
/// La frise de l'atelier (`StoryTimelineHost`) est un éditeur de montage :
/// zoom, transitions, images-clés. La scène plein écran n'en montre que ce que
/// la maquette dessine — un objet, une barre, sa fenêtre d'apparition — et la
/// lit ici, dans le projet que les deux frises partagent, pour qu'elles ne
/// puissent jamais dire deux choses.
public nonisolated struct SceneFriseTrack: Equatable, Sendable, Identifiable {
    public enum Kind: Equatable, Sendable {
        case text, sticker, image, video, audio, place
    }

    public let id: String
    public let kind: Kind
    /// Ce que la piste NOMME : le texte posé, l'emoji, le nom du lieu. Vide
    /// pour un média ou un son — l'hôte y met le mot de sa langue.
    public let label: String
    public let start: Float
    public let end: Float

    public init(id: String, kind: Kind, label: String, start: Float, end: Float) {
        self.id = id
        self.kind = kind
        self.label = label
        self.start = start
        self.end = end
    }
}

extension TimelineViewModel {

    /// Les pistes de la slide, dans l'ordre de la pile du plan : ce qu'on voit
    /// derrière d'abord. Le FOND n'a pas de piste — il ne se règle pas dans le
    /// temps, il EST la scène (`isBackground`, clip synthétique compris).
    public var sceneFriseTracks: [SceneFriseTrack] {
        let medias = project.mediaObjects
            .filter { !$0.isBackground }
            .compactMap { media -> SceneFriseTrack? in
                track(id: media.id, kind: media.kind == .video ? .video : .image, label: "")
            }
        let textes = project.textObjects.compactMap { track(id: $0.id, kind: .text, label: $0.text) }
        let stickers = project.stickerObjects.compactMap { track(id: $0.id, kind: .sticker, label: $0.emoji) }
        let lieux = project.locationObjects.compactMap { track(id: $0.id, kind: .place, label: $0.place.name ?? "") }
        let sons = project.audioPlayerObjects.compactMap { track(id: $0.id, kind: .audio, label: "") }
        return medias + textes + stickers + lieux + sons
    }

    /// **« Entre ici »** : l'objet APPARAÎT à cette seconde, sa sortie ne
    /// bouge pas (`ClipWindowResolver.Edit.setStart`).
    public func setClipEntry(id: String, to seconds: Float) {
        applyWindow(id: id, edit: .setStart(seconds))
    }

    /// **« Sort ici »** : l'objet DISPARAÎT à cette seconde, son entrée ne
    /// bouge pas.
    public func setClipExit(id: String, to seconds: Float) {
        applyWindow(id: id, edit: .setEnd(seconds))
    }

    private func track(id: String, kind: SceneFriseTrack.Kind, label: String) -> SceneFriseTrack? {
        guard let window = currentWindow(id: id) else { return nil }
        return SceneFriseTrack(id: id, kind: kind, label: label,
                               start: window.start, end: window.end)
    }
}
