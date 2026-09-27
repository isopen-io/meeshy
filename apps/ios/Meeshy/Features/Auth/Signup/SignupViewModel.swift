import Foundation
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Ce que l'inscription DEMANDE au monde

/// La seule chose que l'écran d'inscription attend d'un service : créer le
/// compte, ou lever un refus qu'il sait lire.
///
/// Déclaré au-dessus de son unique implémentation, comme la convention iOS
/// l'impose : la suite substitue un `MockSignupRegistrar` sans toucher au
/// `AuthManager` partagé — dont `register` écrit dans le trousseau RÉEL et
/// bascule la session de tout le processus de test.
@MainActor
protocol SignupRegistering: AnyObject {
    /// Crée le compte et APPLIQUE la session — ou, sans numéro de téléphone,
    /// rend l'adresse à vérifier : le compte n'est pas encore actif (#8055).
    /// Lève :
    /// - `MeeshyError.rejected(APIRejection)` — refus typé par champ ;
    /// - `PhoneOwnershipConflict` — numéro déjà rattaché à un compte vérifié ;
    /// - `MeeshyError.network(…)` — réseau indisponible.
    func register(_ request: RegisterRequest) async throws -> RegistrationOutcome
    /// Crée le compte SANS poser la session (#8288) : la carte de l'inscription
    /// la tient le temps de recevoir son code. Mêmes refus que `register`.
    func registerHoldingSession(_ request: RegisterRequest) async throws -> RegistrationHold
}

/// L'implémentation de production : une couche mince au-dessus d'`AuthManager`.
///
/// Elle existe pour que le ViewModel dépende d'une CAPACITÉ (« créer un
/// compte ») et non du singleton d'authentification tout entier — c'est ce qui
/// rend la suite exécutable sans réseau ni trousseau.
@MainActor
final class AuthManagerSignupRegistrar: SignupRegistering {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests (elle ne vise
    // que les `ObservableObject`, mais la cause est l'ISOLATION, pas la
    // conformité — l'écrire ici coûte une ligne et ferme le cas).
    nonisolated deinit {}

    static let shared = AuthManagerSignupRegistrar()

    private let authManager: AuthManager

    private init() { self.authManager = .shared }

    func register(_ request: RegisterRequest) async throws -> RegistrationOutcome {
        try await authManager.registerThrowing(request: request)
    }

    func registerHoldingSession(_ request: RegisterRequest) async throws -> RegistrationHold {
        try await authManager.registerHoldingSession(request: request)
    }
}

// MARK: - Le lien de connexion d'une adresse déjà utilisée (#8216)

/// Demander le code et le lien de connexion d'une adresse — la porte « e-mail
/// seul » que `MagicLinkView` emprunte (`AuthService.requestEmailCode`), jamais
/// une seconde machine. Le protocole n'existe que pour que la suite atteigne
/// l'envoi sans passerelle.
@MainActor
protocol SignInLinkRequesting: AnyObject {
    func requestEmailCode(email: String) async throws -> EmailCodeDispatch
}

@MainActor
final class AuthServiceSignInLinkRequester: SignInLinkRequesting {
    nonisolated deinit {}

    static let shared = AuthServiceSignInLinkRequester()

    private init() {}

    func requestEmailCode(email: String) async throws -> EmailCodeDispatch {
        try await AuthService.shared.requestEmailCode(email: email)
    }
}

/// L'adresse que l'inscription remet à la connexion quand elle y bascule
/// (#8216) : l'accueil referme l'inscription AVANT que `LoginView` n'existe,
/// l'adresse l'y attend donc ici, en mémoire vive, et ne sert qu'une fois.
@MainActor
final class LoginEmailHandoff {
    nonisolated deinit {}

    static let shared = LoginEmailHandoff()

    private var held: String?

    init() {}

    func hold(_ email: String?) { held = email }

