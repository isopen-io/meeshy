import SwiftUI
import MeeshySDK
import MeeshyUI

struct AboutView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    private let accentColor = "45B7D1"

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
                        .font(.system(size: 14, weight: .semibold))
                    Text("Retour")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel("Retour")

            Spacer()

            Text("A propos")
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
            VStack(spacing: 20) {
                appHeaderSection
                informationsSection
                descriptionSection
                fonctionnalitesSection
                liensSection
                copyrightSection
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - App Header

    private var appHeaderSection: some View {
        VStack(spacing: 12) {
            Image(systemName: "message.circle.fill")
                .font(.system(size: 60))
                .foregroundStyle(
                    LinearGradient(
                        colors: [Color(hex: "08D9D6"), Color(hex: "FF2E63")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .accessibilityHidden(true)

            Text("Meeshy")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Text("Version \(appVersion) (\(buildNumber))")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .background(sectionBackground(tint: accentColor))
    }

    // MARK: - Informations

    private var informationsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Informations", icon: "info.circle.fill", color: accentColor)

            VStack(spacing: 0) {
                infoRow(icon: "apple.logo", title: "Plateforme", value: "iOS \(UIDevice.current.systemVersion)", color: accentColor)
                infoRow(icon: "shippingbox.fill", title: "Bundle ID", value: Bundle.main.bundleIdentifier ?? "com.meeshy.app", color: accentColor)
                infoRow(icon: "wrench.and.screwdriver.fill", title: "SDK Version", value: "1.0.0", color: accentColor)
            }
            .background(sectionBackground(tint: accentColor))
        }
    }

    // MARK: - Description

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Description", icon: "text.quote", color: "9B59B6")

            VStack(alignment: .leading, spacing: 8) {
                Text("Meeshy est une plateforme de messagerie en temps reel haute performance avec traduction multilingue, clonage vocal et chiffrement de bout en bout.")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(theme.textPrimary)
                    .lineSpacing(4)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
            }
            .background(sectionBackground(tint: "9B59B6"))
        }
    }

    // MARK: - Fonctionnalites

    private var fonctionnalitesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Fonctionnalites", icon: "star.fill", color: "F8B500")

            VStack(spacing: 0) {
                featureRow(title: "Chiffrement bout en bout", icon: "lock.shield.fill")
                featureRow(title: "Traduction temps reel", icon: "globe")
                featureRow(title: "Clonage vocal", icon: "waveform")
                featureRow(title: "Themes personnalisables", icon: "paintbrush.fill")
                featureRow(title: "Synchronisation cloud", icon: "cloud.fill")
            }
            .background(sectionBackground(tint: "F8B500"))
        }
    }

    // MARK: - Liens

    private var liensSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Liens", icon: "link", color: "4ECDC4")

            VStack(spacing: 0) {
                linkRow(icon: "globe", title: "Site web", url: "https://meeshy.me", color: "4ECDC4")
                linkRow(icon: "at", title: "Twitter / X", url: "https://twitter.com/meeshy", color: "4ECDC4")
                linkRow(icon: "chevron.left.forwardslash.chevron.right", title: "GitHub", url: "https://github.com/meeshy", color: "4ECDC4")
            }
            .background(sectionBackground(tint: "4ECDC4"))
        }
    }

    // MARK: - Copyright

    private var copyrightSection: some View {
        Text("2024-2026 Meeshy. Tous droits reserves.")
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(theme.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
    }

    // MARK: - Helpers

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
    }

    private func sectionBackground(tint: String) -> some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(theme.border(tint: tint), lineWidth: 1)
            )
    }

    private func fieldIcon(_ name: String, color: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(Color(hex: color))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(hex: color).opacity(0.12))
            )
    }

    private func infoRow(icon: String, title: String, value: String, color: String) -> some View {
        HStack(spacing: 12) {
            fieldIcon(icon, color: color)

            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Text(value)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)
                .lineLimit(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }

    private func featureRow(title: String, icon: String) -> some View {
        HStack(spacing: 12) {
            fieldIcon(icon, color: "F8B500")

            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 16))
                .foregroundColor(Color(hex: "4ADE80"))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }

    private func linkRow(icon: String, title: String, url: String, color: String) -> some View {
        Link(destination: URL(string: url)!) {
            HStack(spacing: 12) {
                fieldIcon(icon, color: color)

                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textPrimary)

                Spacer()

                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: color))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .accessibilityLabel(title)
        .accessibilityHint("Ouvre \(title) dans Safari")
    }
}
