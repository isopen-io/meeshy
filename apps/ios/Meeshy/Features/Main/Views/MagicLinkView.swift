import SwiftUI
import MeeshySDK
import MeeshyUI
import os

// MARK: - Magic Link View

struct MagicLinkView: View {
    @EnvironmentObject var authManager: AuthManager
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var step: Step = .emailInput
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var cooldownRemaining = 0
    @FocusState private var isEmailFocused: Bool

    private static let logger = Logger(subsystem: "com.meeshy.app", category: "magic-link")

    private enum Step {
        case emailInput
        case waiting
    }

    private var isValidEmail: Bool {
        let pattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
        return email.wholeMatch(of: pattern) != nil
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    switch step {
                    case .emailInput:
                        emailInputContent
                    case .waiting:
                        waitingContent
                    }
                }
                .padding(.horizontal, MeeshySpacing.xxxl)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: MeeshyFont.headlineSize, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }
                }
                ToolbarItem(placement: .principal) {
                    Text("Connexion par lien magique")
                        .font(.system(size: MeeshyFont.headlineSize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                }
            }
        }
    }

    // MARK: - Email Input Step

    private var emailInputContent: some View {
        VStack(spacing: MeeshySpacing.xxl) {
            Spacer()

            Image(systemName: "wand.and.stars")
                .font(.system(size: 56, weight: .light))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.purple, MeeshyColors.cyan],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .padding(.bottom, MeeshySpacing.lg)

            Text("Entrez votre adresse email")
                .font(.system(size: MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)

            Text("Nous vous enverrons un lien de connexion securise")
                .font(.system(size: MeeshyFont.subheadSize, weight: .regular))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)

            // Email field
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "envelope.fill")
                    .foregroundColor(Color(hex: "8B5CF6").opacity(0.7))
                    .frame(width: 20)
                TextField("nom@exemple.com", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($isEmailFocused)
                    .foregroundColor(theme.textPrimary)
                    .submitLabel(.send)
                    .onSubmit { sendMagicLink() }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(
                                isEmailFocused
                                    ? Color(hex: "8B5CF6").opacity(0.6)
                                    : theme.inputBorder.opacity(0.3),
                                lineWidth: 1
                            )
                    )
            )

            // Error message
            if let errorMessage {
                Text(errorMessage)
                    .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                    .foregroundColor(MeeshyColors.coral)
                    .multilineTextAlignment(.center)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }

            // Send button
            Button(action: sendMagicLink) {
                ZStack {
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .fill(
                            LinearGradient(
                                colors: [MeeshyColors.purple, MeeshyColors.cyan],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(height: 52)
                        .shadow(color: MeeshyColors.purple.opacity(0.3), radius: 12, y: 6)

                    if isLoading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("Envoyer le lien magique")
                            .font(.system(size: MeeshyFont.headlineSize, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
            }
            .disabled(isLoading || !isValidEmail)
            .opacity(!isValidEmail ? 0.6 : 1)

            Spacer()
            Spacer()
        }
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                isEmailFocused = true
            }
        }
    }

    // MARK: - Waiting Step

    private var waitingContent: some View {
        VStack(spacing: MeeshySpacing.xxl) {
            Spacer()

            // Animated envelope icon
            ZStack {
                Circle()
                    .fill(MeeshyColors.purple.opacity(0.1))
                    .frame(width: 120, height: 120)

                Image(systemName: "envelope.open.fill")
                    .font(.system(size: 48, weight: .light))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.purple, MeeshyColors.cyan],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .symbolEffect(.pulse, options: .repeating)
            }
            .padding(.bottom, MeeshySpacing.md)

            Text("Lien envoye !")
                .font(.system(size: MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Text("Un lien de connexion a ete envoye a")
                .font(.system(size: MeeshyFont.subheadSize, weight: .regular))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)

            Text(email)
                .font(.system(size: MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(MeeshyColors.cyan)

            Text("Ouvrez votre email et cliquez sur le lien")
                .font(.system(size: MeeshyFont.subheadSize, weight: .regular))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .padding(.top, MeeshySpacing.sm)

            // Resend button with cooldown
            Button(action: sendMagicLink) {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: MeeshyFont.subheadSize, weight: .medium))

                    if cooldownRemaining > 0 {
                        Text("Renvoyer (\(cooldownRemaining)s)")
                    } else {
                        Text("Renvoyer")
                    }
                }
                .font(.system(size: MeeshyFont.subheadSize, weight: .semibold))
                .foregroundColor(cooldownRemaining > 0 ? theme.textMuted : MeeshyColors.cyan)
            }
            .disabled(cooldownRemaining > 0 || isLoading)
            .padding(.top, MeeshySpacing.md)

            // Cancel button
            Button {
                withAnimation(MeeshyAnimation.springDefault) {
                    step = .emailInput
                    errorMessage = nil
                }
            } label: {
                Text("Annuler")
                    .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
            .padding(.top, MeeshySpacing.sm)

            Spacer()
            Spacer()
        }
    }

    // MARK: - Actions

    private func sendMagicLink() {
        guard isValidEmail else { return }

        isLoading = true
        errorMessage = nil

        Task {
            do {
                try await AuthService.shared.requestMagicLink(email: email)

                withAnimation(MeeshyAnimation.springDefault) {
                    step = .waiting
                    isLoading = false
                }

                startCooldown()
                Self.logger.info("Magic link sent to \(email, privacy: .private)")
            } catch let error as APIError {
                errorMessage = error.errorDescription
                isLoading = false
                Self.logger.error("Magic link send failed: \(error.localizedDescription)")
            } catch {
                errorMessage = "Une erreur est survenue. Veuillez reessayer."
                isLoading = false
                Self.logger.error("Magic link send failed: \(error.localizedDescription)")
            }
        }
    }

    private func startCooldown() {
        cooldownRemaining = 60
        Task {
            while cooldownRemaining > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled else { return }
                cooldownRemaining -= 1
            }
        }
    }
}
