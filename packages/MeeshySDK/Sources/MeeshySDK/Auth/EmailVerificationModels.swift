import Foundation

/// Une adresse qui attend sa preuve de possession avant toute session (#8035).
///
/// La passerelle la rend quand `POST /auth/login` reçoit une adresse inconnue :
/// le compte est créé SANS mot de passe ni session, et un e-mail « code à six
/// chiffres + lien » part vers `email`. `accountCreated` distingue la première
/// fois du renvoi (compte déjà créé ainsi, jamais vérifié).
public struct PendingEmailVerification: Equatable, Sendable, Identifiable {
    public let email: String
    public let accountCreated: Bool
    /// #8083 — le jeton d'attente de CET appareil : il dit à l'écran du code si
    /// l'adresse a été prouvée ailleurs (`pending` / `proven`), jamais plus.
    /// `nil` quand la passerelle ne l'a pas servi : l'écran s'en passe.
    public let pendingSessionToken: String?

    public var id: String { email }

    public init(email: String, accountCreated: Bool, pendingSessionToken: String? = nil) {
        self.email = email
        self.accountCreated = accountCreated
        self.pendingSessionToken = pendingSessionToken
    }
}

/// Ce que la connexion par mot de passe a produit — l'écran en choisit la suite.
public enum LoginOutcome: Equatable, Sendable {
    case authenticated
    case twoFactorRequired
    case verificationRequired(PendingEmailVerification)
    case failed
}

/// Ce que l'inscription a produit (#8055). Sans numéro de téléphone, le compte
/// existe mais n'est pas ACTIF : la passerelle rend la même branche que la
/// connexion d'une adresse inconnue — aucune session, un code est parti — et
/// l'écran présente la saisie du code. Avec un numéro, la session s'ouvre.
public enum RegistrationOutcome: Equatable, Sendable {
    case authenticated
    case verificationRequired(PendingEmailVerification)
}

public extension LoginResponseData {
    static let verificationRequiredStatus = "verification-required"

    /// L'adresse à vérifier si la réponse la demande, sinon `nil`.
    ///
    /// L'adresse SERVIE fait foi ; celle que l'utilisateur a tapée ne sert que
    /// si le serveur l'a omise.
    func pendingEmailVerification(typedIdentifier: String) -> PendingEmailVerification? {
        guard status == Self.verificationRequiredStatus else { return nil }
        let served = (email ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let address = served.isEmpty
            ? typedIdentifier.trimmingCharacters(in: .whitespacesAndNewlines)
            : served
        guard !address.isEmpty else { return nil }
        let token = pendingSessionToken.flatMap { $0.isEmpty ? nil : $0 }
        return PendingEmailVerification(email: address, accountCreated: accountCreated ?? false, pendingSessionToken: token)
    }
}

/// La charge de `POST /auth/verify-email` : l'adresse et UNE preuve — le code
/// reçu, ou le jeton du lien.
///
/// Le mot de passe ne voyage qu'avec le CODE (la passerelle l'ignore avec un
/// jeton, et ne le pose que sur un compte qui n'en a pas) : un lien ouvert ne
/// connaît aucun mot de passe, et un champ vide n'en est pas un.
public struct EmailVerificationRequest: Encodable, Equatable, Sendable {
    public let email: String
    public let code: String?
    public let token: String?
    public let password: String?

    private init(email: String, code: String?, token: String?, password: String?) {
        self.email = email
        self.code = code
        self.token = token
        self.password = password
    }

    public static func code(_ code: String, email: String, password: String? = nil) -> EmailVerificationRequest {
        let typed = password.flatMap { $0.isEmpty ? nil : $0 }
        return EmailVerificationRequest(email: email, code: code, token: nil, password: typed)
    }

    public static func link(token: String, email: String) -> EmailVerificationRequest {
        EmailVerificationRequest(email: email, code: nil, token: token, password: nil)
    }
}
