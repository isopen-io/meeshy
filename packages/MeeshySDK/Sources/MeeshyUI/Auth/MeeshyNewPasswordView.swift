import SwiftUI
import Combine
import MeeshySDK

/// **Nouveau mot de passe** — la dernière étape de « Mot de passe oublié »,
/// qu'on en ait eu un ou jamais (#6644).
///
/// On y CHOISIT un mot de passe : rien n'y est « réinitialisé » pour une
/// personne qui n'en a jamais eu, d'où « Enregistrer le mot de passe » et
/// « Mot de passe enregistré ».
///
/// Sortie de `MeeshyForgotPasswordView`, où elle vivait en propriété privée,
/// pour deux raisons. Elle partageait avec l'écran qui la présente son
/// indicateur de chargement et son message d'erreur — une erreur de la
/// recherche par téléphone restait donc affichée sous le formulaire du mot de
/// passe. Et une feuille enfouie derrière trois appels réseau ne se montait
/// nulle part ailleurs : aucun témoin ne pouvait mesurer sa colonne.
public struct MeeshyNewPasswordView: View {
    private let resetToken: String
    private let onSignIn: () -> Void

    @StateObject private var theme = ThemeManager.shared

    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isSaved = false
    @State private var isLoading = false
    @State private var errorMessage: String?

    public init(resetToken: String, onSignIn: @escaping () -> Void) {
        self.resetToken = resetToken
        self.onSignIn = onSignIn
    }

    public var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                VStack(spacing: 20) {
                    if isSaved {
                        savedContent
                    } else {
                        formContent
                    }
                }
                .padding(.top, 20)
                .iPadFormWidth()
            }
            .navigationTitle(String(localized: "auth.forgotPassword.newPasswordTitle", defaultValue: "Nouveau mot de passe", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - Saisie

    @ViewBuilder
    private var formContent: some View {
        AuthTextField(title: String(localized: "auth.forgotPassword.newPassword", defaultValue: "Nouveau mot de passe", bundle: .module), icon: "lock.fill", text: $newPassword, isSecure: true, textContentType: .newPassword)
            .padding(.horizontal, 24)

        PasswordStrengthIndicator(password: newPassword)
            .padding(.horizontal, 24)

        AuthTextField(title: String(localized: "auth.forgotPassword.confirmPassword", defaultValue: "Confirmer le mot de passe", bundle: .module), icon: "lock.fill", text: $confirmPassword, isSecure: true, textContentType: .newPassword)
            .padding(.horizontal, 24)

        if newPassword != confirmPassword && !confirmPassword.isEmpty {
            Text(String(localized: "auth.forgotPassword.passwordMismatch", defaultValue: "Les mots de passe ne correspondent pas", bundle: .module))
                .font(.caption)
                .foregroundStyle(.red)
        }

        if let errorMessage {
            Text(errorMessage)
                .font(.caption)
                .foregroundStyle(.red)
                .padding(.horizontal, 24)
        }

        AuthActionButton(
            title: String(localized: "auth.forgotPassword.reset", defaultValue: "Enregistrer le mot de passe", bundle: .module),
            isLoading: isLoading
        ) {
            await savePassword()
        }
        .accessibilityIdentifier("auth.newPassword.submit")
    }

    // MARK: - Enregistré

    @ViewBuilder
    private var savedContent: some View {
        Image(systemName: "checkmark.circle.fill")
            .font(.system(size: 48))
            .foregroundStyle(.green)
            .accessibilityHidden(true)

        Text(String(localized: "auth.forgotPassword.resetSuccess", defaultValue: "Mot de passe enregistré", bundle: .module))
            .font(.title3.weight(.bold))
            .foregroundStyle(theme.textPrimary)
            .accessibilityAddTraits(.isHeader)

        Button(String(localized: "auth.forgotPassword.login", defaultValue: "Se connecter", bundle: .module)) {
            onSignIn()
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity)
        .background(MeeshyColors.brandPrimary)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .foregroundStyle(.white)
        .padding(.horizontal, 24)
    }

    // MARK: - Envoi

    private func savePassword() async {
        guard newPassword == confirmPassword else {
            errorMessage = String(localized: "auth.forgotPassword.passwordMismatch", defaultValue: "Les mots de passe ne correspondent pas", bundle: .module)
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            struct ResetReq: Encodable { let token: String; let newPassword: String; let confirmPassword: String }
            let _: APIResponse<[String: String]> = try await APIClient.shared.post(
                AuthEndpoint.resetPassword,
                body: ResetReq(token: resetToken, newPassword: newPassword, confirmPassword: confirmPassword)
            )
            isSaved = true
        } catch {
            errorMessage = String(localized: "auth.forgotPassword.resetError", defaultValue: "Le mot de passe n'a pas pu être enregistré", bundle: .module)
        }
        isLoading = false
    }
}
