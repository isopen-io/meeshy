//
//  OnboardingStepViews.swift
//  Meeshy
//
//  v4 - 8 vues d'étapes avec style Meeshy
//  Validation API, suggestions pseudo, conversation exemple
//

import SwiftUI
import PhotosUI

// MARK: - Shared Components

struct GlassTextField: View {
    let icon: String
    let placeholder: String
    @Binding var text: String
    var errorMessage: String? = nil
    let accentColor: Color
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .default
    var isValidating: Bool = false
    var isAvailable: Bool? = nil

    @State private var showPassword = false
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(isFocused ? accentColor : .secondary)
                    .frame(width: 24)

                if isSecure && !showPassword {
                    SecureField(placeholder, text: $text)
                        .font(.system(size: 16))
                        .focused($isFocused)
                } else {
                    TextField(placeholder, text: $text)
                        .font(.system(size: 16))
                        .keyboardType(keyboardType)
                        .focused($isFocused)
                }

                if isSecure {
                    Button(action: { showPassword.toggle() }) {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .font(.system(size: 16))
                            .foregroundColor(.secondary)
                    }
                }

                // Status indicator
                if isValidating {
                    ProgressView()
                        .scaleEffect(0.8)
                } else if let available = isAvailable {
                    Image(systemName: available ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundColor(available ? .green : .red)
                } else if !text.isEmpty && errorMessage == nil {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundColor(.green)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(.systemBackground).opacity(0.8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(
                                isFocused ? accentColor.opacity(0.6) :
                                    (errorMessage != nil ? Color.red.opacity(0.5) : Color(.systemGray4).opacity(0.4)),
                                lineWidth: isFocused ? 2 : 1
                            )
                    )
            )
            .shadow(color: isFocused ? accentColor.opacity(0.1) : .clear, radius: 8, y: 4)

            if let error = errorMessage {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 11))
                    Text(error)
                        .font(.system(size: 12))
                }
                .foregroundColor(.red)
                .padding(.leading, 16)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: isFocused)
    }
}

struct StepIllustration: View {
    let iconName: String
    let accentColor: Color

    var body: some View {
        ZStack {
            Circle()
                .fill(accentColor.opacity(0.12))
                .frame(width: 100, height: 100)
            Image(systemName: iconName)
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(
                    LinearGradient(
                        colors: [accentColor, accentColor.opacity(0.7)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
        }
    }
}

// MARK: - Step 1: Pseudo (with API validation + suggestions)

struct StepPseudoView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @FocusState private var isFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

                GlassTextField(
                    icon: "at",
                    placeholder: "Ton pseudo de boss",
                    text: $viewModel.username,
                    errorMessage: viewModel.usernameError,
                    accentColor: viewModel.currentStep.accentColor,
                    isValidating: viewModel.isValidatingAPI,
                    isAvailable: viewModel.usernameAvailable
                )
                .focused($isFocused)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: viewModel.username) { _, _ in
                    viewModel.validateUsername()
                }

                // Suggestions if username taken
                if !viewModel.usernameSuggestions.isEmpty {
                    suggestionsCard
                }

                tipsCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { isFocused = true }
        }
    }

    private var suggestionsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "lightbulb.max.fill")
                    .foregroundColor(.orange)
                Text("Suggestions disponibles")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.secondary)
            }

            FlowLayout(spacing: 8) {
                ForEach(viewModel.usernameSuggestions, id: \.self) { suggestion in
                    Button(action: {
                        viewModel.selectSuggestion(suggestion)
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }) {
                        Text("@\(suggestion)")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(viewModel.currentStep.accentColor)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill(viewModel.currentStep.accentColor.opacity(0.1))
                                    .overlay(Capsule().stroke(viewModel.currentStep.accentColor.opacity(0.3), lineWidth: 1))
                            )
                    }
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color.orange.opacity(0.08)))
        .transition(.scale.combined(with: .opacity))
    }

    private var tipsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "lightbulb.fill").foregroundColor(.yellow)
                Text("Conseils Meeshy").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                tipRow(icon: "checkmark.circle", text: "3 à 30 caractères, pas d'espaces")
                tipRow(icon: "star", text: "Sois original, c'est ton identité!")
                tipRow(icon: "eye.slash", text: "Pas de données perso dans le pseudo")
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private func tipRow(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 12)).foregroundColor(.green).frame(width: 16)
            Text(text).font(.system(size: 12)).foregroundColor(.secondary)
        }
    }
}

