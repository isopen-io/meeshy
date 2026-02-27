import SwiftUI
import MeeshySDK
import MeeshyUI

struct ChangePasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showSuccess = false
    @FocusState private var focusedField: Field?

    private let accentColor = "08D9D6"

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
                        .font(.system(size: 14, weight: .semibold))
                    Text("Retour")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text("Mot de passe")
                .font(.system(size: 17, weight: .bold))
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
            sectionHeader(title: "Mot de passe actuel", icon: "lock.fill", color: "9B59B6")

            VStack(spacing: 0) {
                secureField(
                    icon: "lock.fill",
                    title: "Mot de passe actuel",
                    text: $currentPassword,
                    placeholder: "Entrez votre mot de passe",
                    color: "9B59B6",
                    field: .current
                )
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: "9B59B6"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: "9B59B6"), lineWidth: 1)
                    )
            )
        }
    }

    // MARK: - New Password

    private var newPasswordSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Nouveau mot de passe", icon: "key.fill", color: accentColor)

            VStack(spacing: 0) {
                secureField(
                    icon: "key.fill",
                    title: "Nouveau mot de passe",
                    text: $newPassword,
                    placeholder: "Minimum 8 caracteres",
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
                    title: "Confirmer",
                    text: $confirmPassword,
                    placeholder: "Retapez le mot de passe",
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
                text: "Minimum 8 caracteres",
                met: newPassword.count >= 8
            )
            validationRow(
                text: "Les mots de passe correspondent",
                met: passwordsMatch && !newPassword.isEmpty
            )
        }
        .padding(.horizontal, 4)
    }

    private func validationRow(text: String, met: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: met ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 14))
                .foregroundColor(met ? Color(hex: "4ADE80") : theme.textMuted)

            Text(text)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(met ? Color(hex: "4ADE80") : theme.textMuted)

            Spacer()
        }
    }

    // MARK: - Save Button

    private var saveButton: some View {
        VStack(spacing: 8) {
            if let errorMessage {
                Text(errorMessage)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "EF4444"))
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
                    Text("Changer le mot de passe")
                        .font(.system(size: 15, weight: .bold))
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
                .foregroundColor(Color(hex: "4ADE80"))

            Text("Mot de passe modifie")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textPrimary)
        }
        .padding(32)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(Color(hex: "4ADE80").opacity(0.3), lineWidth: 1)
                )
        )
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Reusable Components

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
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: color))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: color).opacity(0.12))
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)

                SecureField(placeholder, text: text)
                    .font(.system(size: 14, weight: .medium))
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
                struct ChangePasswordBody: Encodable {
                    let currentPassword: String
                    let newPassword: String
                }

                let body = ChangePasswordBody(
                    currentPassword: currentPassword,
                    newPassword: newPassword
                )

                let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.request(
                    endpoint: "/users/me/password",
                    method: "PATCH",
                    body: try JSONEncoder().encode(body)
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
                    errorMessage = "Mot de passe actuel incorrect"
                default:
                    errorMessage = error.errorDescription
                }
            } catch {
                HapticFeedback.error()
                errorMessage = "Une erreur est survenue"
            }
            isSaving = false
        }
    }
}
