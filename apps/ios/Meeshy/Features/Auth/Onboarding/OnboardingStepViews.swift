import SwiftUI
import Combine
import PhotosUI
import MeeshySDK
import MeeshyUI

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
                    .font(.title3.weight(.medium))
                    .foregroundColor(isFocused ? accentColor : .secondary)
                    .frame(width: 24)

                if isSecure && !showPassword {
                    SecureField(placeholder, text: $text)
                        .font(.callout)
                        .focused($isFocused)
                } else {
                    TextField(placeholder, text: $text)
                        .font(.callout)
                        .keyboardType(keyboardType)
                        .focused($isFocused)
                }

                if isSecure {
                    Button(action: { showPassword.toggle() }) {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .font(.callout)
                            .foregroundColor(.secondary)
                    }
                    .accessibilityLabel(String(localized: "onboarding.password.toggleVisibility",
                                                defaultValue: "Toggle password visibility", bundle: .main))
                }

                if isValidating {
                    ProgressView().scaleEffect(0.8)
                } else if let available = isAvailable {
                    Image(systemName: available ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.title3)
                        .foregroundColor(available ? MeeshyColors.success : MeeshyColors.error)
                } else if !text.isEmpty && errorMessage == nil {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundColor(MeeshyColors.success)
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
                                    (errorMessage != nil ? MeeshyColors.error.opacity(0.5) : Color(.systemGray4).opacity(0.4)),
                                lineWidth: isFocused ? 2 : 1
                            )
                    )
            )
            .shadow(color: isFocused ? accentColor.opacity(0.1) : .clear, radius: 8, y: 4)
            .bounceOnFocus(isFocused)

            if let error = errorMessage {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle.fill").font(.caption2)
                    Text(error).font(.caption)
                }
                .foregroundColor(MeeshyColors.error)
                .padding(.leading, 16)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: isFocused)
    }
}

// MARK: - Step Illustration

struct StepIllustration: View {
    let iconName: String
    let accentColor: Color

