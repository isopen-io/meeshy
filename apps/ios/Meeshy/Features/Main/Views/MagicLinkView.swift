import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - Magic Link View

struct MagicLinkView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var step: Step = .emailInput
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var countdownRemaining = 0
    @State private var linkExpired = false
    @State private var countdownTask: Task<Void, Never>?
    @FocusState private var isEmailFocused: Bool

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "magic-link")

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
            .onDisappear {
                countdownTask?.cancel()
                countdownTask = nil
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        // Glyphe de fermeture en barre de navigation (chrome, cadre tap géré
                        // par la toolbar) — taille figée, doctrine chrome 82i/87i.
                        Image(systemName: "xmark")
                            .font(.system(size: MeeshyFont.headlineSize, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }
                    .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                }
                ToolbarItem(placement: .principal) {
                    Text(String(localized: "auth.magiclink.title", defaultValue: "Connexion par lien magique", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                }
            }
        }
    }

    // MARK: - Email Input Step

    private var emailInputContent: some View {
        VStack(spacing: MeeshySpacing.xxl) {
            Spacer()

            // Héros décoratif 56pt (≥40pt) — taille figée, décoratif (a11y masqué).
            Image(systemName: "wand.and.stars")
                .font(.system(size: 56, weight: .light))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.indigo600, MeeshyColors.indigo400],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .padding(.bottom, MeeshySpacing.lg)
                .accessibilityHidden(true)

            Text(String(localized: "auth.magiclink.email.title", defaultValue: "Entrez votre adresse email", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)

            Text(String(localized: "auth.magiclink.email.subtitle", defaultValue: "Nous vous enverrons un lien de connexion securise", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)

            // Email field
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "envelope.fill")
                    .foregroundColor(Color(hex: "8B5CF6").opacity(0.7))
                    .frame(width: 20)
                TextField(String(localized: "auth.magiclink.email.placeholder", defaultValue: "nom@exemple.com", bundle: .main), text: $email)
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
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
                    .multilineTextAlignment(.center)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }

            // Send button
            Button(action: sendMagicLink) {
                ZStack {
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .fill(
                            LinearGradient(
                                colors: [MeeshyColors.indigo600, MeeshyColors.indigo400],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(height: 52)
                        .shadow(color: MeeshyColors.indigo600.opacity(0.3), radius: 12, y: 6)

                    if isLoading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text(String(localized: "auth.magiclink.send", defaultValue: "Envoyer le lien magique", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
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
                    .fill(MeeshyColors.indigo600.opacity(0.1))
                    .frame(width: 120, height: 120)

                // Héros décoratif 48pt (≥40pt) — taille figée, décoratif (a11y masqué).
                Image(systemName: "envelope.open.fill")
                    .font(.system(size: 48, weight: .light))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.indigo600, MeeshyColors.indigo400],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .adaptiveSymbolPulse()
                    .accessibilityHidden(true)
            }
            .padding(.bottom, MeeshySpacing.md)

            Text(String(localized: "auth.magiclink.sent.title", defaultValue: "Lien envoye !", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Text(String(localized: "auth.magiclink.sent.subtitle", defaultValue: "Un lien de connexion a ete envoye a", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)

            Text(email)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo400)

            if linkExpired {
                Text(String(localized: "auth.magiclink.expired", defaultValue: "Lien expire, renvoyez-en un nouveau", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
                    .multilineTextAlignment(.center)
                    .padding(.top, MeeshySpacing.sm)
            } else {
                Text(String(localized: "auth.magiclink.instructions", defaultValue: "Ouvrez votre email et cliquez sur le lien", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.top, MeeshySpacing.sm)

                if countdownRemaining > 0 {
                    Text(formattedCountdown)
                        .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold).monospacedDigit())
                        .foregroundColor(MeeshyColors.indigo600)
                        .padding(.top, MeeshySpacing.sm)
                }
            }

            // Resend button
            Button(action: sendMagicLink) {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "arrow.clockwise")
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    Text(String(localized: "auth.magiclink.resend", defaultValue: "Renvoyer", bundle: .main))
                }
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundColor(countdownRemaining > 0 ? theme.textMuted : MeeshyColors.indigo400)
            }
            .accessibilityLabel(String(localized: "auth.magiclink.resendLabel",
                                        defaultValue: "Resend magic link", bundle: .main))
            .disabled(countdownRemaining > 0 || isLoading)
            .padding(.top, MeeshySpacing.md)

            // Cancel button
            Button {
                withAnimation(MeeshyAnimation.springDefault) {
                    step = .emailInput
                    errorMessage = nil
                }
            } label: {
                Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
            .padding(.top, MeeshySpacing.sm)

            Spacer()
            Spacer()
        }
    }

    // MARK: - Actions

    private var formattedCountdown: String {
        let minutes = countdownRemaining / 60
        let seconds = countdownRemaining % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private func sendMagicLink() {
        guard isValidEmail else { return }

        isLoading = true
        errorMessage = nil
        linkExpired = false

        Task {
            do {
                let expiresInSeconds = try await AuthService.shared.requestMagicLink(email: email)

                withAnimation(MeeshyAnimation.springDefault) {
                    step = .waiting
                    isLoading = false
                }

                startCountdown(expiresInSeconds)
                Self.logger.info("Magic link sent to \(email, privacy: .private)")
            } catch let error as APIError {
                errorMessage = error.errorDescription
                isLoading = false
                Self.logger.error("Magic link send failed: \(error.localizedDescription)")
            } catch {
                errorMessage = String(localized: "auth.magiclink.error.generic", defaultValue: "Une erreur est survenue. Veuillez reessayer.", bundle: .main)
                isLoading = false
                Self.logger.error("Magic link send failed: \(error.localizedDescription)")
            }
        }
    }

    private func startCountdown(_ seconds: Int) {
        countdownRemaining = seconds
        linkExpired = false
        // Stocké + annulé avant relance : un resend pendant un countdown
        // actif lançait sinon une 2e boucle (décompte à 2×), et la boucle
        // survivait au dismiss de l'écran pour toute la durée d'expiration.
        countdownTask?.cancel()
        countdownTask = Task {
            while countdownRemaining > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled else { return }
                countdownRemaining -= 1
            }
            linkExpired = true
        }
    }
}
