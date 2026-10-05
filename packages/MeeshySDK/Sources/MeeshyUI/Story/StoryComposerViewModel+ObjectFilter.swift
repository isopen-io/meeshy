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
