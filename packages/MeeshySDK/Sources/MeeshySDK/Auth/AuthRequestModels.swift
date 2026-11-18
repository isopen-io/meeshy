import Foundation

// MARK: - Magic Link

public struct MagicLinkRequest: Encodable {
    public let email: String
    public let deviceFingerprint: String?
    /// #10872 — l'empreinte du secret que cet appareil garde ; omise si `nil`.
    public let linkDeviceHash: String?

    public init(email: String, deviceFingerprint: String? = nil, linkDeviceHash: String? = nil) {
        self.email = email
        self.deviceFingerprint = deviceFingerprint
        self.linkDeviceHash = linkDeviceHash
    }
}

public struct MagicLinkResponse: Decodable {
    public let success: Bool
    public let message: String?
    public let expiresInSeconds: Int?
    public let error: String?
}

public struct MagicLinkValidateRequest: Encodable {
    public let token: String
    /// #10872 — le secret gardé à la demande, et le « oui » explicite de
    /// l'utilisateur ; tous deux omis du corps quand `nil`.
    public let linkDeviceSecret: String?
    public let confirm: Bool?

    public init(token: String, linkDeviceSecret: String? = nil, confirm: Bool? = nil) {
        self.token = token
        self.linkDeviceSecret = linkDeviceSecret
        self.confirm = confirm
    }
}

// MARK: - Forgot Password

public struct ForgotPasswordRequest: Encodable {
    public let email: String

    public init(email: String) {
        self.email = email
    }
}

public struct ResetPasswordRequest: Encodable {
    public let token: String
    public let newPassword: String
    /// Exigé par la passerelle (`resetPasswordSchema`) — sans lui, l'envoi
    /// partait en 400 `Invalid request data`.
    public let confirmPassword: String
    /// Le code 2FA d'un compte protégé (#10867) — omis du corps quand `nil`.
    public let twoFactorCode: String?

    public init(token: String, newPassword: String, confirmPassword: String? = nil, twoFactorCode: String? = nil) {
        self.token = token
        self.newPassword = newPassword
        self.confirmPassword = confirmPassword ?? newPassword
        self.twoFactorCode = twoFactorCode
    }
}

// MARK: - Phone Verification

public struct SendPhoneCodeRequest: Encodable {
    public let phoneNumber: String

    public init(phoneNumber: String) {
        self.phoneNumber = phoneNumber
    }
}

public struct VerifyPhoneRequest: Encodable {
    public let phoneNumber: String
    public let code: String

    public init(phoneNumber: String, code: String) {
        self.phoneNumber = phoneNumber
        self.code = code
    }
}

public struct VerifyPhoneResponse: Decodable {
    public let verified: Bool?
    public let phoneTransferToken: String?
}

// MARK: - Email Verification

public struct VerifyEmailRequest: Encodable {
    public let code: String

    public init(code: String) {
        self.code = code
    }
}

public struct VerifyEmailCodeRequest: Encodable {
    public let code: String
    public let email: String

    public init(code: String, email: String) {
        self.code = code
        self.email = email
    }
}

public struct ResendVerificationRequest: Encodable {
    public let email: String

    public init(email: String) {
        self.email = email
    }
}


// MARK: - Availability Check

/// La réponse de `GET /auth/check-availability`.
///
/// **Le contrat a changé (#4158).** L'adresse et le numéro ne disent plus si un
/// compte existe : les confirmer sans authentification faisait de cette route
/// un oracle, alors que `/forgot-password` et `/magic-link/request` répondent
/// délibérément « succès » dans tous les cas pour ne rien révéler. Ils rendent
/// désormais un verdict de FORME.
///
/// Le PSEUDO, lui, répond toujours sur l'existence — c'est une clé publique,
/// déjà énumérable par `GET /u/:username`.
public struct AvailabilityResponse: Decodable {
    public let usernameAvailable: Bool?
    public let suggestions: [String]?

    /// Forme seulement. `nil` quand l'adresse n'a pas été soumise.
    public let emailValid: Bool?
    /// Forme seulement. `nil` quand le numéro n'a pas été soumis.
    public let phoneNumberValid: Bool?
    /// Le numéro normalisé, quand il est bien formé.
    public let phoneNumberE164: String?

    /// Ne parle QUE du pseudo.
    ///
    /// Elle retombait auparavant sur `emailAvailable ?? phoneNumberAvailable`,
    /// des champs que le serveur ne sert plus : la laisser ainsi ferait rendre
    /// `false` à chaque adresse, et l'écran d'inscription dirait « déjà
    /// utilisée » à tout le monde.
    public var available: Bool {
        usernameAvailable ?? false
    }

    /// L'identifiant de contact soumis est-il BIEN FORMÉ ? (jamais « libre »)
    public var wellFormed: Bool {
        emailValid ?? phoneNumberValid ?? true
    }
}

// MARK: - Phone Ownership Check (récupération de compte)

public struct PhoneOwnerMaskedInfo: Decodable, Sendable, Equatable {
    public let displayName: String?
    public let username: String?
    public let email: String?
}

/// Réponse de `/auth/phone-transfer/check`. Quand `recoverySuggested` est vrai,
/// le numéro appartient à un compte dormant dont l'identité déclarée matche —
/// le client oriente alors vers la récupération de compte plutôt que la
/// création d'un doublon.
/// La réponse de `POST /auth/phone-transfer/check`.
///
/// **`exists` a été RETIRÉ du fil (#4239).** Il confirmait, sans compte, qu'un
/// numéro appartient à un utilisateur Meeshy — le même oracle que #4158 ferme
/// sur la porte voisine. `maskedInfo` ne vient plus que lorsque la récupération
/// est suggérée, c'est-à-dire lorsque l'appelant a déjà prouvé qu'il connaît le
/// vrai nom du titulaire.
///
/// `dormant`, `dormantSince` et `nameSimilarity` n'ont jamais été servis par
/// cette route — elle les tait délibérément. Les déclarer ici les laissait
/// paraître disponibles ; ils sont retirés avec `exists`.
public struct PhoneOwnershipResponse: Decodable, Sendable, Equatable {
    public let maskedInfo: PhoneOwnerMaskedInfo?
    public let recoverySuggested: Bool?
}
