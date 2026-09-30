import SwiftUI
import Combine
import StoreKit
import MeeshySDK
import MeeshyUI

struct SupportView: View {
    @Environment(\.dismiss) private var dismiss
    // Demande d'avis native (StoreKit). ID-free : pas d'App Store ID requis.
    // Quand l'app aura un ID App Store numérique, préférer un Link direct
    // `itms-apps://…?action=write-review` (Apple recommande le deep-link pour
    // un bouton explicite, requestReview restant soumis à ses heuristiques).
    @Environment(\.requestReview) private var requestReview
    private var theme: ThemeManager { ThemeManager.shared }

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

            CollapsibleHeaderPage(
                title: String(localized: "support.title", defaultValue: "Aide et support", bundle: .main),
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
        VStack(spacing: MeeshySpacing.xl) {
            helpSection
            contactSection
            reportSection
            infoSection
            Spacer().frame(height: 40)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.lg)
    }

    // MARK: - Help Section

    private var helpSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "support.help.title", defaultValue: "Obtenir de l'aide", bundle: .main), icon: "lifepreserver.fill", color: accentColor)

            VStack(spacing: 0) {
                supportLink(icon: "book.fill", title: String(localized: "support.help.center", defaultValue: "Centre d'aide", bundle: .main), url: "https://meeshy.me/help", color: accentColor)
                supportLink(icon: "questionmark.circle.fill", title: String(localized: "support.help.faq", defaultValue: "FAQ", bundle: .main), url: "https://meeshy.me/faq", color: accentColor)
                supportButton(icon: "star.fill", title: String(localized: "support.help.rate", defaultValue: "Noter l'app", bundle: .main), color: accentColor) {
                    requestReview()
                }
            }
            .background(sectionBackground(tint: accentColor))
        }
    }

    // MARK: - Contact Section

    private var contactSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "support.contact.title", defaultValue: "Nous contacter", bundle: .main), icon: "envelope.fill", color: MeeshyColors.infoHex)

            VStack(spacing: 0) {
                supportLink(icon: "envelope.fill", title: String(localized: "support.contact.email", defaultValue: "Email du support", bundle: .main), url: "mailto:support@meeshy.me", color: MeeshyColors.infoHex)
                supportLink(icon: "at", title: String(localized: "support.contact.twitter", defaultValue: "Twitter / X", bundle: .main), url: "https://twitter.com/meeshy", color: MeeshyColors.infoHex)
            }
            .background(sectionBackground(tint: MeeshyColors.infoHex))
        }
    }

    // MARK: - Report Section

    private var reportSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "support.report.title", defaultValue: "Signaler un problème", bundle: .main), icon: "exclamationmark.bubble.fill", color: MeeshyColors.warningHex)

            VStack(spacing: 0) {
                supportLink(icon: "ladybug.fill", title: String(localized: "support.report.bug", defaultValue: "Signaler un bug", bundle: .main), url: "mailto:bugs@meeshy.me?subject=Bug%20Report%20-%20Meeshy%20iOS", color: MeeshyColors.warningHex)
                supportLink(icon: "lightbulb.fill", title: String(localized: "support.report.feature", defaultValue: "Suggérer une fonctionnalité", bundle: .main), url: "mailto:features@meeshy.me?subject=Feature%20Suggestion%20-%20Meeshy%20iOS", color: MeeshyColors.warningHex)
            }
            .background(sectionBackground(tint: MeeshyColors.warningHex))
        }
    }

    // MARK: - Info Section

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
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
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, MeeshySpacing.xs)
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
            .font(.system(size: MeeshyIconSize.sm, weight: .medium))
            .foregroundColor(Color(hex: color))
            .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.xs)
                    .fill(Color(hex: color).opacity(MeeshyOpacity.light))
            )
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private func supportLink(icon: String, title: String, url: String, color: String) -> some View {
        if let destination = URL(string: url) {
        Link(destination: destination) {
            HStack(spacing: MeeshySpacing.md) {
                fieldIcon(icon, color: color)

                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                    .foregroundColor(theme.textPrimary)

                Spacer()

                Image(systemName: "arrow.up.right")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundColor(Color(hex: color))
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
        }
        .accessibilityLabel(title)
        .accessibilityHint(String(localized: "support.a11y.opens", defaultValue: "Ouvre \(title)", bundle: .main))
        }
    }

    private func supportButton(icon: String, title: String, color: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                fieldIcon(icon, color: color)

                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                    .foregroundColor(theme.textPrimary)

                Spacer()

                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundColor(Color(hex: color))
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
        }
        .accessibilityLabel(title)
    }

    private func infoRow(icon: String, title: String, value: String, color: String) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            fieldIcon(icon, color: color)

            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Text(value)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                .foregroundColor(theme.textMuted)
                .textSelection(.enabled)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(value)")
    }
}
