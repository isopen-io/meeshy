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

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: Self.title)
            MeeshyGroupCard(layout: .group, tint: Color(hex: accentHex), label: Self.title) {
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
            }
        }
    }

    /// Une rangée K06 : le champ, sa valeur, la pastille K41 de vérification à côté du titre, et le chevron vers Sécurité.
    private func row(_ field: Field, icon: String, title: String, value: String?, verified: Bool?, identifier: String) -> some View {
        MeeshyToggleRow(content: Self.rowContent(title: title, value: value, verified: verified),
                        action: { onOpenSecurity(field.securityFocus) },
                        leading: { MeeshyToggleRowSymbol(icon) },
                        titleAccessory: { verificationBadge(verified) },
                        trailing: { MeeshyToggleRowNoSlot() })
            .accessibilityHint(Self.openSecurityHint)
            .accessibilityIdentifier(identifier)
    }

    @ViewBuilder
    private func verificationBadge(_ verified: Bool?) -> some View {
        if let verified {
            MeeshyBadge(.label(Self.verificationWord(isVerified: verified)),
                        leading: .systemImage(verified ? "checkmark.seal.fill" : "exclamationmark.shield.fill"),
                        kind: verified ? .ok : .warn)
        }
    }

    static var title: String {
        String(localized: "profile.section.contact", bundle: .main)
    }

    /// Ce que la rangée montre et dit : la valeur (ou un tiret), et l'état de vérification que la pastille, muette, ne
    /// dit pas à VoiceOver. Un contact absent n'a rien à vérifier.
    static func rowContent(title: String, value: String?, verified: Bool?) -> MeeshyToggleRowContent {
        MeeshyToggleRowContent(title: title, subtitle: value ?? "—", accessory: .chevron,
                               titleAccessoryLabel: verified.map { verificationWord(isVerified: $0) })
    }

    static func verificationWord(isVerified: Bool) -> String {
        isVerified
            ? String(localized: "profile.verified", bundle: .main)
            : String(localized: "profile.not_verified", bundle: .main)
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
