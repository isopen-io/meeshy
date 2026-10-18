import Foundation
import MeeshySDK

/// **Quand « Mot de passe oublié » a le droit de partir (#10885).**
///
/// Un prédicat par bouton de `MeeshyForgotPasswordView` — Recevoir le lien,
/// Rechercher, Vérifier, Confirmer. Tant qu'il dit non, le bouton est
/// désactivé et AUCUNE requête ne part : une saisie vide ne ferait que recevoir
/// le refus de la passerelle (`services/gateway/src/routes/password-reset.ts`).
///
/// L'e-mail suit la règle de l'inscription (`SignupForm.isEmailValid`, miroir de
/// `isEmailValid` côté web) et le code celle du nouveau mot de passe
/// (`PasswordResetFlow.sanitizedCode`). Le numéro, lui, ne passe PAS la règle
/// anti-faux de l'inscription (`PhonePlausibility`) : il existe déjà sur un
/// compte, peut-être enregistré avant elle, et c'est la passerelle qui dit s'il
/// est connu — on n'exige ici que sa longueur.
public enum ForgotPasswordInput {

    /// La borne basse de l'inscription (« > 8 chiffres ») : un numéro national.
    public static let phoneMinDigits = PhonePlausibility.minDigits

    /// E.164 : quinze chiffres au plus.
    public static let phoneMaxDigits = 15

    /// `fullUsername` : `z.string().min(2)` côté passerelle.
    public static let usernameMinLength = 2

    public static func canRequestLink(email: String) -> Bool {
        SignupForm.isEmailValid(email)
    }

    public static func submittedEmail(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public static func canLookUp(phoneNumber: String) -> Bool {
        (phoneMinDigits...phoneMaxDigits).contains(PhonePlausibility.digitsOnly(phoneNumber).count)
    }

    public static func canVerifyIdentity(fullUsername: String, fullEmail: String) -> Bool {
        let username = fullUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        return username.count >= usernameMinLength && SignupForm.isEmailValid(fullEmail)
    }

    public static func canConfirm(code: String) -> Bool {
        submittedCode(code).count == PasswordResetFlow.codeLength
    }

    public static func submittedCode(_ raw: String) -> String {
        PasswordResetFlow.sanitizedCode(raw)
    }
}
