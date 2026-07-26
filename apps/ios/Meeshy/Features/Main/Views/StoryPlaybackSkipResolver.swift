import Foundation
import MeeshySDK

/// Décide où doit atterrir la lecture quand la position courante pointe sur
/// une story illisible.
///
/// Deux raisons de sauter une slide, traitées d'un même geste parce qu'elles
/// posent la même question — « où va la lecture ensuite ? » :
///
/// - **Expirée.** Le TTL du cache dépasse la fenêtre de 24 h (voir plus bas).
/// - **Vide.** Des stories sans le moindre contenu affichable existent en base
///   (constaté le 2026-07-26 : `media: []`, `textObjects: []`, `content: null`).
///   Les rendre donnait un écran NOIR pendant toute la durée de slide.
///   Cf. `StoryContentPresence`, délibérément conservateur.
///
/// Le TTL du cache du tray est volontairement plus long que la fenêtre de
/// visibilité de 24 h — ça évite de re-télécharger avatars et métadonnées à
/// chaque démarrage à froid, mais ça fait remonter au lecteur des stories que
/// le GC serveur a déjà supprimées. On les filtre ici plutôt qu'au niveau du
/// tray : l'anneau de l'auteur doit rester visible pour la continuité UX, mais
/// afficher une story expirée renverrait 404 sur les réactions.
///
/// Le comportement historique fermait le lecteur dès que la fin du groupe
/// courant était expirée. Pour quelqu'un qui parcourt cinq auteurs, tomber sur
/// un auteur fraîchement expiré éjectait de TOUTE la session — les auteurs
/// suivants devenaient inatteignables sans rouvrir le tray. On saute donc vers
/// le prochain groupe qui a réellement quelque chose à montrer, et on ne ferme
/// qu'une fois la liste épuisée.
///
/// Fonction pure (`now` injecté, aucune dépendance à la View) pour que la
/// règle soit testable sans instancier SwiftUI — même patron que
/// `StoryIndexResolver`.
/// `nonisolated` sur le TYPE, pas seulement sur ses méthodes : le projet
/// impose `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, qui isolerait jusqu'à la
/// conformance `Equatable` de `Outcome` — inutilisable depuis une suite de
/// tests non-MainActor.
nonisolated enum StoryPlaybackSkipResolver {

    enum Outcome: Equatable {
        /// Rien à faire : la position courante est lisible.
        case stay
        /// Avancer dans le groupe courant.
        case advanceStory(index: Int)
        /// Le groupe courant n'a plus rien : passer à un groupe qui a du contenu.
        case advanceGroup(groupIndex: Int, storyIndex: Int)
        /// Plus rien nulle part.
        case close
    }

    static func resolve(groups: [StoryGroup],
                        groupIndex: Int,
                        storyIndex: Int,
                        currentUserId: String?,
                        now: Date) -> Outcome {
        guard groups.indices.contains(groupIndex) else { return .stay }
        let group = groups[groupIndex]
        guard !group.stories.isEmpty else { return .stay }

        // L'auteur revisite ses PROPRES stories expirées pour lire réactions et
        // commentaires — un bandeau d'expiration marque l'état dans l'overlay
        // plutôt qu'un saut (spec 2026-06-23).
        if let currentUserId, group.id == currentUserId { return .stay }

        var idx = storyIndex
        while idx < group.stories.count, isUnplayable(group.stories[idx], now: now) {
            idx += 1
        }
        if idx < group.stories.count {
            return idx == storyIndex ? .stay : .advanceStory(index: idx)
        }

        // Toute la fin du groupe est illisible : chercher le prochain groupe
        // affichable. Le groupe suivant peut l'être aussi — on continue plutôt
        // que de fermer au premier obstacle.
        var next = groupIndex + 1
        while next < groups.count {
            let candidate = groups[next]
            if let entry = entryIndex(of: candidate, now: now) {
                return .advanceGroup(groupIndex: next, storyIndex: entry)
            }
            next += 1
        }
        return .close
    }

    /// Une slide qu'on ne peut pas donner à voir : périmée, ou sans le moindre
    /// contenu. Un seul prédicat pour que la boucle de saut et le calcul
    /// d'index d'entrée ne puissent pas diverger.
    private static func isUnplayable(_ story: StoryItem, now: Date) -> Bool {
        story.isExpired(at: now) || !StoryContentPresence.hasRenderableContent(story)
    }

    /// Index d'entrée d'un groupe — MÊME règle que `StoryViewerView.entryStory`
    /// et que l'aperçu du cube inter-groupes : première non-vue lisible, sinon
    /// première lisible. `nil` = le groupe n'a rien à montrer.
    private static func entryIndex(of group: StoryGroup, now: Date) -> Int? {
        group.stories.firstIndex(where: { !$0.isViewed && !isUnplayable($0, now: now) })
            ?? group.stories.firstIndex(where: { !isUnplayable($0, now: now) })
    }
}
