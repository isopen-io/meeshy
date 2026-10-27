/// Règles du tray de stories, sans état ni dépendance UI : tri, fusion d'un
/// groupe, applications des événements socket (vu, édition, traductions,
/// réactions) et insertion d'un item — chaque fonction prend le tableau de
/// groupes en `inout` et rend si elle a touché quelque chose. `StoryViewModel`
/// garde l'état (`storyGroups`), la persistance du cache et les effets.
///
/// Extrait de `StoryViewModel.swift`.

import Foundation
import SwiftUI
import os
import MeeshySDK

enum StoryTrayRules {

    /// Mimics the sort applied by `Array<APIPost>.toStoryGroups(currentUserId:)`
    /// so the tray ordering stays consistent between cold-start (REST fetch)
    /// and live updates (Socket.IO sink).
    static func sort(_ groups: inout [StoryGroup], currentUserId: String?) {
        groups.sort { a, b in
            if let uid = currentUserId {
                if a.id == uid { return true }
                if b.id == uid { return false }
            }
            if a.hasUnviewed != b.hasUnviewed { return a.hasUnviewed }
            return (a.latestStory?.createdAt ?? .distantPast) > (b.latestStory?.createdAt ?? .distantPast)
        }
    }

    /// Fusion d'UN groupe fraîchement converti dans le tray (voir
    /// `StoryViewModel.insertOrMergeStoryGroups` pour le contrat).
    static func merge(
        _ newGroup: StoryGroup,
        into groups: inout [StoryGroup],
        selfId: String?,
        replacingExisting: Bool
    ) {
        if let idx = groups.firstIndex(where: { $0.id == newGroup.id }) {
            let isOwnGroup = newGroup.id == selfId
            var stories = groups[idx].stories
            for story in newGroup.stories {
                if let j = stories.firstIndex(where: { $0.id == story.id }) {
                    guard replacingExisting else { continue }
                    var replacement = story
                    // Monotone raffinée : cède quand le CONTENU a été édité
                    // après la vue locale (reset d'engagement) — jamais pour
                    // ses propres stories (état « vu » client-only).
                    if stories[j].isViewed && !replacement.isViewed,
                       isOwnGroup || StoryViewModel.shouldKeepLocalViewed(
                           localViewedAt: stories[j].viewedAt,
                           contentEditedAt: replacement.contentEditedAt
                       ) {
                        replacement.isViewed = true
                        replacement.viewedAt = stories[j].viewedAt
                    }
                    stories[j] = replacement
                } else {
                    stories.append(story)
                }
            }
            stories.sort { $0.createdAt < $1.createdAt }
            groups[idx] = groups[idx].with(stories: stories)
        } else {
            groups.append(newGroup)
        }
    }

    /// `story:viewed` — `true` quand la story est dans le tray.
    static func applyViewed(_ viewedData: SocketStoryViewedData, to groups: inout [StoryGroup]) -> Bool {
        for i in groups.indices {
            if let j = groups[i].stories.firstIndex(where: { $0.id == viewedData.storyId }) {
                var updatedStories = groups[i].stories
                // viewCount = total autoritatif porté par l'event ; toujours appliqué.
                // (Avant : ignoré → le compteur de vues restait stale chez l'auteur
                // qui regarde sa propre story pendant que des viewers arrivent.)
                updatedStories[j].viewCount = viewedData.viewCount
                updatedStories[j].isViewed = true
                groups[i] = groups[i].with(stories: updatedStories)
                return true
            }
        }
        return false
    }

    /// `story:updated` pour UN groupe converti — `true` quand le groupe est
    /// dans le tray.
    static func applyUpdate(
        _ updatedGroup: StoryGroup,
        engagementReset: Bool,
        selfId: String?,
        to groups: inout [StoryGroup]
    ) -> Bool {
        guard let groupIdx = groups.firstIndex(where: { $0.id == updatedGroup.id }) else { return false }
        let isOwnGroup = updatedGroup.id == selfId
        var stories = groups[groupIdx].stories
        for newStory in updatedGroup.stories {
            if let storyIdx = stories.firstIndex(where: { $0.id == newStory.id }) {
                var replacement = newStory
                // Local-first : `isViewed` est posé en optimiste par markViewed
                // (fire-and-forget) ; le serveur peut lagger → un `isViewedByMe`
                // stale dans story:updated reverterait l'anneau en « non-vu ».
                // Viewed est MONOTONE (une fois vu, reste vu) — SAUF quand
                // l'édition a remis l'engagement à zéro (flag de l'event, ou
                // `contentEditedAt` postérieur à la vue locale pour le chemin
                // REST). Même garde que fetchStoriesFromNetwork.
                if stories[storyIdx].isViewed && !replacement.isViewed,
                   isOwnGroup || (!engagementReset && StoryViewModel.shouldKeepLocalViewed(
                       localViewedAt: stories[storyIdx].viewedAt,
                       contentEditedAt: replacement.contentEditedAt
                   )) {
                    replacement.isViewed = true
                    replacement.viewedAt = stories[storyIdx].viewedAt
                }
                stories[storyIdx] = replacement
            }
        }
        groups[groupIdx] = groups[groupIdx].with(stories: stories)
        return true
    }

    /// Applique `mutation` à la story `postId` du premier groupe qui la porte —
    /// `false` quand elle n'est pas dans le tray.
    static func mutateStory(
        postId: String,
        in groups: inout [StoryGroup],
        _ mutation: (inout StoryItem) -> Void
    ) -> Bool {
        for i in groups.indices {
            guard let j = groups[i].stories.firstIndex(where: { $0.id == postId }) else { continue }
            var stories = groups[i].stories
            mutation(&stories[j])
            groups[i] = groups[i].with(stories: stories)
            return true
        }
        return false
    }

    /// Increment or decrement the story's `reactionCount` and toggle the
    /// current viewer's emoji presence in `currentUserReactions` if the
    /// event was triggered by this device.
    static func applyReactionDelta(
        to item: inout StoryItem,
        emoji: String,
        userId: String,
        myId: String?,
        delta: Int
    ) {
        item.reactionCount = max(0, item.reactionCount + delta)
        if let myId, userId == myId {
            var mine = item.currentUserReactions ?? []
            if delta > 0 {
                if !mine.contains(emoji) { mine.append(emoji) }
            } else {
                mine.removeAll { $0 == emoji }
            }
            item.currentUserReactions = mine
        }
    }

    /// Insertion dédupliquée par id d'un item sous le groupe de son auteur
    /// (créé en tête si absent).
    static func insert(
        _ item: StoryItem,
        authorId: String,
        authorName: String,
        authorAvatar: String?,
        into groups: inout [StoryGroup]
    ) {
        if let idx = groups.firstIndex(where: { $0.id == authorId }) {
            var updated = groups[idx].stories
            // Déduplication par id : un insert optimiste suivi de l'écho serveur /
            // socket (ou d'un 2e chemin de publish) ne doit JAMAIS produire deux
            // entrées identiques dans le groupe — sinon le viewer affiche la même
            // story deux fois (2 segments de progression identiques).
            if let existing = updated.firstIndex(where: { $0.id == item.id }) {
                updated[existing] = item
            } else {
                updated.append(item)
            }
            groups[idx] = groups[idx].with(stories: updated)
        } else {
            groups.insert(StoryGroup(
                id: authorId,
                username: authorName,
                avatarColor: DynamicColorGenerator.colorForName(authorName),
                avatarURL: authorAvatar,
                stories: [item]
            ), at: 0)
        }
    }
}

/// Lecture paginée du tray : suit `pagination.nextCursor` tant que le serveur
/// annonce `hasMore`, dans la limite de `StoryViewModel.maxTrayPagesPerPass`.
///
/// La page est FILTRÉE par `updatedAt` mais ORDONNÉE par `(createdAt, id)`,
/// et son curseur porte sur ce même couple : paginer parcourt donc la
/// fenêtre EXACTEMENT, sans saut ni doublon. C'est ce qui distingue ce cas
/// de celui des conversations (cycle 79), où escalader vers un fetch complet
/// était le seul recours — ici le fetch complet emprunte la MÊME route
/// plafonnée à 50 : il ne rattraperait rien.
///
/// Avant ce drain, `hasMore`/`nextCursor` n'avaient AUCUN lecteur dans tout
/// le dépôt : le tray était silencieusement coupé à 50 stories pour tout le
/// monde, delta comme fetch complet.
struct StoryTrayPager {
    let storyService: StoryServiceProviding

    /// Résultat d'une passe de tray, pages recollées.
    struct DrainedStoryPages {
        let posts: [APIPost]
        let deletedStoryIds: Set<String>
        /// Le serveur a plafonné ses tombstones : des disparitions manquent, et
        /// elles n'ont AUCUN curseur de reprise.
        let tombstonesTruncated: Bool
    }

    enum StoryTrayPageError: Error {
        /// Une page a répondu `success: false` — indiscernable d'une panne, donc
        /// traitée comme telle plutôt que recollée en silence.
        case unsuccessfulPage
    }

    func drain(updatedSince: Date?) async throws -> DrainedStoryPages {
        var posts: [APIPost] = []
        var deletedStoryIds = Set<String>()
        var tombstonesTruncated = false
        var cursor: String?

        for _ in 0..<StoryViewModel.maxTrayPagesPerPass {
            let response = try await storyService.list(
                cursor: cursor,
                limit: StoryViewModel.trayPageLimit,
                updatedSince: updatedSince
            )
            guard response.success else { throw StoryTrayPageError.unsuccessfulPage }

            posts.append(contentsOf: response.data)
            deletedStoryIds.formUnion(response.meta?.deletedStoryIds ?? [])
            // Les tombstones voyagent page par page : la troncature vue sur
            // N'IMPORTE laquelle vaut pour la passe entière.
            tombstonesTruncated = tombstonesTruncated || (response.meta?.deletedStoryIdsTruncated ?? false)

            // Un `nextCursor` vide avec `hasMore: true` serait une page suivante
            // qu'on ne sait pas demander : on s'arrête plutôt que de rejouer la
            // même page indéfiniment.
            guard response.pagination?.hasMore == true,
                  let next = response.pagination?.nextCursor,
                  !next.isEmpty else {
                return DrainedStoryPages(
                    posts: posts,
                    deletedStoryIds: deletedStoryIds,
                    tombstonesTruncated: tombstonesTruncated
                )
            }
            cursor = next
        }

        Logger.messages.error(
            "[StoryVM] Tray drain stopped at the \(StoryViewModel.maxTrayPagesPerPass, privacy: .public)-page cap while the server still announced more"
        )
        return DrainedStoryPages(
            posts: posts,
            deletedStoryIds: deletedStoryIds,
            tombstonesTruncated: tombstonesTruncated
        )
    }
}
