import Foundation
import MeeshySDK

/// Portée du lecteur de stories : quels auteurs il navigue, et sur lequel il
/// s'ouvre.
///
/// `StoryViewerContainer` présentait le lecteur par DEUX appels quasi
/// identiques de dix arguments — l'un pour le mode mono-auteur, l'autre pour la
/// navigation inter-auteurs. Ils ont fini par diverger : la branche mono-auteur
/// avait perdu `onReplyToStory`. Comme `StoryActionRailPlan.showsReply` vaut
/// `!isOwnStory && onReplyToStory != nil`, le bouton « Répondre » disparaissait
/// sans le moindre signal — précisément sur le point d'entrée qui en a le plus
/// besoin, l'ouverture d'une story depuis une conversation.
///
/// Extraire la décision ici laisse UN seul site de présentation : un argument
/// ne peut plus être passé d'un côté et oublié de l'autre. La duplication était
/// la cause racine, pas l'argument manquant.
nonisolated enum StoryViewerScope {

    /// Pas d'`Equatable` : `StoryGroup` ne l'est pas, et le déclarer ici
    /// faisait échouer la compilation du target app — donc, en cascade, la
    /// résolution de TOUS les symboles applicatifs depuis le bundle de tests.
    /// Les assertions comparent les identifiants, ce qui est de toute façon
    /// plus lisible en cas d'échec.
    struct Resolved {
        let groups: [StoryGroup]
        let currentIndex: Int
    }

    /// - Parameter singleGroup: le lecteur reste sur un unique auteur (ouverture
    ///   depuis une conversation, le bandeau, une notification ou un lien
    ///   profond) au lieu de permettre le passage à l'auteur suivant.
    static func resolve(all: [StoryGroup],
                        resolvedIndex: Int,
                        singleGroup: Bool) -> Resolved {
        guard singleGroup, all.indices.contains(resolvedIndex) else {
            // Index hors bornes : on rend la navigation complète plutôt que de
            // livrer un lecteur vide. Le cas ne devrait pas se produire —
            // `groupIndex(forUserId:)` a déjà validé — mais un lecteur vide
            // serait un cul-de-sac pour l'utilisateur.
            return Resolved(groups: all,
                            currentIndex: all.indices.contains(resolvedIndex) ? resolvedIndex : 0)
        }
        return Resolved(groups: [all[resolvedIndex]], currentIndex: 0)
    }

    /// **Mes stories : seules les barres des stories EN COURS** (#7887,
    /// directive porteur 2026-09-25). Le groupe de l'auteur garde ses archives
    /// dans le modèle ; le lecteur n'en reçoit que la story qu'on a ouverte
    /// explicitement. Sans story en cours, le groupe reste entier : le lecteur
    /// ne s'ouvre jamais vide.
    static func liveOnly(_ groups: [StoryGroup],
                         authorId: String?,
                         keeping storyId: String?,
                         now: Date) -> [StoryGroup] {
        groups.map { group in
            guard let authorId, group.id == authorId else { return group }
            let live = group.stories.filter { !$0.isExpired(at: now) || $0.id == storyId }
            return live.isEmpty ? group : group.with(stories: live)
        }
    }

    /// La même story, retrouvée dans le groupe filtré ; une archive écartée
    /// retombe sur la première story en cours.
    static func storyIndex(_ index: Int, from original: StoryGroup, into scoped: StoryGroup) -> Int {
        guard original.stories.indices.contains(index) else { return 0 }
        let id = original.stories[index].id
        return scoped.stories.firstIndex(where: { $0.id == id }) ?? 0
    }
}