    func take() -> String? {
        defer { held = nil }
        return held
    }
}

// MARK: - Les champs qui peuvent porter un refus

/// Les quatre saisies de l'écran, et rien d'autre : un refus qui ne vise aucune
/// d'elles va au bandeau, jamais sous un champ arbitraire.
enum SignupField: String, CaseIterable, Hashable {
    /// Le pseudo a sa PROPRE saisie depuis #6479 — l'écran le montre et
    /// l'envoie, donc un refus qui le vise doit se poser sous lui.
    case username
    case displayName
    case email
    case phoneNumber
    case password
}

// MARK: - L'alerte « sans numéro » (#8040)

/// Faut-il ALERTER avant de créer le compte ? Oui quand aucun numéro n'est
/// saisi — le numéro sécurise le compte et le récupère quand l'accès à l'adresse
/// est perdu. Une alerte, jamais un blocage : « Continuer quand même » crée le
/// compte sans numéro, exactement comme avant. Miroir web : `apps/web`
/// (`signup.tsx`).
enum SignupPhoneNudge {
    static func shouldNudge(before form: SignupForm) -> Bool { !form.hasPhone }
}

/// Ce qu'une demande d'envoi a produit — l'écran en tire son retour haptique :
/// une alerte n'est ni un succès ni un échec.
enum SignupSubmitOutcome: Equatable {
    case created
    case rejected
    case phoneNudged
}

// MARK: - ViewModel

/// L'orchestration produit de l'inscription : quand envoyer, où poser chaque
/// refus, quoi faire du succès.
///
/// Elle ne valide rien elle-même — `SignupForm` (SDK) porte les règles — et ne
/// parle à personne d'autre qu'à `SignupRegistering`.
///
/// **Aucun appel réseau ne précède l'envoi.** Pas de vérification de
/// disponibilité, pas de `debounce`, pas d'`asyncAfter` : le wizard remplacé en
/// tenait trois (pseudo, e-mail, téléphone), chacun avec sa seconde d'attente,
/// et ils ne pouvaient de toute façon plus répondre « déjà pris » depuis #4158.
/// Ce qu'ils coûtaient — trois écrans et trois attentes — n'achetait plus rien.
@MainActor
final class SignupViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    // MARK: - État

    @Published var form: SignupForm {
        didSet { advanceProgress() }
    }
    @Published private(set) var isSubmitting = false
    /// Le message à poser SOUS chaque champ. Vidé à chaque nouvel envoi : un
    /// refus qui survit à la correction qu'il a provoquée est un mensonge.
    @Published private(set) var fieldErrors: [SignupField: String] = [:]
    /// Le refus qui ne vise aucun champ — réseau, panne serveur, code inconnu.
    @Published private(set) var bannerError: String?
    /// Vrai quand le serveur a répondu `EMAIL_TAKEN` : l'écran offre alors
    /// « Se connecter » sous le champ, au lieu de laisser l'utilisateur deviner.
    @Published private(set) var emailAlreadyRegistered = false
    /// Les pseudos LIBRES à proposer quand celui qu'on envoyait est pris
    /// (#6479). Vide partout ailleurs.
    @Published private(set) var usernameSuggestions: [String] = []
    /// L'alerte « sans numéro » est-elle à l'écran (#8040) ? Écrite par
    /// l'`.alert` elle-même quand l'utilisateur répond.
    @Published var isPhoneNudgePresented = false
    /// L'adresse à vérifier quand le compte, créé SANS numéro, n'est pas encore
    /// actif (#8055) : l'écran présente alors la saisie du code au lieu d'entrer
    /// dans l'app. Le mot de passe est déjà sur le compte — il ne repart pas.
    @Published var pendingVerification: PendingEmailVerification?
    /// Le code et le lien de connexion PARTIS vers l'adresse déjà utilisée
    /// (#8216) : l'écran présente alors l'attente de `MagicLinkView`.
    @Published var signInLink: SentEmailCode?
    @Published private(set) var isRequestingSignInLink = false
    /// Pourquoi le lien n'est pas parti — dit SOUS le geste qui l'a demandé,
    /// jamais au bandeau du bas de l'écran.
    @Published private(set) var signInLinkError: String?
    /// L'adresse, telle que tapée, que la passerelle a refusée comme DÉJÀ
    /// UTILISÉE : le refus et ses gestes ne valent que pour elle.
    private var rejectedEmail: String?
    /// Le détenteur MASQUÉ de l'adresse refusée (#8214) : l'écran demande
    /// « Est-ce vous ? ». `nil` sur une passerelle qui ne le sert pas encore —
    /// l'écran retombe alors sur la récupération seule.
    @Published private(set) var emailOwner: APIRejection.EmailOwner?

    // MARK: - Les phases (#8288)

