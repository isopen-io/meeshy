import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

@MainActor
class StoryViewModel: ObservableObject, StoryPublishExecutor {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    /// Versioned cache key for the home tray story list. Bump the suffix
    /// whenever `StoryItem` / `StoryGroup` gains a non-optional field or a
    /// formerly-dropped enrichment becomes load-bearing — the previous
    /// version's serialized JSON would deserialize with that field missing.
    /// One-shot invalidation, no perma-refetch noise.
    /// `_v2` (2026-05-28): forces a re-fetch so `visibility`, `shareCount`,
    /// `viewCount`, `repostCount`, `currentUserReactions` reach clients that
    /// cached stories before `toStoryGroups` started propagating them
    /// (Partager button stayed hidden on PUBLIC stories until this).
    static let storiesCacheKey = "recent_tray_v2"

    /// Taille de page demandée au tray. `GET /posts/feed/stories` plafonne
    /// `limit` à 50 côté serveur : annoncer davantage ne rend pas une ligne de
    /// plus et désarme le repli heuristique (leçon du cycle 79, où un
    /// `limit=500` face à un plafond de 100 avait rendu la garde inatteignable).
    static let trayPageLimit = 50

    /// Plafond de pages drainées en une passe — 300 stories, très au-delà d'un
    /// cercle réel. Il borne le coût d'une fenêtre anormale et, surtout, d'un
    /// serveur qui annoncerait `hasMore` à tort : sans lui, la boucle ne
    /// s'arrêterait jamais.
    static let maxTrayPagesPerPass = 6

    @Published var storyGroups: [StoryGroup] = []
    @Published var isLoading = false
    @Published var showStoryComposer = false
    /// Brouillon à reprendre, consommé par le cover racine du composer
    /// (`StoryComposerCover`). Posé AVANT `showStoryComposer = true` pour que
    /// le composer s'ouvre SUR ce brouillon et autosauvegarde sous son id —
    /// sans adoption, il écrirait sous un id neuf et dupliquerait le brouillon.
    var pendingDraftId: String?
    /// C5 — file LOCALE des publications en cours. Ordre = ordre des taps
    /// « Publier ». Une seule monte à la fois (`currentUploadId`), mais rien
    /// n'empêche d'en empiler d'autres : plus aucune exclusion mutuelle à la
    /// CRÉATION. L'échec de l'une ne bloque pas les suivantes.
    @Published private(set) var activeUploads: [StoryUploadState] = []
    /// Vue de compatibilité : l'upload que les surfaces d'avatar mettent en
    /// avant (un échec l'emporte, sinon la tête de file). `activeUploads` étant
    /// `@Published`, toutes les vues qui lisent cette propriété calculée
    /// continuent de se rafraîchir.
    var activeUpload: StoryUploadState? { StoryUploadPresentation.surfaced(in: activeUploads)?.upload }
    /// Id de l'upload qui MONTE en ce moment. `nil` = la file peut démarrer le
    /// suivant.
    var currentUploadId: String?
    /// Incrémenté quand une cover de tray vient d'être rendue côté récepteur —
    /// invalide le tray pour que `latestStoryThumbnailURL` relise le cache local.
    @Published private(set) var receiverCoverRenderTick = 0
    var uploadTask: Task<Void, Never>?
    /// Garde local-first du drain d'archive « Mes stories » : un seul drain
    /// réseau ABOUTI par session (cf. `loadMyStoriesArchive`).
    var myStoriesArchiveDrained = false

    let storyService: StoryServiceProviding
    let postService: PostServiceProviding
    var cancellables = Set<AnyCancellable>()
    private let socialSocket: SocialSocketProviding
    let api: APIClientProviding
    let visibilityStore: StoryVisibilityPreferenceStore
    /// Cycle de vie de publication du brouillon (directive 2026-08-02) :
    /// succès online (`launchUploadTask`), annulation (`cancelUpload`) et
    /// édition (`runStoryUpdate`) y écrivent. Propriété injectable — même
    /// raison que les autres dépendances de ce VM — pour que les tests
    /// n'exercent jamais le singleton `.shared` (base réelle du sandbox app).
    let draftStore: StoryDraftStore

    init(
        storyService: StoryServiceProviding = StoryService.shared,
        postService: PostServiceProviding = PostService.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        api: APIClientProviding = APIClient.shared,
        visibilityStore: StoryVisibilityPreferenceStore = .init(),
        draftStore: StoryDraftStore = .shared
    ) {
        self.storyService = storyService
        self.postService = postService
        self.socialSocket = socialSocket
        self.api = api
        self.visibilityStore = visibilityStore
        self.draftStore = draftStore
        observeReconnectionForRetry()
        observeQueueDispositions()
    }

    /// C6 — dernier mode d'audience choisi, injecté au composer à son
    /// ouverture. Passe par le VM (et non par un statique global) pour qu'une
    /// seule instance de magasin — donc une seule suite `UserDefaults` — serve
    /// l'écriture et la lecture, y compris sous test.
    var lastComposerVisibility: String { visibilityStore.lastVisibility() }

    /// Depuis S3.4 la queue peut reprendre un item que le VM a relâché : sans
    /// cet abonnement, un anneau rouge FANTÔME survivrait à une publication
    /// réussie par le drain de fond. `publishFailed` retire aussi la ligne —
    /// l'item est alors listé dans `MyStoriesView` via
    /// `StoryPublishService.failedItems`, une seule affordance et pas deux.
    private func observeQueueDispositions() {
        StoryPublishQueue.shared.publishSucceeded.publisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.removeActiveUpload(queueId: payload.queueId)
            }
            .store(in: &cancellables)

