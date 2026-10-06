import Foundation
import MeeshySDK

// MARK: - Le filtre d'UN objet média (retour porteur 2026-09-28)

extension StoryComposerViewModel {

    /// Le filtre posé sur ce média, `nil` s'il n'en porte pas (ou si l'id ne
    /// désigne aucun média de la slide courante).
    public func mediaObjectFilter(id: String) -> String? {
        currentEffects.mediaObjects?.first { $0.id == id }?.filter
    }

    /// **Pose le filtre sur CET objet, et sur lui seul.** Le filtre de slide
    /// (`StoryEffects.filter`, celui du fond) n'est jamais touché. Un id
    /// inconnu ne fait rien.
    public func applyMediaObjectFilter(id: String, _ raw: String?) {
        var effects = currentEffects
        guard let index = effects.mediaObjects?.firstIndex(where: { $0.id == id }),
              effects.mediaObjects?[index].filter != raw else { return }
        effects.mediaObjects?[index].filter = raw
        currentEffects = effects
    }
}

// MARK: - Les RÉGLAGES d'une image posée (#9175)

extension StoryComposerViewModel {

    /// Les réglages de ce média, neutres s'il n'en porte aucun (ou si l'id ne
    /// désigne aucun média de la slide courante).
    public func mediaObjectAdjustments(id: String) -> ImageAdjustments {
        currentEffects.mediaObjects?.first { $0.id == id }?.adjustments ?? .neutral
    }

    /// **Règle UN réglage de CET objet, et de lui seul.** La valeur est bornée à
    /// la plage du curseur ; un état revenu au neutre s'efface (`nil`), pour
    /// qu'une image « remise à zéro » ne porte rien au fil. Un id inconnu ne
    /// fait rien, une valeur inchangée non plus — aucun rendu, aucune écriture.
    public func setMediaObjectAdjustment(id: String, _ kind: AdjustmentKind, to value: Float) {
        var reglages = mediaObjectAdjustments(id: id)
        reglages[kind] = value
        applyMediaObjectAdjustments(id: id, reglages)
    }

    /// Pose l'ensemble des réglages de CET objet — `.neutral` les retire tous.
    ///
    /// Une VIDÉO ne retient que les réglages qu'elle peint (#9169) : la
    /// netteté ou le flou posés sur elle ne s'écrivent pas — un réglage sans
    /// effet au rendu n'a rien à faire au fil.
    public func applyMediaObjectAdjustments(id: String, _ adjustments: ImageAdjustments) {
        var effects = currentEffects
        guard let index = effects.mediaObjects?.firstIndex(where: { $0.id == id }) else { return }
        let peints = effects.mediaObjects?[index].kind.map { adjustments.served(for: $0) } ?? adjustments
        let retenus: ImageAdjustments? = peints.activeCount > 0 ? peints : nil
        guard effects.mediaObjects?[index].adjustments != retenus else { return }
        effects.mediaObjects?[index].adjustments = retenus
        currentEffects = effects
    }
}
