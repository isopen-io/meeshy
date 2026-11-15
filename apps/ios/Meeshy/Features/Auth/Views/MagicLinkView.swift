import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - Sent Email Code

/// Un code et un lien DÉJÀ partis vers `email` (#8216) — l'inscription d'une
/// adresse déjà utilisée les demande en un geste, puis ouvre CET écran sur son
/// attente plutôt que sur une saisie à refaire.
struct SentEmailCode: Identifiable, Equatable {
    let email: String
    let dispatch: EmailCodeDispatch
    var id: String { email }
}

// MARK: - Magic Link View

struct MagicLinkView: View {
    @EnvironmentObject var authManager: AuthManager
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.dismiss) private var dismiss
    /// Code saisi et vérifié (#8059) : reçoit de quoi ouvrir la session, que
    /// l'hôte pose une fois cet écran REFERMÉ — l'ouvrir pendant qu'il est
    /// présenté démonte la connexion qui le présente, et il resterait figé.
    var onVerified: ((@escaping ProvenSessionOpener) -> Void)?
    /// L'envoi que l'hôte a DÉJÀ fait (#8216) : l'écran s'ouvre sur l'attente.
    private let alreadySent: SentEmailCode?

    @State private var email: String
    @State private var step: Step
    @State private var hasAdoptedSend = false
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var countdownRemaining = 0
    @State private var linkExpired = false
    @State private var countdownTask: Task<Void, Never>?
    @FocusState private var isEmailFocused: Bool
    /// L'e-mail envoyé porte un code ET un lien (#8035) : la saisie du code
    /// suit l'envoi, pour l'adresse à laquelle il est parti.
    @State private var codeEntry: EmailVerificationViewModel?

    private static let logger = MeeshyLog.logger(.magicLink)

    /// - Parameters:
    ///   - prefilledEmail: l'adresse déjà tapée ailleurs (#8216) — la retaper
    ///     est un geste de trop, et une occasion de se tromper d'adresse.
    ///   - alreadySent: un envoi déjà fait par l'hôte — l'écran s'ouvre sur
    ///     son attente, compte à rebours et saisie du code compris.
    init(
        onVerified: ((@escaping ProvenSessionOpener) -> Void)? = nil,
        prefilledEmail: String = "",
        alreadySent: SentEmailCode? = nil
    ) {
        self.onVerified = onVerified
        self.alreadySent = alreadySent
        _email = State(initialValue: alreadySent?.email ?? prefilledEmail)
        _step = State(initialValue: alreadySent == nil ? .emailInput : .waiting)
    }

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
                // La colonne se borne comme celle de la connexion (#6644).
                // Présentée en feuille-formulaire sur iPad (579 pt mesurés),
                // elle y tenait déjà ; la borne est portée par l'écran pour ne
                // plus dépendre de la façon dont on le présente.
                .iPadFormWidth()
            }
            .onAppear(perform: adoptAlreadySent)
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
                            .font(MeeshyFont.fixedGlyph(MeeshyFont.headlineSize, weight: .medium))
                            .foregroundStyle(theme.textSecondary)
                    }
                    .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                }
                ToolbarItem(placement: .principal) {
                    Text(String(localized: "auth.magiclink.title", defaultValue: "Connexion par e-mail", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                        .foregroundStyle(theme.textPrimary)
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
                .font(MeeshyFont.fixedGlyph(56, weight: .light))
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
                Text(String(localized: "auth.magiclink.email.subtitle", defaultValue: "Pas de mot de passe : nous envoyons un lien par e-mail.", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                    .foregroundStyle(theme.textPrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // Email field
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: "envelope.fill")
                    .foregroundStyle(MeeshyColors.indigo400.opacity(0.7))
                    .frame(width: 20)
                    .accessibilityHidden(true)
                TextField(String(localized: "auth.magiclink.email.placeholder", defaultValue: "nom@exemple.com", bundle: .main), text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($isEmailFocused)
                    .foregroundStyle(theme.textPrimary)
                    .submitLabel(.send)
                    .onSubmit { sendMagicLink() }
                    .accessibilityLabel(String(localized: "auth.magiclink.email.a11yLabel",
                                               defaultValue: "Adresse e-mail", bundle: .main))
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.mdPlus)
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
                    .foregroundStyle(MeeshyColors.error)
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
                            .foregroundStyle(Color.white)
                    }
                }
            }
            .disabled(isLoading || !isValidEmail)
            .opacity(!isValidEmail ? 0.6 : 1)
            .accessibilityIdentifier("auth.magiclink.submit")

            Spacer()
            Spacer()
        }
        .onAppear(after: .milliseconds(300)) { isEmailFocused = true }
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
                    .font(MeeshyFont.fixedGlyph(MeeshyIconSize.hero, weight: .light))
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

            VStack(spacing: MeeshySpacing.xs) {
                Text(String(localized: "auth.magiclink.sent.heading", defaultValue: "Code et lien envoyés", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                    .foregroundStyle(theme.textPrimary)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)

                Text(email)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(MeeshyColors.indigo400)
            }
            .accessibilityElement(children: .combine)

            // #16937 — la ligne des spams, sous l'annonce et une seule fois :
            // le champ de code qui suit se tait.
            EmailSpamFolderHint()

            if let codeEntry {
                EmailCodeEntry(viewModel: codeEntry, showsSpamFolderHint: false)
                    .onReceive(codeEntry.$verificationSuccess.filter { $0 }.first()) { _ in
                        handOff(codeEntry)
                    }
            }

            if linkExpired {
                Text(String(localized: "auth.magiclink.expired", defaultValue: "Lien expiré, renvoyez-en un nouveau", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundStyle(MeeshyColors.error)
                    .multilineTextAlignment(.center)
                    .padding(.top, MeeshySpacing.sm)
            } else {
                if countdownRemaining > 0 {
                    Text(formattedCountdown)
                        .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold).monospacedDigit())
                        .foregroundStyle(MeeshyColors.indigo600)
                        .padding(.top, MeeshySpacing.sm)
                        .accessibilityLabel(String(localized: "auth.magiclink.countdown.a11yLabel",
                                                   defaultValue: "Le lien expire dans", bundle: .main))
                        .accessibilityValue(spokenCountdown)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }

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
                    .foregroundStyle(theme.textMuted)
            }
            .padding(.top, MeeshySpacing.sm)

            Spacer()
            Spacer()
        }
    }

    // MARK: - Actions

    private var formattedCountdown: String {
        MediaFormat.duration(countdownRemaining)
    }

    /// « Le lien expire dans **4 minutes 32 secondes** ».
    ///
    /// La valeur d'horloge « 4:32 », passée telle quelle, se lisait « 4 heures
    /// 32 » — l'annonce se trompait d'un facteur soixante sur la seule
    /// information que ce compte à rebours porte.
    private var spokenCountdown: String {
        MediaFormat.duration(countdownRemaining, style: .spoken)
    }

    private func handOff(_ entry: EmailVerificationViewModel) {
        guard let onVerified else { return entry.openProvenSession() }
        onVerified(entry.openProvenSession)
        dismiss()
    }

    private func sendMagicLink() {
        guard isValidEmail else { return }

        isLoading = true
        errorMessage = nil
        linkExpired = false

        Task {
            do {
                let dispatch = try await AuthService.shared.requestEmailCode(email: email)
                withAnimation(MeeshyAnimation.springDefault) {
                    isLoading = false
                    enterWaiting(dispatch)
                }
                Self.logger.info("Magic link sent to \(email, privacy: .private)")
            } catch {
                errorMessage = EmailProofErrorText.sendMessage(for: error)
                isLoading = false
                Self.logger.error("Magic link send failed: \(error.localizedDescription)")
            }
        }
    }

    /// L'attente d'UN envoi — le sien ou celui de l'hôte (#8216) : la saisie
    /// du code pour CETTE adresse, son jeton d'attente, le compte à rebours.
    private func enterWaiting(_ dispatch: EmailCodeDispatch) {
        if codeEntry?.email != email {
            codeEntry = EmailVerificationViewModel(email: email)
        }
        // #8083 — le jeton d'attente de CET envoi : l'écran saura dire
        // que l'adresse a été confirmée sur un autre appareil.
        codeEntry?.pendingSessionToken = dispatch.pendingSessionToken
        step = .waiting
        startCountdown(dispatch.expiresInSeconds ?? 300)
    }

    private func adoptAlreadySent() {
        guard let alreadySent, !hasAdoptedSend else { return }
        hasAdoptedSend = true
        enterWaiting(alreadySent.dispatch)
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
                guard await cancellableSleep(for: .seconds(1)), !Task.isCancelled else { return }
                countdownRemaining -= 1
            }
            linkExpired = true
        }
    }
}
