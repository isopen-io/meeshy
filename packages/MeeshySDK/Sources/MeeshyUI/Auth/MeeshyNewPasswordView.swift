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
    private let service: any PasswordResetProviding
    private let verifiesToken: Bool
    private let onSignIn: () -> Void
    private let onRequestNewLink: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemePalette { ThemePalette(colorScheme: colorScheme) }

    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var secondFactorCode = ""
    @State private var flow: PasswordResetFlow
    @State private var isLoading = false

    /// - Parameters:
    ///   - service: la passerelle — doublée par un aperçu ou un témoin.
    ///   - initialFlow: un état posé d'avance (aperçu DEBUG) ; le jeton n'est
    ///     alors pas revérifié.
    ///   - onRequestNewLink: « Demander un nouveau lien », quand le lien est
    ///     mort ou désactivé par trop de codes faux (#10867).
    public init(
        resetToken: String,
        service: any PasswordResetProviding = AuthService.shared,
        initialFlow: PasswordResetFlow? = nil,
        onRequestNewLink: @escaping () -> Void = {},
        onSignIn: @escaping () -> Void
    ) {
        self.resetToken = resetToken
        self.service = service
        self.verifiesToken = initialFlow == nil
        self.onRequestNewLink = onRequestNewLink
        self.onSignIn = onSignIn
        _flow = State(initialValue: initialFlow ?? PasswordResetFlow())
    }

    public var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: MeeshySpacing.xl) {
                        switch flow.phase {
                        case .form: formContent
                        case .saved: savedContent
                        case .linkInvalid: deadLinkContent(exhausted: false)
                        case .attemptsExhausted: deadLinkContent(exhausted: true)
                        }
                    }
                    .padding(.top, MeeshySpacing.xl)
                    .iPadFormWidth()
                }
            }
            .navigationTitle(String(localized: "auth.forgotPassword.newPasswordTitle", defaultValue: "Nouveau mot de passe", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
        .task { await verifyToken() }
    }

    // MARK: - Saisie

    @ViewBuilder
    private var formContent: some View {
        AuthTextField(title: String(localized: "auth.forgotPassword.newPassword", defaultValue: "Nouveau mot de passe", bundle: .module), icon: "lock.fill", text: $newPassword, isSecure: true, textContentType: .newPassword)
            .padding(.horizontal, MeeshySpacing.xxl)

        PasswordStrengthIndicator(password: newPassword)
            .padding(.horizontal, MeeshySpacing.xxl)

        AuthTextField(title: String(localized: "auth.forgotPassword.confirmPassword", defaultValue: "Confirmer le mot de passe", bundle: .module), icon: "lock.fill", text: $confirmPassword, isSecure: true, textContentType: .newPassword)
            .padding(.horizontal, MeeshySpacing.xxl)

        if newPassword != confirmPassword && !confirmPassword.isEmpty {
            Text(String(localized: "auth.forgotPassword.passwordMismatch", defaultValue: "Les mots de passe ne correspondent pas", bundle: .module))
                .font(.caption)
                .foregroundStyle(.red)
        }

        if flow.requiresSecondFactor {
            secondFactorField
        }

        if let notice = flow.notice {
            Text(Self.text(for: notice))
                .font(.caption)
                .foregroundStyle(.red)
                .multilineTextAlignment(.center)
                .padding(.horizontal, MeeshySpacing.xxl)
                .accessibilityIdentifier("auth.newPassword.notice")
        }

        AuthActionButton(
            title: String(localized: "auth.forgotPassword.reset", defaultValue: "Enregistrer le mot de passe", bundle: .module),
            isLoading: isLoading
        ) {
            await savePassword()
        }
        .disabled(!flow.canSubmit(newPassword: newPassword, confirmPassword: confirmPassword, code: secondFactorCode))
        .accessibilityIdentifier("auth.newPassword.submit")
    }

    @ViewBuilder
    private var secondFactorField: some View {
        AuthTextField(
            title: String(localized: "auth.forgotPassword.code", defaultValue: "Code de vérification", bundle: .module),
            icon: "key.fill",
            text: Binding(
                get: { secondFactorCode },
                set: { secondFactorCode = PasswordResetFlow.sanitizedCode($0) }
            ),
            keyboardType: .numberPad,
            textContentType: .oneTimeCode
        )
        .padding(.horizontal, MeeshySpacing.xxl)
        .accessibilityIdentifier("auth.newPassword.code")

        Text(String(localized: "auth.forgotPassword.code.lead", defaultValue: "Saisissez le code à 6 chiffres de votre application d’authentification.", bundle: .module))
            .font(.caption)
            .foregroundStyle(theme.textSecondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, MeeshySpacing.xxl)
    }

    // MARK: - Enregistré

    @ViewBuilder
    private var savedContent: some View {
        Image(systemName: "checkmark.circle.fill")
            .font(.system(size: MeeshyIconSize.hero))
            .foregroundStyle(.green)
            .accessibilityHidden(true)

        Text(String(localized: "auth.forgotPassword.resetSuccess", defaultValue: "Mot de passe enregistré", bundle: .module))
            .font(.title3.weight(.bold))
            .foregroundStyle(theme.textPrimary)
            .accessibilityAddTraits(.isHeader)

        primaryButton(String(localized: "auth.forgotPassword.login", defaultValue: "Se connecter", bundle: .module), action: onSignIn)
    }

    // MARK: - Lien mort

    @ViewBuilder
    private func deadLinkContent(exhausted: Bool) -> some View {
        Image(systemName: exhausted ? "lock.shield.fill" : "link.badge.plus")
            .font(.system(size: MeeshyIconSize.hero))
            .foregroundStyle(MeeshyColors.error)
            .accessibilityHidden(true)

        Text(exhausted
             ? String(localized: "auth.forgotPassword.exhausted.title", defaultValue: "Trop de codes incorrects", bundle: .module)
             : String(localized: "auth.forgotPassword.invalidLink.title", defaultValue: "Lien invalide ou expiré", bundle: .module))
            .font(.title3.weight(.bold))
            .foregroundStyle(theme.textPrimary)
            .multilineTextAlignment(.center)
            .accessibilityAddTraits(.isHeader)

        Text(exhausted
             ? String(localized: "auth.forgotPassword.exhausted.text", defaultValue: "Par sécurité, ce lien a été désactivé. Demandez-en un nouveau.", bundle: .module)
             : String(localized: "auth.forgotPassword.invalidLink.text", defaultValue: "Demandez un nouveau lien pour choisir votre mot de passe.", bundle: .module))
            .font(.subheadline)
            .foregroundStyle(theme.textSecondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, MeeshySpacing.xxl)

        primaryButton(String(localized: "auth.forgotPassword.invalidLink.action", defaultValue: "Demander un nouveau lien", bundle: .module), action: onRequestNewLink)
            .accessibilityIdentifier("auth.newPassword.requestNewLink")
    }

    private func primaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .padding(.vertical, MeeshySpacing.mdPlus)
            .frame(maxWidth: .infinity)
            .background(MeeshyColors.brandPrimary)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
            .foregroundStyle(.white)
            .padding(.horizontal, MeeshySpacing.xxl)
    }

    // MARK: - Les raisons

    static func text(for notice: PasswordResetFlow.Notice) -> String {
        switch notice {
        case .secondFactorRequired:
            return String(localized: "auth.forgotPassword.error.codeRequired", defaultValue: "Ce compte est protégé : saisissez le code de vérification de votre application d’authentification.", bundle: .module)
        case .secondFactorInvalid:
            return String(localized: "auth.forgotPassword.error.codeInvalid", defaultValue: "Code de vérification incorrect.", bundle: .module)
        case .weakPassword:
            return String(localized: "auth.forgotPassword.error.weak", defaultValue: "Ce mot de passe est trop facile à deviner. Choisissez-en un plus long ou moins prévisible.", bundle: .module)
        case .reusedPassword:
            return String(localized: "auth.forgotPassword.error.reused", defaultValue: "Vous avez déjà utilisé ce mot de passe récemment. Choisissez-en un autre.", bundle: .module)
        case .accountLocked:
            return String(localized: "auth.forgotPassword.error.locked", defaultValue: "Ce compte est temporairement verrouillé. Contactez le support.", bundle: .module)
        case .rateLimited:
            return String(localized: "auth.forgotPassword.error.rateLimited", defaultValue: "Trop de tentatives. Patientez quelques minutes avant de réessayer.", bundle: .module)
        case .offline:
            return String(localized: "auth.forgotPassword.error.offline", defaultValue: "Pas de connexion. Vérifiez votre réseau et réessayez.", bundle: .module)
        case .failed(let reference):
            return String(localized: "auth.forgotPassword.resetError", defaultValue: "Le mot de passe n'a pas pu être enregistré", bundle: .module) + " (\(reference))"
        }
    }

    // MARK: - Réseau

    private func verifyToken() async {
        guard verifiesToken else { return }
        guard let verification = try? await service.verifyResetToken(resetToken) else { return }
        flow = flow.verified(verification)
    }

    private func savePassword() async {
        guard newPassword == confirmPassword else { return }
        isLoading = true
        flow = flow.clearingNotice()
        do {
            try await service.submitPasswordReset(
                token: resetToken,
                newPassword: newPassword,
                twoFactorCode: flow.submittedCode(secondFactorCode)
            )
            flow = flow.resolved(.saved)
        } catch {
            let outcome = PasswordResetOutcome(error: error)
            if outcome == .secondFactorInvalid { secondFactorCode = "" }
            flow = flow.resolved(outcome)
        }
        isLoading = false
    }
}