// MARK: - Step 2: Phone (Mandatory)

struct StepPhoneView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @FocusState private var isFocused: Bool
    @State private var showCountryPicker = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

                // Phone input
                HStack(spacing: 10) {
                    // Country code
                    Button(action: { showCountryPicker = true }) {
                        HStack(spacing: 4) {
                            Text(currentCountryFlag)
                            Text(viewModel.phoneCountryCode)
                                .font(.system(size: 15, weight: .medium))
                            Image(systemName: "chevron.down")
                                .font(.system(size: 10))
                        }
                        .foregroundColor(.primary)
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemGray6)))
                    }

                    // Phone number field
                    HStack(spacing: 12) {
                        Image(systemName: "phone")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundColor(isFocused ? viewModel.currentStep.accentColor : .secondary)
                            .frame(width: 24)

                        TextField("Numéro de téléphone", text: $viewModel.phoneNumber)
                            .font(.system(size: 16))
                            .keyboardType(.phonePad)
                            .focused($isFocused)
                            .onChange(of: viewModel.phoneNumber) { _, _ in
                                viewModel.validatePhone()
                            }

                        if viewModel.isValidatingAPI {
                            ProgressView().scaleEffect(0.8)
                        } else if let available = viewModel.phoneAvailable {
                            Image(systemName: available ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .font(.system(size: 18))
                                .foregroundColor(available ? .green : .red)
                        }
                    }
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(.systemBackground).opacity(0.8))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(
                                        isFocused ? viewModel.currentStep.accentColor :
                                            (viewModel.phoneError != nil ? Color.red.opacity(0.5) : Color(.systemGray4).opacity(0.4)),
                                        lineWidth: isFocused ? 2 : 1
                                    )
                            )
                    )
                }

                if let error = viewModel.phoneError {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 11))
                        Text(error).font(.system(size: 12))
                    }
                    .foregroundColor(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 16)
                }

                infoCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { isFocused = true }
        }
        .sheet(isPresented: $showCountryPicker) {
            countryPickerSheet
        }
    }

    private var currentCountryFlag: String {
        viewModel.countryCodes.first { $0.code == viewModel.phoneCountryCode }?.flag ?? "🌍"
    }

    private var infoCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "shield.checkered").foregroundColor(viewModel.currentStep.accentColor)
                Text("Pourquoi c'est obligatoire?").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                tipRow(icon: "checkmark.shield", text: "Vérification de ton identité")
                tipRow(icon: "key.horizontal", text: "Récupération de compte sécurisée")
                tipRow(icon: "bell.badge", text: "Alertes de sécurité importantes")
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private func tipRow(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 12)).foregroundColor(.secondary).frame(width: 16)
            Text(text).font(.system(size: 12)).foregroundColor(.secondary)
        }
    }

    private var countryPickerSheet: some View {
        NavigationView {
            List(viewModel.countryCodes, id: \.code) { country in
                Button(action: {
                    viewModel.phoneCountryCode = country.code
                    showCountryPicker = false
                }) {
                    HStack {
                        Text(country.flag).font(.system(size: 24))
                        Text(country.country).font(.system(size: 15))
                        Spacer()
                        Text(country.code).font(.system(size: 14)).foregroundColor(.secondary)
                        if viewModel.phoneCountryCode == country.code {
                            Image(systemName: "checkmark").foregroundColor(.green)
                        }
                    }
                }
            }
            .navigationTitle("Indicatif pays")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") { showCountryPicker = false }
                }
            }
        }
    }
}

// MARK: - Step 3: Email (with API validation)

