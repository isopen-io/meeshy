import SwiftUI
import Combine
import MeeshySDK

/// **Mot de passe oublié — ou jamais eu.** L'écran sert les deux (#6644).
///
/// « La page de récupération de mot de passe doit permettre de setter le mot
/// de passe même si on a jamais eu de mot de passe ! » (directive porteur
/// 2026-09-15). Le lien reçu par e-mail mène au même formulaire qu'on ait
/// oublié son mot de passe ou qu'on n'en ait jamais créé (#6642) ; la phrase
/// dit donc ce qu'on FAIT — choisir un nouveau mot de passe — et un (i)
/// « Jamais eu de mot de passe ? » répond à la personne qui, inscrite par son
/// adresse seule, n'a rien oublié.
///
/// L'état « envoyé » parle les mots de la connexion par e-mail (« E-mail
/// envoyé », « Ouvrez le lien reçu à », « Rien reçu ? ») et en emploie les
/// CLÉS, servies par le catalogue de l'app : les deux écrans disent la même
/// chose, une copie au catalogue du SDK divergerait à la première retouche.
///
/// Sur iPad la colonne se borne à `MeeshyLayout.formMaxWidth`, comme la
/// connexion qui ouvre cette feuille.
public struct MeeshyForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var theme = ThemeManager.shared

    @State private var mode: RecoveryMode = .email
    @State private var email = ""
    @State private var emailSent = false
    /// Le (i) DÉPLIÉ — un seul à la fois, comme à la connexion par e-mail.
    @State private var expandedHint: Hint?

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

    @State private var showResetPassword = false

    @State private var isLoading = false
    @State private var errorMessage: String?

    enum RecoveryMode: CaseIterable {
        case email, phone

        var label: String {
            switch self {
            case .email: return String(localized: "auth.forgotPassword.modeEmail", defaultValue: "E-mail", bundle: .module)
            case .phone: return String(localized: "auth.forgotPassword.modePhone", defaultValue: "Téléphone", bundle: .module)
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

    private enum Hint {
        case neverHadPassword
        case nothingReceived
    }

    public init() {}

    public var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
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
                    .iPadFormWidth()
                }
            }
            .navigationTitle(String(localized: "auth.forgotPassword.title", defaultValue: "Mot de passe oublié", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "auth.forgotPassword.close", defaultValue: "Fermer", bundle: .module)) { dismiss() }
                }
            }
            .sheet(isPresented: $showResetPassword) {
                MeeshyNewPasswordView(resetToken: resetToken) {
                    showResetPassword = false
                    dismiss()
                }
            }
        }
    }

    // MARK: - (i)

    private var neverHadPasswordHint: AuthInfoHint {
        AuthInfoHint(
            text: String(localized: "auth.forgotPassword.noPassword.hint", defaultValue: "Ce même lien vous permet d'en créer un.", bundle: .module),
            buttonLabel: String(localized: "auth.forgotPassword.noPassword.hintLabel", defaultValue: "Jamais eu de mot de passe ?", bundle: .module)
        )
    }

    private var nothingReceivedHint: AuthInfoHint {
        AuthInfoHint(
            text: String(localized: "auth.magiclink.sent.spamHint", defaultValue: "Regardez vos indésirables (spam) : le message peut y être tombé.", bundle: .main),
            buttonLabel: String(localized: "auth.magiclink.sent.hintLabel", defaultValue: "Rien reçu ?", bundle: .main)
        )
    }

    private func expansion(of hint: Hint) -> Binding<Bool> {
        Binding(
            get: { expandedHint == hint },
            set: { expandedHint = $0 ? hint : nil }
        )
    }

    // MARK: - Email Flow

    @ViewBuilder
    private var emailFlow: some View {
        if emailSent {
            emailSentContent
        } else {
            emailInputContent
        }
    }

    private var emailInputContent: some View {
        VStack(spacing: 16) {
            VStack(spacing: MeeshySpacing.xs) {
                Text(String(localized: "auth.forgotPassword.emailPrompt", defaultValue: "Recevez par e-mail un lien pour choisir un nouveau mot de passe.", bundle: .module))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)

                AuthInfoHintButton(
                    hint: neverHadPasswordHint,
                    isExpanded: expansion(of: .neverHadPassword),
                    tint: theme.textMuted,
                    showsLabel: true
                )
                .accessibilityIdentifier("auth.forgotPassword.noPasswordHint")

                AuthInfoHintText(
                    hint: neverHadPasswordHint,
                    isExpanded: expandedHint == .neverHadPassword,
                    color: theme.textMuted,
                    alignment: .center
                )
            }
            .padding(.horizontal, 24)

            AuthTextField(
                title: String(localized: "auth.forgotPassword.emailField", defaultValue: "E-mail", bundle: .module),
                icon: "envelope.fill",
                text: $email,
                keyboardType: .emailAddress
            )
            .padding(.horizontal, 24)

            errorView

            AuthActionButton(
                title: String(localized: "auth.magiclink.send", defaultValue: "Recevoir le lien", bundle: .main),
                isLoading: isLoading
            ) {
                isLoading = true
                errorMessage = nil
                let sent = await authManager.requestPasswordReset(email: email)
                isLoading = false
                if sent {
                    expandedHint = nil
                    emailSent = true
                } else {
                    errorMessage = authManager.errorMessage
                }
            }
            .accessibilityIdentifier("auth.forgotPassword.submit")
        }
    }

    private var emailSentContent: some View {
        VStack(spacing: 16) {
            Image(systemName: "envelope.badge.fill")
                .font(.system(size: 48))
                .foregroundStyle(MeeshyColors.brandPrimary)
                .accessibilityHidden(true)

            Text(String(localized: "auth.magiclink.sent.title", defaultValue: "E-mail envoyé", bundle: .main))
                .font(.title3.weight(.bold))
                .foregroundStyle(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            VStack(spacing: MeeshySpacing.xs) {
                Text(String(localized: "auth.magiclink.sent.subtitle", defaultValue: "Ouvrez le lien reçu à", bundle: .main))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)

                Text(email)
                    .fontWeight(.semibold)
                    .foregroundStyle(MeeshyColors.brandPrimary)
            }
            .accessibilityElement(children: .combine)

            VStack(spacing: MeeshySpacing.xs) {
                AuthInfoHintButton(
                    hint: nothingReceivedHint,
                    isExpanded: expansion(of: .nothingReceived),
                    tint: theme.textMuted,
                    showsLabel: true
                )

                AuthInfoHintText(
                    hint: nothingReceivedHint,
                    isExpanded: expandedHint == .nothingReceived,
                    color: theme.textMuted,
                    alignment: .center
                )
            }
        }
        .padding(.horizontal, 24)
    }

    // MARK: - Phone Flow

    @ViewBuilder
    private var phoneFlow: some View {
        switch phoneStep {
        case .lookup:
            VStack(spacing: 16) {
                Text(String(localized: "auth.forgotPassword.phonePrompt", defaultValue: "Entrez votre numéro de téléphone pour retrouver votre compte.", bundle: .module))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)

                CountryPicker(selectedCountry: $selectedCountry, phoneNumber: $phoneNumber)
                    .padding(.horizontal, 24)

                errorView

                AuthActionButton(
                    title: String(localized: "auth.forgotPassword.search", defaultValue: "Rechercher", bundle: .module),
                    isLoading: isLoading
                ) {
                    await phoneLookup()
                }
            }

        case .verifyIdentity:
            VStack(spacing: 16) {
                if let info = maskedInfo {
                    VStack(spacing: 8) {
                        Text(String(localized: "auth.forgotPassword.accountFound", defaultValue: "Compte trouvé", bundle: .module))
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

                Text(String(localized: "auth.forgotPassword.verifyIdentityPrompt", defaultValue: "Pour vérifier votre identité, entrez votre nom d'utilisateur et votre e-mail complets.", bundle: .module))
                    .multilineTextAlignment(.center)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)

                AuthTextField(title: String(localized: "auth.forgotPassword.fullUsername", defaultValue: "Nom d'utilisateur complet", bundle: .module), icon: "person.fill", text: $fullUsername, textContentType: .username)
                    .padding(.horizontal, 24)

                AuthTextField(title: String(localized: "auth.forgotPassword.fullEmail", defaultValue: "E-mail complet", bundle: .module), icon: "envelope.fill", text: $fullEmail, keyboardType: .emailAddress, textContentType: .emailAddress)
                    .padding(.horizontal, 24)

                errorView

                AuthActionButton(
                    title: String(localized: "auth.forgotPassword.verify", defaultValue: "Vérifier", bundle: .module),
                    isLoading: isLoading
                ) {
                    await phoneVerifyIdentity()
                }
            }

        case .verifyCode:
            VStack(spacing: 16) {
                Text(String(localized: "auth.forgotPassword.smsCodeSent", defaultValue: "Un code SMS a été envoyé à votre téléphone.", bundle: .module))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 24)

                AuthTextField(title: String(localized: "auth.forgotPassword.verificationCode", defaultValue: "Code à 6 chiffres", bundle: .module), icon: "number", text: $verificationCode, keyboardType: .numberPad, textContentType: .oneTimeCode)
                    .padding(.horizontal, 24)

                errorView

                AuthActionButton(
                    title: String(localized: "auth.forgotPassword.confirm", defaultValue: "Confirmer", bundle: .module),
                    isLoading: isLoading
                ) {
                    await phoneVerifyCode()
                }
            }
        }
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
                AuthEndpoint.forgotPasswordPhoneLookup,
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
            errorMessage = String(localized: "auth.forgotPassword.noAccountFound", defaultValue: "Aucun compte trouvé avec ce numéro", bundle: .module)
        }
        isLoading = false
    }

    private func phoneVerifyIdentity() async {
        isLoading = true; errorMessage = nil
        do {
            struct VerifyReq: Encodable { let tokenId: String; let fullUsername: String; let fullEmail: String }
            struct VerifyRes: Decodable { let codeSent: Bool }

            let _: APIResponse<VerifyRes> = try await APIClient.shared.post(
                AuthEndpoint.forgotPasswordPhoneVerifyIdentity,
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
                AuthEndpoint.forgotPasswordPhoneVerifyCode,
                body: CodeReq(tokenId: tokenId, code: verificationCode)
            )
            resetToken = res.data.resetToken
            showResetPassword = true
        } catch {
            errorMessage = String(localized: "auth.forgotPassword.invalidCode", defaultValue: "Code invalide", bundle: .module)
        }
        isLoading = false
    }
}
