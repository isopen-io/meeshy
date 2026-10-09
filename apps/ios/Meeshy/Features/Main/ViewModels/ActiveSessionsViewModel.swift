import Foundation
import Combine
import MeeshySDK
import MeeshyUI

/// Le cache de la liste des sessions — un store CHIFFRÉ du compte
/// (`CacheCoordinator.sessions`), ou un double en mémoire dans les tests.
typealias ActiveSessionsCache = any MutableCacheStore<String, UserSession> & Sendable

/// ViewModel for `ActiveSessionsView` (Sécurité > Sessions, #9612).
///
/// **Cache-first** : la dernière liste connue s'affiche tout de suite, sans
/// indicateur ; la liste du serveur la remplace en silence. Le squelette ne se
/// montre que sur un cache vide. Hors ligne, la liste connue reste, et un
/// bandeau dit qu'elle peut dater.
///
/// **Révocation optimiste, après confirmation** : la ligne quitte la liste
/// dès le geste, et y revient si le serveur refuse. La session COURANTE ne se
/// révoque jamais d'ici — se déconnecter passe par Réglages.
@MainActor
final class ActiveSessionsViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    nonisolated static let cacheKey = "sessions:list"

    @Published private(set) var sessions: [UserSession] = []
    @Published private(set) var loadState: LoadState = .idle
    /// La licence CC-BY de DB-IP exige l'attribution partout où un lieu tiré
    /// de l'adresse est montré. Celle du serveur l'emporte dès qu'il la sert.
    @Published private(set) var attribution: GeolocationAttribution = .dbIP
    @Published private(set) var isRevoking = false
    /// La session dont la fermeture attend la confirmation de l'utilisateur.
    @Published var pendingRevocation: UserSession?
    @Published var isConfirmingRevokeAll = false
    @Published var showError = false
    @Published private(set) var errorMessage = ""

    private let sessionService: SessionServiceProviding
    private let cacheProvider: @MainActor () async -> ActiveSessionsCache?
    private let networkMonitor: any NetworkMonitorProviding

    init(
        sessionService: SessionServiceProviding = SessionService.shared,
        cacheProvider: @escaping @MainActor () async -> ActiveSessionsCache? = { await CacheCoordinator.shared.sessions },
        networkMonitor: any NetworkMonitorProviding = NetworkMonitor.shared
    ) {
        self.sessionService = sessionService
        self.cacheProvider = cacheProvider
        self.networkMonitor = networkMonitor
    }

    var currentSession: UserSession? { sessions.first(where: \.isCurrent) }
    var otherSessions: [UserSession] { sessions.filter { !$0.isCurrent } }
    var hasOtherSessions: Bool { sessions.contains { !$0.isCurrent } }
    /// Un lieu au moins est montré : l'attribution de la base est due.
    var showsGeolocation: Bool { sessions.contains { $0.city != nil || $0.country != nil } }

    /// La courante en tête, puis les autres de la plus récemment active à la
    /// plus ancienne ; à égalité, l'ordre du serveur.
    nonisolated static func ordered(_ sessions: [UserSession]) -> [UserSession] {
        sessions.enumerated().sorted { lhs, rhs in
            if lhs.element.isCurrent != rhs.element.isCurrent { return lhs.element.isCurrent }
            let lhsActivity = lhs.element.lastActive ?? lhs.element.createdAt
            let rhsActivity = rhs.element.lastActive ?? rhs.element.createdAt
            if lhsActivity != rhsActivity { return lhsActivity > rhsActivity }
            return lhs.offset < rhs.offset
        }
        .map(\.element)
    }

    // MARK: - Chargement

    func loadSessions() async {
        let cache = await cacheProvider()
        let cached = await Self.readCache(cache)
        if !cached.isEmpty {
            sessions = Self.ordered(cached)
            loadState = .cachedStale
        } else if sessions.isEmpty {
            loadState = .loading
        }
        await revalidate(cache: cache)
    }

    /// Tirer pour rafraîchir, ou « Réessayer » : le réseau, sans repasser par
    /// le cache. Un écran vide montre à nouveau le squelette.
    func refresh() async {
        if sessions.isEmpty { loadState = .loading }
        await revalidate(cache: await cacheProvider())
    }

    private static func readCache(_ cache: ActiveSessionsCache?) async -> [UserSession] {
        guard let cache else { return [] }
        switch await cache.load(for: cacheKey) {
        case .fresh(let items, _), .stale(let items, _):
            return items
        case .expired:
            return await cache.loadIgnoringExpiry(for: cacheKey)?.items ?? []
        case .empty:
            return []
        }
    }

    private func revalidate(cache: ActiveSessionsCache?) async {
        do {
            let list = try await sessionService.listSessions()
            sessions = Self.ordered(list.sessions)
            if let served = list.geolocation { attribution = served }
            loadState = .loaded
            try? await cache?.save(list.sessions, for: Self.cacheKey)
        } catch {
            loadState = networkMonitor.isOnline
                ? .error(String(localized: "sessions_load_error", defaultValue: "Impossible de charger les sessions", bundle: .main))
                : .offline
        }
    }

    // MARK: - Révocation

    /// Le geste sur une ligne : il DEMANDE ; la confirmation exécute
    /// `revokeSession(sessionId:)`.
    func requestRevoke(_ session: UserSession) {
        guard !session.isCurrent else { return }
        pendingRevocation = session
    }

    func requestRevokeAll() {
        guard hasOtherSessions else { return }
        isConfirmingRevokeAll = true
    }

    func revokeSession(sessionId: String) async {
        guard let target = sessions.first(where: { $0.id == sessionId }), !target.isCurrent else { return }
        let snapshot = sessions
        isRevoking = true
        defer { isRevoking = false }
        sessions.removeAll { $0.id == sessionId }
        do {
            try await sessionService.revokeSession(sessionId: sessionId)
            HapticFeedback.success()
            await persist()
        } catch {
            sessions = snapshot
            HapticFeedback.error()
            fail(String(localized: "sessions_revoke_error", defaultValue: "Impossible de révoquer la session", bundle: .main))
        }
    }

    func revokeAllOtherSessions() async {
        isConfirmingRevokeAll = false
        let snapshot = sessions
        isRevoking = true
        defer { isRevoking = false }
        sessions.removeAll { !$0.isCurrent }
        do {
            try await sessionService.revokeAllOtherSessions()
            HapticFeedback.success()
            await persist()
        } catch {
            sessions = snapshot
            HapticFeedback.error()
            fail(String(localized: "sessions_revoke_all_error", defaultValue: "Impossible de révoquer les sessions", bundle: .main))
        }
    }

    private func persist() async {
        let snapshot = sessions
        try? await cacheProvider()?.save(snapshot, for: Self.cacheKey)
    }

    private func fail(_ message: String) {
        errorMessage = message
        showError = true
    }
}
