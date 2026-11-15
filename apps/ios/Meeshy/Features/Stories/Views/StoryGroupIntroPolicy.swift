import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Group intro (interstitiel d'identité inter-groupes)

/// Quand présenter l'interstitiel d'identité d'un groupe.
///
/// Règle resserrée le 2026-08-20 sur directive user : l'interlude s'affiche
/// UNIQUEMENT quand on lit les groupes à la suite — à chaque changement de
/// groupe, en avant comme en arrière, mes propres stories comprises — et
/// JAMAIS à la première ouverture du viewer, qui doit être instantanée. Le
/// site d'appel unique est donc `adaptiveOnChange(of: currentGroupIndex)` ;
/// l'`onAppear` n'appelle plus `presentGroupIntroIfNeeded()`. La règle reste
/// indépendante de l'identité de l'auteur (simplification 2026-07-25
/// conservée : un filtre « est-ce moi ? » produisait un comportement à trous).
///
/// S'y ajoutent deux exclusions techniques : le mode preview du composer,
/// qui n'a pas d'identité à annoncer, et un groupe sans aucune story affichable.
nonisolated enum StoryGroupIntroPolicy {
    static func shouldPresent(isPreviewMode: Bool, hasEntryStory: Bool) -> Bool {
        !isPreviewMode && hasEntryStory
    }

    /// Avance de l'apparition de la story sur la fin annoncée de l'interlude
    /// (directive user 2026-07-26). Le slide ne commence PAS à monter quand le
    /// voile a fini de partir : les deux se recouvrent sur ces 200 ms, sinon
    /// l'enchaînement se lit comme deux animations successives — voile qui
    /// s'en va, puis, après un blanc, contenu qui arrive.
    static let revealOverlap: TimeInterval = 0.2

    /// Temps d'attente RÉEL avant de déclencher le retrait du voile, pour une
    /// durée nominale d'interlude donnée.
    ///
    /// `max(0, …)` n'est pas défensif par principe : `Task.sleep` sur une durée
    /// négative lève / se comporte de travers, et une durée totale inférieure au
    /// recouvrement (interlude volontairement très court) produirait exactement
    /// ça. On plafonne donc à « pas d'attente », c'est-à-dire révélation
    /// immédiate — le comportement correct dans ce cas.
    static func holdDuration(total: TimeInterval) -> TimeInterval {
        max(0, total - revealOverlap)
    }

    /// Animation de disparition de l'interlude, dictée par la transition
    /// d'OUVERTURE du slide qui va être révélé (directive user 2026-07-25 :
    /// « la manière dont l'interlude disparaît dépend de comment le premier
    /// slide a configuré son apparition »).
    ///
    /// L'interlude et le slide forment un seul mouvement : c'est le voile qui
    /// se retire selon la grammaire choisie par l'auteur, pas un fondu générique
    /// suivi d'une entrée sans rapport. Les durées reprennent celles documentées
    /// sur `StoryTransitionEffect`.
    static func dismissAnimation(for opening: StoryTransitionEffect?) -> Animation {
        switch opening {
        case .zoom, .slide:
            // Les deux entrées à ressort : la sortie doit avoir le même élan,
            // sinon le slide « rattrape » un voile encore en train de partir.
            return .spring(response: 0.38, dampingFraction: 0.82)
        case .reveal:
            return .easeOut(duration: 0.4)
        case .fade, .none:
            return .easeOut(duration: 0.3)
        }
    }
}
