import Foundation

// #10904 — un 401 ne rafraîchit et ne rejoue que sous le compte et la session
// qui ont ENVOYÉ la requête. Extrait de `AuthManager.swift` (budget de 1 200
// lignes) : l'identité d'une requête, sa session et les jetons qu'elle a
// remplacés vivent ici ; l'état (`tokenRefreshTask`, `tokenRefreshOwner`,
// `retiredSessionTokens`) reste déclaré sur le type.

extension AuthManager {

    static let retiredSessionTokenMemory = 8

    /// #10904 — un compte, sous une génération de session.
    struct SessionOwner: Equatable {
        let userId: String
        let generation: UInt64
    }

    /// #10904 — le 401 d'une requête qui a présenté `presentedToken`. Rien ne
    /// se rafraîchit si ce jeton n'est plus celui du compte actif : un 401
    /// tardif d'un compte quitté, ou d'un jeton déjà renouvelé, ne relance
    /// pas la session du moment.
    public func handleUnauthorized(presentedToken: String?) {
        guard let presentedToken, let userId = activeUserId, !isLeavingActiveSession,
              sessionTokenInUse(for: userId) == presentedToken else { return }
        handleUnauthorized()
    }

    /// #10904 — le rafraîchissement demandé par une REQUÊTE, au nom du jeton
    /// qu'elle a présenté. Rend le jeton sous lequel la rejouer, ou lève
    /// `CancellationError` quand elle ne doit pas l'être.
    ///
    /// - `stillInstalled` : le client présente encore, au retour du 401, le
    ///   jeton qu'il a mis sur la requête (même génération de jeton). Seul ce
    ///   cas rafraîchit — et seulement si ce jeton est celui du compte actif.
    /// - Sinon le jeton a changé depuis l'envoi. Remplacé par un
    ///   rafraîchissement de la MÊME session : la requête se rejoue sous le
    ///   jeton courant (ou rejoint le rafraîchissement en vol), sans en lancer
    ///   un autre. Toute autre origine — autre compte, session quittée puis
    ///   rouverte, sortie en cours — abandonne la requête.
    public func refreshSession(presentedToken: String, stillInstalled: Bool, force: Bool) async throws -> String {
        guard let userId = activeUserId, !isLeavingActiveSession else { throw CancellationError() }
        let owner = SessionOwner(userId: userId, generation: sessionGeneration)
        let current = sessionTokenInUse(for: userId)
        if stillInstalled, presentedToken == current {
            return try await refreshSession(force: force)
        }
        // Encore installé à la lecture du client, mais remplacé pendant le saut
        // vers cet acteur : c'est le cas des jetons remplacés, pas un abandon.
        guard let retired = retiredSessionTokens, retired.owner == owner,
              retired.tokens.contains(presentedToken) else {
            throw CancellationError()
        }
        if let task = tokenRefreshTask, tokenRefreshOwner == owner {
            return try await awaitRefresh(task, for: owner)
        }
        guard let current else { throw MeeshyError.auth(.sessionExpired) }
        return current
    }

    /// #10904 — le jeton que la session ouverte PRÉSENTE : celui installé en
    /// mémoire (`applySession`, reprise), le trousseau à défaut (réveil en
    /// arrière-plan avant tout amorçage). Une écriture ratée au trousseau ne
    /// désynchronise donc pas la référence de ce que le client envoie.
    func sessionTokenInUse(for userId: String) -> String? {
        APIClient.shared.authToken ?? keychain.load(forKey: tokenKey(for: userId), account: nil)
    }

    /// #10904 — le rafraîchissement attendu ne vaut que si sa session est
    /// toujours la session ouverte au retour : une bascule pendant l'attente
    /// abandonne la requête au lieu de la rejouer après la sortie de son compte.
    func awaitRefresh(_ task: Task<String, Error>, for owner: SessionOwner) async throws -> String {
        let token = try await task.value
        guard let userId = activeUserId, !isLeavingActiveSession,
              SessionOwner(userId: userId, generation: sessionGeneration) == owner else {
            throw CancellationError()
        }
        return token
    }

    /// #10904 — `token` vient d'être remplacé dans la session `owner`.
    func retire(_ token: String, from owner: SessionOwner) {
        var tokens = retiredSessionTokens?.owner == owner ? retiredSessionTokens?.tokens ?? [] : []
        tokens.append(token)
        retiredSessionTokens = (owner, Array(tokens.suffix(Self.retiredSessionTokenMemory)))
    }

    #if DEBUG
    /// Test-only seam: cancels and clears any in-flight `tokenRefreshTask`.
    /// `handleUnauthorized()` fires a detached, fire-and-forget `Task` on
    /// every 401 (e.g. from unrelated background activity — E2EE bundle
    /// upload, story prefetch — hitting the stubbed `authService` while a
    /// test runs) that sets `tokenRefreshTask` and isn't awaited by that
    /// test. `refreshSession(force:)`'s `if let task = tokenRefreshTask {
    /// return try await task.value }` serialization guard then makes the
    /// NEXT test's own `refreshSession` call transparently await that
    /// unrelated leftover task instead of evaluating its own state —
    /// surfacing as a flaky, order-dependent failure in whichever test
    /// happens to run right after one that triggered a 401. Call from
    /// `setUp()` for hermetic test isolation.
    ///
    /// **Annuler ne suffit pas, il faut attendre.** `Task.cancel()` est
    /// coopératif : une tâche déjà entrée dans `authService.refreshToken(…)`
    /// va jusqu'au bout de son appel. Elle atterrit alors sur le stub du test
    /// SUIVANT — installé entre-temps par son `setUp()` — et en incrémente le
    /// compteur d'appels. Le test suivant voit un appel qu'il n'a pas fait.
    ///
    /// En attendant la valeur de la tâche, cette fonction garantit qu'aucun
    /// appel de la tâche annulée ne peut plus survenir après son retour.
    /// `try?` avale le `CancellationError` attendu, qui est ici le cas normal.
    func cancelPendingTokenRefreshForTesting() async {
        // L'ordre compte. La tâche d'arrière-plan de `handleUnauthorized()` est
        // celle qui APPELLE `refreshSession` : tant qu'elle n'a pas démarré,
        // `tokenRefreshTask` est encore `nil`. La vider d'abord ne servirait à
        // rien — c'est l'autre qui la remplirait ensuite, contre le stub du
        // test suivant.
        let background = unauthorizedRefreshTask
        unauthorizedRefreshTask = nil
        await background?.value

        let pending = tokenRefreshTask
        tokenRefreshTask = nil
        tokenRefreshOwner = nil
        retiredSessionTokens = nil
        pending?.cancel()
        _ = try? await pending?.value
    }
    #endif
}