    /// « Continuer avec l'e-mail seulement » a été touché.
    @Published private(set) var phoneSkipped = false
    /// Ce qui est PARU — monotone (`SignupProgress`).
    @Published private(set) var progress: SignupProgress = .initial
    /// Ce que la carte sait du compte qu'elle a créé.
    @Published private(set) var card: SignupCard = .editing
    /// « Valider mon compte maintenant » est en cours.
    @Published private(set) var isValidating = false
    /// La saisie du code DANS la carte — la machine de l'écran du code
    /// (`EmailVerificationViewModel`), jamais une seconde.
    @Published private(set) var codeEntry: EmailVerificationViewModel?

    private let registrar: any SignupRegistering
    /// Le code du lien d'invitation ouvert avant l'inscription (#8075).
    private let referrals: PendingReferralStoreProviding
    private let linkRequester: any SignInLinkRequesting
    /// Pose la session TENUE par la carte (#8288).
    private let confirmer: EmailVerificationConfirming
    /// Le préchargement de l'arrivée, sans seconde fête (#8089, #8288).
    private let celebration: ArrivalCelebrating
    private let makeCodeEntry: (SignupCodeStep) -> EmailVerificationViewModel

    init(
        registrar: any SignupRegistering = AuthManagerSignupRegistrar.shared,
        locale: Locale = .current,
        referrals: PendingReferralStoreProviding = PendingReferralStore.shared,
        linkRequester: any SignInLinkRequesting = AuthServiceSignInLinkRequester.shared,
        confirmer: EmailVerificationConfirming? = nil,
        celebration: ArrivalCelebrating? = nil,
        makeCodeEntry: ((SignupCodeStep) -> EmailVerificationViewModel)? = nil
    ) {
        self.registrar = registrar
        self.referrals = referrals
        self.linkRequester = linkRequester
        self.confirmer = confirmer ?? AuthManager.shared
        self.celebration = celebration ?? ArrivalCelebrationController.shared
        self.makeCodeEntry = makeCodeEntry ?? { step in
            EmailVerificationViewModel(
                email: step.email,
                accountCreated: true,
                pendingSessionToken: step.pendingSessionToken,
                sessionOrigin: .registration,
                celebratesArrival: false
            )
        }
        self.form = SignupForm(locale: locale)
    }

    // MARK: - Dérivés

    /// Le bouton est actif dès que nom, e-mail et mot de passe sont valides.
    /// Rien de réseau n'entre dans cette décision.
    var canSubmit: Bool { form.canSubmit && !isSubmitting }

    /// Le refus du serveur d'abord ; à défaut, ce que la saisie viole DÉJÀ —
    /// la borne du pseudo se dit PENDANT la frappe (#8082), pas après un aller-retour.
    func error(for field: SignupField) -> String? {
        if field == .email, emailAlreadyRegistered {
            return showsEmailTakenActions ? Self.emailTakenMessage : nil
        }
        return fieldErrors[field] ?? liveError(for: field)
    }

    /// L'adresse refusée comme DÉJÀ UTILISÉE est toujours celle du champ
    /// (#8216) : l'écran offre alors le lien de connexion et le mot de passe
    /// oublié. Corrigée, elle n'est plus celle d'un compte connu.
    var showsEmailTakenActions: Bool {
        emailAlreadyRegistered && rejectedEmail == form.email
    }

    /// L'adresse que la connexion reçoit quand l'inscription y bascule — une
    /// adresse COMPLÈTE seulement : un début de saisie préremplirait un champ
    /// qu'il faudrait vider.
    var loginEmail: String? {
        form.isEmailValid ? form.email.trimmingCharacters(in: .whitespacesAndNewlines) : nil
    }

    // MARK: - « Ce n'est pas moi » (#8214 × #8216)

    /// Renvoie la MÊME inscription en REVENDIQUANT l'adresse : la passerelle
    /// crée le compte sans session et envoie un code à l'adresse — sa preuve
    /// seule la donne au nouveau compte. `true` quand le compte attend son
    /// code (`pendingVerification` porte alors l'écran du code).
    @discardableResult
    func claimEmail() async -> Bool {
        guard showsEmailTakenActions else { return false }
        return await submit(claimingEmail: true)
    }

    // MARK: - Lien de connexion (#8216)

