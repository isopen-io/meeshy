import SwiftUI
import MeeshySDK
import MeeshyUI

struct SecurityConversationLockSection: View {
    @ObservedObject var lockManager: ConversationLockManager
    let onSetup: () -> Void
    let onChange: () -> Void
    let onUnlockAll: () -> Void
    let onRemove: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    private let lockColor = "F87171"

    var body: some View {
        let hasMasterPIN = lockManager.masterPinConfigured
        let lockedCount = lockManager.contentLockedConversationIds.count
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            SecuritySectionHeader(title: String(localized: "settings.security.locked_conversations", defaultValue: "Conversations verrouillées", bundle: .main), icon: "lock.shield.fill", color: lockColor)
            SettingsSentence(text: String(localized: "settings.security.locked_conversations.summary", defaultValue: "Verrouillez des conversations derrière un code PIN principal.", bundle: .main))

            VStack(spacing: 0) {
                statusRow(hasMasterPIN: hasMasterPIN, lockedCount: lockedCount)

                actionsRow(hasMasterPIN: hasMasterPIN, lockedCount: lockedCount)
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .padding(.bottom, MeeshySpacing.smPlus)

                if hasMasterPIN {
                    ConversationBiometricUnlockRow(color: lockColor)
                }
            }
            .background(SettingsSectionBackground(tint: lockColor))
        }
    }

    private func actionsRow(hasMasterPIN: Bool, lockedCount: Int) -> some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            if !hasMasterPIN {
                setupButton
            } else {
                changeButton

                if lockedCount > 0 {
                    unlockAllButton(lockedCount: lockedCount)
                }

                if lockManager.offersMasterPinRemoval {
                    removeButton
                }
            }
        }
    }

    private var setupButton: some View {
        Button {
            HapticFeedback.medium()
            onSetup()
        } label: {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "plus.circle.fill")
                    .font(.caption)
                Text(String(localized: "settings.security.configure", defaultValue: "Configurer", bundle: .main))
                    .font(.footnote.weight(.semibold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)
            // Le (+) « Configurer » passe en verre PROÉMINENT (#6481) :
            // le verre simple rendrait le texte blanc illisible avant
            // iOS 26, où la variante proéminente garde l'aplat rouge.
            .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.error)
        }
    }

    private var changeButton: some View {
        Button {
            HapticFeedback.light()
            onChange()
        } label: {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "pencil.circle.fill")
                    .font(.caption)
                Text(String(localized: "common.edit", defaultValue: "Modifier", bundle: .main))
                    .font(.footnote.weight(.semibold))
            }
            .foregroundColor(MeeshyColors.error)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)
            .background(Capsule().fill(MeeshyColors.error.opacity(MeeshyOpacity.light)))
        }
    }

    private func unlockAllButton(lockedCount: Int) -> some View {
        Button {
            HapticFeedback.medium()
            onUnlockAll()
        } label: {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "lock.open.fill")
                    .font(.caption)
                Text("\(String(localized: "settings.security.unlock_all", defaultValue: "Déverrouiller tout", bundle: .main)) (\(lockedCount))")
                    .font(.footnote.weight(.semibold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)
            .background(Capsule().fill(MeeshyColors.warning))
        }
    }

    private var removeButton: some View {
        Button {
            HapticFeedback.medium()
            onRemove()
        } label: {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "trash.circle.fill")
                    .font(.caption)
                Text(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main))
                    .font(.footnote.weight(.semibold))
            }
            .foregroundColor(MeeshyColors.error)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)
            .background(Capsule().fill(MeeshyColors.error.opacity(MeeshyOpacity.subtle)))
        }
    }

    private func statusRow(hasMasterPIN: Bool, lockedCount: Int) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            SecurityFieldIcon("lock.shield.fill", color: lockColor)

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(String(localized: "settings.security.master_pin", defaultValue: "Code PIN principal", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(theme.textMuted)
                Text(hasMasterPIN
                     ? String(localized: "settings.security.configured", defaultValue: "Configuré", bundle: .main)
                     : String(localized: "settings.security.not_configured", defaultValue: "Non configuré", bundle: .main))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(hasMasterPIN ? MeeshyColors.success : theme.textMuted)
            }

            Spacer()

            if hasMasterPIN {
                HStack(spacing: MeeshySpacing.sm) {
                    if lockedCount > 0 {
                        Text("\(lockedCount) \(String(localized: "settings.security.locks", defaultValue: "verrou(s)", bundle: .main))")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(MeeshyColors.error)
                            .padding(.horizontal, MeeshySpacing.sm)
                            .padding(.vertical, MeeshySpacing.xxs)
                            .background(Capsule().fill(MeeshyColors.error.opacity(MeeshyOpacity.light)))
                    }
                    Image(systemName: "checkmark.shield.fill")
                        .font(.callout)
                        .foregroundStyle(MeeshyColors.success)
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
    }
}
