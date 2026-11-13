import SwiftUI
import MeeshySDK
import MeeshyUI

struct SecurityTwoFactorSection: View {
    @ObservedObject var viewModel: TwoFactorViewModel
    let onShowBackupCodes: () -> Void
    let onDisable: () -> Void
    let onEnable: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    private let tfaColor = "6366F1"

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            SecuritySectionHeader(
                title: String(localized: "2fa_section_title", defaultValue: "Authentification à deux facteurs"),
                icon: "shield.lefthalf.filled",
                color: tfaColor
            )
            SettingsSentence(text: String(localized: "2fa_section_summary", defaultValue: "Un code en plus du mot de passe à chaque connexion."))

            VStack(spacing: 0) {
                statusRow

                actionsRow
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .padding(.bottom, MeeshySpacing.smPlus)

                if let twoFactorError = viewModel.error {
                    Text(twoFactorError)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(MeeshyColors.error)
                        .padding(.horizontal, MeeshySpacing.mdPlus)
                        .padding(.bottom, MeeshySpacing.smPlus)
                }
            }
            .background(SettingsSectionBackground(tint: tfaColor))
        }
    }

    private var statusRow: some View {
        HStack(spacing: MeeshySpacing.md) {
            SecurityFieldIcon("shield.lefthalf.filled", color: tfaColor)

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(String(localized: "2fa_status_label", defaultValue: "Statut 2FA"))
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(theme.textMuted)

                if viewModel.isLoading {
                    ProgressView()
                        .scaleEffect(0.7)
                } else {
                    Text(viewModel.isEnabled
                         ? String(localized: "2fa_enabled", defaultValue: "Actif")
                         : String(localized: "2fa_disabled", defaultValue: "Désactivé"))
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(viewModel.isEnabled ? MeeshyColors.success : theme.textMuted)
                }
            }

            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
    }

    private var actionsRow: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            if viewModel.isEnabled {
                backupCodesButton
                disableButton
            } else {
                enableButton
            }
        }
    }

    private var backupCodesButton: some View {
        Button {
            HapticFeedback.light()
            onShowBackupCodes()
        } label: {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "key.fill")
                    .font(.caption)
                Text(String(localized: "2fa_backup_codes_button", defaultValue: "Codes de secours"))
                    .font(.footnote.weight(.semibold))
            }
            .foregroundColor(MeeshyColors.indigo500)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)
            .background(Capsule().fill(MeeshyColors.indigo500.opacity(MeeshyOpacity.light)))
        }
    }

    private var disableButton: some View {
        Button {
            HapticFeedback.medium()
            onDisable()
        } label: {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "shield.slash.fill")
                    .font(.caption)
                Text(String(localized: "2fa_disable_button", defaultValue: "Désactiver"))
                    .font(.footnote.weight(.semibold))
            }
            .foregroundColor(MeeshyColors.error)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)
            .background(Capsule().fill(MeeshyColors.error.opacity(MeeshyOpacity.subtle)))
        }
    }

    private var enableButton: some View {
        Button {
            HapticFeedback.medium()
            onEnable()
        } label: {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "shield.lefthalf.filled.badge.checkmark")
                    .font(.caption)
                Text(String(localized: "2fa_enable_button", defaultValue: "Activer la 2FA"))
                    .font(.footnote.weight(.semibold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)
            .background(Capsule().fill(MeeshyColors.indigo500))
        }
    }
}
