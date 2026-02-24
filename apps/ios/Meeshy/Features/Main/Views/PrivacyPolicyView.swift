import SwiftUI
import MeeshySDK
import MeeshyUI

struct PrivacyPolicyView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var selectedLanguage = "fr"

    private let accentColor = "45B7D1"

    private let sections: [String: [(title: String, content: String)]] = [
        "fr": [
            ("Collecte d'informations",
             "Nous collectons les informations que vous fournissez directement lors de la creation de votre compte, de l'envoi de messages et de l'utilisation de nos services. Cela inclut votre nom d'utilisateur, adresse email, numero de telephone et le contenu de vos communications."),
            ("Utilisation des informations",
             "Vos informations sont utilisees pour fournir, maintenir et ameliorer nos services de messagerie, y compris la traduction en temps reel et le clonage vocal. Nous n'utilisons jamais vos donnees a des fins publicitaires."),
            ("Securite des donnees",
             "Nous utilisons le chiffrement de bout en bout (E2E) pour proteger vos messages. Vos cles de chiffrement sont stockees uniquement sur vos appareils. Meeshy ne peut pas lire le contenu de vos messages chiffres."),
            ("Conservation des donnees",
             "Vos messages sont conserves tant que votre compte est actif. Vous pouvez supprimer vos messages a tout moment. Les donnees de compte sont supprimees dans les 30 jours suivant la fermeture du compte."),
            ("Vos droits",
             "Vous avez le droit d'acceder a vos donnees, de les modifier, de les exporter et de les supprimer. Contactez-nous pour exercer ces droits."),
            ("Modifications de cette politique",
             "Nous pouvons mettre a jour cette politique periodiquement. Nous vous informerons de tout changement significatif par notification dans l'application."),
            ("Contact",
             "Pour toute question concernant cette politique, contactez-nous a privacy@meeshy.me")
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

            VStack(spacing: 0) {
                header
                scrollContent
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
            .accessibilityLabel("Retour")

            Spacer()

            Text("Confidentialite")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)
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
            VStack(spacing: 16) {
                languagePicker

                lastUpdated

                if let currentSections = sections[selectedLanguage] {
                    ForEach(Array(currentSections.enumerated()), id: \.offset) { index, section in
                        policySection(number: index + 1, title: section.title, content: section.content)
                    }
                }

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    // MARK: - Language Picker

    private var languagePicker: some View {
        Picker("Langue", selection: $selectedLanguage) {
            Text("Francais").tag("fr")
            Text("English").tag("en")
        }
        .pickerStyle(.segmented)
        .accessibilityLabel("Langue du document")
    }

    // MARK: - Last Updated

    private var lastUpdated: some View {
        Text(selectedLanguage == "fr" ? "Derniere mise a jour : 24 fevrier 2026" : "Last updated: February 24, 2026")
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(theme.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 4)
    }

    // MARK: - Policy Section

    private func policySection(number: Int, title: String, content: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "\(number).circle.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))

                Text(title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(theme.textPrimary)
            }

            Text(content)
                .font(.system(size: 14, weight: .regular))
                .foregroundColor(theme.textSecondary)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.border(tint: accentColor), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
    }
}
