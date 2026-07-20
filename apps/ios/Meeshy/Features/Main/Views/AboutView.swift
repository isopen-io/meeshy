import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct AboutView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    private let accentColor = "45B7D1"

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

    private var versionString: String {
        String(localized: "about.version", defaultValue: "Version \(appVersion) (\(buildNumber))", bundle: .main)
    }

    private var copyLabel: String {
        String(localized: "common.copy", defaultValue: "Copy", bundle: .main)
    }

    private func copyValue(_ value: String) {
        UIPasteboard.general.string = value
        HapticFeedback.success()
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
                HStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: "chevron.left")
                        .font(MeeshyFont.relative(14, weight: .semibold))
                    Text(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                        .font(MeeshyFont.relative(15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "common.back", defaultValue: "Retour", bundle: .main))

            Spacer()

            Text(String(localized: "about.title", defaultValue: "A propos", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Color.clear.frame(width: 60, height: 24)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: MeeshySpacing.xl) {
                appHeaderSection
                informationsSection
                descriptionSection
                fonctionnalitesSection
                liensSection
                copyrightSection
                Spacer().frame(height: MeeshySpacing.xxxl + MeeshySpacing.sm)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.lg)
        }
    }

    // MARK: - App Header

    private var appHeaderSection: some View {
        VStack(spacing: MeeshySpacing.md) {
            AnimatedLogoView(
                color: isDark ? .white : Color(hex: "1C1917"),
                lineWidth: 10,
                continuous: true
            )
            .frame(width: 80, height: 80)
            .accessibilityHidden(true)

            Text(String(localized: "about.app_name", defaultValue: "Meeshy", bundle: .main))
                .font(MeeshyFont.relative(28, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text(versionString)
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(theme.textMuted)
                .contextMenu {
                    Button {
                        copyValue(versionString)
                    } label: {
                        Label(copyLabel, systemImage: "doc.on.doc")
                    }
                }
                .accessibilityAction(named: Text(copyLabel)) { copyValue(versionString) }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.xl)
        .background(sectionBackground(tint: accentColor))
    }

    // MARK: - Informations

    private var informationsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "about.section.informations", defaultValue: "Informations", bundle: .main), icon: "info.circle.fill", color: accentColor)

            VStack(spacing: 0) {
                infoRow(icon: "apple.logo", title: String(localized: "about.info.platform", defaultValue: "Plateforme", bundle: .main), value: "iOS \(UIDevice.current.systemVersion)", color: accentColor)
                infoRow(icon: "shippingbox.fill", title: String(localized: "about.info.bundleId", defaultValue: "Bundle ID", bundle: .main), value: Bundle.main.bundleIdentifier ?? "me.meeshy.app", color: accentColor)
                infoRow(icon: "wrench.and.screwdriver.fill", title: String(localized: "about.info.sdkVersion", defaultValue: "SDK Version", bundle: .main), value: "1.0.0", color: accentColor)
            }
            .background(sectionBackground(tint: accentColor))
        }
    }

    // MARK: - Description

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "about.section.description", defaultValue: "Description", bundle: .main), icon: "text.quote", color: MeeshyColors.indigo600Hex)

            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                Text(String(localized: "about.description.body", defaultValue: "Meeshy est une plateforme de messagerie en temps reel haute performance avec traduction multilingue, clonage vocal et chiffrement de bout en bout.", bundle: .main))
                    .font(MeeshyFont.relative(14, weight: .regular))
                    .foregroundColor(theme.textPrimary)
                    .lineSpacing(4)
                    .padding(.horizontal, MeeshySpacing.md + 2)
                    .padding(.vertical, MeeshySpacing.md)
            }
            .background(sectionBackground(tint: MeeshyColors.indigo600Hex))
        }
    }

    // MARK: - Fonctionnalites

    private var fonctionnalitesSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "about.section.features", defaultValue: "Fonctionnalites", bundle: .main), icon: "star.fill", color: "F8B500")

            VStack(spacing: 0) {
                featureRow(title: String(localized: "about.feature.encryption", defaultValue: "Chiffrement bout en bout", bundle: .main), icon: "lock.shield.fill")
                featureRow(title: String(localized: "about.feature.translation", defaultValue: "Traduction temps reel", bundle: .main), icon: "globe")
                featureRow(title: String(localized: "about.feature.voiceCloning", defaultValue: "Clonage vocal", bundle: .main), icon: "waveform")
                featureRow(title: String(localized: "about.feature.themes", defaultValue: "Themes personnalisables", bundle: .main), icon: "paintbrush.fill")
                featureRow(title: String(localized: "about.feature.cloudSync", defaultValue: "Synchronisation cloud", bundle: .main), icon: "cloud.fill")
            }
            .background(sectionBackground(tint: "F8B500"))
        }
    }

    // MARK: - Liens

    private var liensSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "about.section.links", defaultValue: "Liens", bundle: .main), icon: "link", color: MeeshyColors.infoHex)

            VStack(spacing: 0) {
                linkRow(icon: "globe", title: String(localized: "about.link.website", defaultValue: "Site web", bundle: .main), url: "https://meeshy.me", color: MeeshyColors.infoHex)
                linkRow(icon: "at", title: String(localized: "about.link.twitter", defaultValue: "Twitter / X", bundle: .main), url: "https://twitter.com/meeshy", color: MeeshyColors.infoHex)
                linkRow(icon: "chevron.left.forwardslash.chevron.right", title: String(localized: "about.link.github", defaultValue: "GitHub", bundle: .main), url: "https://github.com/meeshy", color: MeeshyColors.infoHex)
            }
            .background(sectionBackground(tint: MeeshyColors.infoHex))
        }
    }

    // MARK: - Copyright

    private var copyrightSection: some View {
        Text(String(localized: "about.copyright", defaultValue: "2024-2026 Meeshy. Tous droits reserves.", bundle: .main))
            .font(MeeshyFont.relative(12, weight: .medium))
            .foregroundColor(theme.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.top, MeeshySpacing.sm)
    }

    // MARK: - Helpers

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: MeeshySpacing.xs + 2) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, MeeshySpacing.xs)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
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
        Image(systemName: name)
            .font(MeeshyFont.relative(14, weight: .medium))
            .foregroundColor(Color(hex: color))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm - 2)
                    .fill(Color(hex: color).opacity(0.12))
            )
    }

    private func infoRow(icon: String, title: String, value: String, color: String) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            fieldIcon(icon, color: color)

            Text(title)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Text(value)
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(theme.textMuted)
                .lineLimit(1)
        }
        .padding(.horizontal, MeeshySpacing.md + 2)
        .padding(.vertical, MeeshySpacing.sm + 2)
        .accessibilityElement(children: .combine)
        .contextMenu {
            Button {
                copyValue(value)
            } label: {
                Label(copyLabel, systemImage: "doc.on.doc")
            }
        }
        .accessibilityAction(named: Text(copyLabel)) { copyValue(value) }
    }

    private func featureRow(title: String, icon: String) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            fieldIcon(icon, color: "F8B500")

            Text(title)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(MeeshyFont.relative(16))
                .foregroundColor(MeeshyColors.success)
        }
        .padding(.horizontal, MeeshySpacing.md + 2)
        .padding(.vertical, MeeshySpacing.sm + 2)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func linkRow(icon: String, title: String, url: String, color: String) -> some View {
        if let destination = URL(string: url) {
            Link(destination: destination) {
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon(icon, color: color)

                    Text(title)
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Image(systemName: "arrow.up.right")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(Color(hex: color))
                }
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.vertical, MeeshySpacing.sm + 2)
            }
            .accessibilityLabel(title)
            .accessibilityHint(String(localized: "about.link.hint", defaultValue: "Ouvre \(title) dans Safari", bundle: .main))
        }
    }
}
