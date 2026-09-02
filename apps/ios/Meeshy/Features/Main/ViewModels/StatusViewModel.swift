import Foundation
import SwiftUI
import Combine
import MeeshySDK

@MainActor
class StatusViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var statuses: [StatusEntry] = [] {
        didSet { statusIndexByUserId = Self.index(statuses) }
    }
    /// Index `userId → position` reconstruit à chaque écriture de `statuses`
    /// (O(n), rare) pour que `statusForUser` soit O(1) — il était un balayage
    /// linéaire appelé par cellule de message et par rangée de conversation
    /// (audit fluidité 2026-08-21).
    private var statusIndexByUserId: [String: Int] = [:]

    private static func index(_ entries: [StatusEntry]) -> [String: Int] {
        var index: [String: Int] = [:]
        index.reserveCapacity(entries.count)
        for (offset, entry) in entries.enumerated() where index[entry.userId] == nil {
            index[entry.userId] = offset
        }
        return index
    }
    @Published var myStatus: StatusEntry?
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var error: String?

    let mode: StatusService.Mode
    private let statusService: StatusServiceProviding
    private var cancellables = Set<AnyCancellable>()
    private let socialSocket: SocialSocketProviding
    private let authManager: AuthManaging
    private let offlineQueue: OfflineQueueing
    private let postService: PostServiceProviding
    /// `@Sendable` depuis le lot 7.5 : ce prédicat est TRANSMIS à
    /// `RepostPublisher`, un écrivain `nonisolated` qui doit pouvoir le lire
    /// hors du main actor. Les quatre sites qui l'injectent passent des
    /// littéraux sans capture ; le défaut lit `NetworkMonitor`, qui vit dans le
    /// module core (isolation `nonisolated`) et est `@unchecked Sendable`.
    private let isOffline: @Sendable () -> Bool

    /// Groupement, persistance et flush (arrière-plan / relance) portés par
    /// `ImpressionBatcher`.
    private lazy var impressions = ImpressionBatcher(source: "status", postService: postService)

    /// A mood is "stuck offline" (recoverable as a draft) once it has been
    /// unsent for longer than this — the "pas envoyé dans la minute → offline"
    /// rule shared by every composer. `nonisolated` so it can be read from any
    /// isolation (matches `SyncPillViewModel.staleInflightThreshold`).
    nonisolated static let offlineStuckThreshold: TimeInterval = 60

    // Cursor pagination
    private var nextCursor: String?
    private var hasMore = true

    static let moodOptions: [String] = [
        "😴", "🎉", "💪", "☕", "🔥",
        "💭", "🎵", "📚", "✈️", "❤️"
    ]

    init(
        mode: StatusService.Mode = .friends,
        statusService: StatusServiceProviding = StatusService.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        authManager: AuthManaging = AuthManager.shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        postService: PostServiceProviding = PostService.shared,
        isOffline: @escaping @Sendable () -> Bool = { NetworkMonitor.shared.isOffline }
    ) {
        self.mode = mode
        self.statusService = statusService
        self.socialSocket = socialSocket
        self.authManager = authManager
        self.offlineQueue = offlineQueue
        self.postService = postService
        self.isOffline = isOffline
    }

    // MARK: - Portée (impressions & vues)
    //
    // Un mood EST un post (`PostType.STATUS`) : il porte `impressionCount` et
    // `viewCount` comme les autres. Aucune surface ne les alimentait — la barre
    // de moods était le seul contenu du produit dont la portée restait à zéro.
    //
    // Même contrat que le feed : une impression par APPARITION du pill, groupée
    // sur 3 s ; la vue UNIQUE part à l'ouverture du popover (dédupliquée côté
    // serveur par `PostView`, donc rejouable sans risque).

    /// Le mood `statusId` est apparu à l'écran.
    func trackImpression(_ statusId: String) {
        impressions.record(statusId)
    }

    /// À appeler quand la barre disparaît : sans ce flush, le lot en cours de
    /// groupement est perdu.
    func flushImpressions() async {
        await impressions.flushNow()
    }

    /// Le mood `statusId` a été ouvert (popover) — vue unique par utilisateur.
    func markStatusViewed(_ statusId: String) {
        Task { [postService] in try? await postService.viewPost(postId: statusId, duration: nil) }
    }

    // MARK: - Load Statuses

    func loadStatuses() async {
        guard !isLoading else { return }
        error = nil

        let cacheKey = "statuses_\(mode)"
        let cached = await CacheCoordinator.shared.statuses.load(for: cacheKey)

        switch cached {
        case .fresh(let data, _):
            statuses = data
            if mode == .friends { myStatus = statuses.first }
            return

        case .stale(let data, _):
            statuses = data
            if mode == .friends { myStatus = statuses.first }
            Task { [weak self] in
                await self?.fetchStatusesFromNetwork(cacheKey: cacheKey)
            }
            return

        case .expired, .empty:
            isLoading = statuses.isEmpty
        }

        await fetchStatusesFromNetwork(cacheKey: cacheKey)
        isLoading = false
    }

    private func fetchStatusesFromNetwork(cacheKey: String) async {
        nextCursor = nil
        hasMore = true

        do {
            let response = try await statusService.list(mode: mode, cursor: nil, limit: 20)

            if response.success {
                let entries = response.data.compactMap { $0.toStatusEntry() }
                statuses = entries
                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
                if mode == .friends { myStatus = statuses.first }
                try? await CacheCoordinator.shared.statuses.save(entries, for: cacheKey)
            } else {
                if statuses.isEmpty {
                    error = String(localized: "status.load.error", defaultValue: "Impossible de charger les statuts")
                }
            }
        } catch {
            if statuses.isEmpty {
                self.error = error.localizedDescription
            }
        }
    }

    // MARK: - Load More (infinite scroll)

    func loadMoreIfNeeded(currentStatus: StatusEntry) async {
        guard hasMore, !isLoadingMore, !isLoading else { return }

        // Trigger when within last 3 items
        let thresholdIndex = max(0, statuses.count - 3)
        guard let currentIndex = statuses.firstIndex(where: { $0.id == currentStatus.id }),
              currentIndex >= thresholdIndex else { return }

        isLoadingMore = true

        do {
            let response = try await statusService.list(mode: mode, cursor: nextCursor, limit: 20)

            if response.success {
                let newStatuses = response.data.compactMap { $0.toStatusEntry() }
                let existingIds = Set(statuses.map(\.id))
                let deduplicated = newStatuses.filter { !existingIds.contains($0.id) }
                statuses.append(contentsOf: deduplicated)
                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
            }
        } catch {
            // Silent failure
        }

        isLoadingMore = false
    }

    // MARK: - Refresh

    func refresh() async {
        let cacheKey = "statuses_\(mode)"
        await CacheCoordinator.shared.statuses.invalidate(for: cacheKey)
        nextCursor = nil
        hasMore = true
        await loadStatuses()
    }

    // MARK: - Set Status

    /// - Parameter mentions: les personnes que ce mood nomme sans que son texte
    ///   le dise. `nil` quand il n'y en a aucune — `[]` serait entendu comme un
    ///   effacement.
    /// - Parameter repostOfId: la publication republiée. **Seul porteur de
    ///   l'attribution** : il n'y a pas de `viaUsername` sur le fil, le gateway
    ///   ne l'a jamais lu. Le bandeau « Status de @X » du composer reste, mais
    ///   c'est un fait local d'affichage, pas une écriture.
    func setStatus(emoji: String, content: String?, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil, audioUrl: String? = nil, repostOfId: String? = nil, mentions: [PostMentionInput]? = nil) async {
        // Offline: persist the mood durably through the SAME `.createPost` outbox
        // row as posts/reels (type STATUS) so it is not lost, and survives an app
        // kill. Aucune entrée optimiste n'est insérée ici : le mood est
        // réconcilié quand il atterrit pour de bon (par le socket) à la
        // reconnexion, et le composer peut relever cette ligne bloquée comme
        // brouillon (recoverUnsentStatus).
        //
        // NE PAS réécrire ici que « le gateway n'échoue pas le clientMutationId
        // sur `status:created` » : c'était vrai, ça ne l'est plus —
        // `broadcastStatusCreated` le porte désormais
        // (`StatusCreatedEventData.clientMutationId`).
        //
        // Mais ne pas écrire non plus l'inverse : côté iOS le champ est encore
        // JETÉ avant d'arriver ici. `SocketStatusCreatedData` (SDK) ne déclare
        // que `status`, et `statusCreated` est un
        // `PassthroughSubject<APIPost, Never>` là où son homologue
        // `postCreated` transporte tout l'événement. Une insertion optimiste
        // n'est donc PAS encore réconciliable sur ce client : la dette est le
        // câblage du décodeur, et `packages/shared/types/post.ts` la nomme au
        // même endroit (« faux SERVEUR et toujours vrai CLIENT »). Tant qu'elle
        // est ouverte, l'absence d'entrée optimiste reste la bonne décision.
        if isOffline() {
            let payload = CreatePostPayload(
                clientMutationId: ClientMutationId.generate(),
                content: content ?? "",
                attachmentIds: [],
                visibility: visibility,
                originalLanguage: DefaultComposerLanguage.resolve(),
                type: "STATUS",
                moodEmoji: emoji,
                // La VOIX et la SOURCE, que cette branche laissait tomber
                // pendant que sa jumelle en ligne les passait toutes deux :
                // republier un mood vocal sans réseau produisait un mood
                // ORIGINAL et MUET. Il n'y a PAS de durée à porter à côté —
                // aucun étage de ce chemin n'en connaît (`setStatus`,
                // `StatusServiceProviding.create` et les deux composers n'en
                // ont aucune) ; celle d'un vocal republié vit sur sa source,
                // que le serveur relit par `repostOfId`.
                audioUrl: audioUrl,
                visibilityUserIds: visibilityUserIds,
                mentions: (mentions?.isEmpty ?? true) ? nil : mentions,
                repostOfId: repostOfId
            )
            do {
                try await offlineQueue.enqueue(.createPost, payload: payload, conversationId: nil)
                FeedbackToastManager.shared.showSuccess(String(localized: "status.queuedOffline", defaultValue: "Humeur en attente d'envoi", bundle: .main))
            } catch {
                FeedbackToastManager.shared.showError(String(localized: "status.publishError", defaultValue: "Impossible de publier le statut", bundle: .main))
            }
            return
        }

        do {
            let post = try await statusService.create(moodEmoji: emoji, content: content, originalLanguage: DefaultComposerLanguage.resolve(), visibility: visibility, visibilityUserIds: visibilityUserIds, audioUrl: audioUrl, repostOfId: repostOfId, mentions: mentions)

            if let entry = post.toStatusEntry() {
                myStatus = entry
                statuses.insert(entry, at: 0)
                await saveCacheSnapshot()
            }
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "status.publishError", defaultValue: "Impossible de publier le statut", bundle: .main))
        }
    }

    // MARK: - L'ANCRAGE — republier un mood en POST permanent (loi 5)

    /// **La seconde branche de la loi 5** : une republication MIROITE le format
    /// de sa source, et l'ANCRAGE est le choix EXPLICITE de sortir de
    /// l'éphémère. `setStatus` republie en `STATUS` — un contenu que le
    /// balayage d'expiration détruit une heure plus tard ; ceci republie en
    /// `POST`, permanent.
    ///
    /// **Pourquoi ici, et nulle part ailleurs.** Le meuble TRANSMET (il ne
    /// connaît ni service, ni file, ni endpoint) et la porte du mood a une
    /// garde de source qui lui interdit de toucher un service
    /// (`test_laPorte_neTouchePasLesServicesDirectement`). Le modèle est le
    /// seul étage qui possède déjà `PostServiceProviding` — injecté, doublé, et
    /// partagé avec les impressions et les vues.
    ///
    /// **Ce qu'elle N'ÉCRIT PAS, et c'est délibéré** : ni `myStatus`, ni
    /// `statuses`. `setStatus` les écrit parce qu'un mood publié EST une
    /// humeur ; un ancrage produit un POST, et l'insérer dans la barre de moods
    /// y ferait apparaître une entrée que le prochain `loadStatuses` effacerait.
    ///
    /// **Elle REND un résultat, contrairement à son miroir.** `setStatus` avale
    /// son échec réseau dans un `catch` qui se contente d'un toast, si bien que
    /// le composer se referme sur une perte. Ici le refus remonte, et le meuble
    /// laisse la saisie en place. L'asymétrie est assumée : la lever du côté du
    /// miroir est la dette nommée du lot 4.5.
    ///
    /// - Parameter content: le commentaire que l'auteur a AJOUTÉ. Vide ou blanc
    ///   ⇒ repost SIMPLE. Ce que « ajouté » veut dire est tranché en amont, par
    ///   `ComposerAnchorComment.authored` : le composer PRÉREMPLIT sa saisie
    ///   avec la phrase de la source, et la renvoyer telle quelle déclarerait
    ///   une citation que personne n'a écrite.
    ///
    ///   **Ce que `isQuote` change réellement, ici et pas ailleurs.** Il est
    ///   tentant d'invoquer l'enracinement des réactions
    ///   (`!post.isQuote && post.repostOfId` ⇒ la racine) : c'est l'argument des
    ///   deux publieurs jumeaux, et il ne vaut PAS pour cette porte. Le gateway
    ///   ajoute un troisième terme, `!repostRootIsEphemeral`, et une source
    ///   `STATUS` EST éphémère : `reactionRootId` est donc le repost lui-même,
    ///   quel que soit `isQuote`. Ce qu'un faux `isQuote` coûte ici est autre —
    ///   le post afficherait le texte de la source DEUX fois (en commentaire et
    ///   dans la carte citée), et sa langue serait re-DÉTECTÉE sur ces trois
    ///   mots au lieu d'être héritée de la déclaration de l'original
    ///   (`inheritStatusBody`), ce qui mal-étiquette le Prisme au rang 0.
    /// - Parameter visibility: l'audience CHOISIE, et rien d'autre. Elle ne
    ///   porte AUCUNE liste nominative, et ce n'est pas un oubli à deux
    ///   niveaux : `ComposerAudienceOffer.offered` retire `ONLY`/`EXCEPT` de
    ///   toute republication — leur PORTÉE appartient à la source, que le
    ///   serveur réimpose —, et `PostService.RepostRequest` n'a de toute façon
    ///   aucun champ de liste. Le dire ici pour la session qui lèvera le plafond
    ///   d'ÉLARGISSEMENT de la loi 10 : rouvrir ces deux audiences demanderait
    ///   d'abord un champ sur la requête, pas seulement un argument de plus.
    /// - Returns: `true` quand le serveur a pris la republication.
    ///
    ///   **La dette nommée ici a été payée À MOITIÉ, et la moitié restante a
    ///   changé de propriétaire — lire les deux avant de la reprendre.** Elle
    ///   disait « ce qui manque est un ÉCRIVAIN, pas un kind ». L'écrivain
    ///   existe (`RepostPublisher`, lot 7 tâche 7.5) et cet ancrage passe
    ///   désormais par lui : il gagne le jeton (`X-Client-Mutation-Id`) que
    ///   l'appel direct n'avait pas, donc le REJEU d'un même envoi cesse de
    ///   republier. Deux TAPS, eux, sont deux gestes, donc deux jetons, qu'aucun
    ///   `MutationLog` ne peut rapprocher : ce qui les retient est le verrou
    ///   « en vol » par CIBLE de l'écrivain (`RepostInFlightRegistry`), pas ce
    ///   header.
    ///
    ///   **Ce qui reste : cette porte ne BASCULE toujours pas en file hors
    ///   ligne**, alors que l'écrivain sait le faire pour les huit autres
    ///   sites. Le `guard` ci-dessous refuse avant de l'atteindre, et ce n'est
    ///   pas un oubli : `ComposerDocumentSendPath.quotedRepost.isDurable` vaut
    ///   `false`, `ComposerDocumentSendPlan` en fait un refus, et trois tests
    ///   du lot 4 l'épinglent. Rendre cette porte durable sans retourner cette
    ///   table poserait un meuble qui DÉCLARE non durable un chemin qui l'est
    ///   — exactement le commentaire plus large que son correctif que ce
    ///   dossier traque. Le lot qui possède la surface document lève les deux
    ///   ENSEMBLE, ou aucun.
    ///
    ///   Hors ligne, le refus est donc DIT — TOUT DE SUITE, sans le délai
    ///   d'expiration d'`URLSession` — et la saisie gardée : jamais un envoi
    ///   silencieusement perdu.
    @discardableResult
    func anchorStatusAsPost(sourceStatusId: String, content: String?, visibility: String) async -> Bool {
        // Le hors-ligne se dit AVANT le réseau. Sans ce garde, la promesse du
        // `- Returns:` ci-dessus n'était tenue qu'après le délai d'expiration
        // d'`URLSession` : la flèche restait grise (`isPublishingDocument`) tout
        // ce temps, pour finir sur le même toast. C'est le même prédicat injecté
        // que `setStatus` consulte — la différence est que le miroir, LUI, a une
        // file où basculer.
        guard !isOffline() else {
            FeedbackToastManager.shared.showError(
                String(localized: "feed.repost.error", defaultValue: "Erreur lors du repost", bundle: .main)
            )
            return false
        }

        do {
            // L'ébarbage du commentaire — « vide ou blanc ⇒ repost SIMPLE » —
            // vit désormais dans `RepostIntent.quoted`, avec les trois autres
            // sites qui l'écrivaient chacun de leur côté.
            try await RepostPublisher(
                postService: postService,
                offlineQueue: offlineQueue,
                isOffline: isOffline
            ).publish(
                .quoted(
                    postId: sourceStatusId,
                    targetType: .post,
                    comment: content,
                    visibility: visibility
                )
            )
            return true
        } catch {
            // UN seul message pour TOUS les refus, et c'est une dette NOMMÉE.
            // Le 403 `REPOST_AUDIENCE_WIDENING` est structurellement atteignable
            // — le client ne plafonne pas l'élargissement, faute de connaître
            // l'audience de la source — et « Error reposting » n'apprend rien à
            // qui vient de le déclencher : la seule issue reste l'essai-erreur.
            // Le chemin jumeau (`StoryViewerView.repostAsPostDirect`) discrimine
            // 404 / 403 / générique ; ses trois clés disent « story » dans les
            // sept langues et ne se prêtent pas à une humeur. Lever cette dette
            // demande donc une clé NEUVE, ce qu'aucune tâche de ce lot ne
            // possède : le catalogue est à sept langues avec un cliquet français
            // à zéro tolérance. Ne pas lire ce toast unique comme un oubli.
            FeedbackToastManager.shared.showError(
                String(localized: "feed.repost.error", defaultValue: "Erreur lors du repost", bundle: .main)
            )
            return false
        }
    }

    // MARK: - Offline Draft Recovery

    /// Returns the last mood that got stuck offline (unsent for more than
    /// `offlineStuckThreshold`) so the composer can pre-fill it as a draft.
    func recoverUnsentStatus() async -> RecoveredOfflinePost? {
        await offlineQueue.recoverLastUnsentPost(
            matchingTypes: ["STATUS"],
            olderThan: Self.offlineStuckThreshold
        )
    }

    /// Supersedes a recovered mood when the user re-sends it from the composer,
    /// so the resend replaces the stuck row instead of duplicating it.
    func supersedeRecoveredStatus(clientMutationId: String) async {
        await offlineQueue.cancelCreatePost(clientMutationId: clientMutationId)
    }

    // MARK: - Clear Status

    func clearStatus() async {
        guard let status = myStatus else { return }

        let snapshot = statuses
        let previousStatus = myStatus
        statuses.removeAll { $0.id == status.id }
        myStatus = nil

        do {
            try await statusService.delete(statusId: status.id)
            await saveCacheSnapshot()
        } catch {
            statuses = snapshot
            myStatus = previousStatus
            FeedbackToastManager.shared.showError(String(localized: "status.deleteError", defaultValue: "Impossible de supprimer le statut", bundle: .main))
        }
    }

    private func saveCacheSnapshot() async {
        let cacheKey = "statuses_\(mode)"
        try? await CacheCoordinator.shared.statuses.save(statuses, for: cacheKey)
    }

    // MARK: - Current User Info (for preview)

    var currentUserDisplayName: String {
        let user = authManager.currentUser
        return user?.displayName ?? user?.username ?? "Moi"
    }

    var currentUserInitial: String {
        let user = authManager.currentUser
        return user?.firstName?.prefix(1).uppercased()
            ?? user?.username.prefix(1).uppercased()
            ?? "M"
    }

    // MARK: - Lookup Methods

    func statusForUser(userId: String) -> StatusEntry? {
        guard let offset = statusIndexByUserId[userId], offset < statuses.count else { return nil }
        return statuses[offset]
    }

    // MARK: - Mood Tap Handler

    /// - Parameter repliesInline: vrai quand le mood est affiché dans la barre de
    ///   la conversation directe de son auteur — toucher son contenu répond alors
    ///   immédiatement (sans pop-up de confirmation).
    func moodTapHandler(for userId: String, repliesInline: Bool = false) -> ((CGPoint) -> Void)? {
        guard statusForUser(userId: userId) != nil else { return nil }
        return { [weak self] point in
            guard let entry = self?.statusForUser(userId: userId) else { return }
            Task { @MainActor in
                StatusBubbleController.shared.show(entry: entry, anchor: point, repliesInline: repliesInline)
            }
        }
    }

    // MARK: - Socket.IO Real-Time Updates

    /// Applique un delta de reaction sur un resume par emoji. Un compte qui
    /// retombe a zero perd sa cle : le laisser a 0 afficherait une pastille
    /// vide, et le resume ne descend jamais sous zero meme si un
    /// `status:unreacted` arrive sans son `status:reacted` (reconnexion).
    static func applyingReaction(
        emoji: String, delta: Int, to summary: [String: Int]?
    ) -> [String: Int] {
        var updated = summary ?? [:]
        let next = (updated[emoji] ?? 0) + delta
        if next > 0 {
            updated[emoji] = next
        } else {
            updated.removeValue(forKey: emoji)
        }
        return updated
    }

    func subscribeToSocketEvents() {
        guard cancellables.isEmpty else { return }

        socialSocket.statusCreated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                if let entry = apiPost.toStatusEntry() {
                    if !self.statuses.contains(where: { $0.id == entry.id }) {
                        self.statuses.insert(entry, at: 0)
                        self.persistSnapshot()
                    }
                }
            }
            .store(in: &cancellables)

        socialSocket.statusDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] statusId in
                guard let self, self.statuses.contains(where: { $0.id == statusId }) else { return }
                self.statuses.removeAll { $0.id == statusId }
                self.persistSnapshot()
            }
            .store(in: &cancellables)

        socialSocket.statusUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                if let entry = apiPost.toStatusEntry(),
                   let index = self.statuses.firstIndex(where: { $0.id == entry.id }) {
                    self.statuses[index] = entry
                    self.persistSnapshot()
                }
            }
            .store(in: &cancellables)

        // Reception temps reel des reactions de statut (le REST /posts/:id/like
        // emet `status:reacted` cote gateway). La propre reaction de l'utilisateur
        // est deja posee optimistiquement par reactToStatus ; on n'applique donc
        // que celles des AUTRES. Le payload ne porte pas de compte agrege, on
        // incremente prudemment (meme garde d'echo que la reaction de conversation).
        socialSocket.statusReacted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.applyReactionDelta(statusId: payload.statusId, emoji: payload.emoji,
                                         userId: payload.userId, delta: 1)
            }
            .store(in: &cancellables)

        // Symetrique : `status:unreacted` etait publie par le SDK sans AUCUN
        // abonne, donc un retrait de reaction ne se voyait qu'apres un
        // rechargement REST — et jamais hors-ligne.
        socialSocket.statusUnreacted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.applyReactionDelta(statusId: payload.statusId, emoji: payload.emoji,
                                         userId: payload.userId, delta: -1)
            }
            .store(in: &cancellables)
    }

    private func applyReactionDelta(statusId: String, emoji: String, userId: String, delta: Int) {
        guard userId != authManager.currentUser?.id,
              let index = statuses.firstIndex(where: { $0.id == statusId }) else { return }
        statuses[index].reactionSummary = Self.applyingReaction(
            emoji: emoji, delta: delta, to: statuses[index].reactionSummary
        )
        persistSnapshot()
    }

    /// Toute mutation temps reel de `statuses` doit atteindre le disque : les
    /// quatre sinks ne muteraient que le tableau `@Published`, si bien qu'un
    /// mood cree, supprime ou reagi pendant la session disparaissait au
    /// prochain demarrage a froid (le cache gardait l'instantane REST).
    private func persistSnapshot() {
        Task { await saveCacheSnapshot() }
    }

    // MARK: - React to Status

    func reactToStatus(_ statusId: String, emoji: String) async {
        // Optimistic : refleter la reaction dans reactionSummary avant le reseau
        // (parite avec les reactions de post/commentaire). Snapshot pour rollback.
        let previousSummary = statuses.first(where: { $0.id == statusId })?.reactionSummary
        if let index = statuses.firstIndex(where: { $0.id == statusId }) {
            var summary = statuses[index].reactionSummary ?? [:]
            summary[emoji, default: 0] += 1
            statuses[index].reactionSummary = summary
        }
        do {
            try await statusService.react(statusId: statusId, emoji: emoji)
        } catch {
            // Rollback de l'optimisme + toast. (Sur succes, le broadcast
            // `status:reacted` reconcilie l'etat autoritaire cote serveur.)
            if let index = statuses.firstIndex(where: { $0.id == statusId }) {
                statuses[index].reactionSummary = previousSummary
            }
            FeedbackToastManager.shared.showError(String(localized: "status.reactError", defaultValue: "Impossible de réagir au statut", bundle: .main))
        }
    }

}