    var body: some View {
        ZStack {
            Circle()
                .fill(accentColor.opacity(0.12))
                .frame(width: 100, height: 100)
            // Glyphe héros décoratif ≥40pt dans un cercle fixe 100×100 : figé (doctrine 74i/86i) ; le ZStack est masqué VoiceOver
            Image(systemName: iconName)
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(
                    LinearGradient(
                        colors: [accentColor, accentColor.opacity(0.7)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Flow Layout

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

// MARK: - Step 1: Pseudo

struct StepPseudoView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @FocusState private var isFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

                GlassTextField(
                    icon: "at",
                    placeholder: String(localized: "onboarding.step.pseudo.placeholder", defaultValue: "Your cool username", bundle: .main),
                    text: $viewModel.username,
                    errorMessage: viewModel.usernameError,
                    accentColor: viewModel.currentStep.accentColor,
                    isValidating: viewModel.isValidatingUsername,
                    isAvailable: viewModel.usernameAvailable
                )
                .focused($isFocused)
                // AutoFill : c'est l'identifiant que iOS associera au mot de
                // passe généré à l'étape suivante. Sans lui, rien n'est proposé
                // à l'enregistrement au trousseau en fin d'inscription.
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

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
                Image(systemName: "lightbulb.max.fill").foregroundColor(MeeshyColors.warning)
                Text(String(localized: "onboarding.step.pseudo.suggestions", defaultValue: "Available suggestions", bundle: .main))
                    .font(.footnote.weight(.semibold)).foregroundColor(.secondary)
            }
            FlowLayout(spacing: 8) {
                ForEach(viewModel.usernameSuggestions, id: \.self) { suggestion in
                    Button(action: {
                        viewModel.selectSuggestion(suggestion)
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }) {
                        Text("@\(suggestion)")
                            .font(.footnote.weight(.medium))
                            .foregroundColor(viewModel.currentStep.accentColor)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill(viewModel.currentStep.accentColor.opacity(0.1))
                                    .overlay(Capsule().stroke(viewModel.currentStep.accentColor.opacity(0.3), lineWidth: 1))
                            )
                    }
                    .bounceOnTap(scale: 0.9)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(MeeshyColors.warning.opacity(0.08)))
        .transition(.scale.combined(with: .opacity))
    }

    private var tipsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "lightbulb.fill").foregroundColor(MeeshyColors.warning)
                Text(String(localized: "onboarding.step.pseudo.tips.title", defaultValue: "Meeshy Tips", bundle: .main)).font(.footnote.weight(.semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                tipRow(icon: "checkmark.circle", text: String(localized: "onboarding.step.pseudo.tips.length", defaultValue: "2 to 16 characters, no spaces", bundle: .main))
                tipRow(icon: "star", text: String(localized: "onboarding.step.pseudo.tips.original", defaultValue: "Be original, it's your identity!", bundle: .main))
                tipRow(icon: "eye.slash", text: String(localized: "onboarding.step.pseudo.tips.privacy", defaultValue: "No personal data in your username", bundle: .main))
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private func tipRow(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.caption).foregroundColor(MeeshyColors.success).frame(width: 16)
            Text(text).font(.caption).foregroundColor(.secondary)
        }
    }
}

// MARK: - Step 2: Phone

struct StepPhoneView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @FocusState private var isFocused: Bool
    @State private var showCountryPicker = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

                HStack(spacing: 10) {
                    Button(action: { showCountryPicker = true }) {
                        HStack(spacing: 4) {
                            Text(viewModel.selectedCountry.flag)
                            Text(viewModel.selectedCountry.dialCode)
                                .font(.subheadline.weight(.medium))
                            Image(systemName: "chevron.down")
                                .font(.caption2)
                        }
                        .foregroundColor(.primary)
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemGray6)))
                    }
                    .bounceOnTap()

                    HStack(spacing: 12) {
                        Image(systemName: "phone")
                            .font(.title3.weight(.medium))
                            .foregroundColor(isFocused ? viewModel.currentStep.accentColor : .secondary)
                            .frame(width: 24)

                        TextField(viewModel.phonePlaceholder, text: $viewModel.phoneNumber)
                            .font(.callout)
                            .keyboardType(.phonePad)
                            .focused($isFocused)

                        if viewModel.isValidatingPhone {
                            ProgressView().scaleEffect(0.8)
                        } else if let available = viewModel.phoneAvailable {
                            Image(systemName: available ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .font(.title3)
                                .foregroundColor(available ? MeeshyColors.success : MeeshyColors.error)
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
                                            (viewModel.phoneError != nil ? MeeshyColors.error.opacity(0.5) : Color(.systemGray4).opacity(0.4)),
                                        lineWidth: isFocused ? 2 : 1
                                    )
                            )
                    )
                    .bounceOnFocus(isFocused)
                }

                if let error = viewModel.phoneError {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill").font(.caption2)
                        Text(error).font(.caption)
                    }
                    .foregroundColor(MeeshyColors.error)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 16)
                }

                if viewModel.phoneBelongsToExistingAccount {
                    recoveryHintCard
                }

                Button(action: { viewModel.skipCurrentStep() }) {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.right.circle").font(.subheadline)
                        Text(String(localized: "onboarding.skip-step", defaultValue: "Passer cette etape", bundle: .main))
                            .font(.subheadline.weight(.medium))
                    }
                    .foregroundColor(.secondary)
                }
                .accessibilityLabel(String(localized: "onboarding.step.skip",
                                            defaultValue: "Skip step", bundle: .main))
                .bounceOnTap(scale: 0.94)

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

    private var infoCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "info.circle").foregroundColor(viewModel.currentStep.accentColor)
                Text(String(localized: "onboarding.step.phone.why", defaultValue: "Pourquoi ton numéro?", bundle: .main)).font(.footnote.weight(.semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                tipRow(icon: "key.horizontal", text: String(localized: "onboarding.step.phone.tip.recovery", defaultValue: "Récupération de compte sécurisée", bundle: .main))
                tipRow(icon: "person.badge.shield.checkmark", text: String(localized: "onboarding.step.phone.tip.unique", defaultValue: "Un seul compte par numéro — tes engagements sont protégés", bundle: .main))
                tipRow(icon: "person.2.wave.2", text: String(localized: "onboarding.step.phone.tip.friends", defaultValue: "Tes proches qui ont ton numéro te retrouvent", bundle: .main))
                tipRow(icon: "hand.raised", text: String(localized: "onboarding.step.phone.tip.optional", defaultValue: "Optionnel, tu peux passer", bundle: .main))
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private func tipRow(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.caption).foregroundColor(.secondary).frame(width: 16)
            Text(text).font(.caption).foregroundColor(.secondary)
        }
    }

    @ViewBuilder
    private var recoveryHintCard: some View {
        let recover = viewModel.phoneRecoverySuggested
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: recover ? "person.badge.key.fill" : "info.circle")
                    .foregroundColor(recover ? MeeshyColors.warning : viewModel.currentStep.accentColor)
                Text(recover
                     ? String(localized: "onboarding.step.phone.recovery.title", defaultValue: "On dirait ton ancien compte", bundle: .main)
                     : String(localized: "onboarding.step.phone.existing.title", defaultValue: "Ce numéro est déjà lié à un compte", bundle: .main))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.primary)
            }
            Text(recover
                 ? String(localized: "onboarding.step.phone.recovery.body", defaultValue: "Ce numéro appartient à un compte inactif dont le nom te ressemble. Depuis l'écran de connexion, choisis « Mot de passe oublié » pour le récupérer plutôt que d'en créer un nouveau.", bundle: .main)
                 : String(localized: "onboarding.step.phone.existing.body", defaultValue: "Si c'est le tien, récupère-le depuis « Mot de passe oublié » sur l'écran de connexion. Sinon, saisis un autre numéro ou passe cette étape.", bundle: .main))
                .font(.caption)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill((recover ? MeeshyColors.warning : viewModel.currentStep.accentColor).opacity(0.1))
        )
    }

    private var countryPickerSheet: some View {
        NavigationStack {
            List(CountryPicker.countries) { country in
                Button(action: {
                    viewModel.selectedCountry = country
                    showCountryPicker = false
                }) {
                    HStack {
                        Text(country.flag).font(MeeshyFont.relative(24))
                        Text(country.name).font(.subheadline)
                        Spacer()
                        Text(country.dialCode).font(.subheadline).foregroundColor(.secondary)
                        if viewModel.selectedCountry.id == country.id {
                            Image(systemName: "checkmark").foregroundColor(MeeshyColors.success)
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "onboarding.step.phone.country-picker.title", defaultValue: "Indicatif pays", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) { showCountryPicker = false }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Step 3: Email

struct StepEmailView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @FocusState private var isFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

                GlassTextField(
                    icon: "envelope",
                    placeholder: String(localized: "onboarding.step.email.placeholder", defaultValue: "ton.email@exemple.com", bundle: .main),
                    text: $viewModel.email,
                    errorMessage: viewModel.emailError,
                    accentColor: viewModel.currentStep.accentColor,
                    keyboardType: .emailAddress,
                    isValidating: viewModel.isValidatingEmail,
                    isAvailable: viewModel.emailAvailable
                )
                .focused($isFocused)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

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
                Image(systemName: "lock.shield.fill").foregroundColor(MeeshyColors.success)
                Text(String(localized: "onboarding.step.email.protected.title", defaultValue: "Ton email est protege", bundle: .main)).font(.footnote.weight(.semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                tipRow(icon: "checkmark.circle", text: String(localized: "onboarding.step.email.tip.privacy", defaultValue: "On ne partage jamais ton email", bundle: .main))
                tipRow(icon: "bell", text: String(localized: "onboarding.step.email.tip.notifications", defaultValue: "Pour les notifications importantes", bundle: .main))
                tipRow(icon: "key", text: String(localized: "onboarding.step.email.tip.recovery", defaultValue: "Pour recuperer ton compte si besoin", bundle: .main))
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private func tipRow(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.caption).foregroundColor(MeeshyColors.success).frame(width: 16)
            Text(text).font(.caption).foregroundColor(.secondary)
        }
    }
}

// MARK: - Step 4: Identity

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
                        placeholder: String(localized: "onboarding.step.identity.first-name", defaultValue: "Ton prenom", bundle: .main),
                        text: $viewModel.firstName,
                        accentColor: viewModel.currentStep.accentColor
                    )
                    .focused($focusedField, equals: .firstName)
                    .textContentType(.givenName)

                    GlassTextField(
                        icon: "person.2",
                        placeholder: String(localized: "onboarding.step.identity.last-name", defaultValue: "Ton nom de famille", bundle: .main),
                        text: $viewModel.lastName,
                        accentColor: viewModel.currentStep.accentColor
                    )
                    .focused($focusedField, equals: .lastName)
                    .textContentType(.familyName)
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
                Text(String(localized: "onboarding.step.identity.title", defaultValue: "Ton identite sur Meeshy", bundle: .main)).font(.footnote.weight(.semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                tipRow(icon: "checkmark.circle", text: String(localized: "onboarding.step.identity.tip.recognize", defaultValue: "Tes amis pourront te reconnaitre", bundle: .main))
                tipRow(icon: "eye", text: String(localized: "onboarding.step.identity.tip.profile", defaultValue: "Visible sur ton profil", bundle: .main))
                tipRow(icon: "person.badge.shield.checkmark", text: String(localized: "onboarding.step.identity.tip.verification", defaultValue: "Aide a la verification", bundle: .main))
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private func tipRow(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.caption).foregroundColor(viewModel.currentStep.accentColor).frame(width: 16)
            Text(text).font(.caption).foregroundColor(.secondary)
        }
    }
}

// MARK: - Step 5: Password

struct StepPasswordView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @FocusState private var focusedField: Field?

    enum Field { case password, confirm }

    private var passwordStrength: PasswordStrength {
        PasswordStrength.evaluate(viewModel.password)
    }

    private var passwordsMatch: Bool {
        !viewModel.confirmPassword.isEmpty && viewModel.password == viewModel.confirmPassword
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

                VStack(spacing: 16) {
                    GlassTextField(
                        icon: "lock",
                        placeholder: String(localized: "onboarding.step.password.placeholder", defaultValue: "Ton mot de passe beton", bundle: .main),
                        text: $viewModel.password,
                        accentColor: viewModel.currentStep.accentColor,
                        isSecure: true
                    )
                    .focused($focusedField, equals: .password)
                    // `.newPassword` déclenche la proposition de mot de passe
                    // fort ET, à la fin du flux, la boîte « Enregistrer ce mot
                    // de passe ? » du trousseau. Sans lui, l'inscription ne
                    // laissait aucune trace dans le gestionnaire.
                    .textContentType(.newPassword)
                    .textInputAutocapitalization(.never)

                    if !viewModel.password.isEmpty {
                        PasswordStrengthBar(strength: passwordStrength)
                    }

                    if viewModel.password.count >= 8 {
                        GlassTextField(
                            icon: "lock.rotation",
                            placeholder: String(localized: "onboarding.step.password.confirm-placeholder", defaultValue: "Repete ton mot de passe", bundle: .main),
                            text: $viewModel.confirmPassword,
                            errorMessage: (!viewModel.confirmPassword.isEmpty && !passwordsMatch) ? String(localized: "onboarding.step.password.mismatch", defaultValue: "Les mots de passe ne correspondent pas", bundle: .main) : nil,
                            accentColor: viewModel.currentStep.accentColor,
                            isSecure: true
                        )
                        .focused($focusedField, equals: .confirm)
                        .textContentType(.newPassword)
                        .textInputAutocapitalization(.never)
                        .transition(.asymmetric(
                            insertion: .move(edge: .top).combined(with: .opacity),
                            removal: .opacity
                        ))

                        if !viewModel.confirmPassword.isEmpty {
                            HStack(spacing: 10) {
                                Image(systemName: passwordsMatch ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .font(MeeshyFont.relative(20))
                                    .foregroundColor(passwordsMatch ? MeeshyColors.success : MeeshyColors.error)
                                Text(passwordsMatch ? String(localized: "onboarding.step.password.match", defaultValue: "Les mots de passe correspondent!", bundle: .main) : String(localized: "onboarding.step.password.mismatch", defaultValue: "Les mots de passe ne correspondent pas", bundle: .main))
                                    .font(.subheadline.weight(.medium))
                                    .foregroundColor(passwordsMatch ? MeeshyColors.success : MeeshyColors.error)
                                Spacer()
                            }
                            .padding(14)
                            .background(RoundedRectangle(cornerRadius: 12).fill((passwordsMatch ? MeeshyColors.success : MeeshyColors.error).opacity(0.1)))
                            .transition(.scale.combined(with: .opacity))
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
        .adaptiveOnChange(of: viewModel.password) { _, newValue in
            if newValue.count >= 8 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { focusedField = .confirm }
            }
        }
    }

    private var requirementsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "shield.lefthalf.filled").foregroundColor(viewModel.currentStep.accentColor)
                Text(String(localized: "onboarding.step.password.requirements.title", defaultValue: "Criteres de securite", bundle: .main)).font(.footnote.weight(.semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                reqRow(met: viewModel.password.count >= 8, text: String(localized: "onboarding.step.password.req.length", defaultValue: "Au moins 8 caracteres", bundle: .main))
                reqRow(met: viewModel.password.contains(where: { $0.isUppercase }), text: String(localized: "onboarding.step.password.req.uppercase", defaultValue: "Une majuscule", bundle: .main))
                reqRow(met: viewModel.password.contains(where: { $0.isLowercase }), text: String(localized: "onboarding.step.password.req.lowercase", defaultValue: "Une minuscule", bundle: .main))
                reqRow(met: viewModel.password.contains(where: { $0.isNumber }), text: String(localized: "onboarding.step.password.req.digit", defaultValue: "Un chiffre", bundle: .main))
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private func reqRow(met: Bool, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: met ? "checkmark.circle.fill" : "circle")
                .font(.subheadline).foregroundColor(met ? MeeshyColors.success : .secondary).frame(width: 16)
            Text(text).font(.caption).foregroundColor(met ? .primary : .secondary)
        }
    }
}

// MARK: - Password Strength

enum PasswordStrength {
    case weak, fair, good, strong

    var label: String {
        switch self {
        case .weak: return String(localized: "onboarding.step.password.strength.weak", defaultValue: "Weak", bundle: .main)
        case .fair: return String(localized: "onboarding.step.password.strength.fair", defaultValue: "Fair", bundle: .main)
        case .good: return String(localized: "onboarding.step.password.strength.good", defaultValue: "Good", bundle: .main)
        case .strong: return String(localized: "onboarding.step.password.strength.strong", defaultValue: "Strong", bundle: .main)
        }
    }

    var color: Color {
        switch self {
        case .weak: return MeeshyColors.error
        case .fair: return MeeshyColors.warning
        case .good: return MeeshyColors.success.opacity(0.6)
        case .strong: return MeeshyColors.success
        }
    }

    var progress: CGFloat {
        switch self {
        case .weak: return 0.25
        case .fair: return 0.5
        case .good: return 0.75
        case .strong: return 1.0
        }
    }

    static func evaluate(_ password: String) -> PasswordStrength {
        var score = 0
        if password.count >= 8 { score += 1 }
        if password.contains(where: { $0.isUppercase }) { score += 1 }
        if password.contains(where: { $0.isLowercase }) { score += 1 }
        if password.contains(where: { $0.isNumber }) { score += 1 }
        if password.contains(where: { "!@#$%^&*()_+-=[]{}|;:'\",.<>?/`~".contains($0) }) { score += 1 }
        if password.count >= 12 { score += 1 }

        switch score {
        case 0...2: return .weak
        case 3: return .fair
        case 4: return .good
        default: return .strong
        }
    }
}

struct PasswordStrengthBar: View {
    let strength: PasswordStrength

    var body: some View {
        VStack(spacing: 8) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(Color(.systemGray5)).frame(height: 8)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(strength.color)
                        .frame(width: geo.size.width * strength.progress, height: 8)
                        .animation(.spring(response: 0.4), value: strength.progress)
                }
            }
            .frame(height: 8)

            HStack {
                Image(systemName: "shield.fill")
                    .font(.subheadline)
                    .foregroundColor(strength.color)
                Text(strength.label)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(strength.color)
                Spacer()
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12).fill(strength.color.opacity(0.1)))
    }
}

