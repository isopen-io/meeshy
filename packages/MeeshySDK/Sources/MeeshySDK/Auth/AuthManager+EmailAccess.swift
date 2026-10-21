import Foundation
import os

/// Les portes qui passent par la boîte e-mail : le lien de connexion, et la
/// vérification d'adresse qui, depuis #8035, OUVRE la session.
extension AuthManager {

    // MARK: - Magic Link

    public func requestMagicLink(email: String) async -> Bool {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            _ = try await authService.requestMagicLink(email: email, deviceFingerprint: nil)
            return true
        } catch let error as MeeshyError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        return false
    }

    public func validateMagicLink(token: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            // #10463 — par `openSession` : une session refusée y est refermée.
            openSession(try await verifyMagicLink(token: token))
        } catch let error as MeeshyError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Valide le lien de connexion SANS poser la session (#8076) : un lien
    /// ouvert pendant qu'une présentation d'accès est affichée attend qu'elle
    /// se referme, sinon elle resterait orpheline sous la nouvelle racine.
    ///
    /// #10872 — lève `LinkConfirmationRequired` quand le lien n'a pas été
    /// demandé par cet appareil : aucune session, l'identité du compte à
    /// confirmer. `confirmed` rejoue la preuve après le « oui ».
    public func verifyMagicLink(token: String, confirmed: Bool = false) async throws -> EmailProvenSession {
        let data = try await authService.validateMagicLink(token: token, confirmed: confirmed)
        guard let proven = try EmailProvenSession.served(by: data) else {
            throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
        }
        return proven
    }

    // MARK: - Email Verification

    /// Vérifie l'adresse (code ou lien) et pose la session rendue, par le MÊME
    /// chemin qu'une connexion réussie. Rend `true` si une session est ouverte,
    /// `false` si la passerelle a vérifié sans session (réponse antérieure à
    /// #8035). Lève le refus de la passerelle (code faux, expiré, débit).
    @discardableResult
    public func confirmEmail(_ request: EmailVerificationRequest) async throws -> Bool {
        guard let proven = try await verifyEmail(request) else { return false }
        try installClosingRefused(proven)
        return true
    }

    /// Vérifie l'adresse SANS poser la session (#8059) : l'écran qui a présenté
    /// la saisie du code doit d'abord se REFERMER. Ouvrir la session bascule la
    /// racine de l'app et démonte l'écran de connexion — une feuille encore
    /// présentée par lui resterait orpheline, figée, sans « Fermer » qui
    /// réponde. `nil` ⇒ vérifiée sans session (passerelle antérieure à #8035).
    ///
    /// Lève `SecondFactorRequired` quand le compte porte un second facteur
    /// (#10445) : l'adresse est prouvée, mais aucune session n'est rendue —
    /// ce n'est ni un refus ni un « Email vérifié ! ».
    public func verifyEmail(_ request: EmailVerificationRequest) async throws -> EmailProvenSession? {
        try EmailProvenSession.served(by: try await authService.confirmEmail(request))
    }

    // MARK: - Inscription, session tenue (#8288)

    /// Crée le compte SANS poser la session : l'écran d'inscription la tient
    /// le temps que sa carte reçoive le code, puis la pose par `openSession`.
    /// Mêmes drapeaux que `registerThrowing` (`isLoading`, `errorMessage`), et
    /// mêmes refus : `PhoneOwnershipConflict`, `MeeshyError`.
    public func registerHoldingSession(request: RegisterRequest) async throws -> RegistrationHold {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let data = try await authService.register(request: request)
            // Le conflit de numéro est un 200 qui n'a RIEN créé : le tester
            // avant `token`/`user` évite de le rendre comme une réponse tronquée.
            if data.phoneOwnershipConflict == true {
                throw PhoneOwnershipConflict()
            }
            if let pending = data.pendingEmailVerification(typedIdentifier: request.email) {
                return .verificationRequired(pending)
            }
            guard let token = data.token, let user = data.user else {
                throw MeeshyError.server(statusCode: 0, message: "Response missing token/user data")
            }
            let watch = data.pendingSessionToken.flatMap { $0.isEmpty ? nil : $0 }
            let proven = EmailProvenSession(token: token, sessionToken: data.sessionToken, user: user, origin: .registration)
            return .session(proven, pendingSessionToken: watch)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            throw error
        }
    }

    /// Pose la session prouvée par `verifyEmail`, comme une connexion réussie,
    /// et rend son VERDICT (#10450) : `true` si la session est posée. La session
    /// d'un AUTRE utilisateur que celui de la session ouverte est REFUSÉE
    /// (#10446) — rien n'est posé, `errorMessage` le dit, et l'appelant
    /// n'annonce aucun succès ; y passer se fait par `switchToProvenAccount`.
    ///
    /// #10463 — refusée aussi pendant un changement de compte, et toute session
    /// refusée est REFERMÉE côté passerelle, ici, pour tous les appelants : la
    /// preuve a ouvert une session serveur que rien d'autre ne fermerait.
    @discardableResult
    public func openSession(_ proven: EmailProvenSession) -> Bool {
        do {
            try installOutsideAccountSwitch(proven)
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            closeRefusedProvenSession(proven)
            return false
        }
    }

    /// #10463 — hors d'un changement de compte. Pendant sa pause, la session
    /// sortante est démontée : une session posée là passerait la garde de
    /// `applySession` comme une première connexion, sans question, et le
    /// changement poserait ensuite la sienne par-dessus.
    func installOutsideAccountSwitch(_ proven: EmailProvenSession) throws {
        guard !isSwitchingAccount else {
            throw SessionReplacementRefused(activeUserId: activeUserId, incomingUserId: proven.user.id)
        }
        try installSession(proven)
    }

    /// #10463 — la porte des sessions que le serveur vient d'OUVRIR (connexion,
    /// second facteur, inscription, vérification) : refusée, elle est refermée
    /// côté passerelle, puis le refus est rendu à l'appelant.
    func installClosingRefused(_ proven: EmailProvenSession) throws {
        do {
            try installOutsideAccountSwitch(proven)
        } catch {
            closeRefusedProvenSession(proven)
            throw error
        }
    }

    /// La porte LEVANTE de `openSession` : rend `SessionReplacementRefused` à
    /// l'appelant qui sait le traiter. Le seul appelant direct est le
    /// changement de compte, qui tient `isSwitchingAccount`.
    func installSession(_ proven: EmailProvenSession) throws {
        try applySession(token: proven.token, sessionToken: proven.sessionToken, user: proven.user,
                         origin: proven.origin)
    }

    // MARK: - Un lien qui ouvre un AUTRE compte (#10445)

    /// Passe à la session PROUVÉE d'un autre compte en GARDANT celle qu'on
    /// quitte : même sortie que « Changer de compte » (`suspendActiveSession`),
    /// le compte quitté reste au sélecteur et se reprend sans mot de passe.
    /// Rien n'est écrit au trousseau pour le compte entrant avant cet appel :
    /// la session rendue par la preuve n'existe qu'en mémoire jusque-là.
    ///
    /// #10450 — aucune dérogation à la garde de `applySession` : la session
    /// prouvée ne se pose que sur une session DÉMONTÉE. Si la sortie n'a pas
    /// eu lieu (compte actif inconnu), si un autre changement de compte est en
    /// cours, ou si une session s'est rouverte pendant la pause, rien n'est
    /// posé et la session prouvée est refermée côté passerelle.
    ///
    /// #10463 — la session refusée se referme dans une tâche à part : sous
    /// `isSwitchingAccount`, ses réessais (jusqu'à quelques secondes hors
    /// ligne) tenaient toute autre bascule refusée.
    ///
    /// #10513 — une preuve plus vieille que sa fenêtre d'adoption
    /// (`EmailProvenSession.adoptableFor`, #10518) ne range rien et ne pose
    /// rien : la passerelle ne l'adopterait plus, et le premier appel
    /// déconnecterait. Elle est refermée côté passerelle.
    ///
    /// #10518 — rend la RAISON d'un refus : `.expired` (fenêtre passée, il
    /// faut un nouveau lien) ou `.failed` (l'appareil n'a pas pu poser la
    /// session). Dans les deux cas rien du compte du lien n'est posé et la
    /// session prouvée est refermée côté passerelle. `.expired`, et un
    /// `.failed` rendu AVANT la sortie (autre changement en cours), laissent
    /// le compte ouvert tel quel. Un `.failed` rendu APRÈS la sortie trouve le
    /// compte quitté déjà rangé : il se reprend au sélecteur sans mot de passe
    /// s'il garde sa session (`keepsSession`), et sinon sa session est fermée
    /// pour de bon — l'appareil reste alors sans compte ouvert. La fenêtre se
    /// lit UNE fois, avant de ranger le compte ouvert ; rien ne la relit
    /// ensuite, la bascule comptant sur la marge de l'appareil
    /// (`ProvenAdoptionWindow.clientMargin`).
    @discardableResult
    public func switchToProvenAccount(_ proven: EmailProvenSession) async -> ProvenAccountSwitchOutcome {
        guard !proven.hasLapsedAdoptionWindow() else {
            closeRefusedProvenSession(proven)
            return .refused(.expired)
        }
        guard !isSwitchingAccount else {
            closeRefusedProvenSession(proven)
            return .refused(.failed)
        }
        guard isAuthenticated, proven.user.id != activeUserId else {
            return openSession(proven) ? .switched : .refused(.failed)
        }
        isSwitchingAccount = true
        defer { isSwitchingAccount = false }
        await suspendActiveSession()
        guard !isAuthenticated else {
            closeRefusedProvenSession(proven)
            return .refused(.failed)
        }
        // Même image à l'état « sorti » que `switchAccount(to:)` : sans elle,
        // `false` puis `true` dans le même tour échappent aux observateurs.
        try? await Task.sleep(for: .milliseconds(150))
        guard !isAuthenticated else {
            closeRefusedProvenSession(proven)
            return .refused(.failed)
        }
        await CacheAccountBinder.shared.bind(accountKey(for: proven.user.id)).value
        do {
            try installSession(proven)
            return .switched
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            // Une session s'est posée pendant la liaison du cache : il revient
            // au compte qui est ouvert, jamais à celui qu'on a refusé.
            await CacheAccountBinder.shared.bind(accountKey(for: activeUserId)).value
            closeRefusedProvenSession(proven)
            return .refused(.failed)
        }
    }

    /// Ferme côté passerelle une session prouvée que l'utilisateur a REFUSÉE,
    /// ou que l'appareil n'a pas pu poser : la preuve a consommé le jeton et
    /// ouvert une session serveur, qui ne doit pas leur survivre. Rien ne
    /// change sur l'appareil. Réessaie comme la déconnexion (#10450).
    public func discardProvenSession(_ proven: EmailProvenSession) async {
        await performServerLogoutWithRetries(token: proven.token)
    }

    /// `discardProvenSession` sans faire attendre l'appelant (#10463).
    func closeRefusedProvenSession(_ proven: EmailProvenSession) {
        let closure: Task<Void, Never> = Task { [weak self] in
            guard let self else { return }
            await self.discardProvenSession(proven)
        }
        #if DEBUG
        refusedSessionClosuresForTesting.append(closure)
        #else
        _ = closure
        #endif
    }

    #if DEBUG
    /// Attend les fermetures lancées par `closeRefusedProvenSession`.
    func awaitRefusedSessionClosuresForTesting() async {
        let pending = refusedSessionClosuresForTesting
        refusedSessionClosuresForTesting = []
        for closure in pending { await closure.value }
    }
    #endif
}