    /// « Recevoir un lien de connexion » : UN geste envoie le code et le lien
    /// à l'adresse refusée, normalisée comme l'inscription l'aurait envoyée.
    /// `true` quand ils sont partis — `signInLink` porte alors l'attente.
    @discardableResult
    func requestSignInLink() async -> Bool {
        guard showsEmailTakenActions, !isRequestingSignInLink else { return false }
        let email = form.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        isRequestingSignInLink = true
        signInLinkError = nil
        defer { isRequestingSignInLink = false }
        do {
            let dispatch = try await linkRequester.requestEmailCode(email: email)
            signInLink = SentEmailCode(email: email, dispatch: dispatch)
            return true
        } catch {
            signInLinkError = EmailProofErrorText.sendMessage(for: error)
            return false
        }
    }

    private func liveError(for field: SignupField) -> String? {
        guard field == .username, let refusal = form.usernameRefusal else { return nil }
        return Self.usernameRefusalMessage(refusal)
    }

    // MARK: - Envoi

    /// Le geste « Créer mon compte » : alerte d'abord si aucun numéro n'est
    /// saisi (#8040), sinon crée le compte.
    func requestSubmit() async -> SignupSubmitOutcome {
        guard canSubmit else { return .rejected }
        if SignupPhases.shouldNudgePhone(hasPhone: form.hasPhone, phoneSkipped: phoneSkipped) {
            isPhoneNudgePresented = true
            return .phoneNudged
        }
        return await submit() ? .created : .rejected
    }

    /// « Ajouter mon numéro » : ferme l'alerte, n'envoie rien, et rend le
    /// champ à focaliser.
    func addPhoneInstead() -> SignupField {
        isPhoneNudgePresented = false
        return .phoneNumber
    }

    /// « Continuer quand même » : le compte naît sans numéro.
    func continueWithoutPhone() async -> Bool {
        isPhoneNudgePresented = false
        return await submit()
    }

    /// Crée le compte. `true` quand le compte est créé — l'appelant enchaîne
    /// IMMÉDIATEMENT, sans pause d'aucune sorte : dans l'app si la session est
    /// appliquée, vers la saisie du code si `pendingVerification` est posé.
    @discardableResult
    func submit(claimingEmail: Bool = false) async -> Bool {
        guard form.canSubmit, !isSubmitting else { return false }

        isSubmitting = true
        clearFeedback()
        defer { isSubmitting = false }

        do {
            // Le code d'invitation VOYAGE avec l'inscription (#8058) : la
            // passerelle rattache le compte au parrain, et un code invalide ne
            // bloque jamais la création. Le compte existe dès qu'elle répond —
            // session ouverte ou code à saisir — donc le code a servi.
            let referred = form.registerRequest().referred(byCode: referrals.recall())
            let request = claimingEmail ? referred.claimingEmail() : referred
            let outcome = try await registrar.register(request)
            referrals.forget()
            if case .verificationRequired(let pending) = outcome {
                // #8288 — le code s'attend DANS la carte, jamais sur un autre écran.
                pendingVerification = pending
                beginCode(SignupCodeStep(email: pending.email, pendingSessionToken: pending.pendingSessionToken, held: nil))
            }
            return true
        } catch {
            apply(error)
            return false
        }
    }

    /// Un nouvel envoi efface les refus d'avant : un refus qui survit à la
    /// correction qu'il a provoquée est un mensonge. Les suggestions décrivent
    /// un refus RÉVOLU : les laisser survivre proposerait des pseudos pour un
    /// conflit qui n'est peut-être plus.
    private func clearFeedback() {
        fieldErrors = [:]
        bannerError = nil
        usernameSuggestions = []
        emailAlreadyRegistered = false
        rejectedEmail = nil
        emailOwner = nil
        signInLinkError = nil
        pendingVerification = nil
    }

    // MARK: - Phases et carte (#8288)

    var cardStage: SignupCardStage {
        switch card {
        case .editing: return .editing
        case .awaitingCode(let step): return .awaitingCode(signedIn: step.held != nil)
        case .verified: return .verified
        }
    }

    var phase: SignupPhase { SignupPhases.phase(progress: progress, card: cardStage) }

    var primaryAction: SignupPrimaryAction {
        SignupPhases.primaryAction(
            progress: progress,
            card: cardStage,
            formReady: form.canSubmit && !isSubmitting && !isValidating
        )
    }

