//
//  LoginView.swift
//  Meeshy
//
//  Modern login screen with enhanced UX and biometric authentication
//  Minimum iOS 16+
//

import SwiftUI

struct LoginView: View {
    // MARK: - Properties

    @StateObject private var viewModel = LoginViewModel()
    @StateObject private var environmentConfig = EnvironmentConfig.shared
    @State private var showRegisterView = false
    @State private var showNewOnboarding = false  // v2 - Nouveau flux d'inscription
    @State private var showForgotPasswordView = false
    @State private var showBackendSelector = false
    @State private var pendingRedirectInfo: RegistrationRedirectInfo?
    @FocusState private var focusedField: Field?
    @State private var animateGradient = false
    @Environment(\.verticalSizeClass) private var verticalSizeClass

    // Field focus enum
    private enum Field: Hashable {
        case identifier
        case password
    }

    // MARK: - Computed Properties for Adaptive Layout

    /// Check if we're on a compact screen (iPhone SE, iPhone 8, etc.)
    private var isCompactHeight: Bool {
        verticalSizeClass == .compact
    }

    /// Adaptive spacing based on screen size
    private var mainSpacing: CGFloat {
        isCompactHeight ? 12 : 24
    }

    /// Adaptive top padding
    private var topPadding: CGFloat {
        isCompactHeight ? 20 : 60
    }