struct StepEmailView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @FocusState private var isFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

                GlassTextField(
                    icon: "envelope",
                    placeholder: "ton.email@exemple.com",
                    text: $viewModel.email,
                    errorMessage: viewModel.emailError,
                    accentColor: viewModel.currentStep.accentColor,
                    keyboardType: .emailAddress,
                    isValidating: viewModel.isValidatingAPI,
                    isAvailable: viewModel.emailAvailable
                )
                .focused($isFocused)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: viewModel.email) { _, _ in
                    viewModel.validateEmail()
                }

                tipsCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { isFocused = true }
        }
    }

    private var tipsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "lock.shield.fill").foregroundColor(.green)
                Text("Ton email est protégé").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                tipRow(icon: "checkmark.circle", text: "On ne partage jamais ton email")
                tipRow(icon: "bell", text: "Pour les notifications importantes")
                tipRow(icon: "key", text: "Pour récupérer ton compte si besoin")
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private func tipRow(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 12)).foregroundColor(.green).frame(width: 16)
            Text(text).font(.system(size: 12)).foregroundColor(.secondary)
        }
    }
}

// MARK: - Step 4: Identity (First Name + Last Name)

struct StepIdentityView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @FocusState private var focusedField: Field?

    enum Field { case firstName, lastName }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

                VStack(spacing: 16) {
                    GlassTextField(
                        icon: "person",
                        placeholder: "Ton prénom",
                        text: $viewModel.firstName,
                        errorMessage: viewModel.firstNameError,
                        accentColor: viewModel.currentStep.accentColor
                    )
                    .focused($focusedField, equals: .firstName)
                    .textContentType(.givenName)
                    .onChange(of: viewModel.firstName) { _, _ in
                        viewModel.validateFirstName()
                    }

                    GlassTextField(
                        icon: "person.2",
                        placeholder: "Ton nom de famille",
                        text: $viewModel.lastName,
                        errorMessage: viewModel.lastNameError,
                        accentColor: viewModel.currentStep.accentColor
                    )
                    .focused($focusedField, equals: .lastName)
                    .textContentType(.familyName)
                    .onChange(of: viewModel.lastName) { _, _ in
                        viewModel.validateLastName()
                    }
                }

                tipsCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { focusedField = .firstName }
        }
    }

    private var tipsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "person.crop.circle.badge.checkmark").foregroundColor(viewModel.currentStep.accentColor)
                Text("Ton identité sur Meeshy").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                tipRow(icon: "checkmark.circle", text: "Tes amis pourront te reconnaître")
                tipRow(icon: "eye", text: "Visible sur ton profil")
                tipRow(icon: "person.badge.shield.checkmark", text: "Aide à la vérification")
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private func tipRow(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 12)).foregroundColor(viewModel.currentStep.accentColor).frame(width: 16)
            Text(text).font(.system(size: 12)).foregroundColor(.secondary)
        }
    }
}

// MARK: - Step 5: Password (Password + Confirm in same view)

struct StepPasswordView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @FocusState private var focusedField: Field?

    enum Field { case password, confirm }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

                VStack(spacing: 16) {
                    // Password field
                    GlassTextField(
                        icon: "lock",
                        placeholder: "Ton mot de passe béton",
                        text: $viewModel.password,
                        errorMessage: viewModel.passwordError,
                        accentColor: viewModel.currentStep.accentColor,
                        isSecure: true
                    )
                    .focused($focusedField, equals: .password)
                    .textInputAutocapitalization(.never)
                    .onChange(of: viewModel.password) { _, _ in
                        viewModel.validatePassword()
                    }

                    // Strength indicator
                    if !viewModel.password.isEmpty {
                        strengthIndicator
                    }

                    // Confirm field (appears when password is valid)
                    if viewModel.showConfirmField {
                        GlassTextField(
                            icon: "lock.rotation",
                            placeholder: "Répète ton mot de passe",
                            text: $viewModel.confirmPassword,
                            errorMessage: viewModel.confirmPasswordError,
                            accentColor: viewModel.currentStep.accentColor,
                            isSecure: true
                        )
                        .focused($focusedField, equals: .confirm)
                        .textInputAutocapitalization(.never)
                        .onChange(of: viewModel.confirmPassword) { _, _ in
                            viewModel.validateConfirmPassword()
                        }
                        .transition(.asymmetric(
                            insertion: .move(edge: .top).combined(with: .opacity),
                            removal: .opacity
                        ))

                        // Match indicator
                        if !viewModel.confirmPassword.isEmpty {
                            matchIndicator
                        }
                    }
                }

                requirementsCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { focusedField = .password }
        }
        .onChange(of: viewModel.showConfirmField) { _, show in
            if show {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { focusedField = .confirm }
            }
        }
    }

    private var strengthIndicator: some View {
        VStack(spacing: 8) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(Color(.systemGray5)).frame(height: 8)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(viewModel.passwordStrength.color)
                        .frame(width: geo.size.width * viewModel.passwordStrength.progress, height: 8)
                        .animation(.spring(response: 0.4), value: viewModel.passwordStrength)
                }
            }
            .frame(height: 8)

            HStack {
                Image(systemName: viewModel.passwordStrength.strengthIcon)
                    .font(.system(size: 14))
                    .foregroundColor(viewModel.passwordStrength.color)
                Text(viewModel.passwordStrength.label)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(viewModel.passwordStrength.color)
                Spacer()
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12).fill(viewModel.passwordStrength.color.opacity(0.1)))
    }

    private var matchIndicator: some View {
        HStack(spacing: 10) {
            Image(systemName: viewModel.isConfirmPasswordValid ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.system(size: 20))
                .foregroundColor(viewModel.isConfirmPasswordValid ? .green : .red)
            Text(viewModel.isConfirmPasswordValid ? "Les mots de passe correspondent!" : "Les mots de passe ne correspondent pas")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(viewModel.isConfirmPasswordValid ? .green : .red)
            Spacer()
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12).fill((viewModel.isConfirmPasswordValid ? Color.green : Color.red).opacity(0.1)))
        .transition(.scale.combined(with: .opacity))
    }

    private var requirementsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "shield.lefthalf.filled").foregroundColor(viewModel.currentStep.accentColor)
                Text("Critères de sécurité").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                reqRow(met: viewModel.password.count >= 8, text: "Au moins 8 caractères")
                reqRow(met: viewModel.password.contains(where: { $0.isUppercase }), text: "Une majuscule")
                reqRow(met: viewModel.password.contains(where: { $0.isLowercase }), text: "Une minuscule")
                reqRow(met: viewModel.password.contains(where: { $0.isNumber }), text: "Un chiffre")
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private func reqRow(met: Bool, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: met ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 14)).foregroundColor(met ? .green : .secondary).frame(width: 16)
            Text(text).font(.system(size: 12)).foregroundColor(met ? .primary : .secondary)
        }
    }
}

// MARK: - Step 6: Language (with conversation example)

