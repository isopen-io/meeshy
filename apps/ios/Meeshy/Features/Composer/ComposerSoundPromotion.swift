import CoreGraphics
import Foundation
import MeeshySDK

/// **Faire SORTIR un son du fond pour le poser sur la scène** (#5018).
///
/// > Directive porteur 2026-09-03 : « mettre sur la scene (pour l'enlever de
/// > fond et mettre en front) ».
///
/// ## La mutation existait déjà ; c'est la PLACE qui manquait
///
/// `StoryComposerProviding.toggleBackground(id:)` bascule le drapeau d'un audio
/// depuis 2026-06-01 — la promotion n'est donc pas du code à écrire mais un
/// câblage à faire. Ce que la bascule ne fait PAS, c'est donner une place :
/// elle laisse `x` / `y` où ils étaient. Un fond n'a pas de position utile (il
/// occupe toute la scène), donc deux sons promus l'un après l'autre se
/// poseraient au même point — le défaut exact que `StoryObjectPlacement`
/// existe pour empêcher, et que l'auteur ne verrait pas : deux objets, une
/// seule puce à l'œil.
///
/// ## Pourquoi ce n'est pas offert sur tout fond
///
/// Un fond peut être LEGACY — synthétisé depuis `backgroundAudioId` quand aucun
/// `audioPlayerObject` ne porte de drapeau. Il n'a alors aucun objet à
/// basculer, et `toggleBackground` sur un identifiant fabriqué ne ferait rien
/// en ayant l'air d'agir. La question « existe-t-il un OBJET derrière ce
/// fond ? » est déjà résolue une fois dans le dépôt, par
/// `ComposerBackgroundSoundReplacement.supersededId` — dont le nom parle de son
/// PREMIER usage (que remplacer), pas de la question qu'il tranche. On l'appelle
/// plutôt que d'en écrire la jumelle : deux réponses à une question unique
/// divergeraient le jour où la forme legacy change.
nonisolated enum ComposerSoundPromotion {

    /// L'identifiant de l'objet à faire passer au premier plan — `nil` quand
    /// la promotion n'a rien à quoi s'appliquer.
    ///
    /// `nil` ⇒ **aucune entrée de menu**, jamais une entrée grisée : c'est la
    /// règle que `ComposerSoundActionsMenu` porte déjà pour la suppression, et
    /// la loi 4 du composer (un contrôle existe s'il a un effet).
    static func promotableId(background: StoryAudioPlayerObject?,
                             audioObjects: [StoryAudioPlayerObject]) -> String? {
        ComposerBackgroundSoundReplacement.supersededId(background: background,
                                                        audioObjects: audioObjects)
    }

    /// Où la puce atterrit — le centre s'il est libre, sinon la place suivante
    /// de la cascade.
    ///
    /// Le fond qu'on promeut est EXCLU des positions à éviter : il n'a pas de
    /// place sur la scène tant qu'il est un fond, et s'éviter soi-même ferait
    /// sauter la première place libre sans raison.
    static func landing(on slide: StorySlide, promoting id: String) -> CGPoint {
        StoryObjectPlacement.next(
            avoiding: ComposerScenePosedObjects.positions(on: slide, excluding: id))
    }
}
