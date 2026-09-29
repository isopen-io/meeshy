import Foundation
import os

// MARK: - Plusieurs comptes sur l'appareil (#8286)
//
// Chaque compte a ses jetons dans le trousseau, sous des clés qui portent son
// identifiant (`meeshy_token_<id>`, `meeshy_session_token_<id>`,
// `meeshy_user_<id>`). Un seul est ACTIF (`activeUserId`) ; les autres, quand
// ils sont GARDÉS, y dorment et se reprennent sans mot de passe.
//
// Quitter un compte — pour un autre ou pour en ajouter un — passe par la MÊME
// sortie que la déconnexion (`leaveActiveSession`) : sockets, services, caches,
// files et brouillons partent, parce qu'ils sont partagés par l'appareil et ne
// doivent rien laisser au compte suivant. Seuls les jetons du compte quitté
// SURVIVENT quand il est gardé ; sinon sa session est fermée côté passerelle.

extension AuthManager {

    // MARK: - Connexion

    @discardableResult
    public func login(username: String, password: String) async -> LoginOutcome {
        await login(username: username, password: password, keepSignedIn: true)
    }

    /// `keepSignedIn` — la case « Rester connecté sur cet appareil », proposée
    /// au compte SUPPLÉMENTAIRE (`offersKeepSignedIn`). Elle part au serveur
    /// (`rememberDevice`) et reste attachée au compte : un compte non gardé
    /// est fermé quand on le quitte.
    @discardableResult
    public func login(username: String, password: String, keepSignedIn: Bool) async -> LoginOutcome {
        isLoading = true
        errorMessage = nil
        requires2FA = false
        twoFactorToken = nil
        pendingKeepSignedIn = keepSignedIn
        defer { isLoading = false }

        do {
            let data = try await authService.login(username: username, password: password, rememberDevice: keepSignedIn)
            if let pending = data.pendingEmailVerification(typedIdentifier: username) {
                pendingKeepSignedIn = nil
                return .verificationRequired(pending)
            }
            if data.requires2FA == true {
                self.requires2FA = true
                self.twoFactorToken = data.twoFactorToken
                return .twoFactorRequired
            }
            guard let token = data.token, let user = data.user else {
                throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
            }
            applySession(token: token, sessionToken: data.sessionToken, user: user, origin: .login)
            return .authenticated
        } catch let error as MeeshyError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        pendingKeepSignedIn = nil
        return .failed
    }

    /// Le choix d'une connexion en cours, rendu UNE fois à la session qu'elle ouvre.
    func takePendingKeepSignedIn() -> Bool? {
        defer { pendingKeepSignedIn = nil }
        return pendingKeepSignedIn
    }

    // MARK: - Le compte actif

    /// L'identifiant du compte ACTIF, posé AVANT `isAuthenticated = true` et
    /// retiré avant `isAuthenticated = false`. C'est lui — et non
    /// `currentUser`, absent quand le profil en cache est illisible — qui dit
    /// à quelle base locale des messages la session appartient (#8656).
    public var activeAccountId: String? { activeUserId }

    /// Le compte tel que l'appareil range ses données : utilisateur +
    /// environnement (#8656, #8674).
    func accountKey(for userId: String?) -> MessageStoreAccountKey? {
        MessageStoreAccountKey(userId: userId, serverOrigin: MeeshyConfig.shared.persistedServerOrigin)
    }

    // MARK: - Ce que l'appareil garde

    /// Ce compte peut-il être repris sans mot de passe ?
    public func hasPreservedSession(for userId: String) -> Bool {
        keychain.load(forKey: tokenKey(for: userId), account: nil) != nil
    }

    /// Un AUTRE compte que l'actif garde-t-il sa session ? C'est ce qui fait
    /// proposer « Rester connecté sur cet appareil » : le premier compte est
    /// gardé sans question.
    public var offersKeepSignedIn: Bool {
        let active = activeUserId
        return savedAccounts.contains { $0.id != active && hasPreservedSession(for: $0.id) }
    }