    /// « Continuer avec l'e-mail seulement » — l'adresse paraît.
    func skipPhone() {
        phoneSkipped = true
        advanceProgress()
    }

    private func advanceProgress() {
        let next = progress.advanced(
            phoneGiven: form.hasPhone && form.isPhoneValid,
            phoneSkipped: phoneSkipped,
            emailValid: form.isEmailValid
        )
        if next != progress { progress = next }
    }

    /// « Valider mon compte maintenant » : crée le compte en TENANT sa session,
    /// et fait paraître le code dans la carte. `true` quand le compte existe.
    @discardableResult
    func validateNow() async -> Bool {
        guard form.canSubmit, !isSubmitting, !isValidating, case .editing = card else { return false }
        isValidating = true
        clearFeedback()
        defer { isValidating = false }

        do {
            let request = form.registerRequest().referred(byCode: referrals.recall())
            let hold = try await registrar.registerHoldingSession(request)
            referrals.forget()
            switch hold {
            case .session(let held, let pendingSessionToken):
                let email = form.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                beginCode(SignupCodeStep(email: email, pendingSessionToken: pendingSessionToken, held: held))
            case .verificationRequired(let pending):
                pendingVerification = pending
                beginCode(SignupCodeStep(email: pending.email, pendingSessionToken: pending.pendingSessionToken, held: nil))
            }
            return true
        } catch {
            apply(error)
            return false
        }
    }

    private func beginCode(_ step: SignupCodeStep) {
        let entry = makeCodeEntry(step)
        entry.onVerified = { [weak self] in self?.verify(by: .code) }
        entry.onProvenElsewhere = { [weak self] in self?.verify(by: .link) }
        codeEntry = entry
        card = .awaitingCode(step)
    }

    /// Le code juste valide toujours ; le lien ouvert AILLEURS ne valide que le
    /// compte dont la session est tenue ici — « si et seulement si » (#8083) :
    /// un compte sans session n'entre que par le code saisi sur cet appareil.
    private func verify(by proof: SignupProof) {
        guard case .awaitingCode(let step) = card else { return }
        if proof == .link, step.held == nil { return }
        card = .verified(SignupVerified(proof: proof, held: step.held))
    }

    /// Ce qui ouvre la session pour « S'inscrire » sans code ou « Parler aux
    /// autres » — `nil` quand le compte n'a encore rien à ouvrir. L'hôte
    /// l'appelle une fois l'inscription refermée (#8059).
    func sessionOpener() -> ProvenSessionOpener? {
        switch card {
        case .editing:
            return nil
        case .awaitingCode(let step):
            return step.held.map(openHeld)
        case .verified(let verified):
            guard verified.proof == .code, let entry = codeEntry else { return verified.held.map(openHeld) }
            let fallback = verified.held.map(openHeld)
            return {
                entry.openProvenSession()
                if !entry.sessionOpened { fallback?() }
            }
        }
    }

    private func openHeld(_ held: EmailProvenSession) -> ProvenSessionOpener {
        let confirmer = self.confirmer
        let celebration = self.celebration
        return {
            confirmer.openSession(held)
            celebration.prepare(userId: held.user.id)
        }
    }

    // MARK: - Lecture d'un refus

    /// Range un refus là où l'utilisateur le cherchera : sous le champ qu'il
    /// vise, ou dans le bandeau quand il n'en vise aucun.
    private func apply(_ error: Error) {
        if error is PhoneOwnershipConflict {
            fieldErrors[.phoneNumber] = Self.phoneOwnershipConflictMessage
            return
        }

        guard let meeshyError = error as? MeeshyError else {
            bannerError = error.localizedDescription
            return
        }

        switch meeshyError {
        case .rejected(let rejection):
            applyRejection(rejection)
        case .network:
            bannerError = Self.networkUnavailableMessage
        default:
            bannerError = meeshyError.errorDescription ?? Self.genericFailureMessage
        }
    }

