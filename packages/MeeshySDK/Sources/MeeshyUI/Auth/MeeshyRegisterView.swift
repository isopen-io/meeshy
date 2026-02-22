import SwiftUI
import MeeshySDK

public struct MeeshyRegisterView: View {
    @ObservedObject private var authManager = AuthManager.shared
    @ObservedObject private var theme = ThemeManager.shared

    @State private var currentStep = 0
    @State private var animateTransition = false

    // Step 1: Username
    @State private var username = ""
    // Step 2: Phone (optional)
    @State private var phoneNumber = ""
    @State private var selectedCountry = CountryPicker.countries[0]
    @State private var skipPhone = false
    // Step 3: Email
    @State private var email = ""
    // Step 4: Identity
    @State private var firstName = ""
    @State private var lastName = ""
    // Step 5: Password
    @State private var password = ""
    @State private var confirmPassword = ""
    // Step 6: Languages
    @State private var systemLanguage = "fr"
    @State private var regionalLanguage = "fr"
    // Step 7: Profile (optional)
    @State private var bio = ""
    // Step 8: Recap

    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var acceptTerms = false

    public var onRegisterSuccess: (() -> Void)?
    public var onBack: (() -> Void)?

    private let totalSteps = 8

    public init(onRegisterSuccess: (() -> Void)? = nil, onBack: (() -> Void)? = nil) {
        self.onRegisterSuccess = onRegisterSuccess
        self.onBack = onBack
    }

