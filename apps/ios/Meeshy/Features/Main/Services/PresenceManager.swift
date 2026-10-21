import Foundation
import Combine
import MeeshySDK
import os

// MARK: - Presence Refresh Signal

/// Debounced, coarse-grained re-render signal for observers that need to
/// react to presence changes WITHOUT subscribing to `PresenceManager`
/// itself. Every `@Published` property on ONE `ObservableObject` shares the
/// SAME `objectWillChange` publisher, so observing `PresenceManager`
/// directly would re-fire on every single `presenceMap` mutation (one per
/// `user:status` socket event) — exactly the "re-render the whole list on
/// every presence event" cost `ConversationListView` already deliberately
/// avoids by reading `presenceManager` as a plain (unobserved) computed
/// property. `presenceVersion`'s VALUE is irrelevant — only the CHANGE is
/// the signal; consumers observe THIS object (`@ObservedObject`) instead of
/// `PresenceManager`, keeping "Zero Unnecessary Re-render" intact (audit
/// 2026-07-20, "pastilles de présence jamais rafraîchies sur user:status").
@MainActor
final class PresenceRefreshSignal: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published private(set) var presenceVersion: Int = 0

    fileprivate func bump() {
        presenceVersion &+= 1
    }
}

// MARK: - Presence Manager

@MainActor
final class PresenceManager: ObservableObject {
    static let shared = PresenceManager()

    @Published var presenceMap: [String: UserPresence] = [:] {
        didSet {
            schedulePersist()
            scheduleVersionBump()
        }
    }

    /// « Est dans la conversation » (#8892) : qui a l'écran de quelle
    /// conversation ouvert, alimenté par `viewing:start` / `viewing:stop` /
    /// `viewing:snapshot`. Hors de `presenceMap` : ce n'est pas une présence
    /// globale mais un signal d'activité scopé à une room — il n'est ni
    /// persisté, ni gardé à travers une coupure du socket (le serveur oublie
    /// tout à la déconnexion). Chaque changement relance `refreshSignal`.
    private(set) var conversationViewers = ConversationViewers() {
        didSet {
            guard conversationViewers != oldValue else { return }
            scheduleVersionBump()
        }
    }

    /// Debounced companion signal — see `PresenceRefreshSignal`. Bumped
    /// `Self.versionBumpDebounce` seconds after the LAST `presenceMap`
    /// mutation settles, coalescing a burst of `user:status` events (e.g.
    /// right after reconnect) into a single downstream re-render.
    let refreshSignal = PresenceRefreshSignal()
    /// Le même battement, en flux, pour les avatars des vues du SDK
    /// (`MeeshyLivePresence`, posé par `meeshySocialChrome`) : MeeshyUI ne lit
    /// aucun singleton de l'app. `dropFirst` — s'abonner n'est pas un battement.
    lazy var refreshPublisher: AnyPublisher<Int, Never> = refreshSignal.$presenceVersion
        .dropFirst()
        .eraseToAnyPublisher()
    /// L'état de chaque pastille au dernier battement publié (#11412) : le
    /// minuteur ne repeint que si un état a changé depuis.
    private var publishedStates: [String: PresenceState] = [:]
    nonisolated(unsafe) private var versionBumpTask: Task<Void, Never>?
    nonisolated static let versionBumpDebounce: TimeInterval = 0.4

    private var cancellables = Set<AnyCancellable>()
    private var restTasks: [String: Task<Void, Never>] = [:]
    nonisolated(unsafe) private var recalcTimer: Timer?
    nonisolated(unsafe) private var persistTask: Task<Void, Never>?

    private nonisolated static let persistFileName = "presence_map.json"
    private nonisolated static let persistMaxAge: TimeInterval = 24 * 3600 // 24h
    private nonisolated static let persistDebounce: TimeInterval = 1.5

    private init() {
        // Start with empty map; disk I/O runs off-main below to avoid blocking
        // the launch thread. Using the Published backing store directly bypasses
        // didSet so we don't schedule a spurious persist of the empty state.
        _presenceMap = Published(initialValue: [:])

        // Subscribe to user:status events from socket
        MessageSocketManager.shared.userStatusChanged
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.presenceMap[event.userId] = UserPresence(
                    isOnline: event.isOnline,
                    lastActiveAt: event.lastActiveAt
                )
            }
            .store(in: &cancellables)