    // MARK: - Changer de compte

    /// Passe au compte `userId` SANS mot de passe s'il est gardé. Rend `false`
    /// sans rien toucher sinon : l'appelant présente alors la connexion.
    @discardableResult
    public func switchAccount(to userId: String) async -> Bool {
        guard userId != activeUserId else { return true }
        guard hasPreservedSession(for: userId) else { return false }
        isSwitchingAccount = true
        defer { isSwitchingAccount = false }
        await suspendActiveSession()
        // Mesuré au simulateur : `false` puis `true` dans le MÊME tour du
        // MainActor, et un `onChange(of: isAuthenticated)` SwiftUI n'y voit
        // AUCUNE transition — les sockets ne se rouvraient pas et l'écran du
        // compte quitté restait monté. Une image à l'état « sorti » (écran
        // neutre, `isSwitchingAccount`) laisse chaque observateur la voir.
        try? await Task.sleep(for: .milliseconds(150))
        // #8674 — le cache du compte qui revient est rendu AVANT que la session
        // ne s'ouvre : le premier écran le lit, jamais un cache vide.
        await CacheAccountBinder.shared.bind(accountKey(for: userId)).value
        guard restoreStoredSession(for: userId) else {
            CacheAccountBinder.shared.bind(nil)
            activeUserId = nil
            isAuthenticated = false
            return false
        }
        return true
    }

    /// Quitte le compte actif SANS l'oublier : l'appareil revient à l'écran de
    /// connexion, qui liste les comptes (« Ajouter un compte »). Sa session est
    /// gardée s'il l'a demandé, fermée sinon.
    public func suspendActiveSession() async {
        guard let outgoing = activeUserId else { return }
        let keeps = savedAccounts.first { $0.id == outgoing }?.keepsSession ?? true
        await leaveActiveSession(endingIt: !keeps)
        isAuthenticated = false
    }

    // MARK: - Sortie de session

