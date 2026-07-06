import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct SupportView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    private let accentColor = "27AE60"

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

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
                        .font(MeeshyFont.relative(14, weight: .semibold))
                    Text(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                        .font(MeeshyFont.relative(15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "common.back", defaultValue: "Retour", bundle: .main))

            Spacer()

            Text(String(localized: "support.title", defaultValue: "Aide et support", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
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
            VStack(spacing: 20) {
                helpSection
                contactSection
                reportSection
                infoSection
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Help Section

    private var helpSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "support.help.title", defaultValue: "Obtenir de l'aide", bundle: .main), icon: "lifepreserver.fill", color: accentColor)

            VStack(spacing: 0) {
                supportLink(icon: "book.fill", title: String(localized: "support.help.center", defaultValue: "Centre d'aide", bundle: .main), url: "https://meeshy.me/help", color: accentColor)
                supportLink(icon: "questionmark.circle.fill", title: String(localized: "support.help.faq", defaultValue: "FAQ", bundle: .main), url: "https://meeshy.me/faq", color: accentColor)
            }
            .background(sectionBackground(tint: accentColor))
        }
    }

    // MARK: - Contact Section

    private var contactSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "support.contact.title", defaultValue: "Nous contacter", bundle: .main), icon: "envelope.fill", color: "3498DB")

            VStack(spacing: 0) {
                supportLink(icon: "envelope.fill", title: String(localized: "support.contact.email", defaultValue: "Email support", bundle: .main), url: "mailto:support@meeshy.me", color: "3498DB")
                supportLink(icon: "at", title: String(localized: "support.contact.twitter", defaultValue: "Twitter / X", bundle: .main), url: "https://twitter.com/meeshy", color: "3498DB")
            }
            .background(sectionBackground(tint: "3498DB"))
        }
    }

    // MARK: - Report Section

    private var reportSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "support.report.title", defaultValue: "Signaler un probleme", bundle: .main), icon: "exclamationmark.bubble.fill", color: "E67E22")

            VStack(spacing: 0) {
                supportLink(icon: "ladybug.fill", title: String(localized: "support.report.bug", defaultValue: "Signaler un bug", bundle: .main), url: "mailto:bugs@meeshy.me?subject=Bug%20Report%20-%20Meeshy%20iOS", color: "E67E22")
                supportLink(icon: "lightbulb.fill", title: String(localized: "support.report.feature", defaultValue: "Suggerer une fonctionnalite", bundle: .main), url: "mailto:features@meeshy.me?subject=Feature%20Suggestion%20-%20Meeshy%20iOS", color: "E67E22")
            }
            .background(sectionBackground(tint: "E67E22"))
        }
    }

    // MARK: - Info Section

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "support.info.title", defaultValue: "Informations", bundle: .main), icon: "info.circle", color: "6B7280")

            VStack(spacing: 0) {
                infoRow(icon: "sparkles", title: String(localized: "support.info.version", defaultValue: "Version", bundle: .main), value: appVersion, color: "6B7280")
                infoRow(icon: "hammer.fill", title: String(localized: "support.info.build", defaultValue: "Build", bundle: .main), value: buildNumber, color: "6B7280")
                infoRow(icon: "apple.logo", title: String(localized: "support.info.platform", defaultValue: "Plateforme", bundle: .main), value: "iOS \(UIDevice.current.systemVersion)", color: "6B7280")
            }
            .background(sectionBackground(tint: "6B7280"))
        }
    }

    // MARK: - Helpers

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
    }

    private func sectionBackground(tint: String) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(theme.border(tint: tint), lineWidth: 1)
            )
    }

    private func fieldIcon(_ name: String, color: String) -> some View {
        Image(systemName: name)
            .font(MeeshyFont.relative(14, weight: .medium))
            .foregroundColor(Color(hex: color))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(hex: color).opacity(0.12))
            )
    }

    private func supportLink(icon: String, title: String, url: String, color: String) -> some View {
        Link(destination: URL(string: url)!) {
            HStack(spacing: 12) {
                fieldIcon(icon, color: color)

                Text(title)
                    .font(MeeshyFont.relative(14, weight: .medium))
                    .foregroundColor(theme.textPrimary)

                Spacer()

                Image(systemName: "arrow.up.right")
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(Color(hex: color))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .accessibilityLabel(title)
        .accessibilityHint(String(localized: "support.a11y.opens", defaultValue: "Ouvre \(title)", bundle: .main))
    }

    private func infoRow(icon: String, title: String, value: String, color: String) -> some View {
        HStack(spacing: 12) {
            fieldIcon(icon, color: color)

            Text(title)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Text(value)
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }
}
