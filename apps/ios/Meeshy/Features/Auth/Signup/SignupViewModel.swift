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

    @Published var form: SignupForm
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

    private let registrar: any SignupRegistering

    init(
        registrar: any SignupRegistering = AuthManagerSignupRegistrar.shared,
        locale: Locale = .current
    ) {
        self.registrar = registrar
        self.form = SignupForm(locale: locale)
    }

    // MARK: - Dérivés

    /// Le bouton est actif dès que nom, e-mail et mot de passe sont valides.
    /// Rien de réseau n'entre dans cette décision.
    var canSubmit: Bool { form.canSubmit && !isSubmitting }

    func error(for field: SignupField) -> String? { fieldErrors[field] }

    // MARK: - Envoi

    /// Le geste « Créer mon compte » : alerte d'abord si aucun numéro n'est
    /// saisi (#8040), sinon crée le compte.
    func requestSubmit() async -> SignupSubmitOutcome {
        guard canSubmit else { return .rejected }
        if SignupPhoneNudge.shouldNudge(before: form) {
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
    func submit() async -> Bool {
        guard form.canSubmit, !isSubmitting else { return false }

        isSubmitting = true
        fieldErrors = [:]
        bannerError = nil
        // Les suggestions décrivent un refus RÉVOLU : les laisser survivre à
        // un nouvel envoi proposerait des pseudos pour un conflit qui n'est
        // peut-être plus.
        usernameSuggestions = []
        emailAlreadyRegistered = false
        pendingVerification = nil
        defer { isSubmitting = false }

        do {
            if case .verificationRequired(let pending) = try await registrar.register(form.registerRequest()) {
                pendingVerification = pending
            }
            return true
        } catch {
            apply(error)
            return false
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

        var placed: [SignupField: String] = [:]
        for name in rejection.affectedFields {
            guard let field = Self.field(forServerName: name),
                  let message = rejection.message(forField: name) else { continue }
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

    /// Le seul refus dont l'écran connaît le REMÈDE, et il le dit.
    static let phoneOwnershipConflictMessage = String(
        localized: "auth.signup.error.phoneOwned",
        defaultValue: "Ce numéro est déjà rattaché à un compte. Laissez-le vide pour continuer.",
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