struct StepLanguageView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @State private var searchText = ""

    var filteredLanguages: [(code: String, name: String, flag: String)] {
        if searchText.isEmpty { return viewModel.availableLanguages }
        return viewModel.availableLanguages.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) || $0.code.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

                // Search
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField("Chercher une langue...", text: $searchText)
                        .font(.system(size: 15))
                    if !searchText.isEmpty {
                        Button(action: { searchText = "" }) {
                            Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                        }
                    }
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemGray6).opacity(0.7)))

                // Language grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(filteredLanguages, id: \.code) { lang in
                        languageCard(lang)
                    }
                }

                // Conversation example
                conversationExampleCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
    }

    private func languageCard(_ lang: (code: String, name: String, flag: String)) -> some View {
        let isSelected = viewModel.primaryLanguage == lang.code
        return Button(action: {
            withAnimation(.spring(response: 0.3)) { viewModel.primaryLanguage = lang.code }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }) {
            HStack(spacing: 10) {
                Text(lang.flag).font(.system(size: 26))
                VStack(alignment: .leading, spacing: 2) {
                    Text(lang.name).font(.system(size: 13, weight: .semibold)).foregroundColor(.primary)
                    Text(lang.code.uppercased()).font(.system(size: 10, weight: .medium)).foregroundColor(.secondary)
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 20)).foregroundColor(viewModel.currentStep.accentColor)
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? viewModel.currentStep.accentColor.opacity(0.15) : Color(.systemBackground).opacity(0.8))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(isSelected ? viewModel.currentStep.accentColor : Color(.systemGray4).opacity(0.4), lineWidth: isSelected ? 2 : 1))
            )
        }
        .buttonStyle(PlainButtonStyle())
    }

    private var conversationExampleCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "bubble.left.and.bubble.right.fill").foregroundColor(viewModel.currentStep.accentColor)
                Text("Comment ça marche").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }

            // Example conversation
            VStack(alignment: .leading, spacing: 10) {
                // Received message (original)
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(Color.blue.opacity(0.2))
                        .frame(width: 32, height: 32)
                        .overlay(Text("JP").font(.system(size: 10, weight: .bold)).foregroundColor(.blue))

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Jean-Pierre")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.secondary)

                        Text("Hello! How are you doing today?")
                            .font(.system(size: 13))
                            .padding(10)
                            .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemGray5)))

                        // Translated
                        HStack(spacing: 4) {
                            Image(systemName: "translate")
                                .font(.system(size: 10))
                                .foregroundColor(viewModel.currentStep.accentColor)
                            Text(translatedExample)
                                .font(.system(size: 12))
                                .foregroundColor(viewModel.currentStep.accentColor)
                        }
                    }
                }

                // Arrow
                HStack {
                    Spacer()
                    Image(systemName: "arrow.down")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                    Spacer()
                }

                // Info text
                Text("Tu reçois le message original + la traduction dans ta langue (\(selectedLanguageName))")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemBackground).opacity(0.6)))
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private var translatedExample: String {
        switch viewModel.primaryLanguage {
        case "fr": return "Salut! Comment ça va aujourd'hui?"
        case "es": return "¡Hola! ¿Cómo estás hoy?"
        case "de": return "Hallo! Wie geht es dir heute?"
        case "pt": return "Olá! Como você está hoje?"
        case "ar": return "مرحبا! كيف حالك اليوم؟"
        case "zh": return "你好！今天你好吗？"
        case "sw": return "Hujambo! Habari yako leo?"
        default: return "Salut! Comment ça va aujourd'hui?"
        }
    }

    private var selectedLanguageName: String {
        viewModel.availableLanguages.first { $0.code == viewModel.primaryLanguage }?.name ?? viewModel.primaryLanguage
    }
}

// MARK: - Step 7: Profile (Optional)

