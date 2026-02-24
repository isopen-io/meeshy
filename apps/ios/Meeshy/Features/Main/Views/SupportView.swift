import SwiftUI
import MeeshySDK
import MeeshyUI

struct SupportView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

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
                        .font(.system(size: 14, weight: .semibold))
                    Text("Retour")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel("Retour")

            Spacer()

            Text("Aide et support")
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
            sectionHeader(title: "Obtenir de l'aide", icon: "lifepreserver.fill", color: accentColor)

            VStack(spacing: 0) {
                supportLink(icon: "book.fill", title: "Centre d'aide", url: "https://meeshy.me/help", color: accentColor)
                supportLink(icon: "questionmark.circle.fill", title: "FAQ", url: "https://meeshy.me/faq", color: accentColor)
            }
            .background(sectionBackground(tint: accentColor))
        }
    }

    // MARK: - Contact Section

    private var contactSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Nous contacter", icon: "envelope.fill", color: "3498DB")

            VStack(spacing: 0) {
                supportLink(icon: "envelope.fill", title: "Email support", url: "mailto:support@meeshy.me", color: "3498DB")
                supportLink(icon: "at", title: "Twitter / X", url: "https://twitter.com/meeshy", color: "3498DB")
            }
            .background(sectionBackground(tint: "3498DB"))
        }
    }

    // MARK: - Report Section

    private var reportSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Signaler un probleme", icon: "exclamationmark.bubble.fill", color: "E67E22")

            VStack(spacing: 0) {
                supportLink(icon: "ladybug.fill", title: "Signaler un bug", url: "mailto:bugs@meeshy.me?subject=Bug%20Report%20-%20Meeshy%20iOS", color: "E67E22")
                supportLink(icon: "lightbulb.fill", title: "Suggerer une fonctionnalite", url: "mailto:features@meeshy.me?subject=Feature%20Suggestion%20-%20Meeshy%20iOS", color: "E67E22")
            }
            .background(sectionBackground(tint: "E67E22"))
        }
    }

    // MARK: - Info Section

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Informations", icon: "info.circle", color: "6B7280")

            VStack(spacing: 0) {
                infoRow(icon: "sparkles", title: "Version", value: appVersion, color: "6B7280")
                infoRow(icon: "hammer.fill", title: "Build", value: buildNumber, color: "6B7280")
                infoRow(icon: "apple.logo", title: "Plateforme", value: "iOS \(UIDevice.current.systemVersion)", color: "6B7280")
            }
            .background(sectionBackground(tint: "6B7280"))
        }
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

    private func supportLink(icon: String, title: String, url: String, color: String) -> some View {
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
        .accessibilityHint("Ouvre \(title)")
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
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }
}