    /// Adaptive bottom padding
    private var bottomPadding: CGFloat {
        isCompactHeight ? 20 : 40
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ZStack {
                    // Background gradient
                    backgroundGradient

                    ScrollView(showsIndicators: false) {
                        VStack(spacing: mainSpacing) {
                            // Logo and Title - adaptive
                            headerSection(screenHeight: geometry.size.height)

                            // Login Form
                            loginFormSection

                            // Biometric Login - hide on very small screens if needed
                            if viewModel.biometricType != .none {
                                biometricSection(compact: geometry.size.height < 700)
                            }

                            // Error Message
                            if let errorMessage = viewModel.errorMessage {
                                errorSection(errorMessage)
                            }

                            // Success Message
                            if viewModel.loginSuccessful {
                                successSection
                            }

                            // Sign In Button
                            signInButton

                            // Forgot Password Link
                            forgotPasswordButton

                            // Register Link
                            registerSection(compact: geometry.size.height < 700)

                            // Backend URL Indicator
                            backendIndicator

                            // OAuth Options (Future)
                            // oAuthSection
                        }
                        .padding(.horizontal, 24)
                        .padding(.top, topPadding)
                        .padding(.bottom, bottomPadding)
                        .frame(minHeight: geometry.size.height)
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showBackendSelector = true
                    } label: {
                        Image(systemName: "server.rack")
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationDestination(isPresented: $viewModel.showTwoFactorView) {
                TwoFactorView()
            }
            .sheet(isPresented: $showRegisterView) {
                RegisterView { redirectInfo in
                    pendingRedirectInfo = redirectInfo
                }
            }
            .onChange(of: showRegisterView) { isShowing in
                // Handle redirect info when register sheet is dismissed
                if !isShowing, let redirectInfo = pendingRedirectInfo {
                    viewModel.prefillFromRedirect(redirectInfo)
                    pendingRedirectInfo = nil
                    // Focus on password field since identifier is pre-filled
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        focusedField = .password
                    }
                }
            }
            .sheet(isPresented: $showForgotPasswordView) {
                ForgotPasswordView()
            }
            .sheet(isPresented: $showBackendSelector) {
                BackendSelectorView(config: environmentConfig)
            }
            // v2 - Nouveau flux d'inscription animé avec design moderne
            .fullScreenCover(isPresented: $showNewOnboarding) {
                OnboardingFlowView {
                    // Registration completed successfully
                    showNewOnboarding = false
                }
            }
            .onTapGesture {
                hideKeyboard()
            }
            .onAppear {
                animateGradient = true
                // Focus on identifier field after a brief delay
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    focusedField = .identifier
                }
            }
        }
    }

    // MARK: - View Components

    private var backgroundGradient: some View {
        LinearGradient(
            gradient: Gradient(colors: [
                Color(UIColor.systemBackground),
                Color(UIColor.systemBackground).opacity(0.95),
                Color(red: 0, green: 122/255, blue: 1).opacity(0.05)
            ]),
            startPoint: animateGradient ? .topLeading : .bottomTrailing,
            endPoint: animateGradient ? .bottomTrailing : .topLeading
        )
        .ignoresSafeArea()
        .animation(.easeInOut(duration: 8).repeatForever(autoreverses: true), value: animateGradient)
    }

    private func headerSection(screenHeight: CGFloat) -> some View {
        let isCompact = screenHeight < 700
        let logoSize: CGFloat = isCompact ? 70 : 100
        let titleSize: CGFloat = isCompact ? 28 : 34
        let subtitleSize: CGFloat = isCompact ? 15 : 17
        let spacing: CGFloat = isCompact ? 12 : 20

        return VStack(spacing: spacing) {
            // App Icon with animation
            AnimatedLogoView(color: Color(red: 0, green: 122/255, blue: 1), lineWidth: isCompact ? 4 : 6)
                .frame(width: logoSize, height: logoSize)
                .shadow(color: Color(red: 0, green: 122/255, blue: 1).opacity(0.3), radius: isCompact ? 6 : 10, x: 0, y: isCompact ? 3 : 5)
                .accessibilityHidden(true)

            // Title and subtitle
            VStack(spacing: isCompact ? 4 : 8) {
                Text("Welcome Back")
                    .font(.system(size: titleSize, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)

                Text("Sign in to continue to Meeshy")
                    .font(.system(size: subtitleSize))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.bottom, isCompact ? 8 : 16)
    }

    private var loginFormSection: some View {
        VStack(spacing: 16) {
            // Identifier field with icon
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 0) {
                    AuthTextField(
                        title: "Username, Email or Phone",
                        placeholder: "Enter your identifier",
                        text: $viewModel.identifier,
                        keyboardType: .emailAddress,
                        textContentType: .username,
                        errorMessage: viewModel.identifierError
                    )
                    .focused($focusedField, equals: .identifier)
                    .onSubmit {
                        focusedField = .password
                    }
                }

                // Phone number hint - shows formatted number with country code
                if viewModel.isPhoneNumberIdentifier && !viewModel.identifier.hasPrefix("+") {
                    HStack(spacing: 4) {
                        if let country = viewModel.selectedCountry {
                            Text("\(country.flag) \(country.dialCode)")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                        }
                        Text("→ \(viewModel.formattedIdentifier)")
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 4)
                    .transition(.opacity)
                    .animation(.easeInOut(duration: 0.2), value: viewModel.isPhoneNumberIdentifier)
                }
            }

            // Password field with icon
            AuthTextField(
                title: "Password",
                placeholder: "Enter your password",
                text: $viewModel.password,
                textContentType: .password,
                isSecure: true,
                errorMessage: viewModel.passwordError
            )
            .focused($focusedField, equals: .password)
            .onSubmit {
                if viewModel.canLogin {
                    Task {
                        await viewModel.login()
                    }
                }
            }

            // Remember me toggle (optional for future)
            // rememberMeToggle
        }
    }

    private func biometricSection(compact: Bool) -> some View {
        VStack(spacing: compact ? 10 : 16) {
            // Divider with "OR"
            HStack {
                Rectangle()
                    .fill(Color(UIColor.systemGray4))
                    .frame(height: 1)

                Text("OR")
                    .font(.system(size: compact ? 11 : 13, weight: .medium))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, compact ? 10 : 16)

                Rectangle()
                    .fill(Color(UIColor.systemGray4))
                    .frame(height: 1)
            }
            .padding(.vertical, compact ? 4 : 8)

            // Biometric Button with better design
            Button(action: {
                Task {
                    await viewModel.loginWithBiometrics()
                }
            }) {
                HStack(spacing: compact ? 8 : 12) {
                    Image(systemName: biometricIcon)
                        .font(.system(size: compact ? 18 : 22))
                        .foregroundColor(Color(red: 0, green: 122/255, blue: 1))

                    Text("Sign in with \(viewModel.biometricType.displayName)")
                        .font(.system(size: compact ? 15 : 17, weight: .medium))
                        .foregroundColor(.primary)

                    Spacer()

                    if viewModel.isBiometricLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle())
                            .scaleEffect(0.8)
                    }
                }
                .padding(.horizontal, compact ? 16 : 20)
                .frame(height: compact ? 48 : 56)
                .background(
                    RoundedRectangle(cornerRadius: compact ? 12 : 14)
                        .fill(Color(UIColor.systemGray6))
                        .overlay(
                            RoundedRectangle(cornerRadius: compact ? 12 : 14)
                                .stroke(Color(UIColor.systemGray4), lineWidth: 1)
                        )
                )
            }
            .disabled(viewModel.isLoading || viewModel.isBiometricLoading)
            .accessibilityLabel("Sign in with \(viewModel.biometricType.displayName)")
        }
        .padding(.top, compact ? 4 : 8)
    }

    private func errorSection(_ message: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 16))

            Text(message)
                .font(.system(size: 15))
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            Spacer()
        }
        .foregroundColor(.white)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(red: 1, green: 59/255, blue: 48/255))
        )
        .transition(.asymmetric(
            insertion: .move(edge: .top).combined(with: .opacity),
            removal: .opacity
        ))
        .animation(.spring(response: 0.5, dampingFraction: 0.8), value: message)
    }

    private var successSection: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 16))

            Text("Login successful! Redirecting...")
                .font(.system(size: 15))
                .multilineTextAlignment(.leading)

            Spacer()
        }
        .foregroundColor(.white)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(red: 52/255, green: 199/255, blue: 89/255))
        )
        .transition(.asymmetric(
            insertion: .move(edge: .top).combined(with: .opacity),
            removal: .opacity
        ))
    }

    private var signInButton: some View {
        AuthButton(
            title: viewModel.isLoading ? "Signing In..." : "Sign In",
            isLoading: viewModel.isLoading,
            isEnabled: viewModel.canLogin,
            style: .primary
        ) {
            Task {
                await viewModel.login()
            }
        }
        .animation(.easeInOut(duration: 0.2), value: viewModel.isLoading)
    }

    private var forgotPasswordButton: some View {
        Button(action: {
            showForgotPasswordView = true

            // Haptic feedback
            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.impactOccurred()
        }) {
            Text("Forgot Password?")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
        }
        .padding(.top, 8)
    }

    private func registerSection(compact: Bool) -> some View {
        VStack(spacing: compact ? 12 : 20) {
            // Divider
            Rectangle()
                .fill(Color(UIColor.systemGray5))
                .frame(height: 1)
                .padding(.horizontal, compact ? 20 : 40)

            // Register prompt
            VStack(spacing: compact ? 6 : 8) {
                Text("Don't have an account?")
                    .font(.system(size: compact ? 13 : 15))
                    .foregroundColor(.secondary)

                Button(action: {
                    // v2 - Utiliser le nouveau flux d'inscription animé
                    showNewOnboarding = true

                    // Haptic feedback
                    let generator = UIImpactFeedbackGenerator(style: .light)
                    generator.impactOccurred()
                }) {
                    Text("Create Account")
                        .font(.system(size: compact ? 15 : 17, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: compact ? 44 : 50)
                        .background(
                            LinearGradient(
                                gradient: Gradient(colors: [
                                    Color(red: 0, green: 122/255, blue: 1),
                                    Color(red: 0, green: 100/255, blue: 1)
                                ]),
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .cornerRadius(compact ? 12 : 14)
                }
            }
        }
    }
    
    private var backendIndicator: some View {
        Button {
            showBackendSelector = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "server.rack")
                    .font(.system(size: 10))
                Text(environmentConfig.activeURL)
                    .font(.system(size: 10, weight: .medium))
            }
            .foregroundColor(.secondary)
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(UIColor.systemGray6))
            )
        }
        .buttonStyle(.plain)
    }

    /* Future OAuth section
    private var oAuthSection: some View {
        VStack(spacing: 16) {
            Text("Or continue with")
                .font(.system(size: 14))
                .foregroundColor(.secondary)

            HStack(spacing: 16) {
                // Google
                oAuthButton(
                    icon: "globe",
                    title: "Google",
                    color: .red,
                    action: { viewModel.loginWithGoogle() }
                )

                // Apple
                oAuthButton(
                    icon: "apple.logo",
                    title: "Apple",
                    color: .black,
                    action: { viewModel.loginWithApple() }
                )

                // Facebook
                oAuthButton(
                    icon: "f.circle",
                    title: "Facebook",
                    color: .blue,
                    action: { viewModel.loginWithFacebook() }
                )
            }
        }
        .padding(.top, 20)
    }

    private func oAuthButton(icon: String, title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 24))
                    .foregroundColor(color)

                Text(title)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 60)
            .background(Color(UIColor.systemGray6))
            .cornerRadius(12)
        }
    }
    */

    // MARK: - Computed Properties

    private var biometricIcon: String {
        switch viewModel.biometricType {
        case .faceID, .opticID:
            return "faceid"
        case .touchID:
            return "touchid"
        case .none:
            return "lock.fill"
        }
    }

    // MARK: - Helper Methods

    private func hideKeyboard() {
        focusedField = nil
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
    }
}

// MARK: - Preview

#Preview("Light Mode") {
    LoginView()
}

#Preview("Dark Mode") {
    LoginView()
        .preferredColorScheme(.dark)
}

#Preview("iPad") {
    LoginView()
        .previewDevice("iPad Pro (11-inch) (4th generation)")
}