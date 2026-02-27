import SwiftUI
import MeeshySDK

public struct MeeshyLoginView: View {
    @ObservedObject private var authManager = AuthManager.shared
    @ObservedObject private var theme = ThemeManager.shared

    @State private var username = ""
    @State private var password = ""
    @State private var showMagicLink = false
    @State private var magicLinkEmail = ""
    @State private var magicLinkSent = false
    @State private var showForgotPassword = false
    @State private var showRegister = false

    public var onLoginSuccess: (() -> Void)?
    public var onRegister: (() -> Void)?

    private var isDark: Bool { theme.mode.isDark }

    public init(onLoginSuccess: (() -> Void)? = nil, onRegister: (() -> Void)? = nil) {
        self.onLoginSuccess = onLoginSuccess
        self.onRegister = onRegister
    }

    public var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 28) {
                        // Logo
                        VStack(spacing: 12) {
                            Image(systemName: "bubble.left.and.bubble.right.fill")
                                .font(.system(size: 48))
                                .foregroundStyle(
                                    LinearGradient(colors: [Color(hex: "4ECDC4"), Color(hex: "45B7D1")],
                                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                                )

                            Text("Meeshy")
                                .font(.largeTitle.weight(.bold))
                                .foregroundStyle(theme.textPrimary)

                            Text("Connectez-vous pour continuer")
                                .font(.subheadline)
                                .foregroundStyle(theme.textSecondary)
                        }
                        .padding(.top, 60)

                        // Login form
                        VStack(spacing: 16) {
                            AuthTextField(
                                title: "Nom d'utilisateur ou email",
                                icon: "person.fill",
                                text: $username
                            )

                            AuthTextField(
                                title: "Mot de passe",
                                icon: "lock.fill",
                                text: $password,
                                isSecure: true
                            )
                        }
                        .padding(.horizontal, 24)

                        // Error message
                        if let error = authManager.errorMessage {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(MeeshyColors.coral)
                                .padding(.horizontal, 24)
                        }

                        // Login button
                        Button {
                            Task {
                                await authManager.login(username: username, password: password)
                                if authManager.isAuthenticated {
                                    onLoginSuccess?()
                                }
                            }
                        } label: {
                            HStack {
                                if authManager.isLoading {
                                    ProgressView()
                                        .tint(.white)
                                } else {
                                    Text("Se connecter")
                                        .fontWeight(.semibold)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(
                                LinearGradient(
                                    colors: [Color(hex: "4ECDC4"), Color(hex: "45B7D1")],
                                    startPoint: .leading, endPoint: .trailing
                                )
                            )
                            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
                            .foregroundStyle(.white)
                        }
                        .disabled(username.isEmpty || password.isEmpty || authManager.isLoading)
                        .opacity(username.isEmpty || password.isEmpty ? 0.6 : 1)
                        .padding(.horizontal, 24)

                        // Divider
                        HStack {
                            Rectangle().fill(theme.inputBorder.opacity(0.3)).frame(height: 1)
                            Text("ou")
                                .font(.caption)
                                .foregroundStyle(theme.textSecondary)
                            Rectangle().fill(theme.inputBorder.opacity(0.3)).frame(height: 1)
                        }
                        .padding(.horizontal, 24)

                        // Magic Link button
                        Button {
                            showMagicLink = true
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "link")
                                Text("Connexion par lien magique")
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(
                                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                                    .strokeBorder(Color(hex: "4ECDC4").opacity(0.4), lineWidth: 1)
                            )
                            .foregroundStyle(Color(hex: "4ECDC4"))
                        }
                        .padding(.horizontal, 24)

                        // Forgot password
                        Button {
                            showForgotPassword = true
                        } label: {
                            Text("Mot de passe oublie ?")
                                .font(.subheadline)
                                .foregroundStyle(Color(hex: "45B7D1"))
                        }

                        Spacer(minLength: 40)

                        // Register link
                        HStack(spacing: 4) {
                            Text("Pas de compte ?")
                                .foregroundStyle(theme.textSecondary)
                            Button {
                                if let onRegister {
                                    onRegister()
                                } else {
                                    showRegister = true
                                }
                            } label: {
                                Text("S'inscrire")
                                    .fontWeight(.semibold)
                                    .foregroundStyle(Color(hex: "4ECDC4"))
                            }
                        }
                        .font(.subheadline)
                        .padding(.bottom, 30)
                    }
                }
            }
            .sheet(isPresented: $showMagicLink) {
                magicLinkSheet
            }
            .sheet(isPresented: $showForgotPassword) {
                MeeshyForgotPasswordView()
            }
            .fullScreenCover(isPresented: $showRegister) {
                MeeshyRegisterView(onRegisterSuccess: {
                    showRegister = false
                    onLoginSuccess?()
                }, onBack: {
                    showRegister = false
                })
            }
        }
    }

    // MARK: - Magic Link Sheet

    @ViewBuilder
    private var magicLinkSheet: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                VStack(spacing: 24) {
                    if magicLinkSent {
                        Image(systemName: "envelope.badge.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(Color(hex: "4ECDC4"))

                        Text("Lien envoye !")
                            .font(.title2.weight(.bold))
                            .foregroundStyle(theme.textPrimary)

                        Text("Verifiez votre boite mail \(magicLinkEmail)")
                            .multilineTextAlignment(.center)
                            .foregroundStyle(theme.textSecondary)
                    } else {
                        Text("Entrez votre adresse email pour recevoir un lien de connexion.")
                            .multilineTextAlignment(.center)
                            .foregroundStyle(theme.textSecondary)

                        AuthTextField(
                            title: "Email",
                            icon: "envelope.fill",
                            text: $magicLinkEmail,
                            keyboardType: .emailAddress
                        )
                        .padding(.horizontal, 24)

                        Button {
                            Task {
                                let sent = await authManager.requestMagicLink(email: magicLinkEmail)
                                if sent {
                                    magicLinkSent = true
                                }
                            }
                        } label: {
                            HStack {
                                if authManager.isLoading {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("Envoyer le lien")
                                        .fontWeight(.semibold)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(Color(hex: "4ECDC4"))
                            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
                            .foregroundStyle(.white)
                        }
                        .disabled(magicLinkEmail.isEmpty || authManager.isLoading)
                        .padding(.horizontal, 24)

                        if let error = authManager.errorMessage {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(MeeshyColors.coral)
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Lien magique")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") {
                        showMagicLink = false
                        magicLinkSent = false
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
