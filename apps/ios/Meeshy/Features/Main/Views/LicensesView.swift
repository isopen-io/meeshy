import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct LicensesView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    private let accentColor = "6366F1"

    private let licenses: [OpenSourceLicense] = [
        OpenSourceLicense(name: "Socket.IO Client Swift", author: "Socket.IO", licenseType: "MIT", url: "https://github.com/socketio/socket.io-client-swift"),
        OpenSourceLicense(name: "Firebase iOS SDK", author: "Google", licenseType: "Apache 2.0", url: "https://github.com/firebase/firebase-ios-sdk"),
        OpenSourceLicense(name: "Kingfisher", author: "onevcat", licenseType: "MIT", url: "https://github.com/onevcat/Kingfisher"),
        OpenSourceLicense(name: "WhisperKit", author: "Argmax", licenseType: "MIT", url: "https://github.com/argmaxinc/WhisperKit"),
        OpenSourceLicense(name: "WebRTC", author: "Google", licenseType: "BSD", url: "https://webrtc.org"),
        OpenSourceLicense(name: "Starscream", author: "Dalton Cherry", licenseType: "Apache 2.0", url: "https://github.com/daltoniam/Starscream")
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
                        .font(MeeshyFont.relative(14, weight: .semibold))
                    Text(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                        .font(MeeshyFont.relative(15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "common.back", defaultValue: "Retour", bundle: .main))

            Spacer()

            Text(String(localized: "about.licenses.title", defaultValue: "Licences", bundle: .main))
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
            VStack(spacing: 12) {
                sectionHeader(title: String(localized: "about.licenses.section.open_source", defaultValue: "Open Source", bundle: .main), icon: "checkmark.seal.fill", color: accentColor)

                Text(String(localized: "about.licenses.intro", defaultValue: "Meeshy utilise les bibliotheques open source suivantes.", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 4)
                    .textSelection(.enabled)

                ForEach(licenses) { license in
                    licenseCard(license)
                }

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    // MARK: - License Card

    @ViewBuilder
    private func licenseCard(_ license: OpenSourceLicense) -> some View {
        if let destination = URL(string: license.url) {
        Link(destination: destination) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(license.name)
                        .font(MeeshyFont.relative(15, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text(license.author)
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()

                Text(license.licenseType)
                    .font(MeeshyFont.relative(10, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        Capsule().fill(Color(hex: badgeColor(for: license.licenseType)))
                    )

                Image(systemName: "arrow.up.right")
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: accentColor))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: accentColor), lineWidth: 1)
                    )
            )
        }
        .accessibilityLabel(String(localized: "about.licenses.card.label", defaultValue: "\(license.name) par \(license.author), licence \(license.licenseType)", bundle: .main))
        .accessibilityHint(String(localized: "about.licenses.card.hint", defaultValue: "Ouvre le depot dans Safari", bundle: .main))
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
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isHeader)
    }

    private func badgeColor(for licenseType: String) -> String {
        switch licenseType {
        case "MIT": return "4ADE80"
        case "Apache 2.0": return "F59E0B"
        case "BSD": return "3B82F6"
        default: return "6B7280"
        }
    }
}

// MARK: - Model

private struct OpenSourceLicense: Identifiable {
    let id = UUID()
    let name: String
    let author: String
    let licenseType: String
    let url: String
}
