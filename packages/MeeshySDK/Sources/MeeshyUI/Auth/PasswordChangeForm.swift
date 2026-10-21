import Foundation

/// **Réglages › Sécurité › Mot de passe : CHANGER, ou POSER le premier (#9186).**
///
/// L'inscription rend le mot de passe facultatif (#6424) : un compte né par
/// e-mail seul n'en a pas, et sa seule porte est le lien magique. L'écran
/// exigeait pourtant un « mot de passe actuel » — le bouton restait grisé, et
/// un tel compte ne pouvait jamais en poser un. La passerelle, elle, l'accepte :
/// `PATCH /users/me/password` sans `currentPassword` sur un compte qui n'en a
/// pas, la session servant de preuve.
///
/// `hasPassword` vient de `security.hasPassword` (`GET /auth/me?expand=security`).
/// Tant qu'il est inconnu (`nil` : réponse pas encore là, passerelle ancienne,
/// hors ligne), le formulaire reste celui d'un CHANGEMENT — le cas de presque
/// tous les comptes, et le seul que la passerelle accepte d'un compte qui a un
/// mot de passe. Seul un `false` servi retire le champ.
public nonisolated struct PasswordChangeForm: Equatable, Sendable {

    /// La borne que l'écran affiche (« Minimum 8 caractères »).
    public static let newPasswordMinLength = 8

    public var hasPassword: Bool?
    public var currentPassword: String
    public var newPassword: String
    public var confirmPassword: String

    public init(
        hasPassword: Bool? = nil,
        currentPassword: String = "",
        newPassword: String = "",
        confirmPassword: String = ""
    ) {
        self.hasPassword = hasPassword
        self.currentPassword = currentPassword
        self.newPassword = newPassword
        self.confirmPassword = confirmPassword
    }

    /// Le champ « mot de passe actuel » n'existe que pour un compte qui en a un.
    public var asksCurrentPassword: Bool { hasPassword != false }

    public var meetsMinLength: Bool { newPassword.count >= Self.newPasswordMinLength }

    public var passwordsMatch: Bool { !newPassword.isEmpty && newPassword == confirmPassword }

    public var canSubmit: Bool {
        (!asksCurrentPassword || !currentPassword.isEmpty) && meetsMinLength && passwordsMatch
    }

    /// Ce qui part sous `currentPassword` : rien quand le compte n'en a pas.
    public var submittedCurrentPassword: String? {
        asksCurrentPassword ? currentPassword : nil
    }
}