// MARK: - Step 6: Language

struct StepLanguageView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @State private var searchText = ""
    @State private var editingTarget: LanguageTarget = .system

    enum LanguageTarget { case system, regional }

    private let languages = LanguageSelector.defaultLanguages

    private var filteredLanguages: [MeeshyUI.LanguageOption] {
        if searchText.isEmpty { return languages }
        let lower = searchText.lowercased()
        return languages.filter {
            $0.name.lowercased().contains(lower) || $0.id.lowercased().contains(lower)
        }
    }

    private var selectedSystemLang: MeeshyUI.LanguageOption? {
        languages.first { $0.id == viewModel.systemLanguage }
    }

    private var selectedRegionalLang: MeeshyUI.LanguageOption? {
        languages.first { $0.id == viewModel.regionalLanguage }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

                languageSummaryCards

                HStack(spacing: 10) {
                    languageTargetTab(String(localized: "onboarding.step.language.system", defaultValue: "Langue principale", bundle: .main), target: .system, icon: "globe")
                    languageTargetTab(String(localized: "onboarding.step.language.regional", defaultValue: "Langue regionale", bundle: .main), target: .regional, icon: "map")
                }

                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundColor(.secondary)
                    TextField(String(localized: "onboarding.step.language.search-placeholder", defaultValue: "Chercher une langue...", bundle: .main), text: $searchText)
                        .font(.subheadline)
                    if !searchText.isEmpty {
                        Button(action: { searchText = "" }) {
                            Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                        }
                        .accessibilityLabel(String(localized: "onboarding.search.clear",
                                                    defaultValue: "Clear search", bundle: .main))
                    }
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemGray6).opacity(0.7)))

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(filteredLanguages) { lang in
                        languageCard(lang)
                    }
                }

                conversationExampleCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
    }

    private var languageSummaryCards: some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: "globe")
                    .font(.callout.weight(.medium))
                    .foregroundColor(viewModel.currentStep.accentColor)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text(String(localized: "onboarding.step.language.system", defaultValue: "Langue principale", bundle: .main)).font(.caption2.weight(.medium)).foregroundColor(.secondary)
                    Text("\(selectedSystemLang?.flag ?? "") \(selectedSystemLang?.name ?? viewModel.systemLanguage)")
                        .font(.subheadline.weight(.semibold))
                }
                Spacer()
                Text(String(localized: "onboarding.step.language.detected", defaultValue: "Detectee", bundle: .main)).font(.caption2.weight(.medium))
                    .foregroundColor(viewModel.currentStep.accentColor)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Capsule().fill(viewModel.currentStep.accentColor.opacity(0.15)))
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 12).fill(viewModel.currentStep.accentColor.opacity(0.08)))

            HStack(spacing: 12) {
                Image(systemName: "map")
                    .font(.callout.weight(.medium))
                    .foregroundColor(MeeshyColors.warning)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text(String(localized: "onboarding.step.language.regional", defaultValue: "Langue regionale", bundle: .main)).font(.caption2.weight(.medium)).foregroundColor(.secondary)
                    Text("\(selectedRegionalLang?.flag ?? "") \(selectedRegionalLang?.name ?? viewModel.regionalLanguage)")
                        .font(.subheadline.weight(.semibold))
                }
                Spacer()
                Text(String(localized: "onboarding.step.language.detected", defaultValue: "Detectee", bundle: .main)).font(.caption2.weight(.medium))
                    .foregroundColor(MeeshyColors.warning)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Capsule().fill(MeeshyColors.warning.opacity(0.15)))
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 12).fill(MeeshyColors.warning.opacity(0.08)))
        }
    }

    private func languageTargetTab(_ title: String, target: LanguageTarget, icon: String) -> some View {
        let isActive = editingTarget == target
        let color: Color = target == .system ? viewModel.currentStep.accentColor : MeeshyColors.warning
        return Button(action: {
            withAnimation(.spring(response: 0.3)) { editingTarget = target }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.caption.weight(.medium))
                Text(title).font(.caption.weight(.semibold))
            }
            .foregroundColor(isActive ? .white : color)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isActive ? color : color.opacity(0.12))
            )
        }
        .buttonStyle(PlainButtonStyle())
        .bounceOnTap(scale: 0.94)
        // L'onglet actif n'est signale que par le fill/texte (couleur) : on ajoute le trait
        // `.isSelected` pour que VoiceOver annonce le segment courant (WCAG 1.4.1).
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    private func languageCard(_ lang: MeeshyUI.LanguageOption) -> some View {
        let currentId = editingTarget == .system ? viewModel.systemLanguage : viewModel.regionalLanguage
        let isSelected = currentId == lang.id
        let color: Color = editingTarget == .system ? viewModel.currentStep.accentColor : MeeshyColors.warning
        return Button(action: {
            withAnimation(.spring(response: 0.3)) {
                if editingTarget == .system {
                    viewModel.systemLanguage = lang.id
                } else {
                    viewModel.regionalLanguage = lang.id
                }
            }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }) {
            HStack(spacing: 10) {
                Text(lang.flag).font(MeeshyFont.relative(26))
                VStack(alignment: .leading, spacing: 2) {
                    Text(lang.name).font(.footnote.weight(.semibold)).foregroundColor(.primary)
                    Text(lang.id.uppercased()).font(.caption2.weight(.medium)).foregroundColor(.secondary)
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark.circle.fill").font(MeeshyFont.relative(20)).foregroundColor(color)
                        .accessibilityHidden(true)
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? color.opacity(0.15) : Color(.systemBackground).opacity(0.8))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(isSelected ? color : Color(.systemGray4).opacity(0.4), lineWidth: isSelected ? 2 : 1))
            )
        }
        .buttonStyle(PlainButtonStyle())
        .bounceOnTap(scale: 0.94)
        // La selection est signalee visuellement par un checkmark (masque a VoiceOver ci-dessus)
        // + couleur : on porte l'etat via le trait `.isSelected` pour l'annonce VoiceOver.
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var conversationExampleCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "bubble.left.and.bubble.right.fill").foregroundColor(viewModel.currentStep.accentColor)
                Text(String(localized: "onboarding.step.language.example.title", defaultValue: "Comment ca marche", bundle: .main)).font(.footnote.weight(.semibold)).foregroundColor(.secondary)
            }

            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(MeeshyColors.indigo400.opacity(0.2))
                        .frame(width: 32, height: 32)
                        .overlay(Text("JP").font(.caption2.weight(.bold)).foregroundColor(MeeshyColors.indigo400))

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Jean-Pierre")
                            .font(.caption2.weight(.medium)).foregroundColor(.secondary)
                        Text("Hello! How are you doing today?")
                            .font(.footnote)
                            .padding(10)
                            .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemGray5)))

                        HStack(spacing: 4) {
                            Image(systemName: "translate")
                                .font(.caption2).foregroundColor(viewModel.currentStep.accentColor)
                            Text(translatedExample)
                                .font(.caption).foregroundColor(viewModel.currentStep.accentColor)
                        }
                    }
                }

                HStack {
                    Spacer()
                    Image(systemName: "arrow.down").font(.subheadline).foregroundColor(.secondary)
                    Spacer()
                }

                Text(String(format: String(localized: "onboarding.step.language.example.description", defaultValue: "Tu recois le message original + la traduction dans ta langue principale (%@)", bundle: .main), selectedSystemLangName))
                    .font(.caption2).foregroundColor(.secondary)
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
        switch viewModel.systemLanguage {
        case "fr": return "Salut! Comment ca va aujourd'hui?"
        case "es": return "Hola! Como estas hoy?"
        case "de": return "Hallo! Wie geht es dir heute?"
        case "pt": return "Ola! Como voce esta hoje?"
        case "ar": return "مرحبا! كيف حالك اليوم؟"
        case "zh": return "你好！今天你好吗？"
        case "ja": return "こんにちは！元気ですか？"
        case "ko": return "안녕하세요! 오늘 어떠세요?"
        case "it": return "Ciao! Come stai oggi?"
        case "ru": return "Привет! Как у тебя дела сегодня?"
        case "tr": return "Merhaba! Bugun nasilsin?"
        default: return "Salut! Comment ca va aujourd'hui?"
        }
    }

    private var selectedSystemLangName: String {
        languages.first { $0.id == viewModel.systemLanguage }?.name ?? viewModel.systemLanguage
    }
}

