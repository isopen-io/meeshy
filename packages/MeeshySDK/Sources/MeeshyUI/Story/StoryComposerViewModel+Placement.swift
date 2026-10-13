import CoreGraphics
import Foundation
import MeeshySDK

extension StoryComposerViewModel {

    /// **Déplacer un objet de scène, hors glissement** (#5018).
    ///
    /// ## Le verbe manquait, et son absence ne se voyait pas
    ///
    /// Le SDK expose à l'app un vocabulaire de VERBES — `addText`,
    /// `addSticker`, `deleteElement`, `duplicateElement`, `bringForward` — et
    /// garde l'état pour lui : `currentEffects` est `public internal(set)`.
    /// C'est délibéré, et c'est bien : une app qui écrit dans les effets
    /// contourne les invariants que ces verbes tiennent.
    ///
    /// Mais **aucun verbe ne disait « pose cet objet là »**, et l'absence était
    /// masquée par un trio qui en a l'air : `beginDrag` / `updateDrag` /
    /// `endDrag` ne portent qu'un état ÉPHÉMÈRE (`activeDrag`), et `endDrag()`
    /// se contente de le remettre à `nil` — il ne commite aucune position. Un
    /// appelant qui cherche « comment déplacer » trouve trois fonctions de
    /// glissement et conclut que le sujet est couvert.
    ///
    /// > Une capacité absente derrière un vocabulaire qui la suggère est plus
    /// > coûteuse qu'une capacité absente tout court : on ne la cherche pas
    /// > deux fois.
    ///
    /// ## Ce que ce verbe ne décide pas
    ///
    /// Ni où poser, ni quand. `StoryObjectPlacement` porte la cascade,
    /// l'appelant porte le geste — c'est la règle de partage du SDK : des
    /// briques aux paramètres opaques ici, la décision produit chez l'app.
    ///
    /// - Parameter position: en unités de scène (0…1), bornées. Une valeur hors
    ///   cadre poserait l'objet là où l'auteur ne peut plus le rattraper — et un
    ///   objet injoignable est pire qu'un objet mal placé.
    public func moveElement(id: String, to position: CGPoint) {
        let x = min(1.0, max(0.0, Double(position.x)))
        let y = min(1.0, max(0.0, Double(position.y)))
        var effets = currentEffects

        if let i = effets.textObjects.firstIndex(where: { $0.id == id }) {
            effets.textObjects[i].x = x
            effets.textObjects[i].y = y
        } else if let i = effets.mediaObjects?.firstIndex(where: { $0.id == id }) {
            effets.mediaObjects?[i].x = x
            effets.mediaObjects?[i].y = y
        } else if let i = effets.stickerObjects?.firstIndex(where: { $0.id == id }) {
            effets.stickerObjects?[i].x = x
            effets.stickerObjects?[i].y = y
        } else if let i = effets.locationObjects.firstIndex(where: { $0.id == id }) {
            effets.locationObjects[i].x = x
            effets.locationObjects[i].y = y
        } else if let i = effets.audioPlayerObjects?.firstIndex(where: { $0.id == id }) {
            effets.audioPlayerObjects?[i].x = x
            effets.audioPlayerObjects?[i].y = y
        } else {
            return
        }

        currentEffects = effets
    }

    /// **Poser la fenêtre de temps d'un objet de scène** (#9144) — les cinq
    /// familles, par le même verbe. Seul un TEXTE avait un chemin d'écriture
    /// (son binding) : la fenêtre et le plan 2D n'étaient donc offerts qu'à
    /// lui, et un sticker, une image, un lieu ou une puce de son posés duraient
    /// toute la slide sans recours hors de l'atelier.
    ///
    /// Les deux valeurs sont celles que le modèle stocke : `startTime` `nil` ⇒
    /// dès le début, `duration` `nil` ⇒ jusqu'à la fin de la slide. Le verbe ne
    /// borne rien — la conversion début/fin et ses bornes sont celles de
    /// l'appelant. Un id inconnu ne fait rien.
    public func setSceneObjectTiming(id: String, startTime: Double?, duration: Double?) {
        var effets = currentEffects

        if let i = effets.textObjects.firstIndex(where: { $0.id == id }) {
            effets.textObjects[i].startTime = startTime
            effets.textObjects[i].duration = duration
        } else if let i = effets.mediaObjects?.firstIndex(where: { $0.id == id }) {
            effets.mediaObjects?[i].startTime = startTime
            effets.mediaObjects?[i].duration = duration
        } else if let i = effets.stickerObjects?.firstIndex(where: { $0.id == id }) {
            effets.stickerObjects?[i].startTime = startTime
            effets.stickerObjects?[i].duration = duration
        } else if let i = effets.locationObjects.firstIndex(where: { $0.id == id }) {
            effets.locationObjects[i].startTime = startTime
            effets.locationObjects[i].duration = duration
        } else if let i = effets.audioPlayerObjects?.firstIndex(where: { $0.id == id }) {
            effets.audioPlayerObjects?[i].startTime = startTime.map { Float($0) }
            effets.audioPlayerObjects?[i].duration = duration.map { Float($0) }
        } else {
            return
        }

        currentEffects = effets
    }
}
