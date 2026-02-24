import SwiftUI
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

                if isValidating {
                    ProgressView().scaleEffect(0.8)
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
                    Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 11))
                    Text(error).font(.system(size: 12))
                }
                .foregroundColor(.red)
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
                    placeholder: "Ton pseudo de boss",
                    text: $viewModel.username,
                    errorMessage: viewModel.usernameError,
                    accentColor: viewModel.currentStep.accentColor,
                    isValidating: viewModel.isValidatingUsername,
                    isAvailable: viewModel.usernameAvailable
                )
                .focused($isFocused)
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
                Image(systemName: "lightbulb.max.fill").foregroundColor(.orange)
                Text("Suggestions disponibles")
                    .font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
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
                tipRow(icon: "checkmark.circle", text: "2 a 16 caracteres, pas d'espaces")
                tipRow(icon: "star", text: "Sois original, c'est ton identite!")
                tipRow(icon: "eye.slash", text: "Pas de donnees perso dans le pseudo")
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
                                .font(.system(size: 15, weight: .medium))
                            Image(systemName: "chevron.down")
                                .font(.system(size: 10))
                        }
                        .foregroundColor(.primary)
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemGray6)))
                    }

                    HStack(spacing: 12) {
                        Image(systemName: "phone")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundColor(isFocused ? viewModel.currentStep.accentColor : .secondary)
                            .frame(width: 24)

                        TextField(viewModel.phonePlaceholder, text: $viewModel.phoneNumber)
                            .font(.system(size: 16))
                            .keyboardType(.phonePad)
                            .focused($isFocused)

                        if viewModel.isValidatingPhone {
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

                Button(action: { viewModel.skipCurrentStep() }) {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.right.circle").font(.system(size: 14))
                        Text("Passer cette etape")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundColor(.secondary)
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

    private var infoCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "info.circle").foregroundColor(viewModel.currentStep.accentColor)
                Text("Pourquoi le telephone?").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                tipRow(icon: "key.horizontal", text: "Recuperation de compte securisee")
                tipRow(icon: "bell.badge", text: "Alertes de securite importantes")
                tipRow(icon: "hand.raised", text: "Optionnel, tu peux passer")
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
        NavigationStack {
            List(CountryPicker.countries) { country in
                Button(action: {
                    viewModel.selectedCountry = country
                    showCountryPicker = false
                }) {
                    HStack {
                        Text(country.flag).font(.system(size: 24))
                        Text(country.name).font(.system(size: 15))
                        Spacer()
                        Text(country.dialCode).font(.system(size: 14)).foregroundColor(.secondary)
                        if viewModel.selectedCountry.id == country.id {
                            Image(systemName: "checkmark").foregroundColor(.green)
                        }
                    }
                }
            }
            .navigationTitle("Indicatif pays")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { showCountryPicker = false }
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
                    placeholder: "ton.email@exemple.com",
                    text: $viewModel.email,
                    errorMessage: viewModel.emailError,
                    accentColor: viewModel.currentStep.accentColor,
                    keyboardType: .emailAddress,
                    isValidating: viewModel.isValidatingEmail,
                    isAvailable: viewModel.emailAvailable
                )
                .focused($isFocused)
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
                Image(systemName: "lock.shield.fill").foregroundColor(.green)
                Text("Ton email est protege").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                tipRow(icon: "checkmark.circle", text: "On ne partage jamais ton email")
                tipRow(icon: "bell", text: "Pour les notifications importantes")
                tipRow(icon: "key", text: "Pour recuperer ton compte si besoin")
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
                        placeholder: "Ton prenom",
                        text: $viewModel.firstName,
                        accentColor: viewModel.currentStep.accentColor
                    )
                    .focused($focusedField, equals: .firstName)
                    .textContentType(.givenName)

                    GlassTextField(
                        icon: "person.2",
                        placeholder: "Ton nom de famille",
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
                Text("Ton identite sur Meeshy").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                tipRow(icon: "checkmark.circle", text: "Tes amis pourront te reconnaitre")
                tipRow(icon: "eye", text: "Visible sur ton profil")
                tipRow(icon: "person.badge.shield.checkmark", text: "Aide a la verification")
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
                        placeholder: "Ton mot de passe beton",
                        text: $viewModel.password,
                        accentColor: viewModel.currentStep.accentColor,
                        isSecure: true
                    )
                    .focused($focusedField, equals: .password)
                    .textInputAutocapitalization(.never)

                    if !viewModel.password.isEmpty {
                        PasswordStrengthBar(strength: passwordStrength)
                    }

                    if viewModel.password.count >= 8 {
                        GlassTextField(
                            icon: "lock.rotation",
                            placeholder: "Repete ton mot de passe",
                            text: $viewModel.confirmPassword,
                            errorMessage: (!viewModel.confirmPassword.isEmpty && !passwordsMatch) ? "Les mots de passe ne correspondent pas" : nil,
                            accentColor: viewModel.currentStep.accentColor,
                            isSecure: true
                        )
                        .focused($focusedField, equals: .confirm)
                        .textInputAutocapitalization(.never)
                        .transition(.asymmetric(
                            insertion: .move(edge: .top).combined(with: .opacity),
                            removal: .opacity
                        ))

                        if !viewModel.confirmPassword.isEmpty {
                            HStack(spacing: 10) {
                                Image(systemName: passwordsMatch ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .font(.system(size: 20))
                                    .foregroundColor(passwordsMatch ? .green : .red)
                                Text(passwordsMatch ? "Les mots de passe correspondent!" : "Les mots de passe ne correspondent pas")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(passwordsMatch ? .green : .red)
                                Spacer()
                            }
                            .padding(14)
                            .background(RoundedRectangle(cornerRadius: 12).fill((passwordsMatch ? Color.green : Color.red).opacity(0.1)))
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
        .onChange(of: viewModel.password) { _, newValue in
            if newValue.count >= 8 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { focusedField = .confirm }
            }
        }
    }

    private var requirementsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "shield.lefthalf.filled").foregroundColor(viewModel.currentStep.accentColor)
                Text("Criteres de securite").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                reqRow(met: viewModel.password.count >= 8, text: "Au moins 8 caracteres")
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

// MARK: - Password Strength

enum PasswordStrength {
    case weak, fair, good, strong

    var label: String {
        switch self {
        case .weak: return "Faible"
        case .fair: return "Moyen"
        case .good: return "Bon"
        case .strong: return "Fort"
        }
    }

    var color: Color {
        switch self {
        case .weak: return .red
        case .fair: return .orange
        case .good: return .yellow
        case .strong: return .green
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
                    .font(.system(size: 14))
                    .foregroundColor(strength.color)
                Text(strength.label)
                    .font(.system(size: 13, weight: .semibold))
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

    private let languages = LanguageSelector.defaultLanguages

    private var filteredLanguages: [MeeshyUI.LanguageOption] {
        if searchText.isEmpty { return languages }
        let lower = searchText.lowercased()
        return languages.filter {
            $0.name.lowercased().contains(lower) || $0.id.lowercased().contains(lower)
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                StepIllustration(iconName: viewModel.currentStep.iconName, accentColor: viewModel.currentStep.accentColor)

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

    private func languageCard(_ lang: MeeshyUI.LanguageOption) -> some View {
        let isSelected = viewModel.systemLanguage == lang.id
        return Button(action: {
            withAnimation(.spring(response: 0.3)) {
                viewModel.systemLanguage = lang.id
                viewModel.regionalLanguage = lang.id
            }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }) {
            HStack(spacing: 10) {
                Text(lang.flag).font(.system(size: 26))
                VStack(alignment: .leading, spacing: 2) {
                    Text(lang.name).font(.system(size: 13, weight: .semibold)).foregroundColor(.primary)
                    Text(lang.id.uppercased()).font(.system(size: 10, weight: .medium)).foregroundColor(.secondary)
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
                Text("Comment ca marche").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }

            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(Color.blue.opacity(0.2))
                        .frame(width: 32, height: 32)
                        .overlay(Text("JP").font(.system(size: 10, weight: .bold)).foregroundColor(.blue))

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Jean-Pierre")
                            .font(.system(size: 11, weight: .medium)).foregroundColor(.secondary)
                        Text("Hello! How are you doing today?")
                            .font(.system(size: 13))
                            .padding(10)
                            .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemGray5)))

                        HStack(spacing: 4) {
                            Image(systemName: "translate")
                                .font(.system(size: 10)).foregroundColor(viewModel.currentStep.accentColor)
                            Text(translatedExample)
                                .font(.system(size: 12)).foregroundColor(viewModel.currentStep.accentColor)
                        }
                    }
                }

                HStack {
                    Spacer()
                    Image(systemName: "arrow.down").font(.system(size: 14)).foregroundColor(.secondary)
                    Spacer()
                }

                Text("Tu recois le message original + la traduction dans ta langue (\(selectedLanguageName))")
                    .font(.system(size: 11)).foregroundColor(.secondary)
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

    private var selectedLanguageName: String {
        languages.first { $0.id == viewModel.systemLanguage }?.name ?? viewModel.systemLanguage
    }
}

// MARK: - Step 7: Profile

struct StepProfileView: View {
    @ObservedObject var viewModel: RegistrationViewModel
    @State private var showPhotoPicker = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var photoTarget: PhotoTarget = .profile
    @State private var profileImage: UIImage?
    @State private var bannerImage: UIImage?

    enum PhotoTarget { case profile, banner }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                HStack {
                    Image(systemName: "sparkles").foregroundColor(.orange)
                    Text("Cette etape est optionnelle").font(.system(size: 13, weight: .medium)).foregroundColor(.secondary)
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.orange.opacity(0.1)))

                profilePreviewCard

                VStack(alignment: .leading, spacing: 8) {
                    Text("Bio (optionnel)")
                        .font(.system(size: 13, weight: .medium)).foregroundColor(.secondary)
                    TextEditor(text: $viewModel.bio)
                        .font(.system(size: 15))
                        .frame(minHeight: 80, maxHeight: 120)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color(.systemBackground).opacity(0.8))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(.systemGray4).opacity(0.4), lineWidth: 1))
                        )
                    Text("\(viewModel.bio.count)/150 caracteres")
                        .font(.system(size: 11))
                        .foregroundColor(viewModel.bio.count > 150 ? .red : .secondary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }

                summaryCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 100)
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhotoItem, matching: .images)
        .onChange(of: selectedPhotoItem) { _, item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    if photoTarget == .profile {
                        profileImage = image
                    } else {
                        bannerImage = image
                    }
                }
            }
        }
    }

    private var profilePreviewCard: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottomTrailing) {
                if let banner = bannerImage {
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
                        .font(.system(size: 12)).foregroundColor(.white)
                        .padding(8).background(Circle().fill(Color.black.opacity(0.5)))
                }
                .padding(8)
            }

            HStack {
                ZStack(alignment: .bottomTrailing) {
                    if let photo = profileImage {
                        Image(uiImage: photo)
                            .resizable().scaledToFill()
                            .frame(width: 80, height: 80).clipShape(Circle())
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
                        showPhotoPicker = true
                    }) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 10)).foregroundColor(.white)
                            .padding(6).background(Circle().fill(viewModel.currentStep.accentColor))
                    }
                }
                .offset(y: -30)
                .padding(.leading, 16)
                Spacer()
            }
            .padding(.bottom, -20)

            VStack(alignment: .leading, spacing: 4) {
                Text("\(viewModel.firstName) \(viewModel.lastName)")
                    .font(.system(size: 18, weight: .bold))
                Text("@\(viewModel.username)")
                    .font(.system(size: 14)).foregroundColor(.secondary)
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
                Text("Apercu de ton profil").font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary)
            }
            ForEach(viewModel.summaryItems, id: \.label) { item in
                HStack(spacing: 10) {
                    Image(systemName: item.icon).font(.system(size: 14)).foregroundColor(viewModel.currentStep.accentColor).frame(width: 20)
                    Text(item.label).font(.system(size: 12)).foregroundColor(.secondary)
                    Spacer()
                    Text(item.value).font(.system(size: 12, weight: .medium)).foregroundColor(.primary).lineLimit(1)
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
            Text("Creation de ton compte...")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.secondary)
        }
        .padding(.top, 60)
    }

    private var errorView: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 50))
                .foregroundColor(.red)
            Text(viewModel.errorMessage ?? "Erreur inconnue")
                .font(.system(size: 14))
                .foregroundColor(.red)
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
                    Text("Recapitulatif").font(.system(size: 16, weight: .semibold))
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
            withAnimation(.spring(response: 0.3)) { viewModel.acceptTerms.toggle() }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(viewModel.acceptTerms ? Color.green : Color(.systemGray3), lineWidth: 2)
                        .frame(width: 24, height: 24)
                    if viewModel.acceptTerms {
                        RoundedRectangle(cornerRadius: 6).fill(Color.green).frame(width: 24, height: 24)
                        Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundColor(.white)
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("J'accepte les conditions d'utilisation et la politique de confidentialite")
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
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Conditions d'utilisation").font(.title2.bold())
                    Text("""
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
                    """)
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                }
                .padding(20)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { showTerms = false }
                }
            }
        }
    }
}
