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
    /// Crée le compte et APPLIQUE la session. Lève :
    /// - `MeeshyError.rejected(APIRejection)` — refus typé par champ ;
    /// - `PhoneOwnershipConflict` — numéro déjà rattaché à un compte vérifié ;
    /// - `MeeshyError.network(…)` — réseau indisponible.
    func register(_ request: RegisterRequest) async throws
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

    init(authManager: AuthManager = .shared) {
        self.authManager = authManager
    }

    func register(_ request: RegisterRequest) async throws {
        try await authManager.registerThrowing(request: request)
    }
}

// MARK: - Les champs qui peuvent porter un refus

/// Les quatre saisies de l'écran, et rien d'autre : un refus qui ne vise aucune
/// d'elles va au bandeau, jamais sous un champ arbitraire.
enum SignupField: String, CaseIterable, Hashable {
    case displayName
    case email
    case phoneNumber
    case password
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

    /// Crée le compte. `true` quand la session est appliquée — l'appelant
    /// enchaîne IMMÉDIATEMENT, sans pause d'aucune sorte.
    @discardableResult
    func submit() async -> Bool {
        guard form.canSubmit, !isSubmitting else { return false }

        isSubmitting = true
        fieldErrors = [:]
        bannerError = nil
        emailAlreadyRegistered = false
        defer { isSubmitting = false }

        do {
            try await registrar.register(form.registerRequest())
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
        // Un refus qu'aucun champ ne porte doit rester VISIBLE : sans ce
        // repli, un code inconnu effacerait le formulaire de toute trace de
        // l'échec et le bouton redeviendrait actif sans explication.
        bannerError = placed.isEmpty ? rejection.message : nil
    }

    // MARK: - Table code → champ

    static let emailTakenCode = "EMAIL_TAKEN"
    static let usernameTakenCode = "USERNAME_TAKEN"
    static let phoneInvalidCode = "PHONE_INVALID"
    static let validationErrorCode = "VALIDATION_ERROR"

    /// Le champ SERVEUR → la saisie qui le porte à l'écran.
    ///
    /// `username`, `firstName` et `lastName` atterrissent tous sous le NOM
    /// AFFICHÉ : depuis #5218 le client ne les envoie plus, la passerelle les
    /// DÉRIVE de `displayName` — donc la seule saisie que l'utilisateur peut
    /// corriger pour les changer est celle-là. Les renvoyer au bandeau
    /// laisserait « ce pseudo est déjà pris » flotter au-dessus d'un formulaire
    /// qui n'a pas de champ pseudo.
    ///
    /// `systemLanguage` / `regionalLanguage` ne sont volontairement PAS mappés :
    /// la langue régionale ne se montre pas, et un refus sur elle est un défaut
    /// serveur, pas une faute de saisie — il appartient au bandeau.
    static func field(forServerName name: String) -> SignupField? {
        switch name {
        case "displayName", "username", "firstName", "lastName": return .displayName
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
        case usernameTakenCode: return .displayName
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
}