    /// P1 quiesce-then-purge, commun à la déconnexion et au changement de
    /// compte. `endingIt: false` garde les jetons du compte quitté dans le
    /// trousseau ; tout le reste part dans les deux cas. Ne bascule PAS
    /// `isAuthenticated` : c'est à l'appelant de le faire, en dernier.
    func leaveActiveSession(endingIt: Bool) async {
        // U3 — drop any in-flight optimistic profile guard so it can't leak onto
        // the next user's profile after a re-login.
        pendingOptimisticProfile = nil
        // T15b — HTTP cache purge AVANT le guard : l'état déconnecté ne doit
        // jamais laisser de bodies REST (conversations, messages) d'un compte
        // au repos sur disque, quel que soit le chemin de logout emprunté.
        APIClient.shared.clearHTTPCache()
        // outbox-02 — la file settings persiste endpoint+corps verbatim sans
        // scoping userId et son flush rejoue sous le token de la session
        // COURANTE : sans purge, un PATCH /users/me du compte A s'appliquerait
        // au profil du compte B.
        await SettingsActionQueue.shared.clearAll()
        guard let userId = activeUserId else {
            // sync-04 — les watermarks de delta-sync sont per-user en
            // UserDefaults globaux : sans reset, le compte suivant hérite du
            // checkpoint sortant. Avec un compte actif, c'est la liaison du
            // cache ci-dessous qui les met de côté ou les efface (#8674).
            ConversationSyncEngine.shared.resetSyncCheckpoints()
            currentUser = nil
            return
        }

        // P1 D-7 — SessionSnapshot wipe en PREMIER : si l'app crash ici, les
        // extensions (NSE, Widget) ne re-lisent pas les credentials sortants.
        SessionSnapshotStore.wipe()

        // D5.hygiene — capture the token BEFORE any wipe (the retry Task runs
        // concurrently with `APIClient.shared.authToken = nil` below).
        let outgoingToken = APIClient.shared.authToken
        if endingIt {
            if let outgoingToken {
                Task { await self.performServerLogoutWithRetries(token: outgoingToken) }
            } else {
                Logger.auth.warning("logout(): no authToken snapshot available — skipping server-side logout call")
            }
        }

        // P1 quiesce — stop accepting new mutations BEFORE purging stores.
        MessageSocketManager.shared.disconnect()
        SocialSocketManager.shared.disconnect()

        NotificationCoordinator.shared.reset()
        NotificationToastManager.shared.reset()
        PushNotificationManager.shared.resetSession()
        await BlockService.shared.reset()
        StoryService.shared.reset()
        // E9 — le brouillon de story et la queue de publication appartiennent
        // au compte sortant : le compte suivant ne doit ni les voir, ni les
        // publier sous sa session.
        StoryDraftStore.shared.clear()
        await StoryPublishQueue.shared.clearAll()
        await ConversationStore.shared.reset()
        await UserCategoryStore.shared.reset()
        UserPreferencesManager.shared.resetSession()
        FriendshipCache.shared.clear()
        // A5 — le curseur de séquence est per-user.
        Task { await SyncSeqTracker.shared.reset() }

        if endingIt {
            keychain.delete(forKey: tokenKey(for: userId), account: nil)
            keychain.delete(forKey: sessionTokenKey(for: userId), account: nil)
            keychain.delete(forKey: userKey(for: userId), account: nil)
            keychain.delete(forKey: tokenDateUDKey(for: userId), account: nil)
        }
        // La file des réglages vient d'être vidée : une édition optimiste en
        // attente ne sera jamais confirmée, sa garde ne doit pas survivre.
        keychain.delete(forKey: pendingProfileKey(for: userId), account: nil)

        activeUserId = nil
        currentUser = nil
        APIClient.shared.authToken = nil
        APIClient.shared.registeredSessionToken = nil

        // D3 — le cache vivant est vidé, AWAITED pour que le router ne voie
        // pas isAuthenticated=false avant. #8674 — un compte GARDÉ (jetons
        // encore au trousseau : changement de compte, ajout d'un compte) voit
        // son cache et son point de reprise mis de côté jusqu'à son retour ;
        // un compte déconnecté (jetons effacés ci-dessus) les perd.
        await CacheAccountBinder.shared.bind(nil).value

        // T15b — seconde purge HTTP (un store disque bufferisé peut atterrir
        // après la première).
        APIClient.shared.clearHTTPCache()
    }

    // MARK: - Reprise d'une session gardée