// MARK: - Step 7: Profile

struct StepProfileView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @State private var showPhotoPicker = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var photoTarget: PhotoTarget = .profile

    enum PhotoTarget { case profile, banner }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                HStack {
                    Image(systemName: "sparkles").foregroundColor(MeeshyColors.warning)
                    Text(String(localized: "onboarding.step.profile.optional", defaultValue: "Optionnelle — mais un profil soigné multiplie tes mises en relation", bundle: .main)).font(.footnote.weight(.medium)).foregroundColor(.secondary)
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).fill(MeeshyColors.warning.opacity(0.1)))

                profilePreviewCard

                VStack(alignment: .leading, spacing: 8) {
                    Text(String(localized: "onboarding.step.profile.bio.title", defaultValue: "Bio (optionnel)", bundle: .main))
                        .font(.footnote.weight(.medium)).foregroundColor(.secondary)
                    TextEditor(text: $viewModel.bio)
                        .font(.subheadline)
                        .frame(minHeight: 80, maxHeight: 120)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color(.systemBackground).opacity(0.8))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(.systemGray4).opacity(0.4), lineWidth: 1))
                        )
                    Text(String(format: String(localized: "onboarding.step.profile.bio.counter", defaultValue: "%d/150 caracteres", bundle: .main), viewModel.bio.count))
                        .font(.caption2)
                        .foregroundColor(viewModel.bio.count > 150 ? MeeshyColors.error : .secondary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }

                summaryCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhotoItem, matching: .images)
        .adaptiveOnChange(of: selectedPhotoItem) { _, item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    if photoTarget == .profile {
                        viewModel.profileImage = image
                    } else {
                        viewModel.bannerImage = image
                    }
                }
            }
        }
    }

    private var profilePreviewCard: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottomTrailing) {
                if let banner = viewModel.bannerImage {
                    Image(uiImage: banner)
                        .resizable().scaledToFill()
                        .frame(height: 100).clipped()
                } else {
                    LinearGradient(
                        colors: [viewModel.currentStep.accentColor.opacity(0.3), viewModel.currentStep.accentColor.opacity(0.1)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                    .frame(height: 100)
                }

                Button(action: {
                    photoTarget = .banner
                    showPhotoPicker = true
                }) {
                    Image(systemName: "camera.fill")
                        .font(.caption).foregroundColor(.white)
                        .padding(8).background(Circle().fill(Color.black.opacity(0.5)))
                }
                .padding(8)
                // Bouton icône-seule (camera.fill) : sans libellé, VoiceOver annonce un « bouton » anonyme (WCAG 4.1.2).
                .accessibilityLabel(String(localized: "onboarding.photo.banner.a11y", defaultValue: "Ajouter une photo de bannière", bundle: .main))
            }

            HStack {
                ZStack(alignment: .bottomTrailing) {
                    if let photo = viewModel.profileImage {
                        Image(uiImage: photo)
                            .resizable().scaledToFill()
                            .frame(width: 80, height: 80).clipShape(Circle())
                            .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 4))
                    } else {
                        Circle()
                            .fill(viewModel.currentStep.accentColor.opacity(0.2))
                            .frame(width: 80, height: 80)
                            .overlay(
                                // Glyphe placeholder dans un cercle fixe 80×80 : figé (déborderait s'il scalait, doctrine 86i) + masqué VoiceOver (le nom sous l'aperçu porte le sens)
                                Image(systemName: "person.fill")
                                    .font(.system(size: 32))
                                    .foregroundColor(viewModel.currentStep.accentColor.opacity(0.5))
                                    .accessibilityHidden(true)
                            )
                            .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 4))
                    }

                    Button(action: {
                        photoTarget = .profile
                        showPhotoPicker = true
                    }) {
                        Image(systemName: "camera.fill")
                            .font(.caption2).foregroundColor(.white)
                            .padding(6).background(Circle().fill(viewModel.currentStep.accentColor))
                    }
                    // Bouton icône-seule (camera.fill) : sans libellé, VoiceOver annonce un « bouton » anonyme (WCAG 4.1.2).
                    .accessibilityLabel(String(localized: "onboarding.photo.profile.a11y", defaultValue: "Ajouter une photo de profil", bundle: .main))
                }
                .offset(y: -30)
                .padding(.leading, 16)
                Spacer()
            }
            .padding(.bottom, -20)

            VStack(alignment: .leading, spacing: 4) {
                Text("\(viewModel.firstName) \(viewModel.lastName)")
                    .font(.title3.weight(.bold))
                Text("@\(viewModel.username)")
                    .font(.subheadline).foregroundColor(.secondary)
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
                Text(String(localized: "onboarding.step.profile.summary.title", defaultValue: "Apercu de ton profil", bundle: .main)).font(.footnote.weight(.semibold)).foregroundColor(.secondary)
            }
            ForEach(viewModel.summaryItems, id: \.label) { item in
                HStack(spacing: 10) {
                    Image(systemName: item.icon).font(.subheadline).foregroundColor(viewModel.currentStep.accentColor).frame(width: 20)
                    Text(item.label).font(.caption).foregroundColor(.secondary)
                    Spacer()
                    Text(item.value).font(.caption.weight(.medium)).foregroundColor(.primary).lineLimit(1)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }
}

