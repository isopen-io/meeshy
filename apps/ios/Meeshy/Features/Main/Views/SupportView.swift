import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct SupportView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    private let accentColor = MeeshyColors.successHex

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
            sectionHeader(title: String(localized: "support.contact.title", defaultValue: "Nous contacter", bundle: .main), icon: "envelope.fill", color: MeeshyColors.infoHex)

            VStack(spacing: 0) {
                supportLink(icon: "envelope.fill", title: String(localized: "support.contact.email", defaultValue: "Email support", bundle: .main), url: "mailto:support@meeshy.me", color: MeeshyColors.infoHex)
                supportLink(icon: "at", title: String(localized: "support.contact.twitter", defaultValue: "Twitter / X", bundle: .main), url: "https://twitter.com/meeshy", color: MeeshyColors.infoHex)
            }
            .background(sectionBackground(tint: MeeshyColors.infoHex))
        }
    }

    // MARK: - Report Section

    private var reportSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "support.report.title", defaultValue: "Signaler un probleme", bundle: .main), icon: "exclamationmark.bubble.fill", color: MeeshyColors.warningHex)

            VStack(spacing: 0) {
                supportLink(icon: "ladybug.fill", title: String(localized: "support.report.bug", defaultValue: "Signaler un bug", bundle: .main), url: "mailto:bugs@meeshy.me?subject=Bug%20Report%20-%20Meeshy%20iOS", color: MeeshyColors.warningHex)
                supportLink(icon: "lightbulb.fill", title: String(localized: "support.report.feature", defaultValue: "Suggerer une fonctionnalite", bundle: .main), url: "mailto:features@meeshy.me?subject=Feature%20Suggestion%20-%20Meeshy%20iOS", color: MeeshyColors.warningHex)
            }
            .background(sectionBackground(tint: MeeshyColors.warningHex))
        }
    }

    // MARK: - Info Section

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "support.info.title", defaultValue: "Informations", bundle: .main), icon: "info.circle", color: MeeshyColors.neutral500Hex)

            VStack(spacing: 0) {
                infoRow(icon: "sparkles", title: String(localized: "support.info.version", defaultValue: "Version", bundle: .main), value: appVersion, color: MeeshyColors.neutral500Hex)
                infoRow(icon: "hammer.fill", title: String(localized: "support.info.build", defaultValue: "Build", bundle: .main), value: buildNumber, color: MeeshyColors.neutral500Hex)
                infoRow(icon: "apple.logo", title: String(localized: "support.info.platform", defaultValue: "Plateforme", bundle: .main), value: "iOS \(UIDevice.current.systemVersion)", color: MeeshyColors.neutral500Hex)
            }
            .background(sectionBackground(tint: MeeshyColors.neutral500Hex))
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
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
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
        // Fixed size: glyph pinned inside a 28×28 tinted badge — scaling it with
        // Dynamic Type would burst the fixed frame (doctrine 74i/86i/91i). The
        // adjacent row label carries the meaning, so the glyph is decorative to VoiceOver.
        Image(systemName: name)
            .font(MeeshyFont.relative(14, weight: .medium))
            .foregroundColor(Color(hex: color))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(hex: color).opacity(0.12))
            )
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private func supportLink(icon: String, title: String, url: String, color: String) -> some View {
        if let destination = URL(string: url) {
        Link(destination: destination) {
            HStack(spacing: 12) {
                fieldIcon(icon, color: color)

                Text(title)
                    .font(MeeshyFont.relative(14, weight: .medium))
                    .foregroundColor(theme.textPrimary)

                Spacer()

                Image(systemName: "arrow.up.right")
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(Color(hex: color))
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .accessibilityLabel(title)
        .accessibilityHint(String(localized: "support.a11y.opens", defaultValue: "Ouvre \(title)", bundle: .main))
        }
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
                .textSelection(.enabled)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(value)")
    }
}
