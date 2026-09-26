import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Ouvre la session prouvée par le code. L'HÔTE la reçoit et l'appelle dans le
/// `onDismiss` de sa présentation (#8059) : ouvrir la session pendant que la
/// feuille est encore là démonte l'écran de connexion qui la présente, et la
/// feuille reste orpheline, figée sur « Email vérifié ! ».
typealias ProvenSessionOpener = @MainActor () -> Void

struct EmailVerificationView: View {
    @StateObject private var viewModel: EmailVerificationViewModel
    private let onVerified: (@escaping ProvenSessionOpener) -> Void
    /// Le temps de lire « Email vérifié ! » avant que la feuille se referme.
    private static let successPause: Duration = .milliseconds(800)
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.dismiss) private var dismiss

    init(
        email: String,
        password: String? = nil,
        accountCreated: Bool = false,
        pendingSessionToken: String? = nil,
        authService: AuthServiceProviding = AuthService.shared,
        onVerified: @escaping (@escaping ProvenSessionOpener) -> Void
    ) {
        self.onVerified = onVerified
        _viewModel = StateObject(wrappedValue: EmailVerificationViewModel(
            email: email,
            password: password,
            accountCreated: accountCreated,
            pendingSessionToken: pendingSessionToken,
            authService: authService
        ))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                VStack(spacing: 28) {
                    Spacer()
                    headerIcon
                    titleSection
                    subtitleSection
                    EmailCodeEntry(viewModel: viewModel)
                    resendSection
                    Spacer()
                    Spacer()
                }
                .padding(.horizontal, 24)
                .iPadFormWidth()

                successOverlay
            }
            // #8059 — la vérification réussie REFERME la feuille : l'hôte reçoit
            // de quoi ouvrir la session, la pose une fois la feuille partie.
            .task(id: viewModel.verificationSuccess) {
                guard viewModel.verificationSuccess else { return }
                onVerified(viewModel.openProvenSession)
                try? await Task.sleep(for: Self.successPause)
                dismiss()
            }
            .navigationTitle(String(localized: "emailVerification.nav.title", defaultValue: "Vérification de l'email"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "emailVerification.nav.close", defaultValue: "Fermer")) {
                        dismiss()
                    }
                    .foregroundStyle(MeeshyColors.indigo400)
                }
            }
        }
    }

    // MARK: - Header Icon

    private var headerIcon: some View {
        ZStack {
            Circle()
                .fill(MeeshyColors.indigo500.opacity(0.12))
                .frame(width: 96, height: 96)

            Image(systemName: "envelope.open.fill")
                .font(.system(.largeTitle).weight(.medium))
                .foregroundStyle(MeeshyColors.brandGradient)
        }
        // Illustration héros décorative — le sens est porté par le titre + le
        // sous-titre adjacents ; masquée pour éviter une annonce parasite.
        .accessibilityHidden(true)
    }

    // MARK: - Title

    private var titleSection: some View {
        Text(String(localized: "emailVerification.title", defaultValue: "Vérifiez votre email"))
            .font(.system(.title, design: .rounded).weight(.bold))
            .foregroundStyle(theme.textPrimary)
            .accessibilityAddTraits(.isHeader)
    }

    // MARK: - Subtitle

    private var subtitleSection: some View {
        Text(Self.markdown(subtitle))
            .font(.subheadline)
            .multilineTextAlignment(.center)
            .foregroundStyle(theme.textSecondary)
            .padding(.horizontal, 16)
    }

    /// Un compte NÉ de cette connexion le dit (#8035) : l'utilisateur a tapé
    /// une adresse inconnue, il doit comprendre qu'un compte l'attend.
    private var subtitle: String {
        viewModel.accountCreated
            ? String(localized: "emailVerification.subtitle.accountCreated", defaultValue: "Votre compte est créé. Un code et un lien de validation ont été envoyés à **\(viewModel.email)**.")
            : String(localized: "emailVerification.subtitle", defaultValue: "Entrez le code à 6 chiffres envoyé à **\(viewModel.email)**")
    }

    private static func markdown(_ text: String) -> AttributedString {
        (try? AttributedString(markdown: text)) ?? AttributedString(text)
    }

    // MARK: - Resend Section

    private var resendSection: some View {
        VStack(spacing: 8) {
            Text(String(localized: "emailVerification.noCode", defaultValue: "Vous n'avez pas reçu le code ?"))
                .font(.footnote)
                .foregroundStyle(theme.textSecondary)

            Button {
                Task { await viewModel.resendCode() }
            } label: {
                HStack(spacing: 6) {
                    if viewModel.isResending {
                        ProgressView()
                            .controlSize(.small)
                            .tint(MeeshyColors.indigo400)
                    } else if viewModel.resendSuccess {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(MeeshyColors.success)
                        Text(String(localized: "emailVerification.resendConfirmed", defaultValue: "Code renvoyé !"))
                            .foregroundStyle(MeeshyColors.success)
                    } else {
                        Image(systemName: "arrow.clockwise")
                        Text(String(localized: "emailVerification.resendButton", defaultValue: "Renvoyer le code"))
                    }
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(MeeshyColors.indigo400)
            }
            .disabled(viewModel.isResending || viewModel.resendSuccess)
            // Idem : l'état « renvoi en cours » se réduit à un spinner. Label
            // stable couvrant les trois états (repos / en cours / confirmé) et
            // remplaçant la lecture des glyphes décoratifs internes.
            .accessibilityLabel(resendButtonAccessibilityLabel)
        }
    }

    private var resendButtonAccessibilityLabel: String {
        if viewModel.isResending {
            return String(localized: "emailVerification.resending.a11y", defaultValue: "Envoi du code en cours")
        }
        if viewModel.resendSuccess {
            return String(localized: "emailVerification.resendConfirmed", defaultValue: "Code renvoyé !")
        }
        return String(localized: "emailVerification.resendButton", defaultValue: "Renvoyer le code")
    }

    // MARK: - Success Overlay

    @ViewBuilder
    private var successOverlay: some View {
        if viewModel.verificationSuccess {
            ZStack {
                theme.backgroundPrimary.opacity(0.9)
                    .ignoresSafeArea()

                VStack(spacing: 20) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(.largeTitle))
                        .foregroundStyle(MeeshyColors.success)
                        .adaptiveSymbolBounce(value: viewModel.verificationSuccess)

                    Text(String(localized: "emailVerification.success", defaultValue: "Email vérifié !"))
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .foregroundStyle(theme.textPrimary)
                }
                // Checkmark décoratif + libellé fusionnés → VoiceOver annonce
                // « Email vérifié ! » en un seul élément.
                .accessibilityElement(children: .combine)
            }
            .transition(.opacity)
            .animation(.easeInOut(duration: 0.3), value: viewModel.verificationSuccess)
            // Overlay de succès plein écran : marqué modal pour que le focus
            // VoiceOver s'y déplace et que le contenu masqué en dessous soit ignoré.
            .accessibilityAddTraits(.isModal)
        }
    }
}
