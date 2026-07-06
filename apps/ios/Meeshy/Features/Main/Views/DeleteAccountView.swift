import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct DeleteAccountView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @ObservedObject private var authManager = AuthManager.shared

    @State private var confirmationText = ""
    @State private var showFinalAlert = false
    @State private var isDeleting = false
    @State private var errorMessage: String?
    @State private var showEmailConfirmation = false

    private let requiredPhrase = "SUPPRIMER MON COMPTE"

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            if showEmailConfirmation {
                emailConfirmationView
            } else {
                VStack(spacing: 0) {
                    header
                    scrollContent
                }
            }
        }
        .alert(String(localized: "account.delete.final.title", defaultValue: "Confirmation finale", bundle: .main), isPresented: $showFinalAlert) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { }
            Button(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), role: .destructive) {
                performDeletion()
            }
        } message: {
            Text(String(localized: "account.delete.final.message", defaultValue: "Etes-vous absolument certain ? Cette action est irreversible.", bundle: .main))
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(MeeshyFont.relative(14, weight: .semibold))
                    Text(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                        .font(MeeshyFont.relative(15, weight: .medium))
                }
                .foregroundColor(MeeshyColors.error)
            }
            .accessibilityLabel(String(localized: "common.back", defaultValue: "Retour", bundle: .main))

            Spacer()

            Text(String(localized: "account.delete.title", defaultValue: "Supprimer le compte", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
                .foregroundColor(MeeshyColors.error)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Color.clear.frame(width: 60, height: 24)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                warningCard
                confirmationSection
                deleteButton

                if let errorMessage {
                    Text(errorMessage)
                        .font(MeeshyFont.relative(13, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.horizontal, 16)
                }

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Warning Card

    private var warningCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(MeeshyFont.relative(24))
                    .foregroundColor(MeeshyColors.error)

                Text(String(localized: "account.delete.warning.title", defaultValue: "Action irreversible", bundle: .main))
                    .font(MeeshyFont.relative(17, weight: .bold))
                    .foregroundColor(MeeshyColors.error)
            }

            Text(String(localized: "account.delete.warning.intro", defaultValue: "La suppression de votre compte entrainera la perte definitive de :", bundle: .main))
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .lineSpacing(2)

            VStack(alignment: .leading, spacing: 8) {
                warningBullet(String(localized: "account.delete.warning.conversations", defaultValue: "Toutes vos conversations", bundle: .main))
                warningBullet(String(localized: "account.delete.warning.messages", defaultValue: "Tous vos messages", bundle: .main))
                warningBullet(String(localized: "account.delete.warning.media", defaultValue: "Tous vos medias partages", bundle: .main))
                warningBullet(String(localized: "account.delete.warning.contacts", defaultValue: "Votre liste de contacts", bundle: .main))
                warningBullet(String(localized: "account.delete.warning.preferences", defaultValue: "Vos preferences et parametres", bundle: .main))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(MeeshyColors.error.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .stroke(MeeshyColors.error.opacity(0.3), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
    }

    private func warningBullet(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "xmark.circle.fill")
                .font(MeeshyFont.relative(14))
                .foregroundColor(MeeshyColors.error.opacity(0.7))

            Text(text)
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(theme.textSecondary)
        }
    }

    // MARK: - Confirmation Section

    private var confirmationSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "account.delete.section.confirmation", defaultValue: "Confirmation", bundle: .main), icon: "checkmark.shield.fill", color: "F59E0B")

            VStack(alignment: .leading, spacing: 10) {
                confirmationPrompt
                    .foregroundColor(theme.textPrimary)

                HStack(spacing: 10) {
                    TextField(requiredPhrase, text: $confirmationText)
                        .font(MeeshyFont.relative(14, weight: .semibold, design: .monospaced))
                        .foregroundColor(theme.textPrimary)
                        .autocapitalization(.allCharacters)
                        .disableAutocorrection(true)
                        .accessibilityLabel(String(localized: "account.delete.confirmation.label", defaultValue: "Phrase de confirmation", bundle: .main))

                    if confirmationText == requiredPhrase {
                        Image(systemName: "checkmark.circle.fill")
                            .font(MeeshyFont.relative(20))
                            .foregroundColor(MeeshyColors.success)
                            .transition(.scale.combined(with: .opacity))
                    }
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(theme.surfaceGradient(tint: "F59E0B"))
                )
                .overlay(
                    Group {
                        if confirmationText == requiredPhrase {
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(MeeshyColors.success.opacity(0.5), lineWidth: 1)
                        } else {
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(theme.border(tint: "F59E0B"), lineWidth: 1)
                        }
                    }
                )
                .animation(.spring(response: 0.3, dampingFraction: 0.8), value: confirmationText == requiredPhrase)
            }
            .padding(14)
            .background(sectionBackground(tint: "F59E0B"))
        }
    }

    // MARK: - Delete Button

    private var deleteButton: some View {
        Button {
            HapticFeedback.heavy()
            showFinalAlert = true
        } label: {
            HStack(spacing: 8) {
                if isDeleting {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(.white)
                }
                Image(systemName: "trash.fill")
                    .font(MeeshyFont.relative(14, weight: .semibold))
                Text(String(localized: "account.delete.button", defaultValue: "Supprimer definitivement mon compte", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .bold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(
                        confirmationText == requiredPhrase && !isDeleting
                            ? MeeshyColors.error
                            : MeeshyColors.error.opacity(0.3)
                    )
            )
        }
        .disabled(confirmationText != requiredPhrase || isDeleting)
        .accessibilityLabel(String(localized: "account.delete.button", defaultValue: "Supprimer definitivement mon compte", bundle: .main))
        .accessibilityHint(confirmationText == requiredPhrase
            ? String(localized: "account.delete.button.hint.ready", defaultValue: "Appuyez pour confirmer la suppression", bundle: .main)
            : String(localized: "account.delete.button.hint.type_phrase", defaultValue: "Tapez la phrase de confirmation d'abord", bundle: .main))
    }

    // MARK: - Actions

    private func performDeletion() {
        isDeleting = true
        errorMessage = nil
        Task {
            do {
                try await AccountService.shared.deleteAccount(confirmationPhrase: requiredPhrase)
                HapticFeedback.success()
                withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                    showEmailConfirmation = true
                }
                isDeleting = false
            } catch {
                HapticFeedback.error()
                errorMessage = String(localized: "account.delete.error", defaultValue: "Erreur lors de la suppression du compte. Veuillez reessayer.", bundle: .main)
                isDeleting = false
            }
        }
    }

    // MARK: - Email Confirmation View

    private var emailConfirmationView: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 16) {
                // Héros décoratif ≥40pt : diamètre fixe, exclu du Dynamic Type (doctrine 84i/87i).
                Image(systemName: "envelope.circle.fill")
                    .font(MeeshyFont.relative(64))
                    .foregroundStyle(
                        MeeshyColors.brandGradient
                    )
                    .accessibilityHidden(true)

                Text(String(localized: "account.delete.email.title", defaultValue: "Un email de confirmation vous a ete envoye", bundle: .main))
                    .font(MeeshyFont.relative(20, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                    .multilineTextAlignment(.center)

                Text(String(localized: "account.delete.email.body", defaultValue: "Verifiez votre boite de reception pour confirmer la suppression de votre compte.", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)
            }
            .accessibilityElement(children: .combine)
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                            .stroke(MeeshyColors.indigo500.opacity(0.2), lineWidth: 1)
                    )
            )
            .padding(.horizontal, 24)

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Text(String(localized: "account.delete.email.ok", defaultValue: "Compris", bundle: .main))
                    .font(MeeshyFont.relative(16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                            .fill(MeeshyColors.brandGradient)
                    )
            }
            .padding(.horizontal, 24)
            .accessibilityLabel(String(localized: "account.delete.email.ok", defaultValue: "Compris", bundle: .main))

            Spacer()
        }
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
    }

    // MARK: - Helpers

    // The confirmation phrase is a server-side literal contract
    // (`z.literal('SUPPRIMER MON COMPTE')`, delete-account-schemas.ts): it must be
    // typed verbatim in every locale. So `requiredPhrase` is injected literally into a
    // word-order-safe `%@` format string and emphasized deterministically — never
    // embedded as translatable text (which could drift from the server literal) nor as
    // raw markdown (which `Text(String)` renders with visible asterisks).
    private var confirmationPrompt: Text {
        let format = String(localized: "account.delete.confirmation.prompt", defaultValue: "Tapez %@ pour confirmer", bundle: .main)
        var attributed = AttributedString(String(format: format, requiredPhrase))
        attributed.font = MeeshyFont.relative(14, weight: .medium)
        if let range = attributed.range(of: requiredPhrase) {
            attributed[range].font = MeeshyFont.relative(14, weight: .bold, design: .monospaced)
        }
        return Text(attributed)
    }

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private func sectionBackground(tint: String) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(theme.border(tint: tint), lineWidth: 1)
            )
    }
}