        StoryPublishQueue.shared.publishFailed.publisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.removeActiveUpload(queueId: payload.queueId)
            }
            .store(in: &cancellables)
    }

    private func removeActiveUpload(queueId: String) {
        guard let idx = activeUploads.firstIndex(where: { $0.queueId == queueId }) else { return }
        let removed = activeUploads.remove(at: idx)
        if currentUploadId == removed.id {
            uploadTask?.cancel()
            uploadTask = nil
            currentUploadId = nil
        }
        drainUploadsIfNeeded()
    }

    // MARK: - Load Stories

    func loadStories(forceNetwork: Bool = false) async {
        guard !isLoading else { return }

        if forceNetwork {
            isLoading = true
            await fetchStoriesFromNetwork()
            isLoading = false
            return
        }

        let cached = await CacheCoordinator.shared.stories.load(for: Self.storiesCacheKey)
        switch cached {
        case .fresh(let data, _):
            storyGroups = data
            // Le cache survit délibérément à la fenêtre de visibilité d'une
            // story : sans cette purge, il ressert des stories mortes et le
            // prefetch ci-dessous irait re-télécharger leurs médias.
            purgeDeadStories()
            sortStoryGroupsInPlace()
            prefetchAllStoryMedia(storyGroups)
            renderMissingReceiverCovers()
            return
        case .stale(let data, _):
            storyGroups = data
            purgeDeadStories()
            sortStoryGroupsInPlace()
            prefetchAllStoryMedia(storyGroups)
            renderMissingReceiverCovers()
            // R8 inc.1 — le refresh silencieux passe en DELTA quand le cache
            // porte un curseur updatedAt (sinon nil → full historique). Curseur
            // dérivé du tray APRÈS purge : il doit refléter ce qu'on détient
            // encore. Le dériver d'une story qu'on vient de retirer avancerait
            // le curseur au-delà de notre état réel — le delta suivant sauterait
            // alors les tombstones de cet intervalle.
            let since = Self.deltaSince(for: storyGroups)
            Task { [weak self] in await self?.fetchStoriesFromNetwork(deltaSince: since) }
            return
        case .expired, .empty:
            break
        }

        isLoading = true
        await fetchStoriesFromNetwork()
        isLoading = false
    }

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

    /// Suit `pagination.nextCursor` tant que le serveur annonce `hasMore`.
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
    private func drainStoryPages(updatedSince: Date?) async throws -> DrainedStoryPages {
        var posts: [APIPost] = []
        var deletedStoryIds = Set<String>()
        var tombstonesTruncated = false
        var cursor: String?

        for _ in 0..<Self.maxTrayPagesPerPass {
            let response = try await storyService.list(
                cursor: cursor,
                limit: Self.trayPageLimit,
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
            "[StoryVM] Tray drain stopped at the \(Self.maxTrayPagesPerPass, privacy: .public)-page cap while the server still announced more"
        )
        return DrainedStoryPages(
            posts: posts,
            deletedStoryIds: deletedStoryIds,
            tombstonesTruncated: tombstonesTruncated
        )
    }

    func fetchStoriesFromNetwork(deltaSince: Date? = nil) async {
        // R8 inc.1 — refetch silencieux DELTA : quand le cache fournit un
        // curseur (max updatedAt), on ne demande que les stories créées ou
        // modifiées depuis (G1a serveur). Merge REPLACE (isViewed monotone),
        // jamais d'overwrite du tray — les stories pendantes et l'état local
        // survivent par construction. Toute erreur delta retombe sur le full
        // historique ci-dessous (résilience > économie).
        if let deltaSince {
            do {
                let drained = try await drainStoryPages(updatedSince: deltaSince)
                // Tombstones plafonnés : la purge qu'on tient est INCOMPLÈTE, et
                // aucun curseur ne permet de réclamer la suite. Le seul geste qui
                // fasse sortir les fantômes restants est le remplacement du tray
                // par un fetch complet — on tombe donc volontairement dessus au
                // lieu de fusionner une couverture qu'on sait trouée. C'est
                // l'inverse du geste de la page tronquée juste au-dessus, qui se
                // rattrape, elle, en paginant.
                if drained.tombstonesTruncated {
                    Logger.messages.error("[StoryVM] Server truncated its story tombstones — escalating to a full tray fetch")
                } else {
                    let deltaGroups = drained.posts.toStoryGroups(currentUserId: AuthManager.shared.currentUser?.id)
                    if !deltaGroups.isEmpty {
                        insertOrMergeStoryGroups(deltaGroups, replacingExisting: true)
                    }
                    // Le merge ci-dessus est additif — il ne peut RIEN retirer.
                    // Les disparitions arrivent par les tombstones du serveur
                    // (`meta.deletedStoryIds`), seul canal capable de rattraper
                    // une suppression survenue app fermée ou hors-ligne. Appelé
                    // même sur un delta vide : une réponse sans aucune story
                    // peut très bien ne porter QUE des disparitions.
                    purgeDeadStories(deletedIds: drained.deletedStoryIds)
                    if !deltaGroups.isEmpty {
                        prefetchAllStoryMedia(storyGroups)
                        renderMissingReceiverCovers()
                    }
                    return
                }
            } catch {
                Logger.messages.error("[StoryVM] Delta refresh failed (falling back to full): \(error.localizedDescription)")
            }
        }

        // Capture les stories optimistes hors-ligne AVANT l'overwrite serveur :
        // le payload `getStories` ne contient pas les stories non encore publiées,
        // donc sans ré-injection elles disparaîtraient du tray de l'auteur après
        // un refetch (alors qu'elles sont toujours en attente dans la queue).
        let pendingBeforeFetch = currentPendingStoryItems()

        do {
            // Drainé lui aussi : ce chemin est celui qui REMPLACE le tray, donc
            // une page tronquée n'y laisse pas seulement un trou — elle EFFACE
            // les stories coupées de l'état affiché, et le cache qu'on sauve
            // juste après grave la troncature.
            let drained = try await drainStoryPages(updatedSince: nil)

            var groups = drained.posts.toStoryGroups()

            // Preserve locally-viewed state for stories the API hasn't synced yet.
            // Garde raffinée : une édition de CONTENU postérieure à la vue
            // locale (reset d'engagement serveur) fait céder la monotonie —
            // sauf pour ses PROPRES stories, dont l'état « vu » est
            // client-only par construction (recordView exclut l'auteur).
            let locallyViewed = buildLocallyViewedMap()
            let selfId = AuthManager.shared.currentUser?.id
            if !locallyViewed.isEmpty {
                groups = groups.map { group in
                    let isOwnGroup = group.id == selfId
                    let merged = group.stories.map { story in
                        guard !story.isViewed, let viewedAt = locallyViewed[story.id] else { return story }
                        guard isOwnGroup || Self.shouldKeepLocalViewed(
                            localViewedAt: viewedAt == .distantPast ? nil : viewedAt,
                            contentEditedAt: story.contentEditedAt
                        ) else { return story }
                        var copy = story; copy.isViewed = true; return copy
                    }
                    return group.with(stories: merged)
                }
            }

            storyGroups = groups

            // Ré-injecte les stories optimistes hors-ligne encore en attente
            // (le serveur ne les renvoie pas). Dédupliqué par id : si le
            // serveur a déjà la version publiée, elle a un autre id et la
            // réconciliation a déjà retiré le pending — pas de doublon.
            if !pendingBeforeFetch.isEmpty, let user = AuthManager.shared.currentUser {
                let authorName = user.displayName ?? user.username
                for item in pendingBeforeFetch {
                    insertOrAppendStoryItem(
                        item,
                        authorId: user.id,
                        authorName: authorName,
                        authorAvatar: user.avatar
                    )
                }
            }

            // Tri unifié (ma story d'abord > non-vues > récence), identique au
            // chemin socket. `toStoryGroups()` est appelé sans `currentUserId`
            // ici, donc sans ce re-tri la story « Moi » n'arrivait pas en tête
            // au chargement réseau/cold-start — incohérent avec le tri appliqué
            // par les events socket (2026-06-01). On sauve la version triée pour
            // que les chemins .fresh/.stale servent déjà le bon ordre.
            sortStoryGroupsInPlace()
            try? await CacheCoordinator.shared.stories.save(storyGroups, for: Self.storiesCacheKey)
            prefetchAllStoryMedia(storyGroups)
            renderMissingReceiverCovers()
        } catch {
            Logger.messages.error("[StoryVM] Failed to load stories: \(error.localizedDescription)")
        }
    }

    // MARK: - Background Prefetch (triggered on story load)

    /// URLs média déjà préchargées dans cette session — garde de déduplication.
    ///
    /// `prefetchAllStoryMedia` est rappelé à CHAQUE `loadStories` (y compris sur
    /// cache hit `.fresh`/`.stale`) ET à chaque refetch SWR. Sans ce garde, ouvrir
    /// le tray relance des dizaines de tâches `data(for:)` qui re-sondent le disque
    /// pour des médias déjà en cache à chaque ouverture — du travail redondant qui
    /// alimente le lag ressenti à l'ouverture des stories. Une fois une URL servie
    /// depuis le cache, on ne la re-prefetch plus de la session (les URLs média sont
    /// content-addressed donc immuables ; le viewer garde son chemin de charge à la
    /// demande si jamais le disque a évincé l'asset entre-temps).
    var prefetchedMediaURLs: Set<String> = []

    /// Stories dont le rendu de cover récepteur a déjà été tenté cette session —
    /// évite de re-tenter en boucle les compositions non rendables (fond vidéo,
    /// image de fond introuvable) à chaque rafraîchissement du tray.
    var attemptedReceiverCoverStoryIds: Set<String> = []

    /// Seams injectables (tests) — closures plutôt qu'une extension des
    /// protocols services : ajouter `getProfile` à `UserServiceProviding`
    /// ferait dériver tous les mocks existants pour une seule feature.
    var introProfileResolver: (String) async throws -> MeeshyUser = { userId in
        try await UserService.shared.getProfile(idOrUsername: userId)
    }
    var introMoodFeedLoader: () async throws -> [APIPost] = {
        try await StatusService.shared.list(mode: .friends, cursor: nil, limit: 50).data
    }

    /// Cache SESSION des moods par userId — un seul fetch réseau du feed
    /// statuses par session de ViewModel, réutilisé pour chaque transition.
    var introMoodsByUserId: [String: StatusEntry]?

    // MARK: - Mark Story as Viewed

    /// R6 — seam injectable (tests) : le chemin réel enqueue dans l'outbox
    /// durable (`.markStoryViewed`, anchor = storyId pour le coalescing) au
    /// lieu du POST fire-and-forget historique — le « vu » survit à un
    /// kill/offline et se rejoue FIFO au reconnect via OutboxDispatcher.
    var markViewedOutboxEnqueuer: (String) async throws -> Void = { storyId in
        try await StoryViewModel.enqueueMarkStoryViewed(storyId)
    }

    // MARK: - Lookup Methods

    func storyGroupForUser(userId: String) -> StoryGroup? {
        storyGroups.first { $0.id == userId }
    }

    // MARK: - Optimistic offline stories (visibilité auteur hors-ligne)

    /// Préfixe d'id des stories optimistes (non encore publiées). Permet de les
    /// repérer pour la réconciliation et pour les préserver à travers un refetch
    /// réseau (`fetchStoriesFromNetwork`).
    static let pendingStoryIdPrefix = "pending_"

    // MARK: - Reprise d'un échec de publication (spec 2026-08-01, incrément 5)

    /// Seam injectable (tests) : retrait d'un item de l'historique d'échecs.
    /// Le chemin réel traverse `StoryPublishService` (queue actor singleton +
    /// rafraîchissement du `failedItems` publié) — un état global qu'une
    /// suite de tests ne doit pas muter.
    var failedItemDiscarder: (StoryPublishQueueItem) async -> Void = { item in
        await StoryPublishService.shared.discard(item)
    }

    // MARK: - Delete Story

    func deleteStory(storyId: String) async -> Bool {
        do {
            try await storyService.delete(storyId: storyId)
            // Même chemin que les tombstones et l'event socket. Une suppression
            // explicite l'emporte sur l'exception accordée à l'auteur pour ses
            // propres stories expirées : c'est une volonté, pas un délai.
            purgeDeadStories(deletedIds: [storyId], includingExpired: false)
            return true
        } catch {
            return false
        }
    }
    // MARK: - Socket.IO Real-Time Updates

    /// Mimics the sort applied by `Array<APIPost>.toStoryGroups(currentUserId:)`
    /// so the tray ordering stays consistent between cold-start (REST fetch)
    /// and live updates (Socket.IO sink). Without this re-sort, a new story
    /// from an existing author would land in their group but the group would
    /// stay frozen at its initial tray position — the user would never see
    /// the "most recent author bubbles up to the front" behaviour they
    /// expect from Stories.
    func sortStoryGroupsInPlace() {
        let currentUserId = AuthManager.shared.currentUser?.id
        storyGroups.sort { a, b in
            if let uid = currentUserId {
                if a.id == uid { return true }
                if b.id == uid { return false }
            }
            if a.hasUnviewed != b.hasUnviewed { return a.hasUnviewed }
            return (a.latestStory?.createdAt ?? .distantPast) > (b.latestStory?.createdAt ?? .distantPast)
        }
    }

    /// Insertion/merge d'un lot de groupes fraîchement convertis dans le tray
    /// — extrait du sink `storyCreated` (R4 inc.2) et partagé avec le fetch
    /// unitaire par postId. Contrat : auteur existant → append dédupliqué par
    /// id, stories triées ascendantes par createdAt (`latestStory` ==
    /// stories.last reste la plus fraîche) ; nouvel auteur → append puis
    /// `sortStoryGroupsInPlace` le promeut (self → tête, puis non-vu > vu,
    /// puis plus récent d'abord) ; persistance cache dans la foulée.
    /// `replacingExisting: false` (défaut, sink storyCreated) = append-dédup
    /// pur, comportement historique. `true` (delta-sync R8) = une story déjà
    /// connue est REMPLACÉE par sa version serveur (compteurs, traductions)
    /// avec la garde isViewed MONOTONE du sink storyUpdated / fetch full —
    /// un `isViewedByMe` serveur en retard ne dé-voit jamais un anneau local.
    func insertOrMergeStoryGroups(_ groups: [StoryGroup], replacingExisting: Bool = false) {
        let selfId = AuthManager.shared.currentUser?.id
        for newGroup in groups {
            if let idx = storyGroups.firstIndex(where: { $0.id == newGroup.id }) {
                let isOwnGroup = newGroup.id == selfId
                var stories = storyGroups[idx].stories
                for story in newGroup.stories {
                    if let j = stories.firstIndex(where: { $0.id == story.id }) {
                        guard replacingExisting else { continue }
                        var replacement = story
                        // Monotone raffinée : cède quand le CONTENU a été édité
                        // après la vue locale (reset d'engagement) — jamais pour
                        // ses propres stories (état « vu » client-only).
                        if stories[j].isViewed && !replacement.isViewed,
                           isOwnGroup || Self.shouldKeepLocalViewed(
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
                storyGroups[idx] = storyGroups[idx].with(stories: stories)
            } else {
                storyGroups.append(newGroup)
            }
        }
        sortStoryGroupsInPlace()
        persistStoryCache()
    }

    /// R8 inc.1 — curseur delta DÉRIVÉ du cache affiché : max(updatedAt) des
    /// stories. nil (cache legacy sans le champ, ou tray vide) → full fetch.
    static func deltaSince(for groups: [StoryGroup]) -> Date? {
        groups.flatMap(\.stories).compactMap(\.updatedAt).max()
    }

    /// Le jeu de références AUTORITAIRE d'une story — celui que la lecture
    /// UNITAIRE sert à son auteur, silencieuses comprises.
    ///
    /// Le tray en sert un jeu amputé : son select écarte les SILENCIEUSES
    /// (`postMentionInclude`, gateway). Republier celui-là au PUT les
    /// révoquerait sans que l'auteur les ait seulement vues, et retirerait du
    /// même coup l'accès au contenu aux personnes concernées. C'est donc cette
    /// relecture, et elle seule, qui autorise l'édition à REMPLACER l'ensemble
    /// déclaré.
    ///
    /// `nil` en échec — l'édition se taira, ce qui préserve.
    func fetchDeclaredReferences(postId: String) async -> [PostReference]? {
        do {
            return try await storyService.fetchPost(id: postId).mentions
        } catch {
            Logger.messages.error("[StoryVM] declared references fetch failed postId=\(postId, privacy: .public): \(error.localizedDescription)")
            return nil
        }
    }

    /// R4 inc.2 — le tray ignore ce post mais le point d'entrée connaît son
    /// id exact (bookmark, notification, deep link) : fetch unitaire LÉGER
    /// (`GET /posts/:id`) au lieu du refetch full-tray bloquant.
    /// `toStoryGroups` ne filtre pas l'expiry (contrat tray) — on écarte ici
    /// les stories mortes pour qu'un deep link périmé n'insère pas de groupe
    /// fantôme. Retourne true si la story est disponible après coup.
    func ensureStoryLoaded(postId: String) async -> Bool {
        if storyGroups.contains(where: { $0.stories.contains(where: { $0.id == postId }) }) {
            return true
        }
        let post: APIPost
        do {
            post = try await storyService.fetchPost(id: postId)
        } catch {
            Logger.messages.error("[StoryVM] ensureStoryLoaded fetch failed postId=\(postId, privacy: .public): \(error.localizedDescription)")
            return false
        }
        // Exception AUTEUR (cohérente avec `purgeDeadStories` et le
        // skip-resolver) : mes propres stories expirées restent chargeables —
        // deep link depuis « Mes stories » vers une story archivée.
        let myId = AuthManager.shared.currentUser?.id
        let groups = [post].toStoryGroups(currentUserId: myId)
            .compactMap { group -> StoryGroup? in
                let alive = group.id == myId
                    ? group.stories
                    // Task 9 (post-references) — une story expirée dont le lecteur
                    // détient un droit de référence ACCORDÉ reste ouvrable : le
                    // droit se DÉCLARE (`referenceAccess`), il ne se déduit jamais
                    // de `expiresAt`. Le serveur ne sert jamais dans ce payload une
                    // story où le lecteur n'a ni auteur ni référence (§3.5 spec) —
                    // ce filtre ne fait donc qu'éviter de faire disparaître une
                    // story DÉJÀ présente à son échéance.
                    : group.stories.filter { !$0.isExpired() || $0.referenceAccess == .granted }
                return alive.isEmpty ? nil : group.with(stories: alive)
            }
        guard !groups.isEmpty else { return false }
        insertOrMergeStoryGroups(groups)
        return true
    }

    /// R4 inc.2b — le chemin notification (`StoryNotificationTargetViewModel.load()`)
    /// a DÉJÀ fetché ce post en réseau et l'a mis en cache dans
    /// `storyService.cachedPost(id:)` (même singleton `StoryService.shared`
    /// en production) quelques millisecondes avant que ce viewer ne se
    /// monte. `ensureStoryLoaded` a un contrat cache-first VOLONTAIRE — il
    /// ne refetch jamais un postId déjà présent dans le tray (voir
    /// `test_ensureStoryLoaded_storyAlreadyInTray_skipsNetwork`) — donc un
    /// tray qui contient DÉJÀ ce post (compteurs périmés, ex: `commentCount`)
    /// n'était jamais rafraîchi par ce chemin, et un bouton dont
    /// l'apparition dépend de ce compteur (rail d'actions du viewer, voir
    /// `StoryActionRailPlan.showsComments`) restait manquant pour toute la
    /// lecture du slide. Cette méthode ne fait AUCUN réseau : elle relit
    /// uniquement le cache SDK déjà chaud et fusionne via
    /// `insertOrMergeStoryGroups(replacingExisting: true)` (même mécanisme
    /// que le delta-sync R8 inc.1) — no-op silencieux si rien n'est en
    /// cache (chemin normal, sans notification).
    func refreshFromCachedPostIfAvailable(postId: String) {
        guard let cached = storyService.cachedPost(id: postId) else { return }
        // Même exception auteur que `ensureStoryLoaded` ci-dessus.
        let myId = AuthManager.shared.currentUser?.id
        let groups = [cached].toStoryGroups(currentUserId: myId)
            .compactMap { group -> StoryGroup? in
                let alive = group.id == myId
                    ? group.stories
                    // Task 9 (post-references) — une story expirée dont le lecteur
                    // détient un droit de référence ACCORDÉ reste ouvrable : le
                    // droit se DÉCLARE (`referenceAccess`), il ne se déduit jamais
                    // de `expiresAt`. Le serveur ne sert jamais dans ce payload une
                    // story où le lecteur n'a ni auteur ni référence (§3.5 spec) —
                    // ce filtre ne fait donc qu'éviter de faire disparaître une
                    // story DÉJÀ présente à son échéance.
                    : group.stories.filter { !$0.isExpired() || $0.referenceAccess == .granted }
                return alive.isEmpty ? nil : group.with(stories: alive)
            }
        guard !groups.isEmpty else { return }
        insertOrMergeStoryGroups(groups, replacingExisting: true)
    }

    /// Set dédié aux sinks socket (le `cancellables` partagé porte aussi le
    /// sink de reconnexion posé à l'init) — garde d'idempotence resettable,
    /// même idiome que `FeedViewModel.subscribeToSocketEvents`.
    private var socketCancellables = Set<AnyCancellable>()

    func subscribeToSocketEvents() {
        // Un second appel (re-run du `.task` racine) dupliquerait les 12+
        // sinks — les handlers à delta ±1 (`applyPostReactionDelta`,
        // `applyStoryReactionDelta`) compteraient alors double.
        guard socketCancellables.isEmpty else { return }

        // rts-02 — rattrapage du tray au reconnect social : des stories ont pu
        // être créées ou supprimées pendant la coupure. Le curseur se calcule
        // au moment de l'ÉVÉNEMENT (pas à l'armement) — insertOrMergeStoryGroups,
        // la garde isViewed monotone, les tombstones et le fallback full sur
        // échec du delta garantissent déjà l'idempotence côté
        // fetchStoriesFromNetwork.
        socialSocket.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                guard let self, !self.isLoading else { return }
                Task { await self.fetchStoriesFromNetwork(deltaSince: Self.deltaSince(for: self.storyGroups)) }
            }
            .store(in: &socketCancellables)

        socialSocket.storyCreated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                let currentUserId = AuthManager.shared.currentUser?.id
                self.insertOrMergeStoryGroups([apiPost].toStoryGroups(currentUserId: currentUserId))
            }
            .store(in: &socketCancellables)

        socialSocket.storyViewed
            .receive(on: DispatchQueue.main)
            .sink { [weak self] viewedData in
                guard let self else { return }
                for i in self.storyGroups.indices {
                    if let j = self.storyGroups[i].stories.firstIndex(where: { $0.id == viewedData.storyId }) {
                        var updatedStories = self.storyGroups[i].stories
                        // viewCount = total autoritatif porté par l'event ; toujours appliqué.
                        // (Avant : ignoré → le compteur de vues restait stale chez l'auteur
                        // qui regarde sa propre story pendant que des viewers arrivent.)
                        updatedStories[j].viewCount = viewedData.viewCount
                        updatedStories[j].isViewed = true
                        self.storyGroups[i] = self.storyGroups[i].with(stories: updatedStories)
                        // Re-sort: `hasUnviewed` may flip when the last
                        // unviewed story is consumed, dropping the group
                        // below the "fresh" bubbles.
                        self.sortStoryGroupsInPlace()
                        self.persistStoryCache()
                        return
                    }
                }
            }
            .store(in: &socketCancellables)

        socialSocket.storyUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                let selfId = AuthManager.shared.currentUser?.id
                // Reset d'engagement (édition de contenu) : le serveur a effacé
                // vues et réactions — la story redevient non-vue pour les
                // viewers. Jamais pour l'auteur lui-même (son état « vu » est
                // client-only, recordView l'exclut côté serveur).
                let engagementReset = event.engagementReset ?? false
                let updated = [event.story].toStoryGroups(currentUserId: selfId)
                for updatedGroup in updated {
                    guard let groupIdx = self.storyGroups.firstIndex(where: { $0.id == updatedGroup.id }) else { continue }
                    let isOwnGroup = updatedGroup.id == selfId
                    var stories = self.storyGroups[groupIdx].stories
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
                               isOwnGroup || (!engagementReset && Self.shouldKeepLocalViewed(
                                   localViewedAt: stories[storyIdx].viewedAt,
                                   contentEditedAt: replacement.contentEditedAt
                               )) {
                                replacement.isViewed = true
                                replacement.viewedAt = stories[storyIdx].viewedAt
                            }
                            stories[storyIdx] = replacement
                        }
                    }
                    self.storyGroups[groupIdx] = self.storyGroups[groupIdx].with(stories: stories)
                    // L'anneau du groupe peut redevenir « non-vu » — même
                    // re-tri que storyViewed pour remonter la bulle fraîche.
                    self.sortStoryGroupsInPlace()
                }
                self.persistStoryCache()
            }
            .store(in: &socketCancellables)

        // Prisme realtime : traductions de texte de story par text-object.
        // Le gateway diffuse `story:translation-updated` (postId + textObjectIndex
        // + translations) après avoir traduit un overlay. On fusionne dans la story
        // en cache pour que le reader (qui résout via la chaine préférée) bascule
        // sur la langue demandée dès l'arrivée — branche le picker langue d'« Exploration »
        // au-delà des traductions déjà en cache (parité avec `storyUpdated`).
        socialSocket.storyTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self else { return }
                for groupIdx in self.storyGroups.indices {
                    var stories = self.storyGroups[groupIdx].stories
                    guard let storyIdx = stories.firstIndex(where: { $0.id == payload.postId }) else { continue }
                    stories[storyIdx] = stories[storyIdx].mergingTextObjectTranslations(
                        at: payload.textObjectIndex,
                        translations: payload.translations
                    )
                    self.storyGroups[groupIdx] = self.storyGroups[groupIdx].with(stories: stories)
                    self.persistStoryCache()
                    return
                }
            }
            .store(in: &socketCancellables)

        // Prisme realtime : traduction du CONTENU de la story (sa légende), que
        // le gateway diffuse via `post:translation-updated` — un événement
        // DISTINCT de `story:translation-updated` ci-dessus, qui ne porte que
        // les textes du canvas.
        //
        // Seul le feed s'y abonnait. Le lecteur ignorait donc la traduction
        // qu'il venait lui-même de demander : elle arrivait en base, mais la
        // story en mémoire gardait ses anciennes langues et la feuille
        // « Langues » laissait tourner son anneau indéfiniment sur une langue
        // pourtant traduite (constaté au simulateur le 2026-07-27, allemand
        // présent côté serveur et absent côté lecteur).
        socialSocket.postTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self else { return }
                for groupIdx in self.storyGroups.indices {
                    var stories = self.storyGroups[groupIdx].stories
                    guard let storyIdx = stories.firstIndex(where: { $0.id == payload.postId }) else { continue }
                    stories[storyIdx] = stories[storyIdx].mergingContentTranslation(
                        language: payload.language,
                        content: payload.translation.text
                    )
                    self.storyGroups[groupIdx] = self.storyGroups[groupIdx].with(stories: stories)
                    self.persistStoryCache()
                    return
                }
            }
            .store(in: &socketCancellables)

        // Même chemin de retrait que les tombstones du delta-sync : re-tri du
        // tray, réécriture du cache et libération des médias épinglés compris.
        // (L'ancien retrait en place ne faisait que sortir la story du tableau,
        // laissant ses médias pinnés sur disque jusqu'à l'échéance du pin.)
        socialSocket.storyDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.purgeDeadStories(deletedIds: [event.storyId], includingExpired: false)
            }
            .store(in: &socketCancellables)

        // === Real-time counter sync (user spec 2026-05-28) ===
        // When anyone comments / reacts to a story we already have in the
        // tray, update its denormalized counters in place. Without these
        // sinks the sidebar `storyCommentCount` / `storyReactionCount`
        // reset to the cached `StoryItem` value on every slide change —
        // the « brayan a commenté Belva mais on voit comments=0 »
        // symptom.

        socialSocket.commentAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                self?.applyStoryCommentCountDelta(postId: data.postId, newCount: data.commentCount)
            }
            .store(in: &socketCancellables)

        socialSocket.commentDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                // `commentCount` autoritatif porté par l'event (parité avec commentAdded).
                // Avant : `-1` local qui dérivait sur events manqués / hors-ordre / doublons,
                // et asymétrique avec commentAdded (qui utilise déjà data.commentCount).
                self?.applyStoryCommentCountDelta(postId: data.postId, newCount: data.commentCount)
            }
            .store(in: &socketCancellables)

        socialSocket.postReactionSync
            .receive(on: DispatchQueue.main)
            .sink { [weak self] sync in
                guard let self else { return }
                self.mutateStoryItem(byPostId: sync.postId) { item in
                    item.reactionCount = sync.totalCount
                    item.currentUserReactions = sync.userReactions
                }
            }
            .store(in: &socketCancellables)

        // Optimistic deltas — the SDK ack already mutates the post, but
        // peers don't get a sync event; the *-added/*-removed broadcast is
        // their only signal. We use totalCount when present, otherwise we
        // step the counter ±1 around the user's currentUserReactions.
        socialSocket.postReactionAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyPostReactionDelta(event: event, delta: +1)
            }
            .store(in: &socketCancellables)

        socialSocket.postReactionRemoved
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyPostReactionDelta(event: event, delta: -1)
            }
            .store(in: &socketCancellables)

        // Realtime story reactions : le gateway émet `story:reacted`/`story:unreacted`
        // À LA STORY ROOM (viewers) — fan-out distinct des events POST (cf.
        // routes/posts/interactions.ts). Sans ces sinks, le compteur de réactions
        // d'une story en cours de visionnage ne bougeait pas en temps réel quand un
        // autre utilisateur réagissait/dé-réagissait (bug it.23, callback non branché).
        socialSocket.storyReacted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyStoryReactionDelta(storyId: event.storyId, userId: event.userId,
                                              emoji: event.emoji, delta: +1)
            }
            .store(in: &socketCancellables)

        socialSocket.storyUnreacted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyStoryReactionDelta(storyId: event.storyId, userId: event.userId,
                                              emoji: event.emoji, delta: -1)
            }
            .store(in: &socketCancellables)
    }

    /// Apply an authoritative `commentCount` snapshot to the matching story.
    /// Called by `comment:added` sinks — the gateway already incremented
    /// the denormalized counter and broadcast the new total.
    private func applyStoryCommentCountDelta(postId: String, newCount: Int) {
        mutateStoryItem(byPostId: postId) { item in
            item.commentCount = newCount
        }
    }

    /// Increment or decrement the story's `reactionCount` and toggle the
    /// current viewer's emoji presence in `currentUserReactions` if the
    /// event was triggered by this device.
    private func applyPostReactionDelta(event: SocketPostReactionUpdateEvent, delta: Int) {
        let myId = AuthManager.shared.currentUser?.id
        mutateStoryItem(byPostId: event.postId) { item in
            item.reactionCount = max(0, item.reactionCount + delta)
            if let myId, event.userId == myId {
                var mine = item.currentUserReactions ?? []
                if delta > 0 {
                    if !mine.contains(event.emoji) { mine.append(event.emoji) }
                } else {
                    mine.removeAll { $0 == event.emoji }
                }
                item.currentUserReactions = mine
            }
        }
    }

    /// Realtime delta for a STORY reaction (`story:reacted`/`story:unreacted` — fan-out
    /// distinct des events POST). L'optimiste du viewer vit dans son @State
    /// (`StoryViewerView.sendReaction` incrémente `storyReactionCount` localement,
    /// PAS `item.reactionCount`) ; l'écho de sa propre action fournit ici le +1 sur
    /// l'item, et le miroir absolu (`storyReactionCount = currentStory?.reactionCount`)
    /// écrase l'optimiste — les deux chemins convergent sans double-compte.
    /// Non-`private` pour permettre la vérification unitaire.
    func applyStoryReactionDelta(storyId: String, userId: String, emoji: String, delta: Int) {
        let myId = AuthManager.shared.currentUser?.id
        mutateStoryItem(byPostId: storyId) { item in
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
    }

    /// Locates the `StoryItem` carrying `postId` in any group and applies
    /// `mutation` in place. Persists the cache so the next cold start
    /// reflects the live counter. No-op when the story isn't in the tray
    /// (e.g. the user's own post that never feeds back into `getStories`).
    private func mutateStoryItem(byPostId postId: String, _ mutation: (inout StoryItem) -> Void) {
        for i in storyGroups.indices {
            guard let j = storyGroups[i].stories.firstIndex(where: { $0.id == postId }) else { continue }
            var stories = storyGroups[i].stories
            mutation(&stories[j])
            storyGroups[i] = storyGroups[i].with(stories: stories)
            persistStoryCache()
            return
        }
    }


    // MARK: - Helpers

    func buildFeedMedia(from post: APIPost, fallback uploadResult: TusUploadResult?) -> [FeedMedia] {
        let apiMedia = (post.media ?? []).map { m in
            FeedMedia(id: m.id, type: m.mediaType, url: m.fileUrl, thumbHash: m.thumbHash,
                      thumbnailColor: MeeshyColors.brandPrimaryHex, width: m.width, height: m.height, duration: m.duration.map { $0 / 1000 })
        }
        if !apiMedia.isEmpty { return apiMedia }
        if let uploaded = uploadResult {
            return [FeedMedia(id: uploaded.id, type: .image, url: uploaded.fileUrl,
                              thumbHash: uploaded.thumbHash, thumbnailColor: MeeshyColors.brandPrimaryHex,
                              width: uploaded.width, height: uploaded.height)]
        }
        return []
    }

    func insertOrAppendStoryItem(_ item: StoryItem, forAuthor author: APIAuthor) {
        insertOrAppendStoryItem(
            item,
            authorId: author.id,
            authorName: author.name,
            authorAvatar: author.avatar
        )
    }

    /// Variante à champs primitifs : `APIAuthor` n'expose pas d'init public
    /// (memberwise interne au SDK), donc le chemin optimiste hors-ligne — qui
    /// construit l'auteur depuis `AuthManager.currentUser` — ne peut pas passer
    /// par la surcharge `APIAuthor`. Le corps est identique (insertion dédupliquée
    /// par id, création du groupe si absent).
    func insertOrAppendStoryItem(_ item: StoryItem, authorId: String, authorName: String, authorAvatar: String?) {
        if let idx = storyGroups.firstIndex(where: { $0.id == authorId }) {
            var updated = storyGroups[idx].stories
            // Déduplication par id : un insert optimiste suivi de l'écho serveur /
            // socket (ou d'un 2e chemin de publish) ne doit JAMAIS produire deux
            // entrées identiques dans le groupe — sinon le viewer affiche la même
            // story deux fois (2 segments de progression identiques).
            if let existing = updated.firstIndex(where: { $0.id == item.id }) {
                updated[existing] = item
            } else {
                updated.append(item)
            }
            storyGroups[idx] = storyGroups[idx].with(stories: updated)
        } else {
            storyGroups.insert(StoryGroup(
                id: authorId,
                username: authorName,
                avatarColor: DynamicColorGenerator.colorForName(authorName),
                avatarURL: authorAvatar,
                stories: [item]
            ), at: 0)
        }
        persistStoryCache()
    }

    /// R12 inc.2 — TOUS les callers de ce wrapper sont des mutations locales
    /// ou des pushs socket (classification it.48, plan
    /// 2026-07-04-story-store-dirty-write-plan.md) : écriture DIRTY débouncée
    /// (L1 + markDirty → flush coalescé ~2 s), freshness PRÉSERVÉE — ces
    /// chemins n'ont pas re-validé le tray entier auprès du serveur, le
    /// prochain `.stale` doit toujours déclencher son refetch delta. Le SEUL
    /// write full + freshness-reset est le `save()` direct du fetch réseau
    /// complet (fetchStoriesFromNetwork). Fenêtre de perte ≤2 s sur kill dur
    /// assumée : cache dont la vérité est serveur ; le « vu » est durable via
    /// l'outbox markStoryViewed (R6), pas via ce cache.
    func persistStoryCache() {
        let snapshot = storyGroups
        Task { await CacheCoordinator.shared.stories.mergeUpdate(for: Self.storiesCacheKey) { _ in snapshot } }
    }
}
