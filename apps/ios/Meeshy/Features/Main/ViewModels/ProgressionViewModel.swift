import SwiftUI
import Combine
import MeeshySDK

/// Ce qu'il faut pour défaire UN geste optimiste : la charge d'avant, et la génération de
/// lecture servie à laquelle il a commencé (#9383).
struct GestureUndo {
    let before: APIEngagementProgress
    let generation: Int
}

/// L'écran « Progression » (#5698) — badges, série et niveau de l'utilisateur,
/// lus depuis `GET /me/engagement` et DÉRIVÉS par la loi partagée
/// (`EngagementProgressResolver`, miroir de `packages/shared/utils/engagement-progress.ts`).
///
/// Cache-first comme le reste de l'app (Pattern I1) : le dernier instantané
/// connu se peint immédiatement, la revalidation se fait en silence ; le
/// squelette n'apparaît qu'à froid, jamais sur un instantané. Hors ligne,
/// l'instantané reste affiché — `CacheFirstLoader` récupère même un cache
/// expiré (cache-04) plutôt que de rendre un écran vide.
///
/// Ce ViewModel ne lit JAMAIS l'historique des notifications : les quatre
/// types de réengagement restent le canal de LIVRAISON des paliers, cet écran
/// restitue l'ÉTAT courant (modèle § 9).
@MainActor
final class ProgressionViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free au démontage hors d'une tâche. `revalidationTask`
    // est un `Task` (Sendable) : l'annuler depuis une deinit non isolée est
    // le motif de `ConversationListViewModel`. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {
        revalidationTask?.cancel()
    }

    @Published private(set) var progress: EngagementProgress?
    /// Le JEU (#9383) — le bloc `game` de la même charge, `nil` devant un ancien
    /// serveur ou un bloc que ce client ne comprend pas : l'écran d'avant reste
    /// alors INTACT, il ne reçoit rien à moitié.
    @Published private(set) var game: GameBlock?
    @Published private(set) var loadState: LoadState = .idle
    /// Les gestes du jeu EN VOL, un par intention (#9383).
    @Published var pending = GamePending()
    /// Le refus du DERNIER geste, dit là où le geste a eu lieu.
    @Published var gameErrors = GameErrors()
    /// La dernière pièce frappée, pour la scène ; `nil` tant qu'aucune n'a été frappée depuis l'ouverture.
    @Published var celebration: MintCelebration?
    /// En ligne ou non, tel que la coupure le dit — les gestes d'écriture se taisent hors ligne.
    @Published private(set) var isOnline = true
    /// Une frappe est en vol (#5743) — le bouton reste affiché, avec son état
    /// dit : le faire disparaître au tap donnerait l'impression d'un échec.
    @Published private(set) var isMinting = false
    /// L'échec de la DERNIÈRE frappe, dit dans le détail où le geste a eu lieu
    /// (#6467). Il allait à `loadState`, que l'écran rend en haut du contenu,
    /// SOUS le détail resté ouvert : rien ne changeait là où l'on regardait, et
    /// l'on retouchait. Effacé au geste suivant.
    @Published private(set) var mintError: String?

    /**
     * L'identifiant d'IDEMPOTENCE, généré une fois par INTENTION de frappe et
     * non par requête : sinon un réessai deviendrait une seconde frappe, ce que
     * cet identifiant est justement là pour empêcher. Il n'est renouvelé
     * qu'après une frappe qui a abouti.
     */
    private var mintRequestId = UUID().uuidString

    let service: EngagementProgressProviding
    let gameService: GameServiceProviding
    private let networkMonitor: any NetworkMonitorProviding
    private let cacheKey: String
    private let userId: String
    private var revalidationTask: Task<Void, Never>?
    private var connectivity: AnyCancellable?
    /// `game:updated` (#10900) — l'état du Jeu changé ailleurs.
    private var gameUpdates: AnyCancellable?

    /// La charge servie, telle que le cache la garde : c'est sur elle que les
    /// mises à jour optimistes travaillent, `progress` et `game` en sont dérivés.
    private(set) var snapshot: APIEngagementProgress? {
        didSet { if let snapshot { Self.lastKnown[cacheKey] = snapshot } }
    }
    /// La DERNIÈRE charge connue de ce processus, par clé de cache (#9564, amendement n° 4) : une page de
    /// Progression POUSSÉE (fiche, sous-page) a son propre modèle, et se peint dès sa première image avec ce que la
    /// page d'en dessous montrait déjà — jamais un squelette entre deux pages qui lisent la même charge. Le cache
    /// disque reste la source au démarrage à froid ; la revalidation corrige ensuite, en silence.
    private static var lastKnown: [String: APIEngagementProgress] = [:]
    /// Les gestes du jeu en vol : tant qu'il y en a un, la lecture montrée est
    /// l'optimiste — le guide et les propositions de photo attendent qu'il soit
    /// réglé pour célébrer (un geste refusé ne se célèbre pas).
    @Published private(set) var gesturesInFlight = 0
    /// Une écriture du cache demandée PENDANT un geste attend qu'il soit réglé : ce qui est
    /// affiché alors est l'optimiste, et le cache ne garde jamais une valeur que le geste,
    /// s'il échoue, rendra fausse (#9383).
    private var persistDeferred = false
    /// Un geste a échoué pendant qu'un autre était en vol : son instantané
    /// « d'avant » portait déjà l'optimiste de l'autre (ou l'autre portait le
    /// sien). Défaire l'un effaçait l'autre ; défaire l'autre, dans le désordre,
    /// ressuscitait le premier échec à côté de son message d'erreur. Aucun
    /// défait local alors : la lecture du serveur, une fois tout posé.
    private var reconcilesWhenSettled = false
    /// Incrémenté à chaque lecture SERVIE qui remplace la charge : un retour arrière ne
    /// défait que ce que son geste a changé, jamais une lecture arrivée entre-temps.
    private var snapshotGeneration = 0
    /// L'ORDRE DES LECTURES (#10898) : chaque lecture reçoit son ticket au DÉPART, et ne pose jamais une charge plus
    /// ancienne que celle déjà posée, ni une charge partie avant le dernier geste.
    private var readOrder = GameReadOrder()
    /// Ce que la passerelle a CONFIRMÉ (révision de l'état du jeu, Meeshes frappées), par clé de cache et pour tout le
    /// processus : une page poussée et celle d'en dessous lisent la même charge, et aucune ne repeint un état d'avant une
    /// frappe que l'autre a vue confirmée.
    private static var confirmed: [String: GameReadOrder.Confirmed] = [:]
    var celebrations = 0
    /// Une clé d'idempotence par INTENTION (frappe, coffre, gel, rallumage, changement de mission) ;
    /// elle ne se renouvelle qu'après un SUCCÈS.
    var gestureRequestIds: [String: String] = [:]

    /// Le guide de Mee et Meo (#9379) : une carte par ouverture d'écran.
    private(set) lazy var guide = GameGuideSession(
        service: gameService,
        visits: UserDefaultsGameVisitStore(userId: userId),
        onSeen: { [weak self] keys in self?.markGuideSeenLocally(keys) },
        memory: UserDefaultsGuideSnapshotStore(userId: userId)
    )
    /// Les propositions de photo (#9382) et le déroulé ouvert.
    private(set) lazy var photos = GamePhotoCoordinator(notebook: notebook) { [notebook, weak self] moment in
        // La Flamme du bandeau de parrainage (#7742) : celle que la lecture courante sert, quand elle brûle.
        GamePhotoSession(moment: moment, notebook: notebook, flame: self?.game.flatMap { ReferralCard.Flame(game: $0.flame) })
    }
    let notebook: GamePhotoNotebooking

    var isSettled: Bool { gesturesInFlight == 0 }

    init(
        service: EngagementProgressProviding = EngagementProgressService.shared,
        gameService: GameServiceProviding = GameService.shared,
        networkMonitor: any NetworkMonitorProviding = NetworkMonitor.shared,
        currentUserId: String = AuthManager.shared.currentUser?.id ?? "",
        notebook: GamePhotoNotebooking? = nil
    ) {
        self.service = service
        self.gameService = gameService
        self.networkMonitor = networkMonitor
        self.cacheKey = "engagement:\(currentUserId)"
        self.userId = currentUserId
        self.notebook = notebook ?? GamePhotoNotebook.standard(userId: currentUserId)
        self.isOnline = networkMonitor.isOnline
        self.connectivity = networkMonitor.isOfflinePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] offline in self?.isOnline = !offline }
        self.gameUpdates = NotificationCenter.default.publisher(for: .gameStateUpdated)
            .compactMap { $0.object as? GameUpdatedEvent }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.receive(event) }
        if let known = Self.lastKnown[cacheKey] { _ = adopt(known) }
    }

    /// Squelette : cache FROID et rien encore peint — jamais un spinner sur un instantané.
    var showsSkeleton: Bool {
        progress == nil && loadState == .loading
    }

    var isOffline: Bool {
        loadState == .offline
    }

    var errorMessage: String? {
        if case .error(let message) = loadState { return message }
        return nil
    }

    func load(forceNetwork: Bool = false) async {
        let service = self.service
        let store = await CacheCoordinator.shared.engagementProgress
        let loader = CacheFirstLoader(store: store, key: cacheKey, networkMonitor: networkMonitor)
        revalidationTask?.cancel()

        let fetch: @Sendable () async throws -> [APIEngagementProgress] = { [try await service.fetchProgress()] }
        let ticket = readOrder.issue()
        let setLoadState: @MainActor @Sendable (LoadState) -> Void = { [weak self] state in
            guard let self else { return }
            switch state {
            case .error:
                // Le message du loader est celui de l'erreur système — on lui
                // préfère la phrase de l'écran, la même dans les sept langues.
                self.loadState = .error(String(localized: "progression.load_error", defaultValue: "Impossible de charger la progression", bundle: .main))
            default:
                self.loadState = state
            }
        }
        let apply: @MainActor @Sendable ([APIEngagementProgress]) -> Void = { [weak self] snapshots in
            guard let self, let snapshot = snapshots.first, self.admits(snapshot, ticket: ticket) else { return }
            self.confirm(revision: snapshot.gameRevision, minted: snapshot.meesh?.mintedLifetime)
            let resolu = self.adopt(snapshot)
            self.observeGame()
            // Les rappels de série se REPLANIFIENT à chaque lecture de la
            // progression (#5902) : c'est le seul moment où l'on connaît à la
            // fois le nombre de jours tenus et l'état du geste du jour. Le
            // planificateur retire toujours son jeu précédent, donc l'appeler
            // souvent ne peut pas empiler de rappels.
            Task { await StreakReminderScheduler.shared.replanifier(
                serieEnCours: resolu.streak.currentDays,
                aAgiAujourdhui: StreakActivityMark.aAgiAujourdhui()
            ) }
        }

        if forceNetwork {
            await loader.refresh(fetch: fetch, setLoadState: setLoadState, apply: apply)
            return
        }
        revalidationTask = await loader.load(fetch: fetch, setLoadState: setLoadState, apply: apply)
    }

    /// Frappe une Meesh, puis RELIT depuis le réseau.
    ///
    /// **Optimiste (#9383)** : l'écran change AVANT la réponse — niveau, trésor,
    /// rang, prix suivant, recalculés par la MÊME loi que la passerelle
    /// (`GameOptimistic.afterMint`) ; un échec RESTAURE l'instantané d'avant.
    ///
    /// La relecture est forcée : la frappe change les compteurs, le score, les
    /// badges et le solde d'un seul coup, et servir le cache après elle
    /// montrerait un écran qui contredit l'action qu'on vient de faire.
    ///
    /// Un échec ne bloque rien et ne renouvelle PAS l'identifiant : réessayer
    /// avec le même reste idempotent, ce qui est exactement ce qu'on veut quand
    /// on ne sait pas si la première tentative a abouti.
    func mint() async {
        guard !isMinting else { return }
        isMinting = true
        mintError = nil
        let preview = game?.mint
        let before = beginGesture(GameOptimistic.afterMint)
        do {
            // Le prix que l'écran montrait part avec la frappe (#10903) : au-delà, la passerelle refuse sans débiter.
            let result = try await service.mintMeesh(requestId: mintRequestId, maxPrice: preview?.price)
            mintRequestId = UUID().uuidString
            confirm(revision: result.gameRevision, minted: result.mintedLifetime)
            celebrate(result, preview: preview)
            await load(forceNetwork: true)
        } catch {
            restore(before)
            let refusal = GameService.refusal(of: error)
            if refusal == .requestIdConflict { mintRequestId = UUID().uuidString }
            // La dette (ffbc396c92) et la réserve fermée se DISENT ; la relecture montre ensuite le blocage à l'écran.
            mintError = GameMintCostCopy.mintFailureMessage(code: refusal, debt: game?.mint.sparksDebt ?? game?.level.sparksDebt)
            // Un refus d'ÉTAT dit que l'écran était périmé : il se relit — le nouveau prix, la dette, la réserve fermée.
            if refusal == .mintBlockedByDebt || refusal == .treasuryLocked || refusal == .priceChanged { await load(forceNetwork: true) }
        }
        endGesture()
        isMinting = false
    }

    private func celebrate(_ result: APIMeeshMintResult, preview: GameMintPreview?) {
        guard result.status == "minted" else { return }
        guard let number = result.number ?? preview?.number,
              let edition = result.edition ?? preview?.edition else { return }
        celebrations += 1
        celebration = MintCelebration(number: number, edition: edition, key: celebrations)
    }

    // MARK: - Le socle des gestes du jeu

    /// Capture l'instantané, applique la mise à jour optimiste, annonce le geste en vol.
    /// Rend l'instantané À RESTAURER — `nil` quand il n'y a pas de bloc `game` (ancien serveur).
    func beginGesture(_ apply: (GameState) -> GameState) -> GestureUndo? {
        gesturesInFlight += 1
        readOrder.beginGesture()
        guard let snapshot, let game = snapshot.game else { return nil }
        commit(apply(GameState(game: game, meesh: snapshot.meesh)), over: snapshot)
        return GestureUndo(before: snapshot, generation: snapshotGeneration)
    }

    func endGesture() {
        gesturesInFlight = max(0, gesturesInFlight - 1)
        if isSettled, reconcilesWhenSettled {
            reconcilesWhenSettled = false
            Task { [weak self] in await self?.load(forceNetwork: true) }
        }
        observeGame()
        guard isSettled, persistDeferred else { return }
        persistDeferred = false
        persistSnapshot()
    }

    /// Une lecture servie se pose si elle n'est ni DÉPASSÉE (une lecture partie après elle, ou un geste commencé après
    /// son départ) ni EN RETARD sur une frappe confirmée (#10898).
    private func admits(_ served: APIEngagementProgress, ticket: GameReadOrder.Ticket) -> Bool {
        guard readOrder.admits(ticket) else { return false }
        return GameReadOrder.isCurrent(
            servedRevision: served.gameRevision, servedMinted: served.meesh?.mintedLifetime,
            confirmed: Self.confirmed[cacheKey] ?? GameReadOrder.Confirmed()
        )
    }

    /// `game:updated` (#10900) — une frappe, un gain, une reprise faits AILLEURS. Un état plus ancien que ce qui est
    /// confirmé ne se pose pas ; sinon il relève le plancher, se pose aussitôt quand aucun geste n'est en vol (un geste en vol
    /// relit lui-même), et la progression entière (solde, compteurs) se relit derrière, en silence.
    ///
    /// Le plancher est celui du PROCESSUS : la passerelle date l'événement d'une frappe AVANT de relire le bloc, la frappe
    /// APRÈS — l'événement arrive donc plus ancien que la frappe confirmée par une autre page. La page restée dessous, qui
    /// montre encore l'état d'avant, se relit quand même : sinon elle le garderait jusqu'à sa prochaine lecture.
    func receive(_ event: GameUpdatedEvent) {
        let floor = Self.confirmed[cacheKey] ?? GameReadOrder.Confirmed()
        guard GameReadOrder.isCurrent(servedRevision: event.gameRevision, servedMinted: nil, confirmed: floor) else {
            if showsAnOlderStateThan(floor) { Task { await load(forceNetwork: true) } }
            return
        }
        confirm(revision: event.gameRevision, minted: nil)
        if isSettled, let game = event.game, let snapshot {
            commit(GameState(game: game, meesh: snapshot.meesh), over: snapshot)
        }
        Task { await load(forceNetwork: true) }
    }

    /// Vrai si la charge affichée est EN RETARD sur ce que le processus a confirmé — une frappe confirmée ailleurs. Une
    /// charge optimiste (geste en vol) n'est jamais en retard : son geste relit lui-même.
    private func showsAnOlderStateThan(_ floor: GameReadOrder.Confirmed) -> Bool {
        guard isSettled, let snapshot else { return false }
        return !GameReadOrder.isCurrent(
            servedRevision: snapshot.gameRevision, servedMinted: snapshot.meesh?.mintedLifetime, confirmed: floor
        )
    }

    /// Ce que la passerelle confirme — une frappe, une lecture posée — relève le plancher : rien d'antérieur ne le défait.
    private func confirm(revision: Int?, minted: Int?) {
        Self.confirmed[cacheKey] = (Self.confirmed[cacheKey] ?? GameReadOrder.Confirmed()).raised(revision: revision, minted: minted)
    }

    /// Pose une lecture SERVIE (réseau ou cache) comme la charge affichée.
    @discardableResult
    func adopt(_ served: APIEngagementProgress) -> EngagementProgress {
        let resolved = EngagementProgressResolver.resolve(served)
        snapshotGeneration += 1
        snapshot = served
        progress = resolved
        game = served.game
        return resolved
    }

    /// Pose un état du jeu dans la charge servie et republie ce qui en est dérivé.
    func commit(_ state: GameState, over base: APIEngagementProgress? = nil) {
        guard let current = base ?? snapshot else { return }
        let next = current.replacing(game: state.game, meesh: state.meesh)
        snapshot = next
        progress = EngagementProgressResolver.resolve(next)
        game = next.game
    }

    /// Défait CE QUE LE GESTE a changé, et rien d'autre : une lecture servie arrivée entre-temps
    /// est la vérité du serveur, elle reste ; les clés du guide vues pendant le vol restent vues
    /// (elles ne dépendent pas du geste).
    func restore(_ undo: GestureUndo?) {
        guard let undo, undo.generation == snapshotGeneration else { return }
        guard gesturesInFlight <= 1, !reconcilesWhenSettled else {
            reconcilesWhenSettled = true
            return
        }
        let seenSince = snapshot?.game?.guideSeen ?? []
        guard let game = undo.before.game else { return }
        let state = GameOptimistic.withGuideSeen(GameState(game: game, meesh: undo.before.meesh), keys: seenSince)
        commit(state, over: undo.before)
    }

    /// Le guide et les propositions de photo lisent le jeu, mais seulement RÉGLÉ.
    func observeGame() {
        guard let game else { return }
        guide.observe(game: game, settled: isSettled)
        photos.observe(game: game, settled: isSettled)
    }

    /// L'identifiant d'une intention : généré UNE fois, jamais par requête.
    func requestId(for intention: String) -> String {
        if let known = gestureRequestIds[intention] { return known }
        let fresh = UUID().uuidString
        gestureRequestIds[intention] = fresh
        return fresh
    }

    func spent(_ intention: String) {
        gestureRequestIds.removeValue(forKey: intention)
    }

    /// Les clés du guide entrent aussitôt dans l'état ET dans le cache : la prochaine
    /// ouverture dira la version COURTE même si l'envoi au serveur a échoué.
    private func markGuideSeenLocally(_ keys: [String]) {
        guard let snapshot, let game = snapshot.game else { return }
        let state = GameOptimistic.withGuideSeen(GameState(game: game, meesh: snapshot.meesh), keys: keys)
        commit(state, over: snapshot)
        persistSnapshot()
    }

    func persistSnapshot() {
        guard isSettled else {
            persistDeferred = true
            return
        }
        guard let snapshot else { return }
        let key = cacheKey
        Task {
            let store = await CacheCoordinator.shared.engagementProgress
            try? await store.save([snapshot], for: key)
            // La bannière du joueur (#9494) relit ce cache : elle montre le niveau, les Meeshes et la Flamme que
            // Progression vient d'écrire, sans attendre une revalidation.
            NotificationCenter.default.post(name: .engagementSnapshotPersisted, object: nil)
        }
    }
}
