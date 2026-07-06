import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManager
    @StateObject private var theme = ThemeManager.shared

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
    @State private var twoFactorCode = ""

    // Environment selector
    @State private var selectedEnv: MeeshyConfig.ServerEnvironment = MeeshyConfig.shared.selectedEnvironment
    @State private var customHost: String = MeeshyConfig.shared.customHost
    @State private var showCustomInput = false

    @FocusState private var focusedField: Field?

    private enum Field { case username, password, accountPassword, customHost, twoFactorCode }

    private var isDark: Bool { theme.mode.isDark }
    private var showPicker: Bool { !authManager.savedAccounts.isEmpty && !showNormalLogin }

    // On simulator only: prefill test credentials
    private static let isSimulator = ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] != nil

    /// Optional DX hook: when running Debug builds, the dev can populate the
    /// Xcode scheme env with `DEBUG_AUTOFILL_USERNAME` / `DEBUG_AUTOFILL_PASSWORD`
    /// to skip the login form. The values are read at runtime — they NEVER
    /// ship inside the Release binary because the whole branch is gated by
    /// `#if DEBUG`.
    private static var debugAutofillUsername: String? {
        #if DEBUG
        return ProcessInfo.processInfo.environment["DEBUG_AUTOFILL_USERNAME"]
        #else
        return nil
        #endif
    }
    private static var debugAutofillPassword: String? {
        #if DEBUG
        return ProcessInfo.processInfo.environment["DEBUG_AUTOFILL_PASSWORD"]
        #else
        return nil
        #endif
    }

    init() {
        if Self.isSimulator, let user = Self.debugAutofillUsername {
            _username = State(initialValue: user)
        }
        if Self.isSimulator, let pwd = Self.debugAutofillPassword {
            _password = State(initialValue: pwd)
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
                    color: isDark ? .white : MeeshyColors.indigo950,
                    lineWidth: 10,
                    continuous: false
                )
                .frame(width: 100, height: 100)
                .padding(.bottom, MeeshySpacing.xxl)
                .accessibilityHidden(true)

                Text("Meeshy")
                    .font(MeeshyFont.relative(40, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.purple700, MeeshyColors.purple600, MeeshyColors.purple500],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .shadow(color: MeeshyColors.purple700.opacity(isDark ? 0.5 : 0.25), radius: MeeshyShadow.strong.radius, x: 0, y: 4)
                    .padding(.bottom, MeeshySpacing.xxxl + MeeshySpacing.lg)
                    .accessibilityAddTraits(.isHeader)

                if authManager.requires2FA {
                    twoFactorSection
                } else if showPicker {
                    accountPickerSection
                } else {
                    normalLoginSection
                }

                Spacer()

                Button { showRegister = true } label: {
                    HStack(spacing: 4) {
                        Text(String(localized: "auth.login.no_account", bundle: .main))
                            .foregroundColor(theme.textMuted)
                        Text(String(localized: "auth.login.create_account", bundle: .main))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [MeeshyColors.purple700, MeeshyColors.purple600],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                    }
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                }
                .bounceOnTap(scale: 0.94)
                .accessibilityLabel(String(localized: "auth.login.create_account", bundle: .main))
                .accessibilityHint(String(localized: "auth.login.create_account.hint", bundle: .main))
                .padding(.bottom, MeeshySpacing.md)
                .opacity(showFields ? 1 : 0)

                // Sélecteur d'environnement (Production/Staging/Localhost/Custom +
                // « Connecté à … ») réservé à l'environnement de simulation.
                if Self.isSimulator {
                    environmentSelector
                        .padding(.bottom, MeeshySpacing.md)
                        .opacity(showFields ? 1 : 0)
                }

                // Signature de marque partagée avec le splash (BrandSignature) :
                // version + « Fait avec ❤️ par Services CEO » + logo.
                BrandSignature()
                    .padding(.top, MeeshySpacing.md)
                    .opacity(showFields ? 1 : 0)

                // 3e spacer (avec ceux du haut et du milieu) : remonte l'ensemble de
                // la page et décolle la signature du bord bas.
                Spacer()
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
        .onDisappear {
            withTransaction(Transaction(animation: nil)) {
                glowPulse = false
            }
        }
        .adaptiveOnChange(of: authManager.errorMessage) { _, newValue in
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
        .offset(y: showFields ? 0 : MeeshySpacing.xxxl)
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
                        Label(String(localized: "auth.login.remove_account", bundle: .main), systemImage: "trash")
                        }
                    }
            }

            errorRow

            Button {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    showNormalLogin = true
                }
            } label: {
                Text(String(localized: "auth.login.other_account", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
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
                accountPassword = Self.isSimulator ? (Self.debugAutofillPassword ?? "") : ""
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                focusedField = .accountPassword
            }
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                accountAvatar(account, size: 44)

                VStack(alignment: .leading, spacing: 2) {
                    Text(account.shortName)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text("@\(account.username)")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .regular))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(MeeshyFont.relative(13, weight: .semibold))
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
                    // Chrome de retour : glyphe centré dans un cadre de tap fixe 36×36
                    // (doctrine 82i) — gardé figé pour ne pas déborder le cercle.
                    Image(systemName: "chevron.left")
                        .font(MeeshyFont.relative(16, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 36, height: 36)
                        .background(
                            Circle().fill(theme.inputBackground)
                        )
                }
                .bounceOnTap(scale: 0.90)
                .accessibilityLabel(String(localized: "a11y.back", bundle: .main))

                accountAvatar(account, size: 40)

                VStack(alignment: .leading, spacing: 1) {
                    Text(account.shortName)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text("@\(account.username)")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()
            }

            // Password field
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "lock.fill")
                    .foregroundColor(MeeshyColors.purple600.opacity(0.7))
                    .frame(width: 20)
                    .accessibilityHidden(true)
                SecureField(String(localized: "auth.password.placeholder", bundle: .main), text: $accountPassword)
                    .textContentType(.password)
                    .focused($focusedField, equals: .accountPassword)
                    .foregroundColor(theme.textPrimary)
                    .submitLabel(.go)
                    .onSubmit { attemptAccountLogin() }
                    .accessibilityLabel(String(localized: "auth.password.placeholder", bundle: .main))
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
                                    ? MeeshyColors.purple600.opacity(0.6)
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
                                .font(MeeshyFont.relative(13, weight: .semibold))
                            Text(String(localized: "auth.login.saved_accounts", bundle: .main))
                                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
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
                    .foregroundColor(MeeshyColors.purple600.opacity(0.7))
                    .frame(width: 20)
                    .accessibilityHidden(true)
                TextField(String(localized: "auth.username.placeholder", bundle: .main), text: $username)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .username)
                    .foregroundColor(theme.textPrimary)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                    .accessibilityLabel(String(localized: "auth.username.placeholder", bundle: .main))
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
                                    ? MeeshyColors.purple600.opacity(0.6)
                                    : theme.inputBorder.opacity(0.3),
                                lineWidth: 1
                            )
                    )
            )
            .bounceOnFocus(focusedField == .username)

            // Password
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "lock.fill")
                    .foregroundColor(MeeshyColors.purple600.opacity(0.7))
                    .frame(width: 20)
                    .accessibilityHidden(true)
                SecureField(String(localized: "auth.password.placeholder", bundle: .main), text: $password)
                    .textContentType(.password)
                    .focused($focusedField, equals: .password)
                    .foregroundColor(theme.textPrimary)
                    .submitLabel(.go)
                    .onSubmit { attemptLogin() }
                    .accessibilityLabel(String(localized: "auth.password.placeholder", bundle: .main))
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
                                    ? MeeshyColors.purple600.opacity(0.6)
                                    : theme.inputBorder.opacity(0.3),
                                lineWidth: 1
                            )
                    )
            )
            .bounceOnFocus(focusedField == .password)

            errorRow

            loginButton(action: attemptLogin, disabled: username.isEmpty || password.isEmpty)

            VStack(spacing: MeeshySpacing.sm) {
                // « Connexion sans mot de passe » en premier (action mise en avant),
                // « Mot de passe oublié » en dessous — empilés, plus côte à côte.
                Button { showMagicLink = true } label: {
                    Text(String(localized: "auth.login.passwordless", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [MeeshyColors.purple500, MeeshyColors.indigo400],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                }
                .bounceOnTap(scale: 0.94)
                .accessibilityLabel(String(localized: "auth.login.passwordless", bundle: .main))

                Button { showForgotPassword = true } label: {
                    Text(String(localized: "auth.login.forgot_password", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .bounceOnTap(scale: 0.94)
                .accessibilityLabel(String(localized: "auth.login.forgot_password.label", bundle: .main))
            }
            .padding(.top, MeeshySpacing.xs)
        }
        .padding(.horizontal, MeeshySpacing.xxxl)
        .opacity(showFields ? 1 : 0)
        .offset(y: showFields ? 0 : MeeshySpacing.xxxl)
    }

    // MARK: - Reusable subviews

    private var errorRow: some View {
        Group {
            if let error = authManager.errorMessage, showError {
                Text(error)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
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
                    .shadow(color: MeeshyColors.error.opacity(isDark ? 0.4 : 0.2), radius: MeeshyShadow.strong.radius, y: 6)

                if authManager.isLoading {
                    ProgressView().tint(.white)
                } else {
                    Text(String(localized: "auth.login.submit", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                        .foregroundColor(.white)
                }
            }
        }
        .disabled(authManager.isLoading || disabled)
        .opacity(disabled ? 0.6 : 1)
        .bounceOnTap()
        .padding(.top, MeeshySpacing.sm)
        .accessibilityLabel(String(localized: "auth.login.submit", bundle: .main))
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
                            .font(MeeshyFont.relative(11, weight: selectedEnv == env ? .bold : .medium))
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
                        .font(MeeshyFont.relative(13, weight: .medium, design: .monospaced))
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
                            .font(MeeshyFont.relative(18))
                    }
                    .disabled(customHost.trimmingCharacters(in: .whitespaces).isEmpty)
                    .bounceOnTap(scale: 0.90)
                    .accessibilityLabel(String(localized: "common.confirm", defaultValue: "Confirmer", bundle: .main))
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

            Text(String(format: String(localized: "auth.login.server_origin", defaultValue: "Connecté à : %@", bundle: .main), MeeshyConfig.shared.serverOrigin))
                .font(MeeshyFont.relative(10, weight: .regular, design: .monospaced))
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

    private var twoFactorSection: some View {
        VStack(spacing: MeeshySpacing.lg) {
            Text(String(localized: "auth.login.two_factor.title", bundle: .main))
                .font(MeeshyFont.relative(24, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .padding(.bottom, MeeshySpacing.xs)

            Text(String(localized: "auth.login.two_factor.description", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.bottom, MeeshySpacing.md)

            // Code Input
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "key.fill")
                    .foregroundColor(MeeshyColors.purple600.opacity(0.7))
                    .frame(width: 20)
                    .accessibilityHidden(true)
                TextField(String(localized: "auth.login.two_factor.placeholder", bundle: .main), text: $twoFactorCode)
                    .keyboardType(.numberPad)
                    .focused($focusedField, equals: .twoFactorCode)
                    .foregroundColor(theme.textPrimary)
                    .submitLabel(.go)
                    .onSubmit { attempt2FALogin() }
                    .accessibilityLabel(String(localized: "auth.login.two_factor.label", bundle: .main))
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(
                                focusedField == .twoFactorCode
                                    ? MeeshyColors.purple600.opacity(0.6)
                                    : theme.inputBorder.opacity(0.3),
                                lineWidth: 1
                            )
                    )
            )
            .bounceOnFocus(focusedField == .twoFactorCode)

            errorRow

            // Action Buttons
            VStack(spacing: MeeshySpacing.sm) {
                loginButton(action: attempt2FALogin, disabled: twoFactorCode.count < 6)
                
                Button {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        authManager.requires2FA = false
                        authManager.twoFactorToken = nil
                        twoFactorCode = ""
                    }
                } label: {
                    Text(String(localized: "common.cancel", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, MeeshySpacing.md)
                }
                .bounceOnTap(scale: 0.94)
            }
        }
        .padding(.horizontal, MeeshySpacing.xxxl)
        .opacity(showFields ? 1 : 0)
        .offset(y: showFields ? 0 : MeeshySpacing.xxxl)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                focusedField = .twoFactorCode
            }
        }
    }

    private func attempt2FALogin() {
        focusedField = nil
        Task {
            await authManager.completeLoginWith2FA(code: twoFactorCode)
        }
    }
}