struct StepProfileView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @State private var showPhotoPickerProfile = false
    @State private var showPhotoPickerBanner = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var photoTarget: PhotoTarget = .profile

    enum PhotoTarget { case profile, banner }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Optional badge
                HStack {
                    Image(systemName: "sparkles").foregroundColor(.orange)
                    Text("Cette étape est optionnelle").font(.system(size: 13, weight: .medium)).foregroundColor(.secondary)
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.orange.opacity(0.1)))

                // Profile preview card
                profilePreviewCard

                // Bio input
                VStack(alignment: .leading, spacing: 8) {
                    Text("Bio (optionnel)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.secondary)

                    TextEditor(text: $viewModel.bio)
                        .font(.system(size: 15))
                        .frame(minHeight: 80, maxHeight: 120)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color(.systemBackground).opacity(0.8))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(.systemGray4).opacity(0.4), lineWidth: 1))
                        )

                    Text("\(viewModel.bio.count)/150 caractères")
                        .font(.system(size: 11))
                        .foregroundColor(viewModel.bio.count > 150 ? .red : .secondary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }

                // Summary
                summaryCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
        .photosPicker(isPresented: $showPhotoPickerProfile, selection: $selectedPhotoItem, matching: .images)
        .onChange(of: selectedPhotoItem) { _, item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    if photoTarget == .profile {
                        viewModel.profilePhoto = image
                    } else {
                        viewModel.bannerPhoto = image
                    }
                }
            }
        }
    }

    private var profilePreviewCard: some View {
        VStack(spacing: 0) {
            // Banner
            ZStack(alignment: .bottomTrailing) {
                if let banner = viewModel.bannerPhoto {
                    Image(uiImage: banner)
                        .resizable()
                        .scaledToFill()
                        .frame(height: 100)
                        .clipped()
                } else {
                    LinearGradient(
                        colors: [viewModel.currentStep.accentColor.opacity(0.3), viewModel.currentStep.accentColor.opacity(0.1)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                    .frame(height: 100)
                }

                Button(action: {
                    photoTarget = .banner
                    showPhotoPickerProfile = true
                }) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 12))
                        .foregroundColor(.white)
                        .padding(8)
                        .background(Circle().fill(Color.black.opacity(0.5)))
                }
                .padding(8)
            }

            // Profile photo overlay
            HStack {
                ZStack(alignment: .bottomTrailing) {
                    if let photo = viewModel.profilePhoto {
                        Image(uiImage: photo)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 80, height: 80)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 4))
                    } else {
                        Circle()
                            .fill(viewModel.currentStep.accentColor.opacity(0.2))
                            .frame(width: 80, height: 80)
                            .overlay(
                                Image(systemName: "person.fill")
                                    .font(.system(size: 32))
                                    .foregroundColor(viewModel.currentStep.accentColor.opacity(0.5))
                            )
                            .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 4))
                    }

                    Button(action: {
                        photoTarget = .profile
                        showPhotoPickerProfile = true
                    }) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.white)
                            .padding(6)
                            .background(Circle().fill(viewModel.currentStep.accentColor))
                    }
                }
                .offset(y: -30)
                .padding(.leading, 16)

                Spacer()
            }
            .padding(.bottom, -20)

            // Name display
            VStack(alignment: .leading, spacing: 4) {
                Text("\(viewModel.firstName) \(viewModel.lastName)")
                    .font(.system(size: 18, weight: .bold))
                Text("@\(viewModel.username)")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 12)
        }
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.systemBackground)))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(.systemGray4).opacity(0.3), lineWidth: 1))
    }

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "doc.text").foregroundColor(viewModel.currentStep.accentColor)
                Text("Aperçu de ton profil").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }

            ForEach(viewModel.summaryItems, id: \.label) { item in
                HStack(spacing: 10) {
                    Image(systemName: item.icon)
                        .font(.system(size: 14))
                        .foregroundColor(viewModel.currentStep.accentColor)
                        .frame(width: 20)
                    Text(item.label)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text(item.value)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }
}

// MARK: - Step 8: Complete

