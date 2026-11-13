import SwiftUI
import MeeshySDK
import MeeshyUI

struct SecurityPhoneSection: View {
    let user: MeeshyUser?
    @ObservedObject var phoneFlow: PhoneChangeFlowModel

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            SecuritySectionHeader(title: String(localized: "settings.security.phone", defaultValue: "Téléphone", bundle: .main), icon: "phone.fill", color: MeeshyColors.indigo400Hex)

            VStack(spacing: 0) {
                currentPhoneRow

                if phoneFlow.step == .codeSent {
                    phoneCodeContent
                } else if phoneFlow.step == .editing {
                    phoneEditContent
                } else {
                    idleActions
                }

                if let phoneError = phoneFlow.error {
                    Text(phoneError)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(MeeshyColors.error)
                        .padding(.horizontal, MeeshySpacing.mdPlus)
                        .padding(.bottom, MeeshySpacing.smPlus)
                }
            }
            .background(SettingsSectionBackground(tint: MeeshyColors.indigo400Hex))
        }
    }

    private var currentPhoneRow: some View {
        HStack(spacing: MeeshySpacing.md) {
            SecurityFieldIcon("phone.fill", color: MeeshyColors.indigo400Hex)

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(String(localized: "settings.security.phone.current", defaultValue: "Téléphone actuel", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(theme.textMuted)

                Text({
                    if let phone = user?.phoneNumber, !phone.isEmpty {
                        return "\(CountryPicker.flag(forPhoneNumber: phone)) \(phone)"
                    }
                    return String(localized: "settings.security.not_set", defaultValue: "Non défini", bundle: .main)
                }())
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(user?.phoneNumber != nil ? theme.textPrimary : theme.textMuted)
            }

            Spacer()

            if let phone = user?.phoneNumber, !phone.isEmpty {
                SecurityVerificationBadge(verified: user?.phoneVerifiedAt != nil)
            }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
    }

    private var idleActions: some View {
        HStack(spacing: 0) {
            Button {
                HapticFeedback.light()
                phoneFlow.beginEditing()
            } label: {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "pencil")
                        .font(.caption.weight(.semibold))
                    Text(String(localized: "common.edit", defaultValue: "Modifier", bundle: .main))
                        .font(.footnote.weight(.semibold))
                }
                .foregroundColor(MeeshyColors.indigo400)
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.sm)
            }

            if let phone = user?.phoneNumber, !phone.isEmpty, user?.phoneVerifiedAt == nil {
                Button {
                    HapticFeedback.light()
                    Task { await phoneFlow.requestCode(for: phone) }
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

    private var cancelButton: some View {
        Button {
            HapticFeedback.light()
            phoneFlow.cancel()
        } label: {
            Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                .font(.footnote.weight(.semibold))
                .foregroundStyle(theme.textMuted)
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.sm)
                .background(Capsule().fill(theme.textMuted.opacity(MeeshyOpacity.light)))
        }
    }

    private var phoneEditContent: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            HStack(spacing: MeeshySpacing.md) {
                SecurityFieldIcon("phone.badge.plus", color: MeeshyColors.indigo400Hex)

                TextField("+33 6 12 34 56 78", text: $phoneFlow.newPhone)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(theme.textPrimary)
                    .textContentType(.telephoneNumber)
                    .keyboardType(.phonePad)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)

            HStack(spacing: MeeshySpacing.smPlus) {
                cancelButton

                Button {
                    HapticFeedback.medium()
                    Task { await phoneFlow.sendCode() }
                } label: {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        if phoneFlow.isSending {
                            ProgressView().scaleEffect(0.7).tint(.white)
                        }
                        Text(String(localized: "settings.security.phone.send_code", defaultValue: "Envoyer le code", bundle: .main))
                            .font(.footnote.weight(.bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(
                        Capsule().fill(
                            phoneFlow.canSend
                                ? MeeshyColors.indigo400
                                : MeeshyColors.indigo400.opacity(0.4)
                        )
                    )
                }
                .disabled(!phoneFlow.canSend)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.bottom, MeeshySpacing.smPlus)
        }
    }

    private var phoneCodeContent: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "ellipsis.message.fill")
                    .font(.subheadline)
                    .foregroundStyle(MeeshyColors.success)
                Text(String(localized: "settings.security.phone.code_sent", defaultValue: "Code envoyé par SMS", bundle: .main))
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(MeeshyColors.success)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)

            HStack(spacing: MeeshySpacing.md) {
                SecurityFieldIcon("number", color: MeeshyColors.indigo400Hex)

                TextField(String(localized: "settings.security.phone.code_placeholder", defaultValue: "Code à 6 chiffres", bundle: .main), text: $phoneFlow.code)
                    .font(.system(.callout, design: .monospaced).weight(.semibold))
                    .foregroundStyle(theme.textPrimary)
                    .keyboardType(.numberPad)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)

            HStack(spacing: MeeshySpacing.smPlus) {
                cancelButton

                Button {
                    HapticFeedback.medium()
                    Task { await phoneFlow.verifyCode() }
                } label: {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        if phoneFlow.isVerifying {
                            ProgressView().scaleEffect(0.7).tint(.white)
                        }
                        Text(String(localized: "common.verify", defaultValue: "Vérifier", bundle: .main))
                            .font(.footnote.weight(.bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(
                        Capsule().fill(
                            phoneFlow.canVerify
                                ? MeeshyColors.indigo400
                                : MeeshyColors.indigo400.opacity(0.4)
                        )
                    )
                }
                .disabled(!phoneFlow.canVerify)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.bottom, MeeshySpacing.smPlus)
        }
    }
}
