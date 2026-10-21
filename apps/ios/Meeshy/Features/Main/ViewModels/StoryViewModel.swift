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

    @Published var storyGroups: [StoryGroup] = [] {
        didSet { trayProjection = StoryTrayProjection(groups: storyGroups, ownerId: AuthManager.shared.currentUser?.id, at: Date()) }
    }
    private(set) var trayProjection = StoryTrayProjection.empty
    @Published var isLoading = false

    /// Motif du dernier échec de chargement du tray, `nil` quand la dernière
    /// passe a abouti. Le `catch` de `fetchStoriesFromNetwork` ne faisait que
    /// journaliser : un rail de stories VIDE par panne était strictement
    /// indiscernable d'un rail vide parce que personne n'a publié. Le journal
    /// ne quitte pas la machine du développeur — seul un état publié atteint
    /// un lecteur.
    @Published private(set) var loadFailure: String?
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
    @Published var activeUploads: [StoryUploadState] = [] {
        didSet { uploadProgress.retainOnly(Set(activeUploads.map(\.id))) }
    }
    let uploadProgress: StoryUploadProgressStore
    /// L'id d'un upload qui a ABOUTI côté serveur, annoncé juste AVANT son
    /// retrait de `activeUploads`. Un retrait seul ne dit rien : annulation,
    /// abandon par la file et succès vident la ligne pareil. Qui doit créditer
    /// une publication (l'onboarding, #7729) écoute ce signal, jamais la file.
    let storyUploadSucceeded = PassthroughSubject<String, Never>()
    /// Un upload REFUSÉ pour de bon (#7907), annoncé juste AVANT son retrait de
    /// `activeUploads` — même contrat que le succès.
    let storyUploadRejected = PassthroughSubject<StoryUploadRejection, Never>()
    /// Vue de compatibilité : l'upload que les surfaces d'avatar mettent en
    /// avant (un échec l'emporte, sinon la tête de file). `activeUploads` étant
    /// `@Published`, toutes les vues qui lisent cette propriété calculée
    /// continuent de se rafraîchir.
    var activeUpload: StoryUploadState? { StoryUploadPresentation.surfaced(in: activeUploads)?.upload }
    /// Id de l'upload qui MONTE en ce moment. `nil` = la file peut démarrer le
    /// suivant.
    var currentUploadId: String?
    let coverRenders: StoryCoverRenderSignal
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
        self.uploadProgress = StoryUploadProgressStore()
        self.coverRenders = StoryCoverRenderSignal()
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
                self?.removeActiveUpload(queueId: payload.queueId, succeeded: true)
            }
            .store(in: &cancellables)

        StoryPublishQueue.shared.publishFailed.publisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.removeActiveUpload(queueId: payload.queueId)
            }
            .store(in: &cancellables)
    }

    private func removeActiveUpload(queueId: String, succeeded: Bool = false) {
        guard let idx = activeUploads.firstIndex(where: { $0.queueId == queueId }) else { return }
        if succeeded { storyUploadSucceeded.send(activeUploads[idx].id) }
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
            // #9804 — l'instantané a pu être réécrit par un autre écrivain avec
            // la version serveur : le registre des vues fait foi pour le « vu ».
            storyGroups = applyViewedLedger(to: data)
            // Le cache survit délibérément à la fenêtre de visibilité d'une
            // story : sans cette purge, il ressert des stories mortes et le
            // prefetch ci-dessous irait re-télécharger leurs médias.
            purgeDeadStories()
            sortStoryGroupsInPlace()
            prefetchAllStoryMedia(storyGroups)
            renderMissingReceiverCovers()
            return
        case .stale(let data, _):
            storyGroups = applyViewedLedger(to: data)
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

    private var trayPager: StoryTrayPager { StoryTrayPager(storyService: storyService) }

    func fetchStoriesFromNetwork(deltaSince: Date? = nil) async {
        // R8 inc.1 — refetch silencieux DELTA : quand le cache fournit un
        // curseur (max updatedAt), on ne demande que les stories créées ou
        // modifiées depuis (G1a serveur). Merge REPLACE (isViewed monotone),
        // jamais d'overwrite du tray — les stories pendantes et l'état local
        // survivent par construction. Toute erreur delta retombe sur le full
        // historique ci-dessous (résilience > économie).
        if let deltaSince {
            do {
                let drained = try await trayPager.drain(updatedSince: deltaSince)
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
            let drained = try await trayPager.drain(updatedSince: nil)

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
                        var copy = story; copy.isViewed = true
                        // L'horodatage voyage avec le drapeau : sans lui, la
                        // fusion suivante cède devant tout `contentEditedAt`.
                        copy.viewedAt = viewedAt == .distantPast ? nil : viewedAt
                        return copy
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
            await bestEffort("storyViewModel.stories.save", category: .cache) { try await CacheCoordinator.shared.stories.save(storyGroups, for: StoryViewModel.storiesCacheKey) }
            prefetchAllStoryMedia(storyGroups)
            renderMissingReceiverCovers()
            if loadFailure != nil { loadFailure = nil }
        } catch {
            // Le motif est PUBLIÉ, pas seulement journalisé (#7007) : le rail
            // doit pouvoir dire « panne » au lieu de se taire.
            loadFailure = String(localized: "common.error.generic")
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
    var introProfileResolver: @MainActor (String) async throws -> MeeshyUser = { userId in
        try await UserService.shared.getProfile(idOrUsername: userId)
    }
    var introMoodFeedLoader: @MainActor () async throws -> [APIPost] = {
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
    var markViewedOutboxEnqueuer: @MainActor (String, ContentEntry) async throws -> Void = { storyId, entry in
        try await StoryViewModel.enqueueMarkStoryViewed(storyId, entry: entry)
    }

    /// #9804 — registre durable des vues, distinct de l'instantané du tray.
    var viewedLedger: StoryViewedLedgerProviding = StoryViewedLedger.shared

    /// #10483 — les marques d'entrée posées par les portes du lecteur (tap du
    /// rail, notification, lien) ; la vue de la story les porte.
    var storyViewEntries: DetailOpenSourceProviding = DetailOpenSources.shared

    /// #10399 — l'impression d'une story est DURABLE comme sa vue : persistée,
    /// rejouée à la relance, vidée en sortie de lecteur et en arrière-plan.
    /// UNE file partagée par toutes les instances (une clé de persistance par
    /// file) ; les tests en injectent une isolée.
    static let sharedStoryImpressions = ImpressionBatcher(source: "story", surface: .story)
    lazy var storyImpressions: ImpressionBatcher = StoryViewModel.sharedStoryImpressions

    // MARK: - Lookup Methods

    func storyGroupForUser(userId: String) -> StoryGroup? {
        trayProjection.group(forUserId: userId)
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
    var failedItemDiscarder: @MainActor (StoryPublishQueueItem) async -> Void = { item in
        await StoryPublishService.shared.discard(item)
    }

    // MARK: - Delete Story

    func deleteStory(storyId: String, reason: String? = nil) async -> Bool {
        do {
            try await Self.deleteRemotely(storyId: storyId, reason: reason, with: storyService)
            // Même chemin que les tombstones et l'event socket. Une suppression
            // explicite l'emporte sur l'exception accordée à l'auteur pour ses
            // propres stories expirées : c'est une volonté, pas un délai.
            purgeDeadStories(deletedIds: [storyId], includingExpired: false)
            return true
        } catch {
            return false
        }
    }

    /// **La suppression part par une frontière `@concurrent`, et ce n'est pas
    /// décoratif** (plantage TestFlight build 1890, « j'ai supprimé une story
    /// ça a planté »).
    ///
    /// Le rapport montre `deleteStory` REPRIS sur un fil coopératif (thread 7,
    /// le main étant dans sa runloop), puis `purgeDeadStories` trapper à la
    /// vérification d'exécuteur de la fermeture `.filter { deadIds.contains }`
    /// (`_dispatch_assert_queue_fail`). `storyService.delete` est
    /// `nonisolated(nonsending)` (SE-0461, actif dans le SDK) : l'appelant
    /// FAIT CONFIANCE à la chaîne appelée pour lui rendre la main sur son
    /// exécuteur, et n'émet AUCUN saut de retour. Quand un maillon de cette
    /// chaîne (décodage hors main par continuation, client API) reprend
    /// ailleurs, la suite du view model s'exécute hors du main — mutation de
    /// `@Published` comprise.
    ///
    /// Un appel `@concurrent`, lui, se termine toujours par un saut EXPLICITE
    /// vers le MainActor (`swift_task_switch`, décidé à l'exécution sur
    /// l'exécuteur réellement courant) : la purge retombe sur le main quoi que
    /// fasse la chaîne réseau.
    @concurrent
    nonisolated static func deleteRemotely(
        storyId: String, reason: String? = nil,
        with service: any StoryServiceProviding
    ) async throws {
        try await service.delete(storyId: storyId, reason: reason)
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
        StoryTrayRules.sort(&storyGroups, currentUserId: AuthManager.shared.currentUser?.id)
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
        for newGroup in applyViewedLedger(to: groups) {
            StoryTrayRules.merge(newGroup, into: &storyGroups, selfId: selfId, replacingExisting: replacingExisting)
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
                guard StoryTrayRules.applyViewed(viewedData, to: &self.storyGroups) else { return }
                // Re-sort: `hasUnviewed` may flip when the last
                // unviewed story is consumed, dropping the group
                // below the "fresh" bubbles.
                self.sortStoryGroupsInPlace()
                self.persistStoryCache()
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
                    guard StoryTrayRules.applyUpdate(
                        updatedGroup,
                        engagementReset: engagementReset,
                        selfId: selfId,
                        to: &self.storyGroups
                    ) else { continue }
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
                let merged = StoryTrayRules.mutateStory(postId: payload.postId, in: &self.storyGroups) { item in
                    item = item.mergingTextObjectTranslations(
                        at: payload.textObjectIndex,
                        translations: payload.translations
                    )
                }
                if merged { self.persistStoryCache() }
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
                let merged = StoryTrayRules.mutateStory(postId: payload.postId, in: &self.storyGroups) { item in
                    item = item.mergingContentTranslation(
                        language: payload.language,
                        content: payload.translation.text
                    )
                }
                if merged { self.persistStoryCache() }
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
            StoryTrayRules.applyReactionDelta(to: &item, emoji: event.emoji, userId: event.userId, myId: myId, delta: delta)
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
            StoryTrayRules.applyReactionDelta(to: &item, emoji: emoji, userId: userId, myId: myId, delta: delta)
        }
    }

    /// Locates the `StoryItem` carrying `postId` in any group and applies
    /// `mutation` in place. Persists the cache so the next cold start
    /// reflects the live counter. No-op when the story isn't in the tray
    /// (e.g. the user's own post that never feeds back into `getStories`).
    private func mutateStoryItem(byPostId postId: String, _ mutation: (inout StoryItem) -> Void) {
        if StoryTrayRules.mutateStory(postId: postId, in: &storyGroups, mutation) { persistStoryCache() }
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
        StoryTrayRules.insert(item, authorId: authorId, authorName: authorName,
                              authorAvatar: authorAvatar, into: &storyGroups)
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
