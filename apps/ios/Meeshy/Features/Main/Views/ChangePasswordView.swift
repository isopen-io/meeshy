import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct ChangePasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showSuccess = false
    @FocusState private var focusedField: Field?

    private let accentColor = MeeshyColors.brandPrimaryHex

    private enum Field {
        case current, newPass, confirm
    }

    private var passwordsMatch: Bool {
        !newPassword.isEmpty && newPassword == confirmPassword
    }

    private var isValid: Bool {
        !currentPassword.isEmpty
        && newPassword.count >= 8
        && passwordsMatch
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }

            if showSuccess {
                successOverlay
            }
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
                        .font(.subheadline.weight(.semibold))
                    Text(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                        .font(.subheadline.weight(.medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text(String(localized: "auth.password.change.title", defaultValue: "Mot de passe", bundle: .main))
                .font(.headline.weight(.bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 60, height: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 24) {
                currentPasswordSection
                newPasswordSection
                validationHints
                saveButton

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Current Password

    private var currentPasswordSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "auth.password.change.current.section", defaultValue: "Mot de passe actuel", bundle: .main), icon: "lock.fill", color: MeeshyColors.indigo600Hex)

            VStack(spacing: 0) {
                secureField(
                    icon: "lock.fill",
                    title: String(localized: "auth.password.change.current.field", defaultValue: "Mot de passe actuel", bundle: .main),
                    text: $currentPassword,
                    placeholder: String(localized: "auth.password.change.current.placeholder", defaultValue: "Entrez votre mot de passe", bundle: .main),
                    color: MeeshyColors.indigo600Hex,
                    field: .current
                )
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: MeeshyColors.indigo600Hex))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: MeeshyColors.indigo600Hex), lineWidth: 1)
                    )
            )
        }
    }

    // MARK: - New Password

    private var newPasswordSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "auth.password.change.new.section", defaultValue: "Nouveau mot de passe", bundle: .main), icon: "key.fill", color: accentColor)

            VStack(spacing: 0) {
                secureField(
                    icon: "key.fill",
                    title: String(localized: "auth.password.change.new.field", defaultValue: "Nouveau mot de passe", bundle: .main),
                    text: $newPassword,
                    placeholder: String(localized: "auth.password.change.new.placeholder", defaultValue: "Minimum 8 caracteres", bundle: .main),
                    color: accentColor,
                    field: .newPass
                )

                if !newPassword.isEmpty {
                    HStack(spacing: 12) {
                        Color.clear.frame(width: 28, height: 1)
                        PasswordStrengthIndicator(password: newPassword)
                    }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 8)
                }

                secureField(
                    icon: "checkmark.lock.fill",
                    title: String(localized: "auth.password.change.confirm.field", defaultValue: "Confirmer", bundle: .main),
                    text: $confirmPassword,
                    placeholder: String(localized: "auth.password.change.confirm.placeholder", defaultValue: "Retapez le mot de passe", bundle: .main),
                    color: accentColor,
                    field: .confirm
                )
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: accentColor))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: accentColor), lineWidth: 1)
                    )
            )
        }
    }

    // MARK: - Validation Hints

    private var validationHints: some View {
        VStack(alignment: .leading, spacing: 6) {
            validationRow(
                text: String(localized: "auth.password.change.validation.length", defaultValue: "Minimum 8 caracteres", bundle: .main),
                met: newPassword.count >= 8
            )
            validationRow(
                text: String(localized: "auth.password.change.validation.match", defaultValue: "Les mots de passe correspondent", bundle: .main),
                met: passwordsMatch && !newPassword.isEmpty
            )
        }
        .padding(.horizontal, 4)
    }

    private func validationRow(text: String, met: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: met ? "checkmark.circle.fill" : "circle")
                .font(.subheadline)
                .foregroundColor(met ? MeeshyColors.success : theme.textMuted)

            Text(text)
                .font(.footnote.weight(.medium))
                .foregroundColor(met ? MeeshyColors.success : theme.textMuted)

            Spacer()
        }
    }

    // MARK: - Save Button

    private var saveButton: some View {
        VStack(spacing: 8) {
            if let errorMessage {
                Text(errorMessage)
                    .font(.caption.weight(.medium))
                    .foregroundColor(MeeshyColors.error)
                    .multilineTextAlignment(.center)
                    .transition(.opacity)
            }

            Button {
                HapticFeedback.medium()
                changePassword()
            } label: {
                HStack(spacing: 8) {
                    if isSaving {
                        ProgressView()
                            .scaleEffect(0.8)
                            .tint(.white)
                    }
                    Text(String(localized: "auth.password.change.submit", defaultValue: "Changer le mot de passe", bundle: .main))
                        .font(.subheadline.weight(.bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(
                            isValid && !isSaving
                                ? Color(hex: accentColor)
                                : Color(hex: accentColor).opacity(0.4)
                        )
                )
            }
            .disabled(!isValid || isSaving)
        }
    }

    // MARK: - Success Overlay

    private var successOverlay: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 48))
                .foregroundColor(MeeshyColors.success)

            Text(String(localized: "auth.password.change.success", defaultValue: "Mot de passe modifie", bundle: .main))
                .font(.callout.weight(.semibold))
                .foregroundColor(theme.textPrimary)
        }
        .padding(32)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(MeeshyColors.success.opacity(0.3), lineWidth: 1)
                )
        )
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Reusable Components

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption.weight(.semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(.system(.caption2, design: .rounded).weight(.bold))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
    }

    private func secureField(
        icon: String,
        title: String,
        text: Binding<String>,
        placeholder: String,
        color: String,
        field: Field
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline.weight(.medium))
                .foregroundColor(Color(hex: color))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: color).opacity(0.12))
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(theme.textMuted)

                SecureField(placeholder, text: text)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(theme.textPrimary)
                    .textContentType(.password)
                    .focused($focusedField, equals: field)
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // MARK: - Actions

    private func changePassword() {
        guard isValid else { return }

        isSaving = true
        errorMessage = nil
        focusedField = nil

        Task {
            do {
                try await AuthService.shared.changePassword(
                    currentPassword: currentPassword,
                    newPassword: newPassword
                )

                HapticFeedback.success()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    showSuccess = true
                }
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                dismiss()
            } catch let error as APIError {
                HapticFeedback.error()
                switch error {
                case .serverError(400, _):
                    errorMessage = String(localized: "auth.password.change.error.current", defaultValue: "Incorrect current password", bundle: .main)
                default:
                    errorMessage = error.errorDescription
                }
            } catch let error as MeeshyError {
                HapticFeedback.error()
                if case .server(_, let msg) = error {
                    errorMessage = msg
                } else {
                    errorMessage = error.localizedDescription
                }
            } catch {
                HapticFeedback.error()
                errorMessage = String(localized: "common.error.generic", defaultValue: "An error occurred", bundle: .main)
            }
            isSaving = false
        }
    }
}
