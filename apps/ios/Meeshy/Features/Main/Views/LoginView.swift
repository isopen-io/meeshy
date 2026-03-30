import SwiftUI
import MeeshySDK
import MeeshyUI

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManager
    @ObservedObject private var theme = ThemeManager.shared

    // Normal login form state
    @State private var username = ""
    @State private var password = ""

    // Account picker state
    @State private var selectedAccount: SavedAccount? = nil
    @State private var accountPassword = ""
    @State private var showNormalLogin = false

    // UI state
    @State private var glowPulse = false
    @State private var showFields = false
    @State private var showError = false
    @State private var showRegister = false
    @State private var showForgotPassword = false
    @State private var showMagicLink = false

    // Environment selector
    @State private var selectedEnv: MeeshyConfig.ServerEnvironment = MeeshyConfig.shared.selectedEnvironment
    @State private var customHost: String = MeeshyConfig.shared.customHost
    @State private var showCustomInput = false

    @FocusState private var focusedField: Field?

    private enum Field { case username, password, accountPassword, customHost }

    private var isDark: Bool { theme.mode.isDark }
    private var showPicker: Bool { !authManager.savedAccounts.isEmpty && !showNormalLogin }

    // On simulator only: prefill test credentials
    private static let isSimulator = ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] != nil

    init() {
        if Self.isSimulator {
            _username = State(initialValue: "atabeth")
            _password = State(initialValue: "pD5p1ir9uxLUf2X2FpNE")
        }
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient
                .ignoresSafeArea()

            ForEach(Array(theme.ambientOrbs.enumerated()), id: \.offset) { index, orb in
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity))
                    .frame(width: orb.size, height: orb.size)
                    .blur(radius: orb.size * 0.2)
                    .offset(x: orb.offset.x, y: orb.offset.y)
                    .scaleEffect(glowPulse ? 1.3 - CGFloat(index) * 0.05 : 0.8 + CGFloat(index) * 0.05)
            }
            .accessibilityHidden(true)

            VStack(spacing: 0) {
                Spacer()

                AnimatedLogoView(
                    color: isDark ? .white : Color(hex: "1C1917"),
                    lineWidth: 10,
                    continuous: false
                )
                .frame(width: 100, height: 100)
                .padding(.bottom, MeeshySpacing.xxl)
                .accessibilityHidden(true)

                Text("Meeshy")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: "B24BF3"), Color(hex: "8B5CF6"), Color(hex: "A855F7")],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .shadow(color: Color(hex: "B24BF3").opacity(isDark ? 0.5 : 0.25), radius: 12, x: 0, y: 4)
                    .padding(.bottom, 48)
                    .accessibilityAddTraits(.isHeader)

                if showPicker {
                    accountPickerSection
                } else {
                    normalLoginSection
                }

                Spacer()

                Button { showRegister = true } label: {
                    HStack(spacing: 4) {
                        Text("Pas de compte ?")
                            .foregroundColor(theme.textMuted)
                        Text("Creer un compte")
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [Color(hex: "B24BF3"), Color(hex: "8B5CF6")],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                    }
                    .font(.system(size: MeeshyFont.subheadSize, weight: .semibold))
                }
                .bounceOnTap(scale: 0.94)
                .accessibilityLabel("Creer un compte")
                .accessibilityHint("Ouvre le formulaire d'inscription")
                .padding(.bottom, MeeshySpacing.md)
                .opacity(showFields ? 1 : 0)

                environmentSelector
                    .padding(.bottom, MeeshySpacing.xxxl)
                    .opacity(showFields ? 1 : 0)
            }
        }
        .sheet(isPresented: $showForgotPassword) {
            MeeshyForgotPasswordView()
        }
        .sheet(isPresented: $showMagicLink) {
            MagicLinkView()
                .environmentObject(authManager)
        }
        .fullScreenCover(isPresented: $showRegister) {
            OnboardingFlowView(onComplete: { showRegister = false })
                .environmentObject(authManager)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                glowPulse = true
            }
            withAnimation(.spring(response: 0.7, dampingFraction: 0.8).delay(0.2)) {
                showFields = true
            }
        }
        .onChange(of: authManager.errorMessage) { _, newValue in
            if newValue != nil {
                withAnimation(MeeshyAnimation.springDefault) {
                    showError = true
                }
            }
        }
        .onTapGesture { focusedField = nil }
    }

    // MARK: - Account Picker Section

    private var accountPickerSection: some View {
        VStack(spacing: MeeshySpacing.lg) {
            if let account = selectedAccount {
                selectedAccountView(account)
            } else {
                savedAccountsList
            }
        }
        .padding(.horizontal, MeeshySpacing.xxxl)
        .opacity(showFields ? 1 : 0)
        .offset(y: showFields ? 0 : 30)
    }

    private var savedAccountsList: some View {
        VStack(spacing: MeeshySpacing.md) {
            ForEach(authManager.savedAccounts) { account in
                savedAccountRow(account)
                    .contextMenu {
                        Button(role: .destructive) {
                            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                authManager.removeSavedAccount(userId: account.id)
                            }
                        } label: {
                            Label("Supprimer ce compte", systemImage: "trash")
                        }
                    }
            }

            errorRow

            Button {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    showNormalLogin = true
                }
            } label: {
                Text("Autre compte")
                    .font(.system(size: MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.md)
            }
            .bounceOnTap(scale: 0.94)
            .padding(.top, MeeshySpacing.xs)
        }
    }

    private func savedAccountRow(_ account: SavedAccount) -> some View {
        Button {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                selectedAccount = account
                username = account.username
                accountPassword = Self.isSimulator ? "pD5p1ir9uxLUf2X2FpNE" : ""
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                focusedField = .accountPassword
            }
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                accountAvatar(account, size: 44)

                VStack(alignment: .leading, spacing: 2) {
                    Text(account.shortName)
                        .font(.system(size: MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text("@\(account.username)")
                        .font(.system(size: MeeshyFont.captionSize, weight: .regular))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textMuted.opacity(0.5))
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(theme.inputBorder.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
        .bounceOnTap()
    }

    private func selectedAccountView(_ account: SavedAccount) -> some View {
        VStack(spacing: MeeshySpacing.lg) {
            // Back + selected account header
            HStack(spacing: MeeshySpacing.md) {
                Button {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        selectedAccount = nil
                        accountPassword = ""
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 36, height: 36)
                        .background(
                            Circle().fill(theme.inputBackground)
                        )
                }
                .bounceOnTap(scale: 0.90)

                accountAvatar(account, size: 40)

                VStack(alignment: .leading, spacing: 1) {
                    Text(account.shortName)
                        .font(.system(size: MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text("@\(account.username)")
                        .font(.system(size: MeeshyFont.captionSize))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()
            }

            // Password field
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "lock.fill")
                    .foregroundColor(Color(hex: "8B5CF6").opacity(0.7))
                    .frame(width: 20)
                    .accessibilityHidden(true)
                SecureField("Mot de passe", text: $accountPassword)
                    .textContentType(.password)
                    .focused($focusedField, equals: .accountPassword)
                    .foregroundColor(theme.textPrimary)
                    .submitLabel(.go)
                    .onSubmit { attemptAccountLogin() }
                    .accessibilityLabel("Mot de passe")
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(
                                focusedField == .accountPassword
                                    ? Color(hex: "8B5CF6").opacity(0.6)
                                    : theme.inputBorder.opacity(0.3),
                                lineWidth: 1
                            )
                    )
            )
            .bounceOnFocus(focusedField == .accountPassword)

            errorRow

            // Login button
            loginButton(action: attemptAccountLogin, disabled: accountPassword.isEmpty)
        }
    }

    // MARK: - Normal Login Section

    private var normalLoginSection: some View {
        VStack(spacing: MeeshySpacing.lg) {
            if showNormalLogin && !authManager.savedAccounts.isEmpty {
                // Back to picker button
                HStack {
                    Button {
                        HapticFeedback.light()
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                            showNormalLogin = false
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 13, weight: .semibold))
                            Text("Comptes sauvegardés")
                                .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                        }
                        .foregroundColor(theme.textMuted)
                    }
                    .bounceOnTap(scale: 0.94)
                    Spacer()
                }
            }

            // Username
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "person.fill")
                    .foregroundColor(Color(hex: "8B5CF6").opacity(0.7))
                    .frame(width: 20)
                    .accessibilityHidden(true)
                TextField("Nom d'utilisateur", text: $username)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .username)
                    .foregroundColor(theme.textPrimary)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                    .accessibilityLabel("Nom d'utilisateur")
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(
                                focusedField == .username
                                    ? Color(hex: "8B5CF6").opacity(0.6)
                                    : theme.inputBorder.opacity(0.3),
                                lineWidth: 1
                            )
                    )
            )
            .bounceOnFocus(focusedField == .username)

            // Password
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "lock.fill")
                    .foregroundColor(Color(hex: "8B5CF6").opacity(0.7))
                    .frame(width: 20)
                    .accessibilityHidden(true)
                SecureField("Mot de passe", text: $password)
                    .textContentType(.password)
                    .focused($focusedField, equals: .password)
                    .foregroundColor(theme.textPrimary)
                    .submitLabel(.go)
                    .onSubmit { attemptLogin() }
                    .accessibilityLabel("Mot de passe")
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(
                                focusedField == .password
                                    ? Color(hex: "8B5CF6").opacity(0.6)
                                    : theme.inputBorder.opacity(0.3),
                                lineWidth: 1
                            )
                    )
            )
            .bounceOnFocus(focusedField == .password)

            errorRow

            loginButton(action: attemptLogin, disabled: username.isEmpty || password.isEmpty)

            HStack(spacing: MeeshySpacing.lg) {
                Button { showForgotPassword = true } label: {
                    Text("Mot de passe oublie ?")
                        .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .bounceOnTap(scale: 0.94)
                .accessibilityLabel("Mot de passe oublie")

                Text("·")
                    .foregroundColor(theme.textMuted.opacity(0.5))
                    .accessibilityHidden(true)

                Button { showMagicLink = true } label: {
                    Text("Connexion sans mot de passe")
                        .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(hex: "A855F7"), MeeshyColors.indigo400],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                }
                .bounceOnTap(scale: 0.94)
                .accessibilityLabel("Connexion sans mot de passe")
            }
            .padding(.top, MeeshySpacing.xs)
        }
        .padding(.horizontal, MeeshySpacing.xxxl)
        .opacity(showFields ? 1 : 0)
        .offset(y: showFields ? 0 : 30)
    }

    // MARK: - Reusable subviews

    private var errorRow: some View {
        Group {
            if let error = authManager.errorMessage, showError {
                Text(error)
                    .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
                    .multilineTextAlignment(.center)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private func loginButton(action: @escaping () -> Void, disabled: Bool) -> some View {
        Button(action: action) {
            ZStack {
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(
                        LinearGradient(
                            colors: [MeeshyColors.error, MeeshyColors.indigo400],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(height: 52)
                    .shadow(color: MeeshyColors.error.opacity(isDark ? 0.4 : 0.2), radius: 12, y: 6)

                if authManager.isLoading {
                    ProgressView().tint(.white)
                } else {
                    Text("Se connecter")
                        .font(.system(size: MeeshyFont.headlineSize, weight: .bold))
                        .foregroundColor(.white)
                }
            }
        }
        .disabled(authManager.isLoading || disabled)
        .opacity(disabled ? 0.6 : 1)
        .bounceOnTap()
        .padding(.top, MeeshySpacing.sm)
        .accessibilityLabel("Se connecter")
    }

    private func accountAvatar(_ account: SavedAccount, size: CGFloat) -> some View {
        MeeshyAvatar(
            name: account.shortName,
            context: .custom(size),
            kind: .user,
            avatarURL: account.avatarURL,
            enablePulse: false
        )
    }

    // MARK: - Environment Selector

    private var environmentSelector: some View {
        VStack(spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(MeeshyConfig.ServerEnvironment.allCases, id: \.rawValue) { env in
                    Button {
                        HapticFeedback.light()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            selectedEnv = env
                            showCustomInput = env == .custom
                        }
                        if env != .custom {
                            MeeshyConfig.shared.applyEnvironment(env)
                        }
                    } label: {
                        Text(env.label)
                            .font(.system(size: 11, weight: selectedEnv == env ? .bold : .medium))
                            .foregroundColor(selectedEnv == env ? .white : theme.textMuted)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(
                                Capsule().fill(
                                    selectedEnv == env
                                        ? AnyShapeStyle(MeeshyColors.brandGradient)
                                        : AnyShapeStyle(theme.inputBackground)
                                )
                            )
                    }
                    .bounceOnTap(scale: 0.92)
                }
            }

            if showCustomInput || selectedEnv == .custom {
                HStack(spacing: MeeshySpacing.sm) {
                    TextField("gate.example.com", text: $customHost)
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .customHost)
                        .foregroundColor(theme.textPrimary)
                        .submitLabel(.done)
                        .onSubmit { applyCustomHost() }

                    Button {
                        applyCustomHost()
                    } label: {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(MeeshyColors.brandGradient)
                            .font(.system(size: 18))
                    }
                    .disabled(customHost.trimmingCharacters(in: .whitespaces).isEmpty)
                    .bounceOnTap(scale: 0.90)
                }
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(theme.inputBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                                .stroke(theme.inputBorder.opacity(0.3), lineWidth: 1)
                        )
                )
                .padding(.horizontal, MeeshySpacing.xxxl)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            Text(MeeshyConfig.shared.serverOrigin)
                .font(.system(size: 10, weight: .regular, design: .monospaced))
                .foregroundColor(theme.textMuted.opacity(0.5))
        }
    }

    private func applyCustomHost() {
        let host = customHost.trimmingCharacters(in: .whitespaces)
        guard !host.isEmpty else { return }
        focusedField = nil
        MeeshyConfig.shared.applyEnvironment(.custom, customHost: host)
    }

    // MARK: - Actions

    private func attemptLogin() {
        focusedField = nil
        showError = false
        Task {
            await authManager.login(username: username, password: password)
        }
    }

    private func attemptAccountLogin() {
        focusedField = nil
        showError = false
        guard let account = selectedAccount else { return }
        Task {
            await authManager.login(username: account.username, password: accountPassword)
        }
    }
}