// MARK: - Step 8: Recap

struct StepRecapView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @State private var showTerms = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                if viewModel.isLoading {
                    loadingView
                } else if viewModel.errorMessage != nil {
                    errorView
                } else {
                    summaryView
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
        .sheet(isPresented: $showTerms) { termsSheet }
    }

    private var loadingView: some View {
        VStack(spacing: 20) {
            ProgressView()
                .scaleEffect(1.5)
                .padding(.bottom, 10)
            Text(String(localized: "onboarding.step.recap.creating", defaultValue: "Creation de ton compte...", bundle: .main))
                .font(.callout.weight(.medium))
                .foregroundColor(.secondary)
        }
        .padding(.top, 60)
    }

    private var errorView: some View {
        VStack(spacing: 16) {
            // Glyphe héros décoratif ≥40pt : figé (doctrine 74i/86i) + masqué VoiceOver (le message d'erreur adjacent porte le sens)
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 50))
                .foregroundColor(MeeshyColors.error)
                .accessibilityHidden(true)
            Text(viewModel.errorMessage ?? String(localized: "common.error.unknown", defaultValue: "Erreur inconnue", bundle: .main))
                .font(.subheadline)
                .foregroundColor(MeeshyColors.error)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 40)
    }

    private var summaryView: some View {
        VStack(spacing: 20) {
            StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

            VStack(spacing: 14) {
                HStack {
                    Image(systemName: "doc.text.fill").foregroundColor(viewModel.currentStep.accentColor)
                    Text(String(localized: "onboarding.step.recap.title", defaultValue: "Recapitulatif", bundle: .main)).font(.callout.weight(.semibold))
                    Spacer()
                }

                ForEach(viewModel.summaryItems, id: \.label) { item in
                    summaryRow(icon: item.icon, label: item.label, value: item.value)
                }

                summaryRow(icon: "lock.shield", label: String(localized: "onboarding.step.recap.password", defaultValue: "Mot de passe", bundle: .main), value: String(repeating: "•", count: min(viewModel.password.count, 10)))
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
            Image(systemName: icon).font(.subheadline).foregroundColor(viewModel.currentStep.accentColor).frame(width: 20)
            Text(label).font(.footnote).foregroundColor(.secondary)
            Spacer()
            Text(value).font(.footnote.weight(.medium)).foregroundColor(.primary).lineLimit(1)
        }
    }

    private var termsCheckbox: some View {
        Button(action: {
            withAnimation(.spring(response: 0.3)) { viewModel.acceptTerms.toggle() }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(viewModel.acceptTerms ? MeeshyColors.success : Color(.systemGray3), lineWidth: 2)
                        .frame(width: 24, height: 24)
                    if viewModel.acceptTerms {
                        RoundedRectangle(cornerRadius: 6).fill(MeeshyColors.success).frame(width: 24, height: 24)
                        Image(systemName: "checkmark").font(.subheadline.weight(.bold)).foregroundColor(.white)
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(String(localized: "onboarding.step.recap.terms.accept", defaultValue: "J'accepte les conditions d'utilisation et la politique de confidentialite", bundle: .main))
                        .font(.footnote).foregroundColor(.primary).multilineTextAlignment(.leading)
                    Button(action: { showTerms = true }) {
                        Text(String(localized: "onboarding.step.recap.terms.read", defaultValue: "Lire les conditions", bundle: .main)).font(.caption.weight(.medium)).foregroundColor(viewModel.currentStep.accentColor)
                    }
                }
                Spacer()
            }
        }
        .buttonStyle(PlainButtonStyle())
        .bounceOnTap(scale: 0.96)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemGray6).opacity(0.6)))
    }

    private var termsSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(String(localized: "onboarding.step.recap.terms.title", defaultValue: "Conditions d'utilisation", bundle: .main)).font(.title2.bold())
                    Text(String(localized: "onboarding.step.recap.terms.body", defaultValue: """
                    Bienvenue sur Meeshy! En utilisant notre application, tu acceptes les conditions suivantes:

                    1. UTILISATION RESPONSABLE
                    Meeshy est fait pour connecter les gens positivement. Pas de contenu offensant ou illegal.

                    2. TON COMPTE
                    Tu es responsable de ton compte. Garde ton mot de passe secret!

                    3. TES DONNEES
                    On protege tes donnees avec le chiffrement de bout en bout. Tes messages sont prives.

                    4. TRADUCTION
                    La traduction est automatique et peut ne pas etre parfaite. C'est un outil, pas une science exacte!

                    5. RESPECT
                    Traite les autres comme tu voudrais etre traite. On est une communaute!

                    On est ensemble!
                    """, bundle: .main))
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                }
                .padding(20)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) { showTerms = false }
                }
            }
        }
    }
}