    /// Rend `userId` actif depuis ses jetons du trousseau — le démarrage à
    /// froid comme le changement de compte. `false` si le trousseau n'a rien.
    func restoreStoredSession(for userId: String) -> Bool {
        guard let token = keychain.load(forKey: tokenKey(for: userId), account: nil) else { return false }
        activeUserId = userId
        let sessionToken = keychain.load(forKey: sessionTokenKey(for: userId), account: nil)

        // Show cached user immediately — authenticate from cache before any
        // network call so the UI never blanks. A corrupt entry is dropped so
        // the background revalidation below repopulates it.
        if let userJSON = keychain.load(forKey: userKey(for: userId), account: nil),
           let userData = userJSON.data(using: .utf8) {
            do {
                let user = try JSONDecoder().decode(MeeshyUser.self, from: userData)
                currentUser = user
                updateSavedAccountActivity(from: user)
            } catch {
                Logger.auth.error("Failed to decode cached user for userId \(userId, privacy: .public): \(error.localizedDescription, privacy: .public) — dropping corrupt cache entry")
                keychain.delete(forKey: userKey(for: userId), account: nil)
            }
        }

        // U3-cont'd — reload any optimistic-profile guard left pending by a
        // kill+relaunch BEFORE the background revalidation below can run.
        pendingOptimisticProfile = loadPendingProfileFromKeychain(userId: userId)

        APIClient.shared.authToken = token
        // Le jeton de session suit le JWT (#4213).
        APIClient.shared.registeredSessionToken = currentSessionToken
        sessionOrigin = .restored
        // #8674 — sans effet quand le cache est déjà le sien (démarrage à
        // froid, changement de compte qui l'a déjà rendu).
        CacheAccountBinder.shared.bind(accountKey(for: userId))
        isAuthenticated = true
        warmSessionScopedCaches()

        // Proactive refresh, detached: a slow network must never hold the
        // splash hostage (APIClient's reactive 401-refresh covers the rest).
        if isCurrentTokenExpired, sessionToken != nil, NetworkMonitor.shared.isOnline {
            Task { [weak self] in
                do {
                    _ = try await self?.refreshSession(force: false)
                } catch {
                    Logger.auth.warning("Proactive session refresh failed: \(error.localizedDescription, privacy: .public)")
                }
            }
        }

        // Background revalidation (stale-while-revalidate for the profile).
        // Auth failures surface a re-auth state; the saved account is kept.
        Task { [weak self] in
            guard let self else { return }
            do {
                let user = try await self.authService.me()
                guard self.activeUserId == userId else { return }
                self.updateUserAfterRevalidation(user, userId: userId)
            } catch let error as MeeshyError {
                switch error {
                case .auth:
                    guard self.activeUserId == userId else { return }
                    self.requireReauthentication(userId: userId)
                case .network, .server, .message, .media, .forbidden, .rejected, .unknown:
                    break
                }
            } catch {
                // Cancellation / unknown — preserve session.
            }
        }
        return true
    }

    // MARK: - Saved accounts persistence

    func loadSavedAccounts() {
        guard let json = keychain.load(forKey: savedAccountsUDKey, account: nil),
              let data = json.data(using: .utf8) else {
            savedAccounts = []
            return
        }

        let accounts: [SavedAccount]
        do {
            accounts = try JSONDecoder().decode([SavedAccount].self, from: data)
        } catch {
            Logger.auth.error("Failed to decode saved accounts from keychain: \(error.localizedDescription, privacy: .public)")
            savedAccounts = []
            return
        }
        // D4 — sort with a stable secondary key (`id`): two accounts sharing
        // `lastActiveAt` must not swap places from one cold start to the next.
        savedAccounts = accounts.sorted { a, b in
            if a.lastActiveAt != b.lastActiveAt {
                return a.lastActiveAt > b.lastActiveAt
            }
            return a.id < b.id
        }
    }

    func persistSavedAccounts() {
        do {
            let data = try JSONEncoder().encode(savedAccounts)
            guard let json = String(data: data, encoding: .utf8) else {
                Logger.auth.error("Failed to convert saved accounts to UTF8 string")
                return
            }
            try keychain.save(json, forKey: savedAccountsUDKey, account: nil)
        } catch {
            Logger.auth.error("Failed to persist saved accounts to keychain: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// `keepsSession` absent garde le choix déjà fait — `true` pour un compte neuf.
    func upsertSavedAccount(from user: MeeshyUser, keepsSession: Bool? = nil) {
        let known = savedAccounts.first { $0.id == user.id }
        let account = SavedAccount(
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarURL: user.avatar,
            lastActiveAt: Date(),
            keepsSession: keepsSession ?? known?.keepsSession ?? true
        )
        if let idx = savedAccounts.firstIndex(where: { $0.id == user.id }) {
            savedAccounts[idx] = account
        } else {
            savedAccounts.insert(account, at: 0)
        }
        persistSavedAccounts()
    }

    /// Update lastActiveAt without resetting the token saved-at date.
    func updateSavedAccountActivity(from user: MeeshyUser) {
        upsertSavedAccount(from: user)
    }

    func removeFromSavedAccounts(userId: String) {
        savedAccounts.removeAll { $0.id == userId }
        persistSavedAccounts()
    }
}
