import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le champ du code à six chiffres, son erreur et le bouton « Vérifier » (#8035).
///
/// Partagé par les deux portes qui mènent au code : l'écran de vérification
/// (connexion sur une adresse inconnue) et l'étape « e-mail envoyé » de la
/// connexion par e-mail. Le code saisi part avec le mot de passe que le
/// modèle tient en mémoire, et la vérification ouvre la session.
struct EmailCodeEntry: View {
    @ObservedObject var viewModel: EmailVerificationViewModel
    @State private var code = ""
    @FocusState private var isFocused: Bool
    @Environment(\.scenePhase) private var scenePhase
    private var theme: ThemeManager { ThemeManager.shared }

    private var isCodeComplete: Bool { code.count == 6 }

    /// Ce qui relance la veille : le retour au premier plan, un jeton renouvelé.
    private struct ProofWatchKey: Equatable {
        let active: Bool
        let token: String?
    }

    var body: some View {
        VStack(spacing: 20) {
            proofBanner
            codeField
            errorView
            verifyButton
        }
        .animation(.easeInOut(duration: 0.25), value: viewModel.addressProvenElsewhere)
        // #8083 — au premier plan seulement : SwiftUI annule cette tâche au
        // démontage et à l'arrière-plan, la relance (lecture immédiate) au
        // retour. Aucune lecture ne survit à l'écran.
        .task(id: ProofWatchKey(active: scenePhase == .active, token: viewModel.pendingSessionToken)) {
            guard scenePhase == .active else { return }
            await viewModel.watchProof()
        }
    }

    // MARK: - Proof Banner (#8083)

    /// Le lien a été ouvert sur un autre appareil : l'adresse est confirmée,
    /// mais CE téléphone n'entre que par le code saisi ici (décision porteur).
    @ViewBuilder
    private var proofBanner: some View {
        if viewModel.addressProvenElsewhere {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.title3)
                    .foregroundStyle(MeeshyColors.success)
                VStack(alignment: .leading, spacing: 4) {
                    Text(String(localized: "emailVerification.provenElsewhere.title", defaultValue: "Adresse confirmée ✓"))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(theme.textPrimary)
                    Text(String(localized: "emailVerification.provenElsewhere.body", defaultValue: "Saisissez le code reçu pour vous connecter sur ce téléphone."))
                        .font(.footnote)
                        .foregroundStyle(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(MeeshyColors.success.opacity(0.1))
            )
            .transition(.opacity.combined(with: .move(edge: .top)))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("emailVerification.provenElsewhere")
        }
    }

    // MARK: - Code Field

    private var codeField: some View {
        TextField(
            String(localized: "emailVerification.codePlaceholder", defaultValue: "000000"),
            text: $code
        )
        .keyboardType(.numberPad)
        .textContentType(.oneTimeCode)
        .font(.system(.title, design: .monospaced).weight(.semibold))
        .multilineTextAlignment(.center)
        .padding(.vertical, 14)
        .padding(.horizontal, 24)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.inputBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(isCodeComplete ? MeeshyColors.indigo500 : theme.inputBorder, lineWidth: 1.5)
        )
        .padding(.horizontal, 32)
        .adaptiveOnChange(of: code) { _, newValue in
            let filtered = newValue.filter(\.isNumber)
            let limited = String(filtered.prefix(6))
            if limited != newValue {
                code = limited
                return
            }
            // Six chiffres saisis ou collés (auto-remplissage depuis Mail)
            // valent un « Vérifier » : le chemin nominal tient en un geste.
            if limited.count == 6, !viewModel.isVerifying, !viewModel.verificationSuccess {
                Task { await viewModel.verifyCode(limited) }
            }
        }
        .focused($isFocused)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { isFocused = true }
        }
        .disabled(viewModel.isVerifying || viewModel.verificationSuccess)
        // Sans label, VoiceOver lit le placeholder « 000000 » comme intitulé du
        // champ — inintelligible. On pose un label + un indice explicites.
        .accessibilityLabel(String(localized: "emailVerification.code.a11yLabel", defaultValue: "Code de vérification"))
        .accessibilityHint(String(localized: "emailVerification.code.a11yHint", defaultValue: "Entrez le code à 6 chiffres reçu par email"))
    }

    // MARK: - Error View

    @ViewBuilder
    private var errorView: some View {
        if let errorMessage = viewModel.error {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.subheadline)
                Text(errorMessage)
                    .font(.subheadline.weight(.medium))
            }
            .foregroundStyle(MeeshyColors.error)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(MeeshyColors.error.opacity(0.1))
            )
            .transition(.opacity.combined(with: .move(edge: .top)))
            // Glyphe d'alerte décoratif + message fusionnés en un seul élément :
            // VoiceOver annonce le message d'erreur, pas le triangle isolé.
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: - Verify Button

    private var verifyButton: some View {
        Button {
            Task { await viewModel.verifyCode(code) }
        } label: {
            HStack(spacing: 8) {
                if viewModel.isVerifying {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                } else {
                    Text(String(localized: "emailVerification.verifyButton", defaultValue: "Vérifier"))
                }
            }
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(isCodeComplete && !viewModel.isVerifying
                          ? AnyShapeStyle(MeeshyColors.brandGradient)
                          : AnyShapeStyle(MeeshyColors.indigo500.opacity(0.3)))
            )
        }
        .disabled(!isCodeComplete || viewModel.isVerifying || viewModel.verificationSuccess)
        .accessibilityIdentifier("emailVerification.submit")
        .padding(.horizontal, 8)
        // Pendant la vérification le label se réduit à un spinner (aucun texte) →
        // VoiceOver lirait un bouton anonyme. Label stable et explicite dans les
        // deux états.
        .accessibilityLabel(verifyButtonAccessibilityLabel)
    }

    private var verifyButtonAccessibilityLabel: String {
        viewModel.isVerifying
            ? String(localized: "emailVerification.verifying.a11y", defaultValue: "Vérification en cours")
            : String(localized: "emailVerification.verifyButton", defaultValue: "Vérifier")
    }
}
