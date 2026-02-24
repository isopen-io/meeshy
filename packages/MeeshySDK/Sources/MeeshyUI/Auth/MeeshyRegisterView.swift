import SwiftUI
import MeeshySDK

public struct MeeshyRegisterView: View {
    @ObservedObject private var authManager = AuthManager.shared
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var vm = RegistrationViewModel()

    public var onRegisterSuccess: (() -> Void)?
    public var onBack: (() -> Void)?

    public init(onRegisterSuccess: (() -> Void)? = nil, onBack: (() -> Void)? = nil) {
        self.onRegisterSuccess = onRegisterSuccess
        self.onBack = onBack
    }

    private var stepIndex: Int { vm.currentStep.rawValue }

    public var body: some View {
        ZStack {
            theme.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(spacing: 24) {
                        stepContent
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 20)
                    .padding(.bottom, 100)
                }
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
                    if stepIndex > 0 {
                        vm.previousStep()
                    } else {
                        onBack?()
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(theme.textPrimary)
                }

                Spacer()

                Text("Etape \(stepIndex + 1)/\(vm.totalSteps)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Spacer()

                Color.clear.frame(width: 24, height: 24)
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(theme.inputBorder.opacity(0.3))
                        .frame(height: 4)

                    RoundedRectangle(cornerRadius: 2)
                        .fill(
                            LinearGradient(
                                colors: [vm.currentStep.accentColor, vm.currentStep.accentColor.opacity(0.7)],
                                startPoint: .leading, endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * CGFloat(stepIndex + 1) / CGFloat(vm.totalSteps), height: 4)
                        .animation(.spring(response: 0.4), value: stepIndex)
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
        switch vm.currentStep {
        case .pseudo: stepUsername
        case .phone: stepPhone
        case .email: stepEmail
        case .identity: stepIdentity
        case .password: stepPassword
        case .language: stepLanguages
        case .profile: stepProfile
        case .recap: stepRecap
        }
    }

    // MARK: Step 1 - Username

    @ViewBuilder
    private var stepUsername: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader

            HStack(spacing: 12) {
                Image(systemName: "at")
                    .foregroundStyle(vm.currentStep.accentColor)
                    .frame(width: 20)

                TextField("Nom d'utilisateur", text: $vm.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                validationIcon(
                    isValidating: vm.isValidatingUsername,
                    available: vm.usernameAvailable
                )
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(theme.inputBackground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(
                        validationBorderColor(available: vm.usernameAvailable).opacity(0.5),
                        lineWidth: 1
                    )
            )

            if let error = vm.usernameError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red.opacity(0.8))
                    .padding(.leading, 4)
            }

            if !vm.usernameSuggestions.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Suggestions :")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    FlowLayout(spacing: 6) {
                        ForEach(vm.usernameSuggestions, id: \.self) { suggestion in
                            Button {
                                vm.selectSuggestion(suggestion)
                            } label: {
                                Text(suggestion)
                                    .font(.caption)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(vm.currentStep.accentColor.opacity(0.15))
                                    .clipShape(Capsule())
                                    .foregroundStyle(vm.currentStep.accentColor)
                            }
                        }
                    }
                }
                .padding(.leading, 4)
            }
        }
    }

    // MARK: Step 2 - Phone

    @ViewBuilder
    private var stepPhone: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader

            HStack(spacing: 8) {
                CountryPicker(selectedCountry: $vm.selectedCountry, phoneNumber: $vm.phoneNumber)

                validationIcon(
                    isValidating: vm.isValidatingPhone,
                    available: vm.phoneAvailable
                )
            }

            if let error = vm.phoneError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red.opacity(0.8))
                    .padding(.leading, 4)
            }

            Button {
                vm.skipCurrentStep()
            } label: {
                Text("Passer cette etape")
                    .font(.subheadline)
                    .foregroundStyle(vm.currentStep.accentColor)
            }
        }
    }

    // MARK: Step 3 - Email

    @ViewBuilder
    private var stepEmail: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader

            HStack(spacing: 12) {
                Image(systemName: "envelope.fill")
                    .foregroundStyle(vm.currentStep.accentColor)
                    .frame(width: 20)

                TextField("Email", text: $vm.email)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.emailAddress)

                validationIcon(
                    isValidating: vm.isValidatingEmail,
                    available: vm.emailAvailable
                )
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(theme.inputBackground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(
                        validationBorderColor(available: vm.emailAvailable).opacity(0.5),
                        lineWidth: 1
                    )
            )

            if let error = vm.emailError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red.opacity(0.8))
                    .padding(.leading, 4)
            }
        }
    }

    // MARK: Step 4 - Identity

    @ViewBuilder
    private var stepIdentity: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader

            AuthTextField(
                title: "Prenom",
                icon: "person.fill",
                text: $vm.firstName,
                autocapitalization: .words
            )

            AuthTextField(
                title: "Nom",
                icon: "person.fill",
                text: $vm.lastName,
                autocapitalization: .words
            )
        }
    }

    // MARK: Step 5 - Password

    @ViewBuilder
    private var stepPassword: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader

            AuthTextField(
                title: "Mot de passe",
                icon: "lock.fill",
                text: $vm.password,
                isSecure: true
            )

            PasswordStrengthIndicator(password: vm.password)

            AuthTextField(
                title: "Confirmer le mot de passe",
                icon: "lock.fill",
                text: $vm.confirmPassword,
                isSecure: true
            )

            if !vm.confirmPassword.isEmpty && vm.password != vm.confirmPassword {
                Text("Les mots de passe ne correspondent pas")
                    .font(.caption)
                    .foregroundStyle(.red.opacity(0.8))
            }

            if !vm.confirmPassword.isEmpty && vm.password == vm.confirmPassword && vm.password.count >= 8 {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .font(.caption)
                    Text("Les mots de passe correspondent")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
            }
        }
    }

    // MARK: Step 6 - Languages

    @ViewBuilder
    private var stepLanguages: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader

            LanguageSelector(title: "Langue systeme", selectedId: $vm.systemLanguage)
            LanguageSelector(title: "Langue regionale", selectedId: $vm.regionalLanguage)
        }
    }

    // MARK: Step 7 - Profile

    @ViewBuilder
    private var stepProfile: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader

            VStack(alignment: .leading, spacing: 6) {
                Text("Bio")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                TextEditor(text: $vm.bio)
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
                vm.skipCurrentStep()
            } label: {
                Text("Passer cette etape")
                    .font(.subheadline)
                    .foregroundStyle(vm.currentStep.accentColor)
            }
        }
    }

    // MARK: Step 8 - Recap

    @ViewBuilder
    private var stepRecap: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader

            VStack(spacing: 12) {
                ForEach(Array(vm.summaryItems.enumerated()), id: \.offset) { _, item in
                    recapRow(icon: item.icon, label: item.label, value: item.value)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.inputBackground)
            )

            HStack(alignment: .top, spacing: 12) {
                Button {
                    vm.acceptTerms.toggle()
                } label: {
                    Image(systemName: vm.acceptTerms ? "checkmark.square.fill" : "square")
                        .foregroundStyle(vm.acceptTerms ? vm.currentStep.accentColor : .secondary)
                        .font(.title3)
                }

                Text("J'accepte les conditions d'utilisation et la politique de confidentialite de Meeshy.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let error = vm.errorMessage {
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
                if stepIndex > 0 {
                    Button {
                        vm.previousStep()
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
                    if vm.currentStep == .recap {
                        Task {
                            await vm.register()
                            if authManager.isAuthenticated {
                                onRegisterSuccess?()
                            }
                        }
                    } else {
                        vm.nextStep()
                    }
                } label: {
                    HStack {
                        if vm.isLoading {
                            ProgressView().tint(.white)
                        } else {
                            Text(vm.currentStep == .recap ? "Creer mon compte" : "Continuer")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        LinearGradient(
                            colors: [vm.currentStep.accentColor, vm.currentStep.accentColor.opacity(0.7)],
                            startPoint: .leading, endPoint: .trailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(.white)
                }
                .disabled(!vm.canProceed || vm.isLoading)
                .opacity(vm.canProceed ? 1 : 0.5)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(theme.backgroundPrimary.opacity(0.95))
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private var stepHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: vm.currentStep.iconName)
                .font(.title)
                .foregroundStyle(vm.currentStep.accentColor)

            Text(vm.currentStep.funHeader)
                .font(.title2.weight(.bold))
                .foregroundStyle(theme.textPrimary)

            Text(vm.currentStep.funSubtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func validationIcon(isValidating: Bool, available: Bool?) -> some View {
        if isValidating {
            ProgressView()
                .scaleEffect(0.8)
        } else if let available {
            Image(systemName: available ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(available ? .green : .red)
        }
    }

    private func validationBorderColor(available: Bool?) -> Color {
        guard let available else { return theme.inputBorder }
        return available ? .green : .red
    }

    @ViewBuilder
    private func recapRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(vm.currentStep.accentColor)
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

