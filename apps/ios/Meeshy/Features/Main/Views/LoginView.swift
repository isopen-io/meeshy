import SwiftUI
import MeeshySDK
import MeeshyUI

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManager
    @ObservedObject private var theme = ThemeManager.shared

    @State private var username = ""
    @State private var password = ""
    @State private var glowPulse = false
    @State private var showFields = false
    @State private var showError = false
    @State private var showRegister = false
    @State private var showForgotPassword = false
    @State private var showMagicLink = false
    @FocusState private var focusedField: Field?

    private enum Field { case username, password }

    private var isDark: Bool { theme.mode.isDark }

    init() {
        #if DEBUG
        _username = State(initialValue: "atabeth")
        _password = State(initialValue: "pD5p1ir9uxLUf2X2FpNE")
        #endif
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient
                .ignoresSafeArea()

            // Ambient orbs from theme
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

                VStack(spacing: MeeshySpacing.lg) {
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

                    // Error message
                    if let error = authManager.errorMessage, showError {
                        Text(error)
                            .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                            .foregroundColor(MeeshyColors.coral)
                            .multilineTextAlignment(.center)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    // Login button
                    Button(action: attemptLogin) {
                        ZStack {
                            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                                .fill(
                                    LinearGradient(
                                        colors: [MeeshyColors.coral, MeeshyColors.cyan],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .frame(height: 52)
                                .shadow(color: MeeshyColors.coral.opacity(isDark ? 0.4 : 0.2), radius: 12, y: 6)

                            if authManager.isLoading {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Text("Se connecter")
                                    .font(.system(size: MeeshyFont.headlineSize, weight: .bold))
                                    .foregroundColor(.white)
                            }
                        }
                    }
                    .disabled(authManager.isLoading || username.isEmpty || password.isEmpty)
                    .opacity(username.isEmpty || password.isEmpty ? 0.6 : 1)
                    .padding(.top, MeeshySpacing.sm)
                    .accessibilityLabel("Se connecter")
                    .accessibilityHint("Connexion avec le nom d'utilisateur et le mot de passe saisis")

                    HStack(spacing: MeeshySpacing.lg) {
                        Button { showForgotPassword = true } label: {
                            Text("Mot de passe oublie ?")
                                .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                                .foregroundColor(theme.textMuted)
                        }
                        .accessibilityLabel("Mot de passe oublie")
                        .accessibilityHint("Ouvre le formulaire de reinitialisation du mot de passe")

                        Text("·")
                            .foregroundColor(theme.textMuted.opacity(0.5))
                            .accessibilityHidden(true)

                        Button { showMagicLink = true } label: {
                            Text("Connexion sans mot de passe")
                                .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                                .foregroundStyle(
                                    LinearGradient(
                                        colors: [Color(hex: "A855F7"), MeeshyColors.cyan],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                        }
                        .accessibilityLabel("Connexion sans mot de passe")
                        .accessibilityHint("Ouvre le formulaire de connexion par lien magique")
                    }
                    .padding(.top, MeeshySpacing.xs)
                }
                .padding(.horizontal, MeeshySpacing.xxxl)
                .opacity(showFields ? 1 : 0)
                .offset(y: showFields ? 0 : 30)

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
                .accessibilityLabel("Creer un compte")
                .accessibilityHint("Ouvre le formulaire d'inscription")
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
            MeeshyRegisterView(
                onRegisterSuccess: { showRegister = false },
                onBack: { showRegister = false }
            )
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                glowPulse = true
            }
            withAnimation(.spring(response: 0.7, dampingFraction: 0.8).delay(0.2)) {
                showFields = true
            }
        }
        .onChange(of: authManager.errorMessage) { newValue in
            if newValue != nil {
                withAnimation(MeeshyAnimation.springDefault) {
                    showError = true
                }
            }
        }
        .onTapGesture { focusedField = nil }
    }

    private func attemptLogin() {
        focusedField = nil
        showError = false
        Task {
            await authManager.login(username: username, password: password)
        }
    }
}
