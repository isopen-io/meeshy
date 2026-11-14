import SwiftUI
import MeeshySDK
import MeeshyUI

struct SecurityEmailSection: View {
    let user: MeeshyUser?

    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var authManager: AuthManager
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var isEditingEmail = false
    @State private var newEmail = ""
    @State private var emailLoading = false
    @State private var emailSent = false
    @State private var emailError: String?
    @State private var resendCooldown = 0
    @State private var resendTimer: Timer?

    private let accentColor = "6366F1"

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            SecuritySectionHeader(title: String(localized: "settings.security.email", defaultValue: "E-mail", bundle: .main), icon: "envelope.fill", color: accentColor)

            VStack(spacing: 0) {
                currentEmailRow

                if isEditingEmail {
                    emailEditContent
                } else if emailSent {
                    emailSentContent
                } else {
                    idleActions
                }

                if let emailError {
                    Text(emailError)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(MeeshyColors.error)
                        .padding(.horizontal, MeeshySpacing.mdPlus)
                        .padding(.bottom, MeeshySpacing.smPlus)
                }
            }
            .background(SettingsSectionBackground(tint: accentColor))
        }
        .onDisappear {
            resendTimer?.invalidate()
            resendTimer = nil
        }
        .adaptiveOnChange(of: scenePhase) { _, newPhase in
            if newPhase == .active, emailSent {
                Task { await authManager.checkExistingSession() }
            }
        }
    }

    private var currentEmailRow: some View {
        HStack(spacing: MeeshySpacing.md) {
            SecurityFieldIcon("envelope.fill", color: accentColor)

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(String(localized: "settings.security.email.current", defaultValue: "E-mail actuel", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(theme.textMuted)

                Text(user?.email ?? String(localized: "settings.security.not_set", defaultValue: "Non défini", bundle: .main))
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(user?.email != nil ? theme.textPrimary : theme.textMuted)
            }

            Spacer()

            if let email = user?.email, !email.isEmpty {
                SecurityVerificationBadge(verified: user?.emailVerifiedAt != nil)
            }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
    }

    private var idleActions: some View {
        HStack(spacing: 0) {
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    isEditingEmail = true
                }
            } label: {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "pencil")
                        .font(.caption.weight(.semibold))
                    Text(String(localized: "common.edit", defaultValue: "Modifier", bundle: .main))
                        .font(.footnote.weight(.semibold))
                }
                .foregroundColor(MeeshyColors.indigo500)
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.sm)
            }

            if let email = user?.email, !email.isEmpty, user?.emailVerifiedAt == nil {
                Button {
                    HapticFeedback.light()
                    newEmail = email
                    submitEmailChange()
                } label: {
                    HStack(spacing: MeeshySpacing.sm) {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption.weight(.semibold))
                        Text(String(localized: "common.verify", defaultValue: "Vérifier", bundle: .main))
                            .font(.footnote.weight(.semibold))
                    }
                    .foregroundColor(MeeshyColors.success)
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .padding(.vertical, MeeshySpacing.sm)
                }
            }

            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.bottom, MeeshySpacing.smPlus)
    }

    private var emailEditContent: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            HStack(spacing: MeeshySpacing.md) {
                SecurityFieldIcon("at", color: accentColor)

                TextField(String(localized: "settings.security.email.new", defaultValue: "Nouvel e-mail", bundle: .main), text: $newEmail)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(theme.textPrimary)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)

            HStack(spacing: MeeshySpacing.smPlus) {
                Button {
                    HapticFeedback.light()
                    withAnimation { isEditingEmail = false; newEmail = ""; emailError = nil }
                } label: {
                    Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(theme.textMuted)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.sm)
                        .background(Capsule().fill(theme.textMuted.opacity(MeeshyOpacity.light)))
                }

                Button {
                    HapticFeedback.medium()
                    submitEmailChange()
                } label: {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        if emailLoading {
                            ProgressView().scaleEffect(0.7).tint(.white)
                        }
                        Text(String(localized: "common.send", defaultValue: "Envoyer", bundle: .main))
                            .font(.footnote.weight(.bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(
                        Capsule().fill(
                            newEmail.contains("@") && !emailLoading
                                ? MeeshyColors.indigo500
                                : MeeshyColors.indigo500.opacity(0.4)
                        )
                    )
                }
                .disabled(!newEmail.contains("@") || emailLoading)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.bottom, MeeshySpacing.smPlus)
        }
    }

    private var emailSentContent: some View {
        VStack(spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "envelope.badge.fill")
                    .font(.subheadline)
                    .foregroundStyle(MeeshyColors.success)
                Text(String(localized: "settings.security.email.verification_sent", defaultValue: "E-mail de vérification envoyé", bundle: .main))
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(MeeshyColors.success)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)

            EmailSpamFolderHint()
                .padding(.horizontal, MeeshySpacing.mdPlus)

            Button {
                HapticFeedback.light()
                resendEmailVerification()
            } label: {
                Text(resendCooldown > 0
                     ? "\(String(localized: "settings.security.email.resend", defaultValue: "Renvoyer", bundle: .main)) (\(resendCooldown)s)"
                     : String(localized: "settings.security.email.resend_email", defaultValue: "Renvoyer l'e-mail", bundle: .main))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(resendCooldown > 0 ? theme.textMuted : MeeshyColors.indigo500)
            }
            .disabled(resendCooldown > 0)
            .padding(.bottom, MeeshySpacing.smPlus)
        }
    }

    // MARK: - Actions

    private func submitEmailChange() {
        emailLoading = true
        emailError = nil

        Task {
            do {
                _ = try await UserService.shared.changeEmail(ChangeEmailRequest(newEmail: newEmail))
                HapticFeedback.success()
                withAnimation {
                    emailSent = true
                    isEditingEmail = false
                }
                startResendCooldown()
            } catch let error as MeeshyError {
                HapticFeedback.error()
                emailError = error.errorDescription
            } catch {
                HapticFeedback.error()
                emailError = String(localized: "common.error.generic", defaultValue: "Une erreur est survenue", bundle: .main)
            }
            emailLoading = false
        }
    }

    private func resendEmailVerification() {
        guard resendCooldown == 0 else { return }

        Task {
            do {
                _ = try await UserService.shared.resendEmailChangeVerification()
                HapticFeedback.success()
                startResendCooldown()
            } catch {
                HapticFeedback.error()
                emailError = String(localized: "settings.security.email.resend_failed", defaultValue: "Impossible de renvoyer l'e-mail", bundle: .main)
            }
        }
    }

    private func startResendCooldown() {
        resendCooldown = 60
        resendTimer?.invalidate()
        resendTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in
                resendCooldown -= 1
                if resendCooldown <= 0 {
                    resendTimer?.invalidate()
                    resendTimer = nil
                }
            }
        }
    }
}