    private func applyRejection(_ rejection: APIRejection) {
        emailAlreadyRegistered = rejection.code == Self.emailTakenCode
        rejectedEmail = emailAlreadyRegistered ? form.email : nil
        emailOwner = emailAlreadyRegistered ? rejection.emailOwner : nil

        var placed: [SignupField: String] = [:]
        for name in rejection.affectedFields {
            guard let field = Self.field(forServerName: name),
                  let served = rejection.message(forField: name) else { continue }
            // Un refus de SCHÉMA porte le texte d'Ajv (« must NOT have more
            // than 16 characters ») — anglais, technique. Sous le pseudo, la
            // règle dans la langue du lecteur le remplace (#8082).
            let message = field == .username && rejection.code == Self.validationErrorCode
                ? Self.usernameRuleMessage
                : served
            // Le PREMIER message qui vise un champ gagne : `violations` est
            // ordonné par le serveur, et empiler deux phrases sous une même
            // saisie n'en rendrait aucune lisible.
            if placed[field] == nil { placed[field] = message }
        }

        // Un code que le serveur documente mais qui ne nomme pas son champ :
        // c'est le cas de `PHONE_INVALID` quand la validation a échoué avant
        // d'atteindre la couche qui pose `field`.
        if placed.isEmpty, let field = Self.field(forCode: rejection.code) {
            placed[field] = rejection.message
        }

        fieldErrors = placed
        // Les pseudos LIBRES servis avec `USERNAME_TAKEN` (#6479). Le SDK les
        // décode déjà (`APIRejection.suggestions`) ; personne ne les lisait.
        // Depuis que l'écran ENVOIE son pseudo, une collision est un REFUS et
        // non plus un renommage silencieux — sans ces trois valeurs, ce refus
        // serait un mur.
        usernameSuggestions = rejection.suggestions
        // Un refus qu'aucun champ ne porte doit rester VISIBLE : sans ce
        // repli, un code inconnu effacerait le formulaire de toute trace de
        // l'échec et le bouton redeviendrait actif sans explication.
        //
        // Le bandeau NE REND JAMAIS `rejection.message` tel quel (#5325) : un
        // contrat de passerelle plus ancien que l'app (validation Fastify par
        // défaut, hors de `sendError`) porte dans ce champ une phrase
        // TECHNIQUE en anglais (« body must have required property
        // 'username' ») — jamais destinée à l'écran, quoi qu'en dise le
        // doc-comment d'`APIRejection.message`. Un message humain, localisé,
        // porte le code à la place : le lecteur comprend, le support trace.
        bannerError = placed.isEmpty ? Self.rejectionBannerMessage(for: rejection) : nil
    }

    /// Le bandeau d'un refus qu'aucun champ ne porte : toujours une phrase
    /// HUMAINE dans la langue du lecteur, jamais le texte brut du serveur.
    /// Le code machine — ou, à défaut, le statut HTTP — l'accompagne pour que
    /// le support puisse le retrouver.
    static func rejectionBannerMessage(for rejection: APIRejection) -> String {
        let supportCode = rejection.code ?? String(rejection.statusCode)
        return "\(rejectionGenericMessage) (\(supportCode))"
    }

    // MARK: - Table code → champ

    static let emailTakenCode = "EMAIL_TAKEN"
    static let usernameTakenCode = "USERNAME_TAKEN"
    static let phoneInvalidCode = "PHONE_INVALID"
    static let validationErrorCode = "VALIDATION_ERROR"

    /// Le champ SERVEUR → la saisie qui le porte à l'écran.
    ///
    /// LA TABLE A CHANGÉ (#6479). `username` se repliait sur le nom affiché
    /// parce qu'aucune saisie ne le portait — « ce pseudo est déjà pris »
    /// aurait flotté au-dessus d'un formulaire sans champ pseudo. L'écran en a
    /// un désormais, et il ENVOIE sa valeur : le refus se pose sous lui, sinon
    /// le message accuse un champ que l'utilisateur n'a pas touché.
    ///
    /// `firstName`/`lastName` restent sous le nom affiché : la passerelle les
    /// dérive de lui, et c'est la seule saisie qui permet de les changer.
    ///
    /// `systemLanguage` / `regionalLanguage` ne sont volontairement PAS mappés :
    /// la langue régionale ne se montre pas, et un refus sur elle est un défaut
    /// serveur, pas une faute de saisie — il appartient au bandeau.
    static func field(forServerName name: String) -> SignupField? {
        switch name {
        case "username": return .username
        case "displayName", "firstName", "lastName": return .displayName
        case "email": return .email
        case "phoneNumber", "phoneCountryCode": return .phoneNumber
        case "password": return .password
        default: return nil
        }
    }

