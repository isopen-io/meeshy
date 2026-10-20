import Foundation
import Combine
import os

// MARK: - Implementation

@MainActor
public final class AuthManager: ObservableObject, AuthManaging {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public static let shared = AuthManager()

    // MARK: - Published State

    @Published public var isAuthenticated = false

    /// **La session a-t-elle été REGARDÉE ?** (#5968)
    ///
    /// `isAuthenticated` naît `false` et `checkExistingSession()` est async :
    /// entre le lancement et sa conclusion, `false` ne veut pas dire « pas de
    /// session », il veut dire « personne n'a encore regardé ». Un `@Published`
    /// rejouant sa valeur courante à tout nouvel abonné, un consommateur qui
    /// s'abonne tôt reçoit ce `false`-là et le prend pour un verdict.
    ///
    /// Ce que ça a coûté : `DependencyContainer` s'abonne à la CONSTRUCTION de
    /// l'`App` et purgeait la base locale — 25 messages et 7 lignes d'outbox
    /// mesurés — à chaque démarrage à froid, session parfaitement valide.
    ///
    /// Passe à `true` UNE fois, à la fin de `checkExistingSession()`, quelle
    /// que soit l'issue : c'est un fait sur la LECTURE, pas sur son résultat.
    @Published public private(set) var hasResolvedStoredSession = false
    /// D'OÙ vient la session courante. `nil` tant qu'aucune n'a été appliquée.
    ///
    /// Sans elle, l'app n'a que `isAuthenticated`, qui vaut `true` de la même
    /// façon après une connexion et après une inscription. Deux moments qui
    /// n'autorisent pourtant pas la même chose : #5218 diffère la demande de
    /// permission de notification quand le compte VIENT D'ÊTRE CRÉÉ, pour ne
    /// pas poser une alerte système devant quelqu'un qui n'a encore rien
    /// envoyé.
    @Published public internal(set) var sessionOrigin: SessionOrigin?
    @Published public var currentUser: MeeshyUser?
    @Published public var isLoading = false
    @Published public var errorMessage: String?
    @Published public var requires2FA = false
    @Published public var twoFactorToken: String?
    /// All accounts that have saved credentials on this device, sorted by most recently active.
    @Published public var savedAccounts: [SavedAccount] = []
    /// #8286 — une bascule entre deux comptes gardés est en cours : la session
    /// sortante est quittée, l'entrante pas encore reprise. La racine y montre
    /// un écran neutre plutôt que la connexion.
    @Published public internal(set) var isSwitchingAccount = false
    /// #10482 — le verrou de bascule est tenu par le retrait du compte ACTIF.
    var isRetiringActiveAccount = false
    /// #9612 — la fermeture que le serveur vient de prononcer, à EXPLIQUER
    /// avant la reconnexion (« fermée par l'équipe Meeshy », « depuis un autre
    /// appareil »…). `nil` dès que l'utilisateur l'a lue.
    @Published public private(set) var sessionRevocationNotice: SessionRevocationNotice?
    /// #8286 — le choix « Rester connecté sur cet appareil » d'une connexion
    /// en cours, consommé par la session qu'elle ouvre (second facteur compris).
    var pendingKeepSignedIn: Bool?

    /// Fires every time the SDK rotates the JWT for the currently active
    /// user — i.e. `applySession` ran while the same userId was already
    /// authenticated. `MessageSocketManager` already reacts to this via a
    /// direct `forceReconnect()` call inside `applySession`; the publisher
    /// is exposed so other long-lived subscribers (NSE, widgets) can also
    /// react to a fresh token without coupling to `MessageSocketManager`.
    ///
    /// P2.2 — the audit suspected this signal was missing; in fact the
    /// direct socket-reconnect chain has existed since the initial
    /// implementation. The publisher pins the contract for future readers.
    public let tokenDidRotate = PassthroughSubject<Void, Never>()
    /// startup-03 — émis quand la session est invalidée PAR LE SERVEUR
    /// (`requireReauthentication`), jamais sur un logout volontaire. Permet
    /// aux hooks de purge de distinguer les deux chemins (ex. signaler la
    /// perte de messages en attente d'envoi).
    public let sessionInvalidated = PassthroughSubject<Void, Never>()

    // MARK: - Protocol Publisher

    public var currentUserPublisher: AnyPublisher<MeeshyUser?, Never> {
        $currentUser.eraseToAnyPublisher()
    }

    // MARK: - Private

    /// Var (not `let`) so `@testable` test targets can substitute an
    /// in-memory `KeychainStoring` on `AuthManager.shared` — the real
    /// `KeychainManager` is not entitled inside the SPM xctest host, which
    /// otherwise silently no-ops every save/load and makes any test that
    /// drives a full `applySession` → `refreshSession` round trip
    /// unrunnable. Mirrors the existing `authService` injection seam below.
    internal var keychain: any KeychainStoring
    private let userDefaults: UserDefaults
    private let groupDefaults: UserDefaults?

    /// Backed by the protocol type so tests can inject a stub conforming
    /// to `AuthServiceProviding` without subclassing the production
    /// `final` `AuthService`.
    internal var authService: AuthServiceProviding = AuthService.shared

