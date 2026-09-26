import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - Magic Link View

struct MagicLinkView: View {
    @EnvironmentObject var authManager: AuthManager
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
    /// Le (i) DÉPLIÉ — un seul à la fois, comme à l'inscription (#6626).
    @State private var expandedHint: Hint?

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "magic-link")

    private enum Step {
        case emailInput
        case waiting
    }

    /// UNE ligne visible par étape dit ce qu'on fait ; le COMMENT vit derrière
    /// un (i) (directive porteur 2026-09-15, #6626) — le même que celui des
    /// champs de l'inscription.
    private enum Hint {
        case howItWorks
        case nothingReceived
    }

    private var howItWorksHint: AuthInfoHint {
        AuthInfoHint(
            text: String(
                localized: "auth.magiclink.email.subtitle",
                defaultValue: "Pas de mot de passe à retenir : nous vous envoyons un lien par e-mail. Ouvrez-le et vous êtes connecté.",
                bundle: .main
            ),
            buttonLabel: String(localized: "auth.magiclink.email.hintLabel", defaultValue: "Comment ça marche", bundle: .main)
        )
    }

    private var nothingReceivedHint: AuthInfoHint {
        AuthInfoHint(
            text: String(
                localized: "auth.magiclink.sent.spamHint",
                defaultValue: "Regardez vos indésirables (spam) : le message peut y être tombé.",
                bundle: .main
            ),
            buttonLabel: String(localized: "auth.magiclink.sent.hintLabel", defaultValue: "Rien reçu ?", bundle: .main)
        )
    }

    private func expansion(of hint: Hint) -> Binding<Bool> {
        Binding(
            get: { expandedHint == hint },
            set: { expandedHint = $0 ? hint : nil }
        )
    }

    private static let emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

    private var isValidEmail: Bool {
        email.wholeMatch(of: Self.emailPattern) != nil
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
                // La colonne se borne comme celle de la connexion (#6644).
                // Présentée en feuille-formulaire sur iPad (579 pt mesurés),
                // elle y tenait déjà ; la borne est portée par l'écran pour ne
                // plus dépendre de la façon dont on le présente.
                .iPadFormWidth()
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
                        // Chrome de fermeture : glyphe dans un cadre de tap fixe (toolbar) —
                        // gardé figé, doctrine 82i/87i. Libellé VoiceOver ajouté.
                        Image(systemName: "xmark")
                            .font(.system(size: MeeshyFont.headlineSize, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }
                    .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                }
                ToolbarItem(placement: .principal) {
                    Text(String(localized: "auth.magiclink.title", defaultValue: "Connexion par e-mail", bundle: .main))
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

            // Héros décoratif ≥40pt : taille fixe assumée (doctrine 84i/87i), masqué à VoiceOver.
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

            VStack(spacing: MeeshySpacing.sm) {
                HStack(spacing: MeeshySpacing.xs) {
                    Text(String(localized: "auth.magiclink.email.title", defaultValue: "Votre adresse e-mail", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .multilineTextAlignment(.center)

                    AuthInfoHintButton(hint: howItWorksHint, isExpanded: expansion(of: .howItWorks), tint: theme.textMuted)
                }

                AuthInfoHintText(
                    hint: howItWorksHint,
                    isExpanded: expandedHint == .howItWorks,
                    color: theme.textMuted,
                    alignment: .center
                )
            }

            // Email field
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "envelope.fill")
                    .foregroundColor(MeeshyColors.indigo400.opacity(0.7))
                    .frame(width: 20)
                    .accessibilityHidden(true)
                TextField(String(localized: "auth.magiclink.email.placeholder", defaultValue: "nom@exemple.com", bundle: .main), text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($isEmailFocused)
                    .foregroundColor(theme.textPrimary)
                    .submitLabel(.send)
                    .onSubmit { sendMagicLink() }
                    .accessibilityLabel(String(localized: "auth.magiclink.email.a11yLabel",
                                               defaultValue: "Adresse email", bundle: .main))
                    // REPLIÉ ne veut pas dire ABSENT : VoiceOver énonce le
                    // fonctionnement sur le champ, sans avoir à trouver le (i).
                    .accessibilityHint(howItWorksHint.text)
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
                                    ? MeeshyColors.indigo400.opacity(0.6)
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
                        Text(String(localized: "auth.magiclink.send", defaultValue: "Recevoir le lien", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
            }
            .disabled(isLoading || !isValidEmail)
            .opacity(!isValidEmail ? 0.6 : 1)
            .accessibilityIdentifier("auth.magiclink.submit")

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

                // Héros décoratif ≥40pt : taille fixe assumée (doctrine 84i/87i), masqué à VoiceOver.
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
            }
            .padding(.bottom, MeeshySpacing.md)
            .accessibilityHidden(true)

            Text(String(localized: "auth.magiclink.sent.title", defaultValue: "E-mail envoyé", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)

            VStack(spacing: MeeshySpacing.xs) {
                Text(String(localized: "auth.magiclink.sent.subtitle", defaultValue: "Ouvrez le lien reçu à", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)

                Text(email)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo400)
            }
            .accessibilityElement(children: .combine)

            if linkExpired {
                Text(String(localized: "auth.magiclink.expired", defaultValue: "Lien expiré, renvoyez-en un nouveau", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
                    .multilineTextAlignment(.center)
                    .padding(.top, MeeshySpacing.sm)
            } else {
                if countdownRemaining > 0 {
                    Text(formattedCountdown)
                        .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold).monospacedDigit())
                        .foregroundColor(MeeshyColors.indigo600)
                        .padding(.top, MeeshySpacing.sm)
                        .accessibilityLabel(String(localized: "auth.magiclink.countdown.a11yLabel",
                                                   defaultValue: "Le lien expire dans", bundle: .main))
                        .accessibilityValue(spokenCountdown)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }

            // Renvoyer, et à côté le (i) « Rien reçu ? » : il reste actif
            // pendant le compte à rebours — c'est précisément quand le renvoi
            // est bloqué que regarder les indésirables sert.
            VStack(spacing: MeeshySpacing.xs) {
                HStack(spacing: MeeshySpacing.xs) {
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
                                                defaultValue: "Renvoyer le lien", bundle: .main))
                    .disabled(countdownRemaining > 0 || isLoading)

                    AuthInfoHintButton(hint: nothingReceivedHint, isExpanded: expansion(of: .nothingReceived), tint: theme.textMuted)
                }

                AuthInfoHintText(
                    hint: nothingReceivedHint,
                    isExpanded: expandedHint == .nothingReceived,
                    color: theme.textMuted,
                    alignment: .center
                )
            }
            .padding(.top, MeeshySpacing.md)

            // Cancel button
            Button {
                withAnimation(MeeshyAnimation.springDefault) {
                    step = .emailInput
                    errorMessage = nil
                    expandedHint = nil
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
        LocalizedNumber.duration(seconds: countdownRemaining)
    }

    /// « Le lien expire dans **4 minutes 32 secondes** ».
    ///
    /// La valeur d'horloge « 4:32 », passée telle quelle, se lisait « 4 heures
    /// 32 » — l'annonce se trompait d'un facteur soixante sur la seule
    /// information que ce compte à rebours porte.
    private var spokenCountdown: String {
        LocalizedNumber.spokenDuration(seconds: countdownRemaining)
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
                    expandedHint = nil
                }

                startCountdown(expiresInSeconds)
                Self.logger.info("Magic link sent to \(email, privacy: .private)")
            } catch let error as APIError {
                errorMessage = error.errorDescription
                isLoading = false
                Self.logger.error("Magic link send failed: \(error.localizedDescription)")
            } catch {
                errorMessage = String(localized: "auth.magiclink.error.generic", defaultValue: "Une erreur est survenue. Veuillez réessayer.", bundle: .main)
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
