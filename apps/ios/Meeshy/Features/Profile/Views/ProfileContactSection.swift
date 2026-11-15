import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Contact » sur ma fiche : mon e-mail et mon téléphone, avec leur vérification. La fiche les MONTRE ; ils se changent
/// et se vérifient dans Sécurité, que chaque rangée ouvre (#18590) — une rangée qui a l'air d'une information mène là où
/// cette information se règle.
struct ProfileContactSection: View {
    let email: String?
    let isEmailVerified: Bool
    let phoneNumber: String?
    let isPhoneVerified: Bool
    let accentHex: String
    let onOpenSecurity: (SettingsFocus) -> Void

    /// Les deux rangées, chacune menant à SA section de Sécurité.
    enum Field {
        case email, phone

        var securityFocus: SettingsFocus {
            switch self {
            case .email: return .securityEmail
            case .phone: return .securityPhone
            }
        }
    }

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            ProfileSectionHeader(icon: "envelope.fill",
                                 title: String(localized: "profile.section.contact", bundle: .main),
                                 color: MeeshyColors.indigo300)
            VStack(spacing: 0) {
                row(.email, icon: "envelope.fill",
                    title: String(localized: "profile.email", bundle: .main),
                    value: Self.displayedEmail(email), verified: Self.isFilled(email) ? isEmailVerified : nil,
                    identifier: "profile.contact.email")
                row(.phone, icon: "phone.fill",
                    title: String(localized: "profile.phone", bundle: .main),
                    value: Self.displayedPhone(phoneNumber), verified: Self.isFilled(phoneNumber) ? isPhoneVerified : nil,
                    identifier: "profile.contact.phone")
            }
            .background(ProfileSectionCard(tintHex: accentHex))
        }
    }

    private func row(_ field: Field, icon: String, title: String, value: String?, verified: Bool?, identifier: String) -> some View {
        Button {
            HapticFeedback.light()
            onOpenSecurity(field.securityFocus)
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                ProfileFieldIcon(name: icon, accentColor: accentHex)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundStyle(theme.textMuted)
                    Text(value ?? "—")
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                        .foregroundColor(value != nil ? theme.textPrimary : theme.textMuted)
                }
                Spacer()
                if let verified { ProfileVerificationBadge(isVerified: verified) }
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableButtonStyle())
        .accessibilityElement(children: .combine)
        .accessibilityHint(Self.openSecurityHint)
        .accessibilityIdentifier(identifier)
    }

    static var openSecurityHint: String {
        String(localized: "profile.contact.open.hint", defaultValue: "Ouvre Sécurité, où se change et se vérifie ce contact", bundle: .main)
    }

    private static func isFilled(_ value: String?) -> Bool { !(value ?? "").isEmpty }

    private static func displayedEmail(_ email: String?) -> String? { isFilled(email) ? email : nil }

    private static func displayedPhone(_ phone: String?) -> String? {
        guard let phone, !phone.isEmpty else { return nil }
        return "\(CountryPicker.flag(forPhoneNumber: phone)) \(phone)"
    }
}

/// « Vérifié » / « Non vérifié », en pastille de couleur sémantique.
struct ProfileVerificationBadge: View {
    let isVerified: Bool

    var body: some View {
        Text(isVerified
             ? String(localized: "profile.verified", bundle: .main)
             : String(localized: "profile.not_verified", bundle: .main))
            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, MeeshySpacing.xsPlus)
            .padding(.vertical, MeeshySpacing.xxs)
            .background(Capsule().fill(isVerified ? MeeshyColors.success : MeeshyColors.warning))
    }
}