/// #10446 — `applySession` refuse d'installer un autre utilisateur par-dessus
/// une session ouverte, hors du changement de compte explicite.
public struct SessionReplacementRefused: LocalizedError, Equatable, Sendable {
    public let activeUserId: String?
    public let incomingUserId: String

    public init(activeUserId: String?, incomingUserId: String) {
        self.activeUserId = activeUserId
        self.incomingUserId = incomingUserId
    }

    public var errorDescription: String? {
        "Another account is already signed in on this device"
    }
}

/// #10463 — une connexion, un second facteur ou une inscription demandés
/// pendant un changement de compte : refusés, rien n'est envoyé au serveur.
public struct AccountSwitchUnderway: LocalizedError, Equatable, Sendable {
    public init() {}

    public var errorDescription: String? {
        "An account switch is in progress on this device"
    }
}

/// Ce que rend `switchToProvenAccount` (#10518).
public enum ProvenAccountSwitchOutcome: Equatable, Sendable {
    case switched
    case refused(ProvenAccountSwitchRefusal)
}

/// Pourquoi la session prouvée n'a pas été posée (#10518).
public enum ProvenAccountSwitchRefusal: Equatable, Sendable {
    /// La fenêtre d'adoption est passée : il faut un nouveau lien. Jugé avant
    /// toute sortie — le compte ouvert l'est resté.
    case expired
    /// L'appareil n'a pas pu poser la session (autre changement en cours,
    /// session rouverte entre-temps, garde de `applySession`). Rendu avant la
    /// sortie, le compte ouvert l'est resté ; rendu après, il est déjà rangé,
    /// et sa session fermée s'il ne la garde pas (`keepsSession`).
    case failed
}

