import SwiftUI
import MeeshySDK
import MeeshyUI

struct DeleteAccountView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var authManager = AuthManager.shared

    @State private var confirmationText = ""
    @State private var showFinalAlert = false
    @State private var isDeleting = false
    @State private var errorMessage: String?

    private let requiredPhrase = "SUPPRIMER MON COMPTE"
    private let accentColor = "EF4444"

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
        .alert("Confirmation finale", isPresented: $showFinalAlert) {
            Button("Annuler", role: .cancel) { }
            Button("Supprimer", role: .destructive) {
                performDeletion()
            }
        } message: {
            Text("Etes-vous absolument certain ? Cette action est irreversible.")
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
                        .font(.system(size: 14, weight: .semibold))
                    Text("Retour")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel("Retour")

            Spacer()

            Text("Supprimer le compte")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(Color(hex: accentColor))
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
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(hex: "EF4444"))
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
                    .font(.system(size: 24))
                    .foregroundColor(Color(hex: accentColor))

                Text("Action irreversible")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(Color(hex: accentColor))
            }

            Text("La suppression de votre compte entrainera la perte definitive de :")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .lineSpacing(2)

            VStack(alignment: .leading, spacing: 8) {
                warningBullet("Toutes vos conversations")
                warningBullet("Tous vos messages")
                warningBullet("Tous vos medias partages")
                warningBullet("Votre liste de contacts")
                warningBullet("Vos preferences et parametres")
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(hex: accentColor).opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color(hex: accentColor).opacity(0.3), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
    }

    private func warningBullet(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 14))
                .foregroundColor(Color(hex: accentColor).opacity(0.7))

            Text(text)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textSecondary)
        }
    }

    // MARK: - Confirmation Section

    private var confirmationSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Confirmation", icon: "checkmark.shield.fill", color: "F59E0B")

            VStack(alignment: .leading, spacing: 10) {
                Text("Tapez **SUPPRIMER MON COMPTE** pour confirmer")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textPrimary)

                HStack(spacing: 10) {
                    TextField("SUPPRIMER MON COMPTE", text: $confirmationText)
                        .font(.system(size: 14, weight: .semibold, design: .monospaced))
                        .foregroundColor(theme.textPrimary)
                        .autocapitalization(.allCharacters)
                        .disableAutocorrection(true)
                        .accessibilityLabel("Phrase de confirmation")

                    if confirmationText == requiredPhrase {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "4ADE80"))
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
                                .stroke(Color(hex: "4ADE80").opacity(0.5), lineWidth: 1)
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
                    .font(.system(size: 14, weight: .semibold))
                Text("Supprimer definitivement mon compte")
                    .font(.system(size: 15, weight: .bold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(
                        confirmationText == requiredPhrase && !isDeleting
                            ? Color(hex: accentColor)
                            : Color(hex: accentColor).opacity(0.3)
                    )
            )
        }
        .disabled(confirmationText != requiredPhrase || isDeleting)
        .accessibilityLabel("Supprimer definitivement mon compte")
        .accessibilityHint(confirmationText == requiredPhrase ? "Appuyez pour confirmer la suppression" : "Tapez la phrase de confirmation d'abord")
    }

    // MARK: - Actions

    private func performDeletion() {
        isDeleting = true
        errorMessage = nil
        Task {
            do {
                try await AccountService.shared.deleteAccount(confirmationPhrase: requiredPhrase)
                HapticFeedback.success()
                authManager.logout()
                MessageSocketManager.shared.disconnect()
                dismiss()
            } catch {
                HapticFeedback.error()
                errorMessage = "Erreur lors de la suppression du compte. Veuillez reessayer."
                isDeleting = false
            }
        }
    }

    // MARK: - Helpers

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
    }

    private func sectionBackground(tint: String) -> some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(theme.border(tint: tint), lineWidth: 1)
            )
    }
}
