import SwiftUI
import MeeshySDK

public struct MeeshyForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var authManager = AuthManager.shared

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

    enum RecoveryMode: String, CaseIterable {
        case email = "Email"
        case phone = "Telephone"
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
                Color(hex: "1E1E2E").ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Mode picker
                        Picker("Mode", selection: $mode) {
                            ForEach(RecoveryMode.allCases, id: \.self) { m in
                                Text(m.rawValue).tag(m)
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
            .navigationTitle("Mot de passe oublie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
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

                Text("Email envoye !")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)

                Text("Si un compte existe avec \(email), un lien de reinitialisation a ete envoye.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)
            }
        } else {
            VStack(spacing: 16) {
                Text("Entrez votre email pour recevoir un lien de reinitialisation.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)

                AuthTextField(
                    title: "Email",
                    icon: "envelope.fill",
                    text: $email,
                    keyboardType: .emailAddress
                )
                .padding(.horizontal, 24)

                errorView

                actionButton("Envoyer") {
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
                Text("Entrez votre numero de telephone pour retrouver votre compte.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)

                CountryPicker(selectedCountry: $selectedCountry, phoneNumber: $phoneNumber)
                    .padding(.horizontal, 24)

                errorView

                actionButton("Rechercher") {
                    await phoneLookup()
                }
            }

        case .verifyIdentity:
            VStack(spacing: 16) {
                if let info = maskedInfo {
                    VStack(spacing: 8) {
                        Text("Compte trouve")
                            .font(.headline)
                            .foregroundStyle(.white)
                        Text(info.displayName)
                            .foregroundStyle(.secondary)
                        Text(info.username)
                            .foregroundStyle(.secondary)
                        Text(info.email)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color(hex: "2D2D40").opacity(0.6))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .padding(.horizontal, 24)
                }

                Text("Pour verifier votre identite, entrez votre nom d'utilisateur et email complets.")
                    .multilineTextAlignment(.center)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)

                AuthTextField(title: "Nom d'utilisateur complet", icon: "person.fill", text: $fullUsername)
                    .padding(.horizontal, 24)

                AuthTextField(title: "Email complet", icon: "envelope.fill", text: $fullEmail, keyboardType: .emailAddress)
                    .padding(.horizontal, 24)

                errorView

                actionButton("Verifier") {
                    await phoneVerifyIdentity()
                }
            }

        case .verifyCode:
            VStack(spacing: 16) {
                Text("Un code SMS a ete envoye a votre telephone.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)

                AuthTextField(title: "Code a 6 chiffres", icon: "number", text: $verificationCode, keyboardType: .numberPad)
                    .padding(.horizontal, 24)

                errorView

                actionButton("Confirmer") {
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
                Color(hex: "1E1E2E").ignoresSafeArea()

                VStack(spacing: 20) {
                    if resetSuccess {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.green)

                        Text("Mot de passe reinitialise !")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(.white)

                        Button("Se connecter") {
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
                        AuthTextField(title: "Nouveau mot de passe", icon: "lock.fill", text: $newPassword, isSecure: true)
                            .padding(.horizontal, 24)

                        PasswordStrengthIndicator(password: newPassword)
                            .padding(.horizontal, 24)

                        AuthTextField(title: "Confirmer le mot de passe", icon: "lock.fill", text: $confirmPassword, isSecure: true)
                            .padding(.horizontal, 24)

                        if newPassword != confirmPassword && !confirmPassword.isEmpty {
                            Text("Les mots de passe ne correspondent pas")
                                .font(.caption)
                                .foregroundStyle(.red)
                        }

                        errorView

                        actionButton("Reinitialiser") {
                            await doResetPassword()
                        }
                    }
                }
                .padding(.top, 20)
            }
            .navigationTitle("Nouveau mot de passe")
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
            errorMessage = "Aucun compte trouve avec ce numero"
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
            errorMessage = "Informations incorrectes"
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
            errorMessage = "Code invalide"
        }
        isLoading = false
    }

    private func doResetPassword() async {
        guard newPassword == confirmPassword else {
            errorMessage = "Les mots de passe ne correspondent pas"
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
            errorMessage = "Erreur lors de la reinitialisation"
        }
        isLoading = false
    }
}