    /// Prevents concurrent refresh loops when APIClient fires multiple 401s.
    var tokenRefreshTask: Task<String, Error>?
    /// #10904 — sa session, et les jetons remplacés de la session ouverte (`+RequestOwnership`).
    var tokenRefreshOwner: SessionOwner?
    var retiredSessionTokens: (owner: SessionOwner, tokens: [String])?

    /// #10463 — la génération de la session ouverte. `leaveActiveSession` la
    /// change EN ENTRANT : un rafraîchissement lancé sous une autre génération
    /// ne pose rien, même si le compte qu'il rafraîchit est encore actif
    /// pendant les attentes de la sortie.
    var sessionGeneration: UInt64 = 0
    /// #10463 — les sorties de session EN COURS. Un compteur, pas un drapeau :
    /// deux sorties qui se chevauchent (déconnexion pendant une bascule) ne se
    /// lèvent pas l'une l'autre en finissant.
    var activeSessionExits = 0
    /// Une sortie est en cours : aucun rafraîchissement ne commence, et aucun
    /// refus ne démonte le compte qu'elle retire déjà (#10463).
    var isLeavingActiveSession: Bool { activeSessionExits > 0 }
    #if DEBUG
    /// Les fermetures de sessions prouvées refusées, lancées sans être
    /// attendues (#10463) : retenues pour que les témoins les attendent.
    var refusedSessionClosuresForTesting: [Task<Void, Never>] = []
    #endif

    /// Throttle gate for `refreshCurrentUserProfile()` — foreground transitions
    /// can fire in quick succession (Control Center, app-switcher peek); this
    /// keeps each one from re-hitting `/auth/me`.
    private var lastProfileRefreshAt: Date?

    #if DEBUG
    /// Tâche d'arrière-plan lancée par `handleUnauthorized()`, retenue pour que
    /// les tests puissent l'attendre. Voir `cancelPendingTokenRefreshForTesting`.
    var unauthorizedRefreshTask: Task<Void, Never>?
    #endif

    // Legacy global keys kept only for one-time migration
    private let legacyTokenKey = "meeshy_auth_token"
    private let legacyUserKey = "meeshy_current_user"

    // UserDefaults keys (non-sensitive)
    private let activeUserIdUDKey = "meeshy_active_user_id"
    let savedAccountsUDKey = "meeshy_saved_accounts"

    private init(
        keychain: any KeychainStoring = KeychainManager.shared,
        userDefaults: UserDefaults = .standard,
        groupDefaults: UserDefaults? = UserDefaults(suiteName: "group.me.meeshy.apps")
    ) {
        self.keychain = keychain
        self.userDefaults = userDefaults
        self.groupDefaults = groupDefaults
    }

    // MARK: - Namespaced keys

    func tokenKey(for userId: String) -> String { AuthStorageKeys.token(for: userId) }
    func userKey(for userId: String) -> String { AuthStorageKeys.user(for: userId) }
    func sessionTokenKey(for userId: String) -> String { AuthStorageKeys.sessionToken(for: userId) }

    /// Le jeton de SESSION du compte actif, ou `nil`.
    ///
    /// Il voyage déjà en en-tête `X-Session-Token` sur les appels REST ; il
    /// manquait au handshake Socket.IO, si bien qu'un socket inscrit
    /// s'authentifiait au JWT SEUL et que le serveur n'avait aucun moyen de
    /// dire quel socket appartient à quelle session. Révoquer une session
    /// passait la ligne à `isValid: false` et l'appareil continuait de tout
    /// recevoir indéfiniment (#4213).
    public var currentSessionToken: String? {
        guard let userId = activeUserId else { return nil }
        return keychain.load(forKey: sessionTokenKey(for: userId), account: nil)
    }
    func tokenDateUDKey(for userId: String) -> String { AuthStorageKeys.tokenDate(for: userId) }
    func pendingProfileKey(for userId: String) -> String { AuthStorageKeys.pendingProfile(for: userId) }

    // MARK: - Active user

    /// Le compte actif tel que le trousseau le garde, lisible AVANT la restauration de session. Une action
    /// de notification (réponse rapide, commentaire) peut s'exécuter app tuée, avant `checkExistingSession` :
    /// `currentUser` est encore vide, et le texte tapé sur l'écran verrouillé partait à la poubelle.
    public var persistedActiveUserId: String? { activeUserId }

    var activeUserId: String? {
        get { keychain.load(forKey: activeUserIdUDKey, account: nil) }
        set {
            if let value = newValue {
                do {
                    try keychain.save(value, forKey: activeUserIdUDKey, account: nil)
                } catch {
                    Logger.auth.error("Failed to save activeUserId to keychain: \(error.localizedDescription, privacy: .public)")
                }
            } else {
                keychain.delete(forKey: activeUserIdUDKey, account: nil)
            }
            groupDefaults?.set(newValue, forKey: activeUserIdUDKey)
        }
    }

    // MARK: - Token Access

    public var authToken: String? {
        get {
            guard let userId = activeUserId else { return nil }
            return keychain.load(forKey: tokenKey(for: userId), account: nil)
        }
        set {
            guard let userId = activeUserId else { return }
            if let value = newValue {
                do {
                    try keychain.save(value, forKey: tokenKey(for: userId), account: nil)
                } catch {
                    Logger.auth.error("Failed to save authToken to keychain: \(error.localizedDescription, privacy: .public)")
                }
            } else {
                keychain.delete(forKey: tokenKey(for: userId), account: nil)
            }
            APIClient.shared.authToken = newValue
        }
    }

