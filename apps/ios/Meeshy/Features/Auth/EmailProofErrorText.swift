import Foundation
import MeeshySDK

/// Ce qu'un refus de preuve d'adresse DIT à l'écran (#8081).
///
/// La passerelle écrit ses phrases en français ; elle pose à côté un `code`
/// machine (`sendError`, `routes/auth/magic-link.ts`). L'écran lit le CODE et
/// rend la phrase du catalogue de l'app, dans la langue de l'interface — jamais
/// le `message` du serveur, même en repli : un code inconnu rend le générique.
enum EmailProofRefusal: Equatable {
    case invalidCode
    case expiredCode
    case weakPassword
    case tooManyAttempts
    case offline
    case unexpected

    static let invalidVerificationCode = "INVALID_VERIFICATION"
    static let verificationExpiredCode = "VERIFICATION_EXPIRED"
    static let weakPasswordCode = "WEAK_PASSWORD"
    static let rateLimitedCodes: Set<String> = ["RATE_LIMITED", "RATE_LIMIT_EXCEEDED"]

    static func classify(_ error: Error) -> EmailProofRefusal {
        if error is URLError { return .offline }
        guard let meeshyError = error as? MeeshyError else { return .unexpected }
        switch meeshyError {
        case .rejected(let rejection):
            return classify(code: rejection.code, statusCode: rejection.statusCode)
        case .server(let statusCode, _):
            return statusCode == 429 ? .tooManyAttempts : .unexpected
        case .network:
            return .offline
        default:
            return .unexpected
        }
    }

    private static func classify(code: String?, statusCode: Int) -> EmailProofRefusal {
        if statusCode == 429 { return .tooManyAttempts }
        switch code {
        case invalidVerificationCode: return .invalidCode
        case verificationExpiredCode: return .expiredCode
        case weakPasswordCode: return .weakPassword
        case let code? where rateLimitedCodes.contains(code): return .tooManyAttempts
        default: return .unexpected
        }
    }
}

enum EmailProofErrorText {

    /// La saisie du code (écran de vérification, porte « e-mail seul »).
    static func codeMessage(for error: Error, bundle: Bundle = .main) -> String {
        switch EmailProofRefusal.classify(error) {
        case .invalidCode:
            return String(localized: "emailVerification.error.invalidCode",
                          defaultValue: "Code de vérification invalide.", bundle: bundle)
        case .expiredCode:
            return String(localized: "emailVerification.error.expiredCode",
                          defaultValue: "Ce code a expiré. Demandez-en un nouveau.", bundle: bundle)
        case .weakPassword:
            return String(localized: "emailVerification.error.weakPassword",
                          defaultValue: "Ce mot de passe est trop faible. Choisissez-en un plus robuste.", bundle: bundle)
        case .tooManyAttempts:
            return tooManyAttempts(bundle)
        case .offline:
            return offline(bundle)
        case .unexpected:
            return String(localized: "emailVerification.error.generic",
                          defaultValue: "La vérification a échoué. Réessayez.", bundle: bundle)
        }
    }

    /// Un lien de connexion ou de vérification ouvert sur l'appareil.
    static func linkMessage(for error: Error, bundle: Bundle = .main) -> String {
        switch EmailProofRefusal.classify(error) {
        case .tooManyAttempts: return tooManyAttempts(bundle)
        case .offline: return offline(bundle)
        default:
            return String(localized: "magicLink.error.invalidLink", defaultValue: "Lien invalide ou expiré", bundle: bundle)
        }
    }

    /// Le renvoi du code.
    static func resendMessage(for error: Error, bundle: Bundle = .main) -> String {
        switch EmailProofRefusal.classify(error) {
        case .tooManyAttempts: return tooManyAttempts(bundle)
        case .offline: return offline(bundle)
        default:
            return String(localized: "emailVerification.error.resendFailed",
                          defaultValue: "Impossible de renvoyer le code de vérification", bundle: bundle)
        }
    }

    /// Le premier envoi du code et du lien (porte « e-mail seul »).
    static func sendMessage(for error: Error, bundle: Bundle = .main) -> String {
        switch EmailProofRefusal.classify(error) {
        case .tooManyAttempts: return tooManyAttempts(bundle)
        case .offline: return offline(bundle)
        default:
            return String(localized: "auth.magiclink.error.generic",
                          defaultValue: "Une erreur est survenue. Veuillez réessayer.", bundle: bundle)
        }
    }

    private static func tooManyAttempts(_ bundle: Bundle) -> String {
        String(localized: "emailVerification.error.tooManyAttempts",
               defaultValue: "Trop de tentatives. Réessayez dans quelques minutes.", bundle: bundle)
    }

    private static func offline(_ bundle: Bundle) -> String {
        String(localized: "emailVerification.error.offline",
               defaultValue: "Pas de connexion. Vérifiez votre réseau et réessayez.", bundle: bundle)
    }
}