/// La passerelle a prouvé l'adresse, mais le compte attend son second facteur
/// (`requires2FA`) : aucune session n'est rendue (#10445).
///
/// #10518 — le défi a lui aussi sa fenêtre : `adoptableFor` secondes à
/// compter de `receivedAt`. C'est un plafond — un défi plus récent du même
/// compte le remplace. Deux refus sont égaux par leur défi et sa fenêtre,
/// jamais par l'instant où ils ont été reçus.
public struct SecondFactorRequired: Error, Equatable, Sendable {
    public let twoFactorToken: String?
    public let receivedAt: Date
    public let adoptableFor: TimeInterval

    public init(
        twoFactorToken: String?,
        receivedAt: Date = Date(),
        adoptableFor: TimeInterval = ProvenAdoptionWindow.fallback(for: .secondFactor)
    ) {
        self.twoFactorToken = twoFactorToken
        self.receivedAt = receivedAt
        self.adoptableFor = ProvenAdoptionWindow.bounded(adoptableFor)
    }

    /// Le défi a-t-il passé la fenêtre où le présenter vaut encore ?
    public func hasLapsedAdoptionWindow(now: Date = Date()) -> Bool {
        ProvenAdoptionWindow.hasLapsed(receivedAt: receivedAt, window: adoptableFor, now: now)
    }

