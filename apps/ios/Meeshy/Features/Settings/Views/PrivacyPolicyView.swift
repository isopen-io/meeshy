import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct PrivacyPolicyView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var selectedLanguage: String

    private let accentColor = MeeshyColors.brandPrimaryHex

    private static let supportedLanguages: Set<String> = ["fr", "en"]

    @MainActor
    init() {
        // Défaut de COMPOSITION (langue proposée, repli « fr ») — pas une lecture (#11875).
        let preferred = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        let deviceLocale = Locale.current.language.languageCode?.identifier
        _selectedLanguage = State(initialValue: InitialLanguageChoice.resolve(
            preferred: preferred, deviceLocale: deviceLocale, supported: Self.supportedLanguages, fallback: "fr"
        ))
    }

    private let sections: [String: [(title: String, content: String)]] = [
        "fr": [
            ("Collecte d'informations",
             "Nous collectons les informations que vous fournissez directement lors de la création de votre compte, de l'envoi de messages et de l'utilisation de nos services. Cela inclut votre nom d'utilisateur, adresse e-mail, numéro de téléphone et le contenu de vos communications."),
            ("Utilisation des informations",
             "Vos informations sont utilisées pour fournir, maintenir et améliorer nos services de messagerie, y compris la traduction en temps réel et le clonage vocal. Nous n'utilisons jamais vos données à des fins publicitaires."),
            ("Sécurité des données",
             "Nous utilisons le chiffrement de bout en bout (E2E) pour protéger vos messages. Vos clés de chiffrement sont stockées uniquement sur vos appareils. Meeshy ne peut pas lire le contenu de vos messages chiffrés."),
            ("Conservation des données",
             "Vos messages sont conservés tant que votre compte est actif. Vous pouvez supprimer vos messages à tout moment. Les données de compte sont supprimées dans les 30 jours suivant la fermeture du compte."),
            ("Vos droits",
             "Vous avez le droit d'accéder à vos données, de les modifier, de les exporter et de les supprimer. Contactez-nous pour exercer ces droits."),
            ("Modifications de cette politique",
             "Nous pouvons mettre à jour cette politique périodiquement. Nous vous informerons de tout changement significatif par notification dans l'application."),
            ("Contact",
             "Pour toute question concernant cette politique, contactez-nous à privacy@meeshy.me")
        ],
        "en": [
            ("Information Collection",
             "We collect information you provide directly when creating your account, sending messages, and using our services. This includes your username, email address, phone number, and the content of your communications."),
            ("Use of Information",
             "Your information is used to provide, maintain, and improve our messaging services, including real-time translation and voice cloning. We never use your data for advertising purposes."),
            ("Data Security",
             "We use end-to-end encryption (E2E) to protect your messages. Your encryption keys are stored only on your devices. Meeshy cannot read the content of your encrypted messages."),
            ("Data Retention",
             "Your messages are retained as long as your account is active. You can delete your messages at any time. Account data is deleted within 30 days of account closure."),
            ("Your Rights",
             "You have the right to access, modify, export, and delete your data. Contact us to exercise these rights."),
            ("Policy Changes",
             "We may update this policy periodically. We will notify you of any significant changes via in-app notification."),
            ("Contact",
             "For any questions about this policy, contact us at privacy@meeshy.me")
        ]
    ]

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            CollapsibleHeaderPage(
                title: String(localized: "legal.privacy.title", defaultValue: "Politique de confidentialité", bundle: .main),
                onBack: { dismiss() },
                titleColor: theme.textPrimary,
                backArrowColor: Color(hex: accentColor),
                backgroundColor: theme.backgroundPrimary,
                content: { pageContent }
            )
        }
    }

    // MARK: - Content

    private var pageContent: some View {
        VStack(spacing: MeeshySpacing.lg) {
            languagePicker

            lastUpdated

            if let currentSections = sections[selectedLanguage] {
                ForEach(Array(currentSections.enumerated()), id: \.offset) { index, section in
                    policySection(number: index + 1, title: section.title, content: section.content)
                }
            }

            Spacer().frame(height: 40)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
    }

    // MARK: - Language Picker

    private var languagePicker: some View {
        Picker(String(localized: "legal.privacy.language", defaultValue: "Langue", bundle: .main), selection: $selectedLanguage) {
            Text(String(localized: "legal.privacy.language.fr", defaultValue: "Français", bundle: .main)).tag("fr")
            Text(String(localized: "legal.privacy.language.en", defaultValue: "Anglais", bundle: .main)).tag("en")
        }
        .pickerStyle(.segmented)
        .accessibilityLabel(String(localized: "legal.privacy.language.a11y", defaultValue: "Langue du document", bundle: .main))
    }

    // MARK: - Last Updated

    private var lastUpdated: some View {
        Text(selectedLanguage == "fr" ? String(localized: "legal.privacy.lastUpdated.fr", defaultValue: "Dernière mise à jour : 24 février 2026", bundle: .main) : String(localized: "legal.privacy.lastUpdated.en", defaultValue: "Dernière mise à jour : 24 février 2026", bundle: .main))
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
            .foregroundStyle(theme.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, MeeshySpacing.xs)
    }

    // MARK: - Policy Section

    private func policySection(number: Int, title: String, content: String) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "\(number).circle.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                    .foregroundStyle(Color(hex: accentColor))

                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                    .foregroundStyle(theme.textPrimary)
            }

            Text(content)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .regular))
                .foregroundStyle(theme.textSecondary)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(MeeshySpacing.mdPlus)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .stroke(theme.border(tint: accentColor), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
    }
}
