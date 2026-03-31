import SwiftUI
import MeeshySDK

public struct MeeshyForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var authManager = AuthManager.shared
    @ObservedObject private var theme = ThemeManager.shared

    @State private var mode: RecoveryMode = .email
    @State private var email = ""
    @State private var emailSent = false

    // Phone flow
    @State private var phoneNumber = ""
    @State private var selectedCountry = CountryPicker.countries[0]
    @State private var phoneStep: PhoneStep = .lookup
    @State private var tokenId = ""
    @State private var maskedInfo: MaskedInfo?
    @State private var fullUsername = ""
    @State private var fullEmail = ""
    @State private var verificationCode = ""
    @State private var resetToken = ""

    // Reset password
    @State private var showResetPassword = false
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var resetSuccess = false

    @State private var isLoading = false
    @State private var errorMessage: String?

    enum RecoveryMode: CaseIterable {
        case email, phone

        var label: String {
            switch self {
            case .email: return String(localized: "auth.forgotPassword.modeEmail", defaultValue: "Email", bundle: .module)
            case .phone: return String(localized: "auth.forgotPassword.modePhone", defaultValue: "Telephone", bundle: .module)
            }
        }
    }

    enum PhoneStep {
        case lookup, verifyIdentity, verifyCode
    }

    struct MaskedInfo {
        let displayName: String
        let username: String
        let email: String
    }

    public init() {}

    public var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Mode picker
                        Picker(String(localized: "auth.forgotPassword.modePicker", defaultValue: "Mode", bundle: .module), selection: $mode) {
                            ForEach(RecoveryMode.allCases, id: \.self) { m in
                                Text(m.label).tag(m)
                            }
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal, 24)

                        if mode == .email {
                            emailFlow
                        } else {
                            phoneFlow
                        }
                    }
                    .padding(.top, 20)
                }
            }
            .navigationTitle(String(localized: "auth.forgotPassword.title", defaultValue: "Mot de passe oublie", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "auth.forgotPassword.close", defaultValue: "Fermer", bundle: .module)) { dismiss() }
                }
            }
            .sheet(isPresented: $showResetPassword) {
                resetPasswordSheet
            }
        }
    }

    // MARK: - Email Flow

    @ViewBuilder
    private var emailFlow: some View {
        if emailSent {
            VStack(spacing: 16) {
                Image(systemName: "envelope.badge.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(Color(hex: "4ECDC4"))

                Text(String(localized: "auth.forgotPassword.emailSent", defaultValue: "Email envoye !", bundle: .module))
                    .font(.title3.weight(.bold))
                    .foregroundStyle(theme.textPrimary)

                Text("Si un compte existe avec \(email), un lien de reinitialisation a ete envoye.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)
            }
        } else {
            VStack(spacing: 16) {
                Text(String(localized: "auth.forgotPassword.emailPrompt", defaultValue: "Entrez votre email pour recevoir un lien de reinitialisation.", bundle: .module))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)

                AuthTextField(
                    title: String(localized: "auth.forgotPassword.emailField", defaultValue: "Email", bundle: .module),
                    icon: "envelope.fill",
                    text: $email,
                    keyboardType: .emailAddress
                )
                .padding(.horizontal, 24)

                errorView

                actionButton(String(localized: "auth.forgotPassword.send", defaultValue: "Envoyer", bundle: .module)) {
                    isLoading = true
                    errorMessage = nil
                    let sent = await authManager.requestPasswordReset(email: email)
                    isLoading = false
                    if sent { emailSent = true }
                    else { errorMessage = authManager.errorMessage }
                }
            }
        }
    }

    // MARK: - Phone Flow

    @ViewBuilder
    private var phoneFlow: some View {
        switch phoneStep {
        case .lookup:
            VStack(spacing: 16) {
                Text(String(localized: "auth.forgotPassword.phonePrompt", defaultValue: "Entrez votre numero de telephone pour retrouver votre compte.", bundle: .module))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)

                CountryPicker(selectedCountry: $selectedCountry, phoneNumber: $phoneNumber)
                    .padding(.horizontal, 24)

                errorView

                actionButton(String(localized: "auth.forgotPassword.search", defaultValue: "Rechercher", bundle: .module)) {
                    await phoneLookup()
                }
            }

        case .verifyIdentity:
            VStack(spacing: 16) {
                if let info = maskedInfo {
                    VStack(spacing: 8) {
                        Text(String(localized: "auth.forgotPassword.accountFound", defaultValue: "Compte trouve", bundle: .module))
                            .font(.headline)
                            .foregroundStyle(theme.textPrimary)
                        Text(info.displayName)
                            .foregroundStyle(.secondary)
                        Text(info.username)
                            .foregroundStyle(.secondary)
                        Text(info.email)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(theme.inputBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .padding(.horizontal, 24)
                }

                Text(String(localized: "auth.forgotPassword.verifyIdentityPrompt", defaultValue: "Pour verifier votre identite, entrez votre nom d'utilisateur et email complets.", bundle: .module))
                    .multilineTextAlignment(.center)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)

                AuthTextField(title: String(localized: "auth.forgotPassword.fullUsername", defaultValue: "Nom d'utilisateur complet", bundle: .module), icon: "person.fill", text: $fullUsername)
                    .padding(.horizontal, 24)

                AuthTextField(title: String(localized: "auth.forgotPassword.fullEmail", defaultValue: "Email complet", bundle: .module), icon: "envelope.fill", text: $fullEmail, keyboardType: .emailAddress)
                    .padding(.horizontal, 24)

                errorView

                actionButton(String(localized: "auth.forgotPassword.verify", defaultValue: "Verifier", bundle: .module)) {
                    await phoneVerifyIdentity()
                }
            }

        case .verifyCode:
            VStack(spacing: 16) {
                Text(String(localized: "auth.forgotPassword.smsCodeSent", defaultValue: "Un code SMS a ete envoye a votre telephone.", bundle: .module))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)

                AuthTextField(title: String(localized: "auth.forgotPassword.verificationCode", defaultValue: "Code a 6 chiffres", bundle: .module), icon: "number", text: $verificationCode, keyboardType: .numberPad)
                    .padding(.horizontal, 24)

                errorView

                actionButton(String(localized: "auth.forgotPassword.confirm", defaultValue: "Confirmer", bundle: .module)) {
                    await phoneVerifyCode()
                }
            }
        }
    }

    // MARK: - Reset Password Sheet

    @ViewBuilder
    private var resetPasswordSheet: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                VStack(spacing: 20) {
                    if resetSuccess {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.green)

                        Text(String(localized: "auth.forgotPassword.resetSuccess", defaultValue: "Mot de passe reinitialise !", bundle: .module))
                            .font(.title3.weight(.bold))
                            .foregroundStyle(theme.textPrimary)

                        Button(String(localized: "auth.forgotPassword.login", defaultValue: "Se connecter", bundle: .module)) {
                            showResetPassword = false
                            dismiss()
                        }
                        .padding(.vertical, 14)
                        .frame(maxWidth: .infinity)
                        .background(Color(hex: "4ECDC4"))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 24)
                    } else {
                        AuthTextField(title: String(localized: "auth.forgotPassword.newPassword", defaultValue: "Nouveau mot de passe", bundle: .module), icon: "lock.fill", text: $newPassword, isSecure: true)
                            .padding(.horizontal, 24)

                        PasswordStrengthIndicator(password: newPassword)
                            .padding(.horizontal, 24)

                        AuthTextField(title: String(localized: "auth.forgotPassword.confirmPassword", defaultValue: "Confirmer le mot de passe", bundle: .module), icon: "lock.fill", text: $confirmPassword, isSecure: true)
                            .padding(.horizontal, 24)

                        if newPassword != confirmPassword && !confirmPassword.isEmpty {
                            Text(String(localized: "auth.forgotPassword.passwordMismatch", defaultValue: "Les mots de passe ne correspondent pas", bundle: .module))
                                .font(.caption)
                                .foregroundStyle(.red)
                        }

                        errorView

                        actionButton(String(localized: "auth.forgotPassword.reset", defaultValue: "Reinitialiser", bundle: .module)) {
                            await doResetPassword()
                        }
                    }
                }
                .padding(.top, 20)
            }
            .navigationTitle(String(localized: "auth.forgotPassword.newPasswordTitle", defaultValue: "Nouveau mot de passe", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - Helpers

    @ViewBuilder
    private var errorView: some View {
        if let error = errorMessage {
            Text(error)
                .font(.caption)
                .foregroundStyle(.red)
                .padding(.horizontal, 24)
        }
    }

    @ViewBuilder
    private func actionButton(_ title: String, action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            HStack {
                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    Text(title).fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color(hex: "4ECDC4"))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .foregroundStyle(.white)
        }
        .disabled(isLoading)
        .padding(.horizontal, 24)
    }

    // MARK: - API Calls

    private func phoneLookup() async {
        isLoading = true; errorMessage = nil
        do {
            struct LookupReq: Encodable { let phoneNumber: String; let countryCode: String }
            struct LookupRes: Decodable {
                let tokenId: String
                let maskedUserInfo: MaskedUserInfo
            }
            struct MaskedUserInfo: Decodable {
                let displayName: String; let username: String; let email: String
            }

            let fullPhone = selectedCountry.dialCode + phoneNumber
            let res: APIResponse<LookupRes> = try await APIClient.shared.post(
                endpoint: "/auth/forgot-password/phone/lookup",
                body: LookupReq(phoneNumber: fullPhone, countryCode: selectedCountry.id)
            )
            tokenId = res.data.tokenId
            maskedInfo = MaskedInfo(
                displayName: res.data.maskedUserInfo.displayName,
                username: res.data.maskedUserInfo.username,
                email: res.data.maskedUserInfo.email
            )
            phoneStep = .verifyIdentity
        } catch {
            errorMessage = String(localized: "auth.forgotPassword.noAccountFound", defaultValue: "Aucun compte trouve avec ce numero", bundle: .module)
        }
        isLoading = false
    }

    private func phoneVerifyIdentity() async {
        isLoading = true; errorMessage = nil
        do {
            struct VerifyReq: Encodable { let tokenId: String; let fullUsername: String; let fullEmail: String }
            struct VerifyRes: Decodable { let codeSent: Bool }

            let _: APIResponse<VerifyRes> = try await APIClient.shared.post(
                endpoint: "/auth/forgot-password/phone/verify-identity",
                body: VerifyReq(tokenId: tokenId, fullUsername: fullUsername, fullEmail: fullEmail)
            )
            phoneStep = .verifyCode
        } catch {
            errorMessage = String(localized: "auth.forgotPassword.incorrectInfo", defaultValue: "Informations incorrectes", bundle: .module)
        }
        isLoading = false
    }

    private func phoneVerifyCode() async {
        isLoading = true; errorMessage = nil
        do {
            struct CodeReq: Encodable { let tokenId: String; let code: String }
            struct CodeRes: Decodable { let resetToken: String }

            let res: APIResponse<CodeRes> = try await APIClient.shared.post(
                endpoint: "/auth/forgot-password/phone/verify-code",
                body: CodeReq(tokenId: tokenId, code: verificationCode)
            )
            resetToken = res.data.resetToken
            showResetPassword = true
        } catch {
            errorMessage = String(localized: "auth.forgotPassword.invalidCode", defaultValue: "Code invalide", bundle: .module)
        }
        isLoading = false
    }

    private func doResetPassword() async {
        guard newPassword == confirmPassword else {
            errorMessage = String(localized: "auth.forgotPassword.passwordMismatch", defaultValue: "Les mots de passe ne correspondent pas", bundle: .module)
            return
        }
        isLoading = true; errorMessage = nil
        do {
            struct ResetReq: Encodable { let token: String; let newPassword: String; let confirmPassword: String }
            let _: APIResponse<[String: String]> = try await APIClient.shared.post(
                endpoint: "/auth/reset-password",
                body: ResetReq(token: resetToken, newPassword: newPassword, confirmPassword: confirmPassword)
            )
            resetSuccess = true
        } catch {
            errorMessage = String(localized: "auth.forgotPassword.resetError", defaultValue: "Erreur lors de la reinitialisation", bundle: .module)
        }
        isLoading = false
    }
}