    public static func == (lhs: SecondFactorRequired, rhs: SecondFactorRequired) -> Bool {
        lhs.twoFactorToken == rhs.twoFactorToken && lhs.adoptableFor == rhs.adoptableFor
    }
}

/// Une session que la preuve de l'adresse a rendue, pas encore posée (#8059).
public struct EmailProvenSession: Sendable {
    public let token: String
    public let sessionToken: String?
    public let user: MeeshyUser
    /// D'où vient la session qu'on posera — une preuve d'adresse ouvre une
    /// CONNEXION ; la carte de l'inscription (#8288) tient celle d'un compte
    /// qu'elle vient de CRÉER, et le report de la demande de notifications en dépend.
    public let origin: SessionOrigin
    /// L'instant où la preuve a été reçue (#10513) : l'âge de la session.
    public let receivedAt: Date
    /// Les secondes, à compter de `receivedAt`, pendant lesquelles adopter
    /// cette session vaut encore (#10518) : le délai SERVI par la passerelle
    /// moins la marge, ou le repli. Toujours entre zéro et la borne dure.
    public let adoptableFor: TimeInterval

    /// Le REPLI (#10518) : la fenêtre d'une session dont la passerelle n'a
    /// servi aucun délai lisible. La fenêtre d'une preuve se lit sur
    /// `adoptableFor`, jamais ici.
    public static let adoptionWindow: TimeInterval = ProvenAdoptionWindow.fallback(for: .session)

