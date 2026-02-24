import SwiftUI
import MeeshySDK
import MeeshyUI

struct TermsOfServiceView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var selectedLanguage = "fr"

    private let accentColor = "45B7D1"

    private let sections: [String: [(title: String, content: String)]] = [
        "fr": [
            ("Acceptation des conditions",
             "En utilisant Meeshy, vous acceptez ces conditions d'utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser notre service."),
            ("Licence d'utilisation",
             "Nous vous accordons une licence limitee, non exclusive et revocable pour utiliser Meeshy conformement a ces conditions. Vous ne pouvez pas copier, modifier ou distribuer l'application."),
            ("Conduite de l'utilisateur",
             "Vous vous engagez a ne pas utiliser Meeshy pour envoyer du spam, du contenu illegal, harcelant ou portant atteinte aux droits d'autrui. Tout abus sera sanctionne par la suspension ou la fermeture de votre compte."),
            ("Contenu",
             "Vous conservez la propriete de votre contenu. En utilisant Meeshy, vous nous accordez une licence limitee pour transmettre et stocker votre contenu afin de fournir nos services."),
            ("Resiliation du compte",
             "Vous pouvez supprimer votre compte a tout moment. Nous nous reservons le droit de suspendre ou fermer les comptes qui violent ces conditions."),
            ("Avertissement",
             "Meeshy est fourni tel quel, sans garantie expresse ou implicite. Nous ne garantissons pas un fonctionnement ininterrompu ou sans erreur du service."),
            ("Limitation de responsabilite",
             "Dans la mesure permise par la loi, Meeshy ne sera pas responsable des dommages indirects, accessoires ou consecutifs lies a l'utilisation de notre service."),
            ("Modifications des conditions",
             "Nous pouvons modifier ces conditions a tout moment. Les modifications prendront effet des leur publication dans l'application. L'utilisation continue constitue votre acceptation."),
            ("Contact",
             "Pour toute question concernant ces conditions, contactez-nous a legal@meeshy.me")
        ],
        "en": [
            ("Acceptance of Terms",
             "By using Meeshy, you agree to these terms of service. If you do not accept these terms, please do not use our service."),
            ("License to Use",
             "We grant you a limited, non-exclusive, revocable license to use Meeshy in accordance with these terms. You may not copy, modify, or distribute the application."),
            ("User Conduct",
             "You agree not to use Meeshy to send spam, illegal content, harassment, or content that infringes on others' rights. Any abuse will result in account suspension or termination."),
            ("Content",
             "You retain ownership of your content. By using Meeshy, you grant us a limited license to transmit and store your content to provide our services."),
            ("Account Termination",
             "You may delete your account at any time. We reserve the right to suspend or terminate accounts that violate these terms."),
            ("Disclaimer",
             "Meeshy is provided as-is, without express or implied warranty. We do not guarantee uninterrupted or error-free operation of the service."),
            ("Limitation of Liability",
             "To the extent permitted by law, Meeshy shall not be liable for indirect, incidental, or consequential damages arising from the use of our service."),
            ("Changes to Terms",
             "We may modify these terms at any time. Changes take effect upon publication in the application. Continued use constitutes your acceptance."),
            ("Contact",
             "For any questions about these terms, contact us at legal@meeshy.me")
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

            Text("Conditions")
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
                        termsSection(number: index + 1, title: section.title, content: section.content)
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

    // MARK: - Terms Section

    private func termsSection(number: Int, title: String, content: String) -> some View {
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
