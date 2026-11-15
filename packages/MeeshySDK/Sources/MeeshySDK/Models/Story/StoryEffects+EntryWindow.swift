import Foundation

/// **Où ENTRE un objet posé sur une scène animée** (#8370, lot 6 — maquette
/// `docs/product/composer-plein-ecran/Main.dc.html`, `mkObj` : `t0 =
/// min(ph, 0.8)`, `t1 = 1`).
///
/// L'auteur qui règle sa scène dans le temps pose ce qu'il ajoute LÀ où il
/// regarde — à la tête — et jusqu'à la fin. L'entrée ne dépasse jamais 80 % de
/// la durée : un objet qui n'apparaîtrait qu'à la dernière image serait posé
/// sans être vu. Même règle que le web (`apps/web`, lot 6).
public enum SceneEntryWindow {

    public static let latestEntryFraction: Double = 0.8

    public static func forNewObject(playhead: Double,
                                    slideDuration: Double) -> (start: Double, duration: Double) {
        let duree = slideDuration.isFinite ? max(0, slideDuration) : 0
        let tete = playhead.isFinite ? playhead : 0
        let debut = max(0, min(tete, duree * latestEntryFraction))
        return (debut, duree - debut)
    }
}

public extension StoryEffects {

    /// Les identifiants de ce que la scène POSE — le fond n'en est pas : il ne
    /// se règle pas dans le temps.
    var timedObjectIds: [String] {
        let textes: [String] = textObjects.map(\.id)
        let medias: [String] = (mediaObjects ?? []).filter { !$0.isBackground }.map(\.id)
        let stickers: [String] = (stickerObjects ?? []).map(\.id)
        let lieux: [String] = locationObjects.map(\.id)
        let sons: [String] = (audioPlayerObjects ?? []).map(\.id)
        return [textes, medias, stickers, lieux, sons].flatMap { $0 }
    }

    /// Pose la fenêtre d'un objet, quelle que soit sa famille. Rend `false`
    /// quand l'id ne désigne rien (ou un fond).
    @discardableResult
    mutating func setWindow(id: String, start: Double, duration: Double) -> Bool {
        if let i = textObjects.firstIndex(where: { $0.id == id }) {
            textObjects[i].startTime = start
            textObjects[i].duration = duration
            return true
        }
        if let i = mediaObjects?.firstIndex(where: { $0.id == id && !$0.isBackground }) {
            mediaObjects?[i].startTime = start
            mediaObjects?[i].duration = duration
            return true
        }
        if let i = stickerObjects?.firstIndex(where: { $0.id == id }) {
            stickerObjects?[i].startTime = start
            stickerObjects?[i].duration = duration
            return true
        }
        if let i = locationObjects.firstIndex(where: { $0.id == id }) {
            locationObjects[i].startTime = start
            locationObjects[i].duration = duration
            return true
        }
        if let i = audioPlayerObjects?.firstIndex(where: { $0.id == id }) {
            audioPlayerObjects?[i].startTime = Float(start)
            audioPlayerObjects?[i].duration = Float(duration)
            return true
        }
        return false
    }
}