    public init(
        token: String,
        sessionToken: String?,
        user: MeeshyUser,
        origin: SessionOrigin = .login,
        receivedAt: Date = Date(),
        adoptableFor: TimeInterval = EmailProvenSession.adoptionWindow
    ) {
        self.token = token
        self.sessionToken = sessionToken
        self.user = user
        self.origin = origin
        self.receivedAt = receivedAt
        self.adoptableFor = ProvenAdoptionWindow.bounded(adoptableFor)
    }

    /// La preuve a-t-elle passé la fenêtre où l'adopter vaut encore ?
    public func hasLapsedAdoptionWindow(now: Date = Date()) -> Bool {
        ProvenAdoptionWindow.hasLapsed(receivedAt: receivedAt, window: adoptableFor, now: now)
    }

    /// La session que sert une réponse de preuve d'adresse. `nil` ⇒ adresse
    /// prouvée sans session (passerelle antérieure à #8035) ; lève
    /// `SecondFactorRequired` quand le compte attend son second facteur.
    /// `receivedAt` est l'instant où la réponse est lue (#10518) : le délai
    /// servi s'y applique, sur les deux branches.
    /// #10872 — lève `LinkConfirmationRequired` avant tout : la passerelle n'a
    /// rien ouvert, elle attend que l'utilisateur confirme le compte.
    static func served(by data: LoginResponseData, receivedAt: Date = Date()) throws -> EmailProvenSession? {
        if data.requiresConfirmation == true, let account = data.account {
            throw LinkConfirmationRequired(account: account, intent: data.linkIntent, maskedEmail: data.maskedEmail)
        }
        if data.requires2FA == true {
            throw SecondFactorRequired(
                twoFactorToken: data.twoFactorToken,
                receivedAt: receivedAt,
                adoptableFor: ProvenAdoptionWindow.clientWindow(for: .secondFactor, adoptWithinSeconds: data.adoptWithinSeconds))
        }
        guard let token = data.token, let user = data.user else { return nil }
        return EmailProvenSession(
            token: token, sessionToken: data.sessionToken, user: user,
            receivedAt: receivedAt,
            adoptableFor: ProvenAdoptionWindow.clientWindow(for: .session, adoptWithinSeconds: data.adoptWithinSeconds))
    }

    /// La même session, sous une autre origine.
    public func originating(from origin: SessionOrigin) -> EmailProvenSession {
        EmailProvenSession(token: token, sessionToken: sessionToken, user: user, origin: origin,
                           receivedAt: receivedAt, adoptableFor: adoptableFor)
    }
}

/// Ce dont un écran de saisie du code a besoin : prouver l'adresse, puis — une
/// fois l'écran refermé — ouvrir la session (#8059).
@MainActor
public protocol EmailVerificationConfirming: AnyObject {
    func verifyEmail(_ request: EmailVerificationRequest) async throws -> EmailProvenSession?
    /// `true` si la session est posée (#10450) : un refus n'annonce rien, et
    /// la session refusée est refermée côté passerelle par l'implémentation
    /// (#10463) — l'appelant n'a rien à fermer.
    @discardableResult
    func openSession(_ proven: EmailProvenSession) -> Bool
}

extension AuthManager: EmailVerificationConfirming {}