    /// Le champ qu'un CODE vise, quand la charge ne nomme pas de champ.
    static func field(forCode code: String?) -> SignupField? {
        switch code {
        case emailTakenCode: return .email
        case usernameTakenCode: return .username
        case phoneInvalidCode: return .phoneNumber
        default: return nil
        }
    }

    // MARK: - Copies de refus

    /// La borne du pseudo, dite sous le champ PENDANT la saisie (#8082). Les
    /// nombres viennent de `SignupForm` — miroir du schéma partagé — jamais
    /// d'un littéral de la copie.
    static func usernameRefusalMessage(_ refusal: SignupForm.UsernameRefusal) -> String {
        switch refusal {
        case .tooLong:
            return String(
                format: String(localized: "auth.signup.username.tooLong", defaultValue: "%lld caractères au plus.", bundle: .main),
                SignupForm.usernameMaxLength
            )
        case .tooShort:
            return String(
                format: String(localized: "auth.signup.username.tooShort", defaultValue: "%lld caractères au moins.", bundle: .main),
                SignupForm.usernameMinLength
            )
        case .invalidCharacters:
            return String(
                localized: "auth.signup.username.invalidCharacters",
                defaultValue: "Lettres sans accent, chiffres, - et _ uniquement — pas d’espace.",
                bundle: .main
            )
        }
    }

    /// La règle ENTIÈRE, quand la passerelle refuse le pseudo sans motif
    /// exploitable (texte d'Ajv) : elle couvre les trois.
    static var usernameRuleMessage: String {
        String(
            format: String(
                localized: "auth.signup.username.rule",
                defaultValue: "De %1$lld à %2$lld caractères : lettres sans accent, chiffres, - et _.",
                bundle: .main
            ),
            SignupForm.usernameMinLength,
            SignupForm.usernameMaxLength
        )
    }

    /// Le seul refus dont l'écran connaît le REMÈDE, et il le dit.
    static let phoneOwnershipConflictMessage = String(
        localized: "auth.signup.error.phoneOwned",
        defaultValue: "Ce numéro est déjà rattaché à un compte. Laissez-le vide pour continuer.",
        bundle: .main
    )

    /// Ce que dit le champ d'une adresse DÉJÀ UTILISÉE (#8216) — jamais le
    /// texte du serveur, et le mot « compte » plutôt que « adresse prise » :
    /// l'utilisateur apprend qu'il A un compte, pas qu'il s'est trompé.
    static let emailTakenMessage = String(
        localized: "auth.signup.email.taken",
        defaultValue: "Un compte existe déjà avec cette adresse.",
        bundle: .main
    )

    static let networkUnavailableMessage = String(
        localized: "auth.signup.error.network",
        defaultValue: "Pas de connexion. Vérifiez votre réseau et réessayez.",
        bundle: .main
    )

    static let genericFailureMessage = String(
        localized: "auth.signup.error.generic",
        defaultValue: "La création du compte a échoué. Réessayez.",
        bundle: .main
    )

    /// Le refus RENVOYÉ PAR LA PASSERELLE mais qu'AUCUN champ ne porte : un
    /// code inconnu, une clé de validation que le client ne mappe pas, ou —
    /// le cas qui a motivé #5325 — une réponse hors du contrat `sendError`
    /// (validation Fastify par défaut) dont `message` est un texte technique
    /// anglais. Jamais affiché seul : `rejectionBannerMessage(for:)` lui
    /// adjoint le code machine ou le statut HTTP.
    static let rejectionGenericMessage = String(
        localized: "auth.signup.error.rejectedGeneric",
        defaultValue: "L'inscription a été refusée — réessayez dans un instant.",
        bundle: .main
    )
}

// MARK: - La carte de l'inscription (#8288)

/// Le compte que la carte a créé et qui attend son code.
struct SignupCodeStep {
    let email: String
    /// Le jeton d'attente (#8083) — la carte apprend que le lien a été ouvert ailleurs.
    let pendingSessionToken: String?
    /// La session TENUE ; `nil` pour un compte qui n'entre que par son code.
    let held: EmailProvenSession?
}

enum SignupProof: Equatable {
    case code
    case link
}

struct SignupVerified {
    let proof: SignupProof
    let held: EmailProvenSession?
}

enum SignupCard {
    case editing
    case awaitingCode(SignupCodeStep)
    case verified(SignupVerified)
}