    // MARK: - Token Expiration Check

    /// Returns true if the stored JWT is expired (with 30s margin).
    /// Decodes the payload inline to read `exp`.
    ///
    /// D2 — every "malformed → expired" branch now logs a structured
    /// reason so the next time a user complains about a silent logout
    /// we can trace whether the JWT was truncated, base64-corrupted,
    /// or just missing `exp`. Returning `true` is the safe default
    /// (forces refresh) but the silence was actively hurting support.
    public var isCurrentTokenExpired: Bool {
        Self.isTokenExpired(authToken, now: Date())
    }

    /// D2 — pure decoder (`AuthJWTExpiry`): `true` for every malformed input.
    nonisolated public static func isTokenExpired(_ token: String?, now: Date) -> Bool {
        AuthJWTExpiry.isExpired(token, now: now)
    }

    // MARK: - Login

    /// #10463 — refusée pendant un changement de compte ; la session qu'elle
    /// ne peut pas poser est refermée côté passerelle.
    public func completeLoginWith2FA(code: String) async {
        guard let twoFactorToken = twoFactorToken else {
            errorMessage = "Session 2FA expirée ou invalide"
            return
        }
        guard !isSwitchingAccount else {
            errorMessage = AccountSwitchUnderway().errorDescription
            return
        }
        isLoading = true
        errorMessage = nil

        do {
            let data = try await authService.completeLoginWith2FA(twoFactorToken: twoFactorToken, code: code)
            if let token = data.token, let user = data.user {
                self.requires2FA = false
                self.twoFactorToken = nil
                try installClosingRefused(EmailProvenSession(
                    token: token, sessionToken: data.sessionToken, user: user, origin: .login))
            } else {
                throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
            }
        } catch let error as MeeshyError {
            // P1 — `APIClient` only ever throws `MeeshyError` (never the
            // legacy `APIError`); the previous `catch let error as APIError`
            // here was dead code that silently fell through to the generic
            // `catch` below. Behaviourally identical (both paths read
            // `errorDescription`), but explicit about the real error type.
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Register

    /// La variante LEVANTE de `register(request:)` — la seule qui rende un refus
    /// TYPÉ à son appelant.
    ///
    /// `register(request:)` avale toute erreur dans `errorMessage: String?`, ce
    /// qui suffit à un bandeau et à rien d'autre : un écran de formulaire qui
    /// doit poser « cette adresse est déjà utilisée » SOUS le champ e-mail a
    /// besoin du `code` et du `field`, pas d'une phrase. Elle lève donc :
    ///
    /// - `MeeshyError.rejected(APIRejection)` — 400/409 typés (`VALIDATION_ERROR`,
    ///   `PHONE_INVALID`, `USERNAME_TAKEN`, `EMAIL_TAKEN`), parce que
    ///   `AuthEndpoint.register` déclare `rejectionPolicy == .structured` ;
    /// - `PhoneOwnershipConflict` — le refus servi en 200 sans compte créé ;
    /// - `MeeshyError.network(…)` — réseau indisponible.
    ///
    /// Elle tient les mêmes drapeaux (`isLoading`, `errorMessage`) que sa
    /// jumelle, pour qu'un écran branché sur l'un ou l'autre voie le même
    /// `AuthManager`.
    ///
    /// #8055 — rend `.verificationRequired` quand le compte, créé SANS numéro,
    /// attend la preuve de son adresse : aucune session n'est appliquée, et
    /// l'écran présente la saisie du code (le mot de passe est déjà sur le
    /// compte). `.authenticated` quand la session est appliquée.
    @discardableResult
    public func registerThrowing(request: RegisterRequest) async throws -> RegistrationOutcome {
        switch try await registerHoldingSession(request: request) {
        case .session(let proven, _):
            try installClosingRefused(proven)
            return .authenticated
        case .verificationRequired(let pending):
            return .verificationRequired(pending)
        }
    }

    public func register(request: RegisterRequest) async {
        guard !isSwitchingAccount else {
            errorMessage = AccountSwitchUnderway().errorDescription
            return
        }
        isLoading = true
        errorMessage = nil

        do {
            let data = try await authService.register(request: request)
            // #8055 — compte créé sans numéro : aucune session, rien d'une panne.
            if data.pendingEmailVerification(typedIdentifier: request.email) != nil {
                isLoading = false
                return
            }
            if let token = data.token, let user = data.user {
                try installClosingRefused(EmailProvenSession(
                    token: token, sessionToken: data.sessionToken, user: user, origin: .registration))
            } else {
                throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
            }
        } catch let error as MeeshyError {
            // P1 — `APIClient` only ever throws `MeeshyError` (never the
            // legacy `APIError`); the previous `catch let error as APIError`
            // here was dead code that silently fell through to the generic
            // `catch` below. Behaviourally identical (both paths read
            // `errorDescription`), but explicit about the real error type.
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Forgot Password

    public func requestPasswordReset(email: String) async -> Bool {
        isLoading = true
        errorMessage = nil

        do {
            try await authService.requestPasswordReset(email: email)
            isLoading = false
            return true
        } catch let error as MeeshyError {
            // P1 — `APIClient` only ever throws `MeeshyError` (never the
            // legacy `APIError`); the previous `catch let error as APIError`
            // here was dead code that silently fell through to the generic
            // `catch` below. Behaviourally identical (both paths read
            // `errorDescription`), but explicit about the real error type.
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
        return false
    }

    // MARK: - Logout

    /// Déconnexion COMPLÈTE : la session finit et le compte disparaît du
    /// sélecteur de l'écran de connexion.
    public func logout() async {
        await logout(forgettingAccount: true)
    }

    /// Déconnexion, en choisissant si le compte est OUBLIÉ.
    ///
    /// `forgettingAccount: false` est la « Déconnexion » des réglages (#8286) :
    /// la session finit — serveur, jeton, jeton de session, profil et caches
    /// par compte — mais le compte RESTE listé. Y revenir redemande le mot de
    /// passe (ou un lien magique) : une `SavedAccount` ne porte que l'identité.
    /// « Changer de compte », lui, ne passe jamais ici : il GARDE la session
    /// (`switchAccount(to:)`, `suspendActiveSession()`).
    ///
    /// Le paramètre ne remonte pas dans `AuthManaging` : son unique
    /// consommateur est l'écran de réglages, qui tient le type concret en
    /// `@EnvironmentObject`, et l'ajouter au protocole casserait les mocks de
    /// tous ses autres conformants sans servir personne.
    ///
    /// #10463 — pendant un changement de compte, la session sortante est déjà
    /// démontée et l'entrante pas encore posée : la déconnexion attend qu'il
    /// rende la main, puis ferme ce qui est ouvert.
    public func logout(forgettingAccount: Bool) async {
        guard await awaitAccountSwitchEnd() else { return }
        let outgoing = activeUserId
        await leaveActiveSession(endingIt: true)
        guard let userId = outgoing else {
            isAuthenticated = false
            return
        }
        // Le SEUL geste que « Déconnexion » peut épargner : l'entrée du
        // sélecteur. Tout le reste — trousseau, caches, files — est effacé.
        if forgettingAccount {
            removeFromSavedAccounts(userId: userId)
        }
        // En DERNIER : déclenche le router et tous les `wireAuthLogoutHook`
        // app-side (ConversationAudioCoordinator, FeedbackToastManager, etc.).
        isAuthenticated = false
    }

    func performServerLogoutWithRetries(token: String) async {
        await AuthServerLogout.run(token: token, using: authService)
    }

    // MARK: - Remove Saved Account

    public func removeSavedAccount(userId: String) {
        keychain.delete(forKey: tokenKey(for: userId), account: nil)
        keychain.delete(forKey: sessionTokenKey(for: userId), account: nil)
        keychain.delete(forKey: userKey(for: userId), account: nil)
        keychain.delete(forKey: tokenDateUDKey(for: userId), account: nil)
        keychain.delete(forKey: pendingProfileKey(for: userId), account: nil)
        removeFromSavedAccounts(userId: userId)
        // #8674 — retiré de l'appareil : son cache part, qu'il soit vivant ou
        // mis de côté.
        guard activeUserId == userId else {
            if let key = accountKey(for: userId) { CacheAccountBinder.shared.forget(key) }
            return
        }
        CacheAccountBinder.shared.bind(nil)
        activeUserId = nil
        currentUser = nil
        isAuthenticated = false
        pendingOptimisticProfile = nil
        APIClient.shared.authToken = nil
        APIClient.shared.registeredSessionToken = nil
    }

    // MARK: - Check Existing Session

    public func checkExistingSession() async {
        // `defer` et non une affectation par sortie : cette fonction a plusieurs
        // retours anticipés (aucun utilisateur actif, trousseau vide), et un
        // état neuf doit être porté par TOUTES les portes du type. Le `defer`
        // les couvre par construction — on ne peut pas en oublier une.
        defer { hasResolvedStoredSession = true }
        // #10463 — un changement de compte en cours tient la session : la
        // reprise ci-dessous effacerait l'état qu'il est en train de poser.
        guard !isSwitchingAccount else { return }
        loadSavedAccounts()
        migrateFromLegacyKeysIfNeeded()

        guard let userId = activeUserId else { return }

        guard restoreStoredSession(for: userId) else {
            // Keychain empty for this user. Saved accounts stay intact so
            // re-login is one tap, but we have no session to restore.
            activeUserId = nil
            isAuthenticated = false
            return
        }
    }

    /// Revalidates `currentUser` against `/auth/me` on scene foreground so a
    /// profile edit made from another device (avatar, displayName…) reaches
    /// this device without waiting for a cold start. Throttled to once per
    /// 60s and a no-op when not authenticated. Shares the exact error
    /// semantics of the `checkExistingSession` background revalidation: a
    /// dead account (`isActive == false`) or an auth failure surfaces
    /// re-authentication, any other error is transient and leaves the
    /// session untouched.
    ///
    /// #10463 — la réponse ne vaut que pour la session qui l'a demandée : une
    /// sortie commencée, ou une autre session posée entre-temps, l'écarte.
    public func refreshCurrentUserProfile() async {
        guard isAuthenticated, let userId = activeUserId else { return }
        if let lastProfileRefreshAt, Date().timeIntervalSince(lastProfileRefreshAt) < 60 {
            return
        }
        lastProfileRefreshAt = Date()
        let generation = sessionGeneration

        do {
            let user = try await authService.me()
            guard !isLeavingActiveSession, sessionGeneration == generation, activeUserId == userId else { return }
            updateUserAfterRevalidation(user, userId: userId, generation: generation)
        } catch let error as MeeshyError {
            switch error {
            case .auth:
                requireReauthentication(userId: userId, generation: generation)
            case .network, .server, .message, .media, .forbidden, .rejected, .unknown:
                // Transient — keep session, retry on next foreground / launch.
                break
            }
        } catch {
            // Cancellation / unknown — preserve session.
        }
    }

    // MARK: - Handle 401 (called from APIClient during active session)

    public func handleUnauthorized() {
        guard isAuthenticated else {
            // No active session — nothing to refresh.
            return
        }

        // D1 — guard against concurrent refreshes by invoking refreshSession(force: true)
        // asynchronously. Since refreshSession uses tokenRefreshTask to serialize,
        // multiple concurrent calls to handleUnauthorized() will safely share the same refresh task.
        // #10904 — pour la session de CE 401 : si un autre compte (ou une autre
        // session) s'est ouvert avant que la tâche ne s'exécute, rien ne part.
        let owner = activeUserId.map { SessionOwner(userId: $0, generation: sessionGeneration) }
        let backgroundRefresh = Task { [weak self] in
            guard let self, let owner, let userId = self.activeUserId,
                  SessionOwner(userId: userId, generation: self.sessionGeneration) == owner else { return }
            do {
                _ = try await self.refreshSession(force: true)
            } catch {
                Logger.auth.error("Background session refresh after 401 failed: \(error.localizedDescription, privacy: .public)")
            }
        }
        #if DEBUG
        // Retenue UNIQUEMENT pour que les tests puissent attendre cette tâche.
        // Sans référence, elle est inatteignable : au moment où un `tearDown`
        // veut la neutraliser, elle n'a souvent pas encore atteint
        // `refreshSession`, donc `tokenRefreshTask` est toujours `nil` et il
        // n'y a rien à annuler. Elle démarre ensuite, et son appel atterrit sur
        // le stub du test suivant. Voir `cancelPendingTokenRefreshForTesting`.
        unauthorizedRefreshTask = backgroundRefresh
        #endif
    }

    // MARK: - Handle auth:session-revoked (server-side invalidation)

    /// Le serveur a INVALIDÉ la session (changement de mot de passe, révocation
    /// de tous les appareils, action admin) et vient de couper la socket.
    ///
    /// Chemin délibérément DISJOINT de `handleUnauthorized()` : celui-là lance
    /// `refreshSession(force: true)`, et `/auth/refresh` rend un JWT neuf SANS
    /// vérifier que la session existe encore — le réarmer ici prolongerait de
    /// 24 h la session qu'on vient de révoquer. On va donc droit à la
    /// ré-authentification, qui émet `sessionInvalidated` (l'écran de ré-auth
    /// existe déjà, aucune UI neuve n'est requise).
    ///
    /// Sans session active, rien à révoquer : on sort.
    ///
    /// Le motif (#9612) est gardé pour l'avis que la racine montre avant la
    /// reconnexion ; il ne change rien au chemin de fermeture.
    public func handleSessionRevoked(reason: SessionRevocationReason = .unknown) {
        guard let userId = activeUserId, !AccountDeletedSignal.isAwaitingRetirement(userId) else { return }
        Logger.auth.warning("Session revoked by server (\(reason.rawValue, privacy: .public)) — requiring re-authentication")
        sessionRevocationNotice = SessionRevocationNotice(reason: reason)
        requireReauthentication(userId: userId, generation: sessionGeneration)
    }

    /// L'utilisateur a lu l'avis de fermeture.
    public func acknowledgeSessionRevocationNotice() {
        sessionRevocationNotice = nil
    }

    // MARK: - Internal session helpers

    /// Pure helper exposed for tests: returns true iff a new
    /// `applySession(token:sessionToken:user:)` call constitutes a token
    /// rotation (same user already authenticated). Pulled out of
    /// `applySession` so the contract can be pinned without driving the
    /// full keychain / sockets side effects.
    nonisolated static func isTokenRotation(
        currentlyAuthenticated: Bool,
        currentActiveUserId: String?,
        newUserId: String
    ) -> Bool {
        currentlyAuthenticated && currentActiveUserId == newUserId
    }

    /// #10446 — la loi de `applySession` : une session ouverte n'accepte que
    /// son propre utilisateur (rotation). Un compte actif INCONNU (`nil`) sous
    /// une session ouverte n'est pas une permission : il refuse aussi.
    ///
    /// #10450 — la loi n'a AUCUNE dérogation. Changer de compte, c'est d'abord
    /// DÉMONTER la session ouverte ; ce qui la pose ensuite passe ici comme une
    /// première connexion. Un drapeau « changement de compte » laissait passer
    /// l'autre utilisateur précisément quand le démontage n'avait pas eu lieu.
    nonisolated static func refusesSessionReplacement(
        currentlyAuthenticated: Bool,
        currentActiveUserId: String?,
        newUserId: String
    ) -> Bool {
        guard currentlyAuthenticated else { return false }
        return currentActiveUserId != newUserId
    }

    /// #10450 — un rafraîchissement ne s'applique qu'au compte qui l'a
    /// demandé, s'il est TOUJOURS le compte actif.
    nonisolated static func appliesRefreshedSession(refreshedUserId: String, currentActiveUserId: String?) -> Bool {
        currentActiveUserId == refreshedUserId
    }

    /// `origin` par défaut à `.restored` : un renouvellement de jeton (la
    /// rotation, plus bas) est bien une session REPRISE, et les suites qui
    /// posent une session à la main n'ont pas d'origine à déclarer.
    ///
    /// #10446 — refuse d'installer un AUTRE utilisateur par-dessus une session
    /// ouverte : poser une session sans démonter la précédente laisserait ses
    /// sockets, ses files et ses caches servir le compte entrant. Passer à un
    /// autre compte quitte d'abord la session sortante (`switchToProvenAccount`,
    /// `switchAccount(to:)`). Le refus précède toute écriture.
    internal func applySession(
        token: String,
        sessionToken: String?,
        user: MeeshyUser,
        origin: SessionOrigin = .restored
    ) throws {
        let userId = user.id
        if Self.refusesSessionReplacement(
            currentlyAuthenticated: isAuthenticated,
            currentActiveUserId: activeUserId,
            newUserId: userId
        ) {
            Logger.auth.error("Refused to install another user's session over the open session")
            throw SessionReplacementRefused(activeUserId: activeUserId, incomingUserId: userId)
        }
        // #10483 — un compte compte sous son identité : la clé visiteur s'efface.
        VisitorReaderKey(keychain: keychain).purge()
        // Capture BEFORE we mutate state. If we were already authenticated
        // when applySession runs, this is a token rotation (refresh) — the
        // sockets need to be torn down and reconnected with the new JWT.
        // The `onChange(isAuthenticated:)` observer in MeeshyApp would
        // otherwise miss this transition because the boolean stays true
        // throughout the rotation.
        let isTokenRotation = Self.isTokenRotation(
            currentlyAuthenticated: isAuthenticated,
            currentActiveUserId: activeUserId,
            newUserId: userId
        )

        do {
            try keychain.save(token, forKey: tokenKey(for: userId), account: nil)
        } catch {
            Logger.auth.error("Failed to save token to keychain for userId \(userId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }

        if let sessionToken = sessionToken, !sessionToken.isEmpty {
            do {
                try keychain.save(sessionToken, forKey: sessionTokenKey(for: userId), account: nil)
            } catch {
                Logger.auth.error("Failed to save sessionToken to keychain for userId \(userId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        // U3 — a token refresh/rotation carries the server's session response,
        // which doesn't port voicePublic (self-only /auth/me payload shape);
        // re-apply the locally-held value before persisting so a background
        // token refresh can't silently flip the toggle back off.
        let user = user.withProfileChanges(voicePublic: currentUser?.voicePublic)
        saveUserToKeychain(user, userId: userId)
        let now = String(Date().timeIntervalSince1970)
        do {
            try keychain.save(now, forKey: tokenDateUDKey(for: userId), account: nil)
        } catch {
            Logger.auth.error("Failed to save token date to keychain for userId \(userId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }

        activeUserId = userId
        APIClient.shared.authToken = token
        // Le jeton de session suit le JWT (#4213) : le transport le lit depuis
        // un contexte non isolé, et sans lui aucune révocation ne peut viser
        // ce socket-ci plutôt qu'un autre.
        APIClient.shared.registeredSessionToken = currentSessionToken

        upsertSavedAccount(from: user, keepsSession: origin == .restored ? nil : takePendingKeepSignedIn())
        // U3 — preserve an in-flight optimistic profile edit across a token
        // refresh (applySession also runs on rotation). On a fresh login the
        // pending guard is nil (cleared on logout), so this is a no-op.
        let resolved = Self.resolveServerUserWithOptimistic(user, pending: pendingOptimisticProfile)
        currentUser = resolved.user
        if resolved.clearedPending {
            pendingOptimisticProfile = nil
            clearPendingProfileFromKeychain(userId: userId)
        }
        // Posée AVANT `isAuthenticated` : l'observateur de `MeeshyApp` lit les
        // deux dans la même passe, et la lire après ferait décider le bascule
        // sur l'origine de la session PRÉCÉDENTE.
        sessionOrigin = origin
        // #8674 — le cache devient celui de ce compte (rendu s'il en avait un
        // de côté). Sans effet sur une rotation de jeton.
        if !isTokenRotation { CacheAccountBinder.shared.bind(accountKey(for: userId)) }
        isAuthenticated = true
        // Hydrate session-scoped caches not carried by the auth payload (block
        // list). Skip on token rotation — already warm.
        if !isTokenRotation { warmSessionScopedCaches() }

        if isTokenRotation {
            MessageSocketManager.shared.forceReconnect()
            SocialSocketManager.shared.forceReconnect()
            tokenDidRotate.send(())
        }
    }

    /// Warm session-scoped caches that aren't hydrated by the auth payload.
    /// Mirror of the teardown in `logout()`. Currently the block list, fetched
    /// via `GET /users/me/blocked-users` so the composer block zone and the
    /// new-conversation graying reflect reality from launch instead of staying
    /// empty until the Blocked Users screen is first opened.
    func warmSessionScopedCaches() {
        Task { await BlockService.shared.refreshCache() }
    }

    private var profileStore: AuthProfileKeychainStore { AuthProfileKeychainStore(keychain: keychain) }

    private func saveUserToKeychain(_ user: MeeshyUser, userId: String) {
        profileStore.saveUser(user, userId: userId)
    }

    private func savePendingProfileToKeychain(_ snapshot: ProfileSnapshot, userId: String) {
        profileStore.savePendingProfile(snapshot, userId: userId)
    }

    func loadPendingProfileFromKeychain(userId: String) -> ProfileSnapshot? {
        profileStore.loadPendingProfile(userId: userId)
    }

    private func clearPendingProfileFromKeychain(userId: String) {
        profileStore.clearPendingProfile(userId: userId)
    }

    func updateUserAfterRevalidation(_ user: MeeshyUser, userId: String, generation: UInt64) {
        // Server-side deactivation (admin disable, account deletion, etc.)
        // arrives as `isActive: false` on a 200 /auth/me response. The token
        // is still cryptographically valid but the account is dead — surface
        // a re-auth screen so the user knows and so the app stops issuing
        // calls on a zombie session.
        if user.isActive == false {
            requireReauthentication(userId: userId, generation: generation)
            return
        }
        // U3 — the revalidated /auth/me user doesn't port voicePublic (self-only
        // response shape); re-apply the locally-held value before persisting so
        // the throttled background revalidation can't silently flip it back off.
        let user = user.withProfileChanges(voicePublic: currentUser?.voicePublic)
        saveUserToKeychain(user, userId: userId)
        // U3 — don't clobber an in-flight optimistic profile edit with the
        // revalidated server user; re-apply it (and drop the guard once the
        // server already reflects the edit).
        let resolved = Self.resolveServerUserWithOptimistic(user, pending: pendingOptimisticProfile)
        self.currentUser = resolved.user
        if resolved.clearedPending {
            pendingOptimisticProfile = nil
            clearPendingProfileFromKeychain(userId: userId)
        }
        self.updateSavedAccountActivity(from: user)
    }

    @discardableResult
    public func refreshSession(force: Bool = false) async throws -> String {
        guard let userId = activeUserId else {
            throw MeeshyError.auth(.sessionExpired)
        }
        let owner = SessionOwner(userId: userId, generation: sessionGeneration)
        // #10904 — seule la MÊME session rejoint le rafraîchissement en vol.
        // Celui d'une session quittée s'abandonnera de lui-même ; le rejoindre
        // ferait hériter son abandon au compte qui vient de s'ouvrir.
        if let task = tokenRefreshTask, tokenRefreshOwner == owner {
            return try await awaitRefresh(task, for: owner)
        }

        guard let token = sessionTokenInUse(for: userId) else {
            requireReauthentication(userId: userId, generation: sessionGeneration)
            throw MeeshyError.auth(.sessionExpired)
        }
        let sessionToken = keychain.load(forKey: sessionTokenKey(for: userId), account: nil)

        // If not forcing AND token is not expired, return current token
        if !force && !Self.isTokenExpired(token, now: Date()) {
            return token
        }

        // #10463 — pendant la sortie, le compte quitté est encore actif : un
        // rafraîchissement lancé maintenant rouvrirait ses sockets.
        guard !isLeavingActiveSession else { throw CancellationError() }
        let generation = sessionGeneration

        let task = Task<String, Error> { [weak self] in
            guard let self = self else { throw CancellationError() }
            do {
                let data = try await self.authService.refreshToken(token, sessionToken: sessionToken)
                guard let newToken = data.token, let newUser = data.user else {
                    throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
                }
                // #10450 — le compte rafraîchi a pu être QUITTÉ pendant l'appel
                // (changement de compte, déconnexion) : sa session rafraîchie
                // est abandonnée, jamais réinstallée. Pas une `MeeshyError` :
                // les jetons d'un compte gardé au sélecteur restent intacts.
                // #10463 — ni quand une sortie a COMMENCÉ pendant l'appel : le
                // compte y est encore actif tant qu'elle attend.
                guard Self.appliesRefreshedSession(refreshedUserId: userId, currentActiveUserId: self.activeUserId),
                      self.sessionGeneration == generation else {
                    Logger.auth.info("Refreshed session abandoned: its account is no longer the active one")
                    throw CancellationError()
                }
                // #10904 — le jeton remplacé reste reconnu comme de CETTE
                // session : son 401 tardif se rejouera sans rien rafraîchir.
                self.retire(token, from: owner)
                try self.applySession(token: newToken, sessionToken: data.sessionToken, user: newUser)
                return newToken
            } catch let error as MeeshyError {
                // #10463 — le refus d'une session qu'on a quittée ne ferme pas
                // celle qui l'a remplacée, et n'est pas rendu comme un refus :
                // l'appelant (`APIClient`) le traduirait en session expirée.
                guard self.sessionGeneration == generation else { throw CancellationError() }
                // Un compte de moins de 13 ans (#9929) ne se rafraîchit plus :
                // ses jetons partent, sans quoi chaque requête rejouerait le refus.
                if case .auth = error {
                    self.requireReauthentication(userId: userId, generation: generation)
                } else if AgeGateSignal.isAgeRefusal(error) {
                    self.requireReauthentication(userId: userId, generation: generation)
                }
                throw error
            } catch {
                throw error
            }
        }

        tokenRefreshTask = task
        tokenRefreshOwner = owner

        // #10904 — ne libère que SA tâche : une autre session a pu en poser
        // une depuis, et l'effacer la ferait rafraîchir deux fois.
        defer {
            if tokenRefreshTask == task {
                tokenRefreshTask = nil
                tokenRefreshOwner = nil
            }
        }

        return try await awaitRefresh(task, for: owner)
    }

    // MARK: - Migration from legacy global keys (one-time, at first launch)

    private func migrateFromLegacyKeysIfNeeded() {
        LegacyAuthKeyMigration(
            keychain: keychain,
            userDefaults: userDefaults,
            activeUserIdKey: activeUserIdUDKey,
            savedAccountsKey: savedAccountsUDKey,
            legacyTokenKey: legacyTokenKey,
            legacyUserKey: legacyUserKey,
            currentActiveUserId: { [unowned self] in self.activeUserId },
            adopt: { [unowned self] user in
                self.activeUserId = user.id
                self.upsertSavedAccount(from: user)
            }
        ).run()
    }

    // MARK: - Local Profile Mutation (optimistic)

    /// U3 — the optimistic profile while an `updateProfile` outbox row is in
    /// flight. A server revalidation (`/auth/me`) or token-refresh `applySession`
    /// must NOT clobber it; `resolveServerUserWithOptimistic` re-applies these
    /// fields onto the server user and self-clears once the server reflects them.
    var pendingOptimisticProfile: ProfileSnapshot?

    @discardableResult
    public func applyLocalProfileChanges(
        displayName: String?,
        bio: String?,
        avatarUrl: String?
    ) -> ProfileSnapshot {
        let snapshot = ProfileSnapshot(
            displayName: currentUser?.displayName,
            bio: currentUser?.bio,
            avatarUrl: currentUser?.avatar
        )
        guard let user = currentUser else { return snapshot }
        let updated = user.withProfileChanges(
            displayName: displayName,
            bio: bio,
            avatar: avatarUrl
        )
        currentUser = updated
        // U3 — remember the optimistic profile so a revalidation/refresh can't
        // clobber it, and persist to the keychain so it survives a cold start
        // (cold-start hydration reads currentUser from the keychain). The
        // guard itself is ALSO persisted (not just the optimistic user) —
        // see `savePendingProfileToKeychain` — so a kill+relaunch before the
        // outbox row confirms still protects the edit from the boot-time
        // `/auth/me` revalidation.
        let pending = ProfileSnapshot(
            displayName: updated.displayName, bio: updated.bio, avatarUrl: updated.avatar)
        pendingOptimisticProfile = pending
        saveUserToKeychain(updated, userId: updated.id)
        savePendingProfileToKeychain(pending, userId: updated.id)
        return snapshot
    }

    public func restoreLocalProfileSnapshot(_ snapshot: ProfileSnapshot) {
        guard let user = currentUser else { return }
        let reverted = user.withProfileChanges(
            displayName: snapshot.displayName,
            bio: snapshot.bio,
            avatar: snapshot.avatarUrl
        )
        currentUser = reverted
        // U3 — the optimistic edit was rolled back; drop the guard + persist.
        pendingOptimisticProfile = nil
        saveUserToKeychain(reverted, userId: reverted.id)
        clearPendingProfileFromKeychain(userId: reverted.id)
    }

    public func applyLocalVoicePublicChange(_ isPublic: Bool) {
        guard let user = currentUser else { return }
        let updated = user.withProfileChanges(voicePublic: isPublic)
        currentUser = updated
        // The change is already server-confirmed (called after PATCH /users/me),
        // so it doesn't join the optimistic guard — just persist for cold start.
        saveUserToKeychain(updated, userId: updated.id)
    }

    /// U3 — merge any in-flight optimistic profile onto a freshly-fetched server
    /// `user`. Returns the user to assign + whether the pending guard should be
    /// cleared: `true` once the server already reflects the optimistic edit (the
    /// `updateProfile` row propagated), so a later external profile change isn't
    /// shadowed by a stale optimistic value. Pure + static for testability;
    /// when `pending == nil` it returns the server user unchanged (the common
    /// login/session path is unaffected).
    static func resolveServerUserWithOptimistic(
        _ server: MeeshyUser, pending: ProfileSnapshot?
    ) -> (user: MeeshyUser, clearedPending: Bool) {
        guard let pending else { return (server, false) }
        if server.displayName == pending.displayName,
           server.bio == pending.bio,
           server.avatar == pending.avatarUrl {
            return (server, true)
        }
        return (
            server.withProfileChanges(
                displayName: pending.displayName, bio: pending.bio, avatar: pending.avatarUrl),
            false
        )
    }

    #if DEBUG
    /// Lève le délai d'une minute de `refreshCurrentUserProfile` (#10463) : un
    /// témoin qui le subirait passerait sans avoir rien demandé.
    func resetProfileRefreshThrottleForTesting() {
        lastProfileRefreshAt = nil
    }
    #endif
}