    public var body: some View {
        ZStack {
            theme.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Header with progress
                header

                // Step content
                ScrollView {
                    VStack(spacing: 24) {
                        stepContent
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 20)
                    .padding(.bottom, 100)
                }

                // Navigation buttons
                navigationButtons
            }
        }
    }

    // MARK: - Header

    @ViewBuilder
    private var header: some View {
        VStack(spacing: 12) {
            HStack {
                Button {
                    if currentStep > 0 {
                        withAnimation(.spring(response: 0.3)) { currentStep -= 1 }
                    } else {
                        onBack?()
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(theme.textPrimary)
                }

                Spacer()

                Text("Etape \(currentStep + 1)/\(totalSteps)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Spacer()

                // Placeholder for symmetry
                Color.clear.frame(width: 24, height: 24)
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)

            // Progress bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(theme.inputBorder.opacity(0.3))
                        .frame(height: 4)

                    RoundedRectangle(cornerRadius: 2)
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: "4ECDC4"), Color(hex: "45B7D1")],
                                startPoint: .leading, endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * CGFloat(currentStep + 1) / CGFloat(totalSteps), height: 4)
                        .animation(.spring(response: 0.4), value: currentStep)
                }
            }
            .frame(height: 4)
            .padding(.horizontal, 24)
        }
        .padding(.bottom, 8)
    }

    // MARK: - Step Content

    @ViewBuilder
    private var stepContent: some View {
        switch currentStep {
        case 0: stepUsername
        case 1: stepPhone
        case 2: stepEmail
        case 3: stepIdentity
        case 4: stepPassword
        case 5: stepLanguages
        case 6: stepProfile
        case 7: stepRecap
        default: EmptyView()
        }
    }

    // MARK: Step 1 — Username

    @ViewBuilder
    private var stepUsername: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepTitle("Choisissez votre nom d'utilisateur", subtitle: "C'est ainsi que les autres vous verront.")

            UsernameField(username: $username)
        }
    }

    // MARK: Step 2 — Phone

    @ViewBuilder
    private var stepPhone: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepTitle("Numero de telephone", subtitle: "Optionnel. Permet la recuperation du compte.")

            CountryPicker(selectedCountry: $selectedCountry, phoneNumber: $phoneNumber)

            Button {
                skipPhone = true
                phoneNumber = ""
                withAnimation(.spring(response: 0.3)) { currentStep += 1 }
            } label: {
                Text("Passer cette etape")
                    .font(.subheadline)
                    .foregroundStyle(Color(hex: "45B7D1"))
            }
        }
    }

    // MARK: Step 3 — Email

    @ViewBuilder
    private var stepEmail: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepTitle("Adresse email", subtitle: "Requise pour la verification et la recuperation.")

            AuthTextField(
                title: "Email",
                icon: "envelope.fill",
                text: $email,
                keyboardType: .emailAddress
            )
        }
    }

    // MARK: Step 4 — Identity

    @ViewBuilder
    private var stepIdentity: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepTitle("Votre identite", subtitle: "Prenom et nom (visibles sur votre profil).")

            AuthTextField(
                title: "Prenom",
                icon: "person.fill",
                text: $firstName,
                autocapitalization: .words
            )

            AuthTextField(
                title: "Nom",
                icon: "person.fill",
                text: $lastName,
                autocapitalization: .words
            )
        }
    }

    // MARK: Step 5 — Password

    @ViewBuilder
    private var stepPassword: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepTitle("Creez un mot de passe", subtitle: "8 caracteres minimum. Melangez majuscules, minuscules et chiffres.")

            AuthTextField(
                title: "Mot de passe",
                icon: "lock.fill",
                text: $password,
                isSecure: true
            )

            PasswordStrengthIndicator(password: password)

            AuthTextField(
                title: "Confirmer le mot de passe",
                icon: "lock.fill",
                text: $confirmPassword,
                isSecure: true
            )

            if !confirmPassword.isEmpty && password != confirmPassword {
                Text("Les mots de passe ne correspondent pas")
                    .font(.caption)
                    .foregroundStyle(.red.opacity(0.8))
            }
        }
    }

    // MARK: Step 6 — Languages

    @ViewBuilder
    private var stepLanguages: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepTitle("Vos langues", subtitle: "Langue principale et langue regionale pour les traductions.")

            LanguageSelector(title: "Langue systeme", selectedId: $systemLanguage)
            LanguageSelector(title: "Langue regionale", selectedId: $regionalLanguage)
        }
    }

    // MARK: Step 7 — Profile

    @ViewBuilder
    private var stepProfile: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepTitle("Personnalisez votre profil", subtitle: "Optionnel. Vous pourrez modifier cela plus tard.")

            VStack(alignment: .leading, spacing: 6) {
                Text("Bio")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                TextEditor(text: $bio)
                    .frame(height: 100)
                    .scrollContentBackground(.hidden)
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(theme.inputBackground)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .strokeBorder(theme.inputBorder.opacity(0.3), lineWidth: 1)
                    )
            }

            Button {
                withAnimation(.spring(response: 0.3)) { currentStep += 1 }
            } label: {
                Text("Passer cette etape")
                    .font(.subheadline)
                    .foregroundStyle(Color(hex: "45B7D1"))
            }
        }
    }

    // MARK: Step 8 — Recap

    @ViewBuilder
    private var stepRecap: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepTitle("Recapitulatif", subtitle: "Verifiez vos informations avant de creer votre compte.")

            VStack(spacing: 12) {
                recapRow(icon: "at", label: "Utilisateur", value: username)
                recapRow(icon: "envelope.fill", label: "Email", value: email)
                recapRow(icon: "person.fill", label: "Nom", value: "\(firstName) \(lastName)")
                if !phoneNumber.isEmpty {
                    recapRow(icon: "phone.fill", label: "Telephone", value: "\(selectedCountry.dialCode) \(phoneNumber)")
                }
                recapRow(icon: "globe", label: "Langues", value: "\(systemLanguage) / \(regionalLanguage)")
                if !bio.isEmpty {
                    recapRow(icon: "text.quote", label: "Bio", value: bio)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.inputBackground)
            )

            // Terms
            HStack(alignment: .top, spacing: 12) {
                Button {
                    acceptTerms.toggle()
                } label: {
                    Image(systemName: acceptTerms ? "checkmark.square.fill" : "square")
                        .foregroundStyle(acceptTerms ? Color(hex: "4ECDC4") : .secondary)
                        .font(.title3)
                }

                Text("J'accepte les conditions d'utilisation et la politique de confidentialite de Meeshy.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    // MARK: - Navigation Buttons

    @ViewBuilder
    private var navigationButtons: some View {
        VStack(spacing: 0) {
            Divider().background(theme.inputBorder.opacity(0.3))

            HStack(spacing: 12) {
                if currentStep > 0 {
                    Button {
                        withAnimation(.spring(response: 0.3)) { currentStep -= 1 }
                    } label: {
                        Text("Retour")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(
                                RoundedRectangle(cornerRadius: 14)
                                    .strokeBorder(theme.inputBorder.opacity(0.4), lineWidth: 1)
                            )
                            .foregroundStyle(theme.textPrimary)
                    }
                }

                Button {
                    if currentStep == totalSteps - 1 {
                        Task { await submitRegistration() }
                    } else {
                        withAnimation(.spring(response: 0.3)) { currentStep += 1 }
                    }
                } label: {
                    HStack {
                        if isLoading {
                            ProgressView().tint(.white)
                        } else {
                            Text(currentStep == totalSteps - 1 ? "Creer mon compte" : "Continuer")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        LinearGradient(
                            colors: [Color(hex: "4ECDC4"), Color(hex: "45B7D1")],
                            startPoint: .leading, endPoint: .trailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(.white)
                }
                .disabled(!canProceed || isLoading)
                .opacity(canProceed ? 1 : 0.5)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(theme.backgroundPrimary.opacity(0.95))
        }
    }

    // MARK: - Validation

    private var canProceed: Bool {
        switch currentStep {
        case 0: return username.count >= 2 && username.count <= 16
        case 1: return !phoneNumber.isEmpty || skipPhone
        case 2: return email.contains("@") && email.contains(".")
        case 3: return !firstName.isEmpty && !lastName.isEmpty
        case 4: return password.count >= 8 && password == confirmPassword
        case 5: return !systemLanguage.isEmpty
        case 6: return true // Profile is optional
        case 7: return acceptTerms
        default: return false
        }
    }

    // MARK: - Submit

    private func submitRegistration() async {
        isLoading = true
        errorMessage = nil

        let fullPhone = phoneNumber.isEmpty ? nil : selectedCountry.dialCode + phoneNumber

        let request = RegisterRequest(
            username: username,
            password: password,
            firstName: firstName,
            lastName: lastName,
            email: email,
            phoneNumber: fullPhone,
            phoneCountryCode: phoneNumber.isEmpty ? nil : selectedCountry.id,
            systemLanguage: systemLanguage,
            regionalLanguage: regionalLanguage
        )

        await authManager.register(request: request)

        isLoading = false

        if authManager.isAuthenticated {
            onRegisterSuccess?()
        } else {
            errorMessage = authManager.errorMessage ?? "Erreur lors de l'inscription"
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private func stepTitle(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.title2.weight(.bold))
                .foregroundStyle(theme.textPrimary)

            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func recapRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(Color(hex: "4ECDC4"))
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.subheadline)
                    .foregroundStyle(theme.textPrimary)
            }

            Spacer()
        }
    }
}