struct StepCompleteView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @State private var showTerms = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                if viewModel.registrationComplete {
                    successView
                } else {
                    summaryView
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
        .sheet(isPresented: $showTerms) {
            termsSheet
        }
    }

    private var successView: some View {
        VStack(spacing: 20) {
            ZStack {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .stroke(Color.green.opacity(0.3 - Double(i) * 0.1), lineWidth: 2)
                        .frame(width: 100 + CGFloat(i) * 30)
                        .scaleEffect(1.2)
                        .opacity(0)
                        .animation(.easeOut(duration: 1.5).repeatForever(autoreverses: false).delay(Double(i) * 0.3), value: viewModel.registrationComplete)
                }
                Circle().fill(Color.green.opacity(0.15)).frame(width: 100, height: 100)
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 50))
                    .foregroundColor(.green)
            }

            Text("Bienvenue \(viewModel.firstName)!")
                .font(.system(size: 24, weight: .bold, design: .rounded))

            Text("Tu es officiellement un Meeshyer!\nOn est ensemble!")
                .font(.system(size: 15))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            VStack(spacing: 10) {
                featureRow(icon: "message.fill", text: "Chatter avec le monde")
                featureRow(icon: "waveform", text: "Messages vocaux")
                featureRow(icon: "translate", text: "Traduction automatique")
            }
            .padding(.top, 10)
        }
    }

    private func featureRow(icon: String, text: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 18)).foregroundColor(.green).frame(width: 28)
            Text(text).font(.system(size: 14)).foregroundColor(.primary)
            Spacer()
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.green.opacity(0.1)))
    }

    private var summaryView: some View {
        VStack(spacing: 20) {
            StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

            // Summary card
            VStack(spacing: 14) {
                HStack {
                    Image(systemName: "doc.text.fill").foregroundColor(viewModel.currentStep.accentColor)
                    Text("Récapitulatif").font(.system(size: 16, weight: .semibold))
                    Spacer()
                }

                ForEach(viewModel.summaryItems, id: \.label) { item in
                    summaryRow(icon: item.icon, label: item.label, value: item.value)
                }

                summaryRow(icon: "lock.shield", label: "Mot de passe", value: String(repeating: "•", count: min(viewModel.password.count, 10)))
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemBackground).opacity(0.9))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(viewModel.currentStep.accentColor.opacity(0.3), lineWidth: 1))
            )

            termsCheckbox
        }
    }

    private func summaryRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 14)).foregroundColor(viewModel.currentStep.accentColor).frame(width: 20)
            Text(label).font(.system(size: 13)).foregroundColor(.secondary)
            Spacer()
            Text(value).font(.system(size: 13, weight: .medium)).foregroundColor(.primary).lineLimit(1)
        }
    }

    private var termsCheckbox: some View {
        Button(action: {
            withAnimation(.spring(response: 0.3)) { viewModel.acceptedTerms.toggle() }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(viewModel.acceptedTerms ? Color.green : Color(.systemGray3), lineWidth: 2)
                        .frame(width: 24, height: 24)
                    if viewModel.acceptedTerms {
                        RoundedRectangle(cornerRadius: 6).fill(Color.green).frame(width: 24, height: 24)
                        Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundColor(.white)
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("J'accepte les conditions d'utilisation et la politique de confidentialité")
                        .font(.system(size: 13)).foregroundColor(.primary).multilineTextAlignment(.leading)
                    Button(action: { showTerms = true }) {
                        Text("Lire les conditions").font(.system(size: 12, weight: .medium)).foregroundColor(viewModel.currentStep.accentColor)
                    }
                }
                Spacer()
            }
        }
        .buttonStyle(PlainButtonStyle())
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private var termsSheet: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Conditions d'utilisation").font(.title2.bold())
                    Text("""
                    Bienvenue sur Meeshy! En utilisant notre application, tu acceptes les conditions suivantes:

                    1. UTILISATION RESPONSABLE
                    Meeshy est fait pour connecter les gens positivement. Pas de contenu offensant ou illégal.

                    2. TON COMPTE
                    Tu es responsable de ton compte. Garde ton mot de passe secret!

                    3. TES DONNÉES
                    On protège tes données avec le chiffrement de bout en bout. Tes messages sont privés.

                    4. TRADUCTION
                    La traduction est automatique et peut ne pas être parfaite. C'est un outil, pas une science exacte!

                    5. RESPECT
                    Traite les autres comme tu voudrais être traité. On est une communauté!

                    On est ensemble!
                    """)
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                }
                .padding(20)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") { showTerms = false }
                }
            }
        }
    }
}

// MARK: - Flow Layout Helper

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.width ?? 0, subviews: subviews, spacing: spacing)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x, y: bounds.minY + result.positions[index].y), proposal: .unspecified)
        }
    }

    struct FlowResult {
        var size: CGSize = .zero
        var positions: [CGPoint] = []

        init(in width: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var x: CGFloat = 0
            var y: CGFloat = 0
            var lineHeight: CGFloat = 0

            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)
                if x + size.width > width && x > 0 {
                    x = 0
                    y += lineHeight + spacing
                    lineHeight = 0
                }
                positions.append(CGPoint(x: x, y: y))
                lineHeight = max(lineHeight, size.height)
                x += size.width + spacing
            }
            self.size = CGSize(width: width, height: y + lineHeight)
        }
    }
}

// MARK: - Previews

#Preview("Step 1 - Pseudo") {
    StepPseudoView(viewModel: RegistrationViewModel())
}

#Preview("Step 6 - Language") {
    StepLanguageView(viewModel: RegistrationViewModel())
}

#Preview("Step 8 - Complete") {
    StepCompleteView(viewModel: RegistrationViewModel())
}