        // Subscribe to the post-auth presence snapshot. Lets us seed the entire
        // contact set in one shot instead of waiting for each contact to emit a
        // `user:status` transition (which only fires on state changes — so a
        // user who's been online for hours would never light up otherwise).
        MessageSocketManager.shared.presenceSnapshotReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.ingestSnapshot(event.users)
            }
            .store(in: &cancellables)

        // Typing = signal de présence le plus fort : l'émetteur est actif LÀ,
        // MAINTENANT. Le gateway persiste lastActiveAt sur typing:start mais ne
        // rebroadcaste pas de user:status — sans ce bump local, la pastille
        // décroissait (vert → orange → gris) pendant que « X écrit… » s'affichait.
        MessageSocketManager.shared.typingStarted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.noteActivity(userId: event.userId)
            }
            .store(in: &cancellables)

        // Un pair qui arrive dans une conversation est actif LÀ, MAINTENANT —
        // même statut que la frappe. Voir `applyViewing(_:)`.
        MessageSocketManager.shared.conversationViewing
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyViewing(event)
            }
            .store(in: &cancellables)

        // Contrairement à `presenceMap` (ci-dessous), l'ensemble des présents
        // NE survit PAS à une coupure : le serveur retire la présence à l'écran
        // de chaque socket déconnecté, puis ré-annonce après `authenticated`
        // un `viewing:snapshot` par conversation NON VIDE — une conversation
        // vidée entre-temps n'en reçoit aucun. La garder ferait briller un
        // point primaire périmé ; `.sessionStarted` la vide aussi quand une
        // reconnexion automatique ne passe pas par `isConnected == false`.
        MessageSocketManager.shared.$isConnected
            .removeDuplicates()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.clearConversationViewers()
            }
            .store(in: &cancellables)

        // La carte SURVIT à une coupure (vidée, chaque reprise d'arrière-plan
        // éteignait tous les points), mais elle n'y garde aucun `isOnline:true` :
        // sans socket, ce drapeau n'est plus maintenu par personne, et une entrée
        // sans `lastActiveAt` restait verte indéfiniment (#11412). Chaque entrée
        // garde son `lastActiveAt` et décroît (1/3/5) ; l'instantané de la
        // reconnexion la remplace. Seules les coupures APRÈS l'abonnement
        // comptent (`dropFirst`) : l'état initial n'est pas une coupure.
        MessageSocketManager.shared.$isConnected
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.noteSocketDisconnected()
            }
            .store(in: &cancellables)

        // Hydrate from disk off-main: fills entries not yet populated by a
        // real-time socket event (live updates take precedence via merging).
        Task { @MainActor [weak self] in
            let loaded = await Task.detached(priority: .utility) {
                Self.loadFromDisk()
            }.value
            guard let self else { return }
            self.presenceMap = loaded.merging(self.presenceMap) { _, liveEntry in liveEntry }
        }

        startRecalcTimer()
    }

    /// Re-résout chaque pastille à chaque tick et ne repeint que si un état a
    /// changé depuis le dernier battement (`recalculateStates`) — plus de
    /// fenêtre fixe qu'un tick manqué sautait. Mode `.common` : le minuteur
    /// continue pendant le défilement, quand la décroissance se voit le plus.
    private func startRecalcTimer() {
        let timer = Timer(timeInterval: Self.recalcInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.recalculateStates()
            }
        }
        timer.tolerance = 1
        RunLoop.main.add(timer, forMode: .common)
        recalcTimer = timer
    }

    /// Re-sème la présence depuis une page de conversations (REST). Cette
    /// charge n'a d'autorité que sur les INCONNUS : un utilisateur déjà suivi
    /// GARDE son entrée — masque serveur (`isOnline:false`, `lastActiveAt:nil`)
    /// compris, activité fraîche (`noteActivity`) comprise. Seules les sources
    /// vivantes (`presence:snapshot`, `user:status`, typing:start) remplacent
    /// une présence connue. Jumeau iOS de F10 (web `mergeParticipants(_,
    /// { presence: 'keep-existing' })`) — chantier confidentialité 2026-08-26.
    func seed(from conversations: [APIConversation], currentUserId: String) {
        let listed = conversations
            .flatMap { $0.participants ?? [] }
            .filter { $0.userId != currentUserId }
            .reduce(into: [String: UserPresence]()) { map, participant in
                guard let userId = participant.userId else { return }
                map[userId] = UserPresence(
                    isOnline: participant.isOnline ?? participant.user?.isOnline ?? false,
                    lastActiveAt: participant.lastActiveAt ?? participant.user?.lastActiveAt
                )
            }
        guard !listed.isEmpty else { return }
        presenceMap.merge(listed) { known, _ in known }
    }

    func presenceState(for userId: String) -> PresenceState {
        presenceMap[userId]?.state ?? .offline
    }

    /// La présence SERVIE de l'auteur d'un message (#10944) : `senderId` est
    /// l'identifiant de PARTICIPATION, la carte est tenue par COMPTE — la clé
    /// sous laquelle le serveur l'annonce (`viewingKey`). Un visiteur anonyme
    /// n'a aucune présence servie : son avatar ne porte aucun point.
    func presenceState(forSenderOf message: MeeshyMessage) -> PresenceState {
        presenceState(for: message.viewingKey)
    }

    /// La carte vivante d'abord, la présence que la charge a SERVIE sinon — un
    /// auteur de story dont aucun `user:status` n'est encore arrivé (#10944).
    func presenceState(for userId: String, served: UserPresence?) -> PresenceState {
        knownPresenceState(for: userId) ?? served?.state ?? .offline
    }

    /// Preuve d'activité observée côté client (frappe, arrivée dans une
    /// conversation) : elle date l'activité, rien de plus (#11412). Le pair est
    /// vert (≤ 60 s) puis décroît orange → gris → rien ; `isOnline` reste ce que
    /// le serveur a dit — le poser à `true` donnait 5 min de vert puis plus rien.
    /// Sa propre activité n'écrit jamais la carte.
    func noteActivity(userId: String) {
        guard !userId.isEmpty, userId != AuthManager.shared.currentUser?.id else { return }
        presenceMap[userId] = UserPresence(
            isOnline: presenceMap[userId]?.isOnline ?? false,
            lastActiveAt: Date()
        )
    }

    /// Coupure du socket (#11412) : plus personne n'est en ligne AU SENS DU
    /// SERVEUR. Chaque entrée passe à `isOnline:false` en gardant son
    /// `lastActiveAt`, donc décroît sans s'éteindre d'un coup ; l'instantané de
    /// la reconnexion la remplace.
    func noteSocketDisconnected() {
        guard presenceMap.values.contains(where: \.isOnline) else { return }
        presenceMap = presenceMap.mapValues { UserPresence(isOnline: false, lastActiveAt: $0.lastActiveAt) }
    }

    // MARK: - « Est dans la conversation » (#8892)

    /// `userId` a l'écran de `conversationId` ouvert, au premier plan.
    func isHere(userId: String, conversationId: String) -> Bool {
        conversationViewers.isHere(userId: userId, conversationId: conversationId)
    }

    /// … et y regarde, écoute ou agit en ce moment (#9061) : son point pulse.
    func isHereActive(userId: String, conversationId: String) -> Bool {
        conversationViewers.isActive(userId: userId, conversationId: conversationId)
    }

    /// Ce que l'avatar de `userId` dit dans `conversationId` : absent, ici, actif.
    func here(userId: String, conversationId: String) -> ConversationHere {
        conversationViewers.here(userId: userId, conversationId: conversationId)
    }

    /// Le temps qu'un pair reste actif après son dernier `viewing:activity` —
    /// jumeau de `ACTIVITY_HOLD_MS` (`apps/web/src/lib/api/conversation-viewing.ts`).
    nonisolated static let defaultActivityHold: TimeInterval = 4
    var activityHold: TimeInterval = PresenceManager.defaultActivityHold

    /// Applique un événement `viewing:*`. Un pair annoncé présent (arrivée ou
    /// snapshot) compte aussi comme activité : le serveur n'annonce que les
    /// utilisateurs qui montrent leur statut en ligne.
    func applyViewing(_ event: ConversationViewingEvent) {
        conversationViewers = conversationViewers.applying(event)
        switch event {
        case .arrived(let change):
            noteActivity(userId: change.userId)
        case .snapshot(let snapshot):
            snapshot.userIds.forEach { noteActivity(userId: $0) }
        case .active(let change):
            noteActivity(userId: change.userId)
            scheduleRest(change)
        case .left(let change):
            restTasks.removeValue(forKey: Self.restKey(change))?.cancel()
        case .sessionStarted:
            cancelRestTasks()
        }
    }

    /// Déconnexion : la présence observée appartient au compte sortant. Le
    /// fichier n'a pas de compte dans son nom ; il est réécrit vide tout de
    /// suite, pas après le délai de regroupement, pour qu'un arrêt de l'app
    /// juste après ne rende pas au compte suivant la carte du précédent.
    func resetForLogout() {
        presenceMap = [:]
        persistTask?.cancel()
        persistToDisk()
        clearConversationViewers()
    }

    func clearConversationViewers() {
        cancelRestTasks()
        conversationViewers = ConversationViewers()
    }

    private nonisolated static func restKey(_ change: ConversationViewingChange) -> String {
        "\(change.conversationId)\u{0}\(change.userId)"
    }

    /// Chaque activité reçue repousse l'extinction : le point pulse tant que
    /// le pair continue, et s'apaise `activityHold` après son dernier geste.
    private func scheduleRest(_ change: ConversationViewingChange) {
        let key = Self.restKey(change)
        restTasks[key]?.cancel()
        let hold = activityHold
        restTasks[key] = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(hold * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            self.restTasks[key] = nil
            self.conversationViewers = self.conversationViewers.resting(userId: change.userId, conversationId: change.conversationId)
        }
    }

    private func cancelRestTasks() {
        restTasks.values.forEach { $0.cancel() }
        restTasks = [:]
    }

    /// Présence temps réel si l'utilisateur est suivi par le manager, `nil`
    /// sinon. Injecté comme `presenceProvider` de `UserProfileSheet` : le
    /// profil affiche la MÊME pastille que la liste de conversations quand la
    /// donnée live existe, et retombe sur son snapshot REST `isOnline` pour
    /// les profils hors du périmètre suivi (contacts jamais croisés).
    func knownPresenceState(for userId: String) -> PresenceState? {
        presenceMap[userId]?.state
    }

    /// Pastille tri-state pour les listes : présence temps réel du manager si
    /// l'utilisateur est suivi, sinon calcul depuis le snapshot REST
    /// (`isOnline` + `lastActiveAt`) du modèle de la row.
    func resolvedState(userId: String?, isOnline: Bool?, lastActiveAt: Date? = nil) -> PresenceState {
        if let userId, let live = knownPresenceState(for: userId) { return live }
        return UserPresence(isOnline: isOnline ?? false, lastActiveAt: lastActiveAt).state
    }

    /// Cadence du minuteur de recalcul : un seuil 1/3/5 se repeint au plus
    /// `recalcInterval` après avoir été franchi.
    nonisolated static let recalcInterval: TimeInterval = 15

    /// L'état de chaque pastille de `map` à l'instant `now`.
    nonisolated static func resolvedStates(of map: [String: UserPresence], at now: Date) -> [String: PresenceState] {
        map.mapValues { $0.state(now: now) }
    }

    /// Re-résout TOUTES les entrées à `now` et compare au dernier battement
    /// publié (#11412) : un état changé — seuil 1/3/5 franchi, à n'importe quel
    /// moment depuis — programme un battement ; rien de changé, rien ne se
    /// repeint. Rend `true` quand un battement est programmé.
    @discardableResult
    func recalculateStates(now: Date = Date()) -> Bool {
        guard Self.resolvedStates(of: presenceMap, at: now) != publishedStates else { return false }
        scheduleVersionBump()
        return true
    }

    /// Apply a bulk presence snapshot received via the `presence:snapshot` socket
    /// event — sent right after auth, and re-sent on every reconnect since the
    /// gateway re-authenticates on each new socket connection.
    ///
    /// Each entry replaces the local presence row for that userId so a contact
    /// that was online in our cache but is now offline server-side gets corrected
    /// (closes the "stale online forever" failure mode).
    func ingestSnapshot(_ users: [UserStatusEvent]) {
        guard !users.isEmpty else { return }
        // Le DERNIER relevé d'un même utilisateur l'emporte ; un doublon dans l'instantané du serveur
        // ne fait plus planter l'app (`uniqueKeysWithValues` piège sur une clé répétée).
        let updates = Dictionary(
            users.map { entry in
                (entry.userId, UserPresence(isOnline: entry.isOnline, lastActiveAt: entry.lastActiveAt))
            },
            uniquingKeysWith: { _, latest in latest }
        )
        presenceMap.merge(updates) { _, newEntry in newEntry }
    }

    deinit {
        recalcTimer?.invalidate()
        recalcTimer = nil
        persistTask?.cancel()
        versionBumpTask?.cancel()
    }

    // MARK: - Disk Persistence

    /// Debounce writes so a burst of `user:status` events during reconnect
    /// doesn't hammer the filesystem. 1.5s is short enough that backgrounding
    /// immediately after still captures the latest state via
    /// `UIApplication.didEnterBackgroundNotification`.
    private nonisolated func schedulePersist() {
        persistTask?.cancel()
        persistTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.persistDebounce * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            self.persistToDisk()
        }
    }

    private func persistToDisk() {
        let snapshot = presenceMap
        Task.detached(priority: .utility) {
            Self.writeToDisk(snapshot)
        }
    }

    // MARK: - Debounced Refresh Signal

    /// Schedules a `refreshSignal.bump()` `Self.versionBumpDebounce` seconds
    /// out, cancelling any still-pending bump — a burst of `presenceMap`
    /// mutations (several `user:status` events arriving close together)
    /// coalesces into exactly ONE bump instead of one per event. See
    /// `PresenceRefreshSignal`.
    private nonisolated func scheduleVersionBump() {
        versionBumpTask?.cancel()
        versionBumpTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.versionBumpDebounce * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            self.publishedStates = Self.resolvedStates(of: self.presenceMap, at: Date())
            self.refreshSignal.bump()
        }
    }

    private nonisolated static var persistURL: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        if !FileManager.default.fileExists(atPath: cacheDir.path) {
            FileManager.default.createDirectoryLogging(at: cacheDir, context: "presence cache dir", logger: Logger.presence)
        }
        return cacheDir.appendingPathComponent(persistFileName)
    }

    private nonisolated static func writeToDisk(_ map: [String: UserPresence]) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = encoder.encodeOrLog(map, field: "presence map", logger: Logger.presence) else { return }
        do {
            try data.write(to: persistURL, options: .atomic)
        } catch {
            Logger.presence.error("Presence snapshot not persisted, dots restart empty next launch: \(error.localizedDescription, privacy: .public)")
        }
    }

    private nonisolated static func loadFromDisk() -> [String: UserPresence] {
        let url = persistURL
        guard FileManager.default.fileExists(atPath: url.path) else { return [:] }
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            Logger.presence.error("Presence snapshot present but unreadable: \(error.localizedDescription, privacy: .public)")
            return [:]
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let map = decoder.decodeOrLog([String: UserPresence].self, from: data, field: "presence map", logger: Logger.presence) else { return [:] }
        // Drop entries older than 24h — claiming someone is online based on
        // day-old data would be actively wrong, but a 15-min gap is fine and
        // still avoids the "all offline on cold start" flash.
        let cutoff = Date().addingTimeInterval(-persistMaxAge)
        return map.filter { _, presence in
            (presence.lastActiveAt ?? .distantPast) >= cutoff
        }
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let presence = MeeshyLog.logger(.presence)
}
