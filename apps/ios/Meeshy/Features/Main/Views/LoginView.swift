import SwiftUI
import MeeshySDK

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManager

    @State private var username = ""
    @State private var password = ""
    @State private var glowPulse = false
    @State private var showFields = false
    @State private var showError = false
    @FocusState private var focusedField: Field?

    private enum Field { case username, password }

    init() {
        #if DEBUG
        _username = State(initialValue: "atabeth")
        _password = State(initialValue: "pD5p1ir9uxLUf2X2FpNE")
        #endif
    }

    var body: some View {
        ZStack {
            // Background (same as splash)
            LinearGradient(
                colors: [
                    Color(hex: "0a0a1a"),
                    Color(hex: "1a1035"),
                    Color(hex: "0d1f2d")
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            // Ambient orbs
            Circle()
                .fill(Color(hex: "08D9D6").opacity(0.15))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: -80, y: -200)
                .scaleEffect(glowPulse ? 1.3 : 0.8)

            Circle()
                .fill(Color(hex: "FF2E63").opacity(0.12))
                .frame(width: 160, height: 160)
                .blur(radius: 50)
                .offset(x: 90, y: 180)
                .scaleEffect(glowPulse ? 1.2 : 0.9)

            Circle()
                .fill(Color(hex: "B24BF3").opacity(0.1))
                .frame(width: 120, height: 120)
                .blur(radius: 40)
                .offset(x: 60, y: -80)
                .scaleEffect(glowPulse ? 1.1 : 1.0)

            // Content
            VStack(spacing: 0) {
                Spacer()

                // Logo + Title
                AnimatedLogoView(color: .white, lineWidth: 10, continuous: false)
                    .frame(width: 100, height: 100)
                    .padding(.bottom, 24)

                Text("Meeshy")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: "B24BF3"), Color(hex: "8B5CF6"), Color(hex: "A855F7")],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .shadow(color: Color(hex: "B24BF3").opacity(0.5), radius: 12, x: 0, y: 4)
                    .padding(.bottom, 48)

                // Login form
                VStack(spacing: 16) {
                    // Username
                    HStack(spacing: 12) {
                        Image(systemName: "person.fill")
                            .foregroundColor(Color(hex: "8B5CF6").opacity(0.7))
                            .frame(width: 20)
                        TextField("Nom d'utilisateur", text: $username)
                            .textContentType(.username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .username)
                            .foregroundColor(.white)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .password }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color.white.opacity(0.08))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(
                                        focusedField == .username
                                            ? Color(hex: "8B5CF6").opacity(0.6)
                                            : Color.white.opacity(0.1),
                                        lineWidth: 1
                                    )
                            )
                    )

                    // Password
                    HStack(spacing: 12) {
                        Image(systemName: "lock.fill")
                            .foregroundColor(Color(hex: "8B5CF6").opacity(0.7))
                            .frame(width: 20)
                        SecureField("Mot de passe", text: $password)
                            .textContentType(.password)
                            .focused($focusedField, equals: .password)
                            .foregroundColor(.white)
                            .submitLabel(.go)
                            .onSubmit { attemptLogin() }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color.white.opacity(0.08))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(
                                        focusedField == .password
                                            ? Color(hex: "8B5CF6").opacity(0.6)
                                            : Color.white.opacity(0.1),
                                        lineWidth: 1
                                    )
                            )
                    )

                    // Error message
                    if let error = authManager.errorMessage, showError {
                        Text(error)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Color(hex: "FF6B6B"))
                            .multilineTextAlignment(.center)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    // Login button
                    Button(action: attemptLogin) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 14)
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .frame(height: 52)
                                .shadow(color: Color(hex: "FF6B6B").opacity(0.4), radius: 12, y: 6)

                            if authManager.isLoading {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Text("Se connecter")
                                    .font(.system(size: 17, weight: .bold))
                                    .foregroundColor(.white)
                            }
                        }
                    }
                    .disabled(authManager.isLoading || username.isEmpty || password.isEmpty)
                    .opacity(username.isEmpty || password.isEmpty ? 0.6 : 1)
                    .padding(.top, 8)
                }
                .padding(.horizontal, 32)
                .opacity(showFields ? 1 : 0)
                .offset(y: showFields ? 0 : 30)

                Spacer()

                // Bottom text
                Text("Pas de compte ? Bientot disponible")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.3))
                    .padding(.bottom, 32)
                    .opacity(showFields ? 1 : 0)
            }
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
                withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
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
