/// Marquage « vu » d'une story et impressions, suivi `locallyViewed` (garde
/// « vu » monotone raffinée), résolution de l'interstitiel d'identité
/// inter-groupes (`StoryGroupIntro`), et l'archive auteur (« Mes stories »,
/// stories en cours ET passées).
///
/// Extrait de `StoryViewModel.swift` (#4425) — voir ce fichier pour l'état
/// stocké (`markViewedOutboxEnqueuer`, `introMoodsByUserId`,
/// `introProfileResolver`, `introMoodFeedLoader`, `myStoriesArchiveDrained`, …).

import Foundation
import SwiftUI
import os
import MeeshySDK
import MeeshyUI

extension StoryViewModel {
    private func buildLocallyViewedSet() -> Set<String> {
        var ids = Set<String>()
        for group in storyGroups {
            for story in group.stories where story.isViewed {
                ids.insert(story.id)
            }
        }
        return ids
    }

    /// `id → viewedAt` des stories vues localement (`.distantPast` quand le
    /// moment de la vue est inconnu — caches antérieurs au champ). Sert à la
    /// garde monotone raffinée : une vue sans horodatage cède toujours devant
    /// une édition de contenu.
    func buildLocallyViewedMap() -> [String: Date] {
        var map: [String: Date] = [:]
        for group in storyGroups {
            for story in group.stories where story.isViewed {
                map[story.id] = story.viewedAt ?? .distantPast
            }
        }
        return map
    }

    /// Résout les données de l'interstitiel, cache-first : profil depuis
    /// `CacheCoordinator.profiles` (fresh/stale servis tels quels), fetch
    /// réseau UNIQUEMENT si le cache n'a ni nom ni bannière (persisté au
    /// cache ensuite), mood best-effort depuis le feed statuses de session.
    /// Ne throw jamais : au pire l'interstitiel affiche username + avatar
    /// du groupe (données déjà en main).
    func resolveGroupIntro(for group: StoryGroup) async -> StoryGroupIntro {
        var intro = StoryGroupIntro(userId: group.id, username: group.username)

        switch await CacheCoordinator.shared.profiles.load(for: group.id) {
        case .fresh(let users, _), .stale(let users, _):
            if let user = users.first { Self.applyIntroProfile(user, to: &intro) }
        case .expired, .empty:
            break
        }
        if intro.displayName == nil && intro.bannerURL == nil,
           let fetched = try? await introProfileResolver(group.id) {
            Self.applyIntroProfile(fetched, to: &intro)
            try? await CacheCoordinator.shared.profiles.save([fetched], for: group.id)
        }

        if introMoodsByUserId == nil {
            let posts = (try? await introMoodFeedLoader()) ?? []
            introMoodsByUserId = Dictionary(
                posts.compactMap { $0.toStatusEntry() }.map { ($0.userId, $0) },
                uniquingKeysWith: { a, b in a.createdAt > b.createdAt ? a : b }
            )
        }
        if let mood = introMoodsByUserId?[group.id],
           mood.expiresAt.map({ $0 > Date() }) ?? true {
            intro.moodEmoji = mood.moodEmoji
            intro.moodMessage = mood.content
        }
        return intro
    }

    /// Corps réel du seam ci-dessus — `nonisolated static` pour que la valeur
    /// PAR DÉFAUT de la propriété n'évalue rien d'actor-isolé (Swift 6 :
    /// « actor-isolated default value in a main actor-isolated context »).
    nonisolated static func enqueueMarkStoryViewed(_ storyId: String) async throws {
        let payload = MarkStoryViewedPayload(
            clientMutationId: ClientMutationId.generate(),
            storyId: storyId
        )
        _ = try await OfflineQueue.shared.enqueue(
            .markStoryViewed, payload: payload, conversationId: storyId
        )
        // Sans ce réveil explicite, la ligne dort `.pending` jusqu'à ce qu'une
        // mutation SANS RAPPORT (envoi, réaction) réveille le videur — la
        // pastille affichait « Synchronisation des vues story » en boucle sans
        // jamais se vider. C'était le SEUL site d'enfilement à ne pas le faire :
        // même correctif que `markAsRead` (cf. OutboxFlushTrigger).
        await OutboxFlushTrigger.flushNow()
    }

    /// C3 (unification des remontées, 2026-07-14) : chaque slide de story affiché émet
    /// UNE impression (non dédupliquée, `source: "story"`) pour CE post-slide — aligne
    /// `impressionCount` de la story sur le détail/réel (« chaque visionnage fait monter
    /// les impressions »). Volontairement SÉPARÉ de `markViewed` (vue UNIQUE, coalescée
    /// via l'outbox durable) car l'impression doit monter à CHAQUE visionnage, pas une
    /// seule fois. Fire & forget : l'échec réseau est loggé, jamais toasté (bruit de fond).
    func recordStoryImpression(storyId: String) {
        // #4044 — même frontière que `markViewed` ci-dessous, et pour la même
        // raison : `POST /posts/:id/impression` fait lever Prisma sur un
        // identifiant local. Ici l'appel est fire-and-forget, donc rien ne
        // s'accumule — mais laisser partir la moitié jumelle reviendrait à
        // corriger le symptôme (la file) en gardant la cause (un id local qui
        // atteint le serveur). Doctrine : `MeeshyObjectID`.
        guard MeeshyObjectID.isValid(storyId) else { return }
        Task { [postService] in
            do {
                try await postService.recordImpression(postId: storyId, source: "story")
            } catch {
                Logger.stories.error(
                    "recordStoryImpression failed for \(storyId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    func markViewed(storyId: String) {
        // Fire & forget : l'état « vu » local est posé optimistiquement (local-first).
        // L'échec réseau ne déclenche PAS de toast (marquer-vu est un effet de bord de
        // fond, pas une action utilisateur attendant un feedback — un toast serait du
        // bruit), mais il est désormais LOGGÉ (avant : catch vide → échec invisible,
        // ring « vu » localement mais jamais côté serveur → revert au prochain fetch).
        // #4044 — un identifiant LOCAL (`pending_<uuid>`, story encore en file
        // de publication) n'entre pas dans la file durable : le serveur ne peut
        // pas l'adresser, la ligne y pourrit en 500 jusqu'à `.exhausted`.
        // Doctrine complète : `MeeshyObjectID`. Ne gouverne QUE l'envoi — l'état
        // « vu » local ci-dessous reste posé.
        if MeeshyObjectID.isValid(storyId) {
            Task { [markViewedOutboxEnqueuer] in
                do {
                    try await markViewedOutboxEnqueuer(storyId)
                } catch {
                    Logger.stories.error(
                        "markViewed enqueue failed for \(storyId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        } else {
            Logger.stories.info(
                "markViewed: identifiant non adressable, vu gardé en local — \(storyId, privacy: .public)")
        }

        // Update local state — `isViewed` est un `var` : on le flippe EN PLACE.
        // (Avant : reconstruction via init partiel qui droppait ~13 champs à leur
        // défaut — translations [Prisme cassé après visionnage], currentUserReactions,
        // chaîne de repost repostOfId/originalRepostOfId/repostAuthorName, audioUrl,
        // backgroundAudio, reaction/comment/share/view/repostCount. Et persistStoryCache
        // gravait l'état corrompu en cache → survie au cold-start.) Même pattern que
        // fetchStoriesFromNetwork (`var copy = story; copy.isViewed = true`).
        for i in storyGroups.indices {
            if let j = storyGroups[i].stories.firstIndex(where: { $0.id == storyId }) {
                var updated = storyGroups[i].stories
                updated[j].isViewed = true
                // R11 — horodatage local du vu (DateTime nullable > boolean seul).
                updated[j].viewedAt = Date()
                storyGroups[i] = storyGroups[i].with(stories: updated)
                persistStoryCache()
                // R5 — la story vient d'être VUE : garantir sa relecture
                // offline en protégeant ses médias de l'éviction LRU.
                pinStoryMediaForOfflineReplay(updated[j])
                return
            }
        }
    }

    /// Change le mode de visibilité d'une story (menu « Modifier la
    /// visibilité » de « Mes stories »).
    ///
    /// Écriture locale D'ABORD pour que le checkmark du menu bouge tout de
    /// suite, appel serveur ensuite, restauration de l'état exact d'avant si
    /// l'appel échoue — sinon l'UI affirmerait un changement que le serveur
    /// n'a jamais enregistré.
    ///
    /// Mutation EN PLACE (`visibility` et `visibilityUserIds` sont des `var`),
    /// jamais une reconstruction via init partielle : celle-ci droppait ~13
    /// champs à leur défaut et le cache gravait l'état corrompu (cf. le
    /// commentaire de `markViewed`).
    ///
    /// - Returns: `true` si le serveur a accepté le changement.
    func applyVisibility(storyId: String, visibility: String, userIds: [String]?) async -> Bool {
        guard let groupIndex = storyGroups.firstIndex(where: { $0.stories.contains { $0.id == storyId } }),
              let storyIndex = storyGroups[groupIndex].stories.firstIndex(where: { $0.id == storyId })
        else { return false }

        let previousVisibility = storyGroups[groupIndex].stories[storyIndex].visibility
        let previousUserIds = storyGroups[groupIndex].stories[storyIndex].visibilityUserIds

        write(visibility: visibility, userIds: userIds, groupIndex: groupIndex, storyIndex: storyIndex)

        do {
            _ = try await postService.update(
                postId: storyId,
                content: nil,
                visibility: visibility,
                visibilityUserIds: userIds,
                moodEmoji: nil,
                originalLanguage: nil,
                type: nil,
                removeMediaIds: nil
            )
            return true
        } catch {
            Logger.stories.error(
                "applyVisibility failed for \(storyId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            // La story a pu disparaître (suppression temps réel) pendant l'appel :
            // relocaliser avant de restaurer plutôt que réutiliser des index périmés.
            if let g = storyGroups.firstIndex(where: { $0.stories.contains { $0.id == storyId } }),
               let s = storyGroups[g].stories.firstIndex(where: { $0.id == storyId }) {
                write(visibility: previousVisibility, userIds: previousUserIds, groupIndex: g, storyIndex: s)
            }
            return false
        }
    }

    private func write(visibility: String?, userIds: [String]?, groupIndex: Int, storyIndex: Int) {
        var stories = storyGroups[groupIndex].stories
        stories[storyIndex].visibility = visibility
        stories[storyIndex].visibilityUserIds = userIds
        storyGroups[groupIndex] = storyGroups[groupIndex].with(stories: stories)
        persistStoryCache()
    }

    // MARK: - Archive auteur (« Mes stories », stories en cours ET passées)

    /// Draine `GET /posts/stories/mine` (archive complète — les stories ne
    /// sont plus jamais détruites côté serveur) et fusionne les stories
    /// manquantes dans le groupe de l'utilisateur courant. La page du tray
    /// borne son archive auteur à 7 j pour ne pas noyer les amis ;
    /// « Mes stories » lit ICI l'historique au-delà. Idempotent (dédup par id),
    /// drain borné à 10 pages de 50.
    func loadMyStoriesArchive() async {
        guard let user = AuthManager.shared.currentUser else { return }
        // Local-first : un seul drain par session — l'archive est immuable côté
        // serveur (les nouvelles stories arrivent par le flux temps réel /
        // publication locale, la republication par `applyRepublishedStory`).
        // Sans ce garde, chaque apparition de MyStoriesView relançait jusqu'à
        // 10 pages de refetch d'un contenu déjà présent.
        guard !myStoriesArchiveDrained else { return }
        myStoriesArchiveDrained = true
        var cursor: String? = nil
        var fetched: [APIPost] = []
        for _ in 0..<10 {
            guard let response = try? await storyService.listMine(cursor: cursor, limit: 50) else { break }
            fetched.append(contentsOf: response.data)
            guard response.pagination?.hasMore == true,
                  let next = response.pagination?.nextCursor else { break }
            cursor = next
        }
        guard !fetched.isEmpty,
              let archiveGroup = fetched.toStoryGroups(currentUserId: user.id).first(where: { $0.id == user.id })
        else {
            // Rien reçu (offline, erreur, archive vide) : rendre le drain
            // retentable — le garde ne doit verrouiller qu'un drain ABOUTI.
            myStoriesArchiveDrained = false
            return
        }

        if let idx = groupIndex(forUserId: user.id) {
            let existing = storyGroups[idx].stories
            let existingIds = Set(existing.map(\.id))
            let missing = archiveGroup.stories.filter { !existingIds.contains($0.id) }
            guard !missing.isEmpty else { return }
            let merged = (existing + missing).sorted { $0.createdAt < $1.createdAt }
            storyGroups[idx] = storyGroups[idx].with(stories: merged)
        } else {
            storyGroups.append(archiveGroup)
        }
        persistStoryCache()
    }

    /// Applique le résultat d'une republication (`POST /posts/:id/republish`) :
    /// la MÊME story (même id) repart avec des dates fraîches et un engagement
    /// remis à zéro — on remplace l'item en place et on re-trie le groupe.
    func applyRepublishedStory(_ post: APIPost) {
        guard let user = AuthManager.shared.currentUser,
              let refreshed = [post].toStoryGroups(currentUserId: user.id)
                  .first(where: { $0.id == user.id })?.stories.first
        else { return }

        if let gIdx = groupIndex(forUserId: user.id),
           let sIdx = storyGroups[gIdx].stories.firstIndex(where: { $0.id == refreshed.id }) {
            var stories = storyGroups[gIdx].stories
            stories[sIdx] = refreshed
            storyGroups[gIdx] = storyGroups[gIdx].with(stories: stories.sorted { $0.createdAt < $1.createdAt })
            persistStoryCache()
        } else {
            insertOrAppendStoryItem(refreshed, forAuthor: post.author)
        }
    }

    func groupIndex(forUserId userId: String) -> Int? {
        storyGroups.firstIndex { $0.id == userId }
    }

    func groupIndex(forStoryId storyId: String) -> Int? {
        storyGroups.firstIndex { group in
            group.stories.contains { $0.id == storyId }
        }
    }

    func hasStories(forUserId userId: String) -> Bool {
        storyGroups.contains { $0.id == userId }
    }

    func hasUnviewedStories(forUserId userId: String) -> Bool {
        storyGroups.first { $0.id == userId }?.hasUnviewed ?? false
    }

    /// Source unique de l'état d'anneau story d'un avatar, toutes surfaces.
    /// `.none` si l'utilisateur n'a aucune story active (groupe absent ou
    /// entièrement expiré), `.unread` s'il reste au moins une story non vue.
    func storyRingState(forUserId userId: String) -> StoryRingState {
        guard let group = storyGroups.first(where: { $0.id == userId }),
              !group.isFullyExpired() else { return .none }
        return group.hasUnviewed ? .unread : .read
    }
}
