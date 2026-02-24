import SwiftUI
import MeeshySDK
import MeeshyUI

struct LicensesView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    private let accentColor = "4ECDC4"

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
                        .font(.system(size: 14, weight: .semibold))
                    Text("Retour")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel("Retour")

            Spacer()

            Text("Licences")
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
            VStack(spacing: 12) {
                sectionHeader(title: "Open Source", icon: "checkmark.seal.fill", color: accentColor)

                Text("Meeshy utilise les bibliotheques open source suivantes.")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 4)

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

    private func licenseCard(_ license: OpenSourceLicense) -> some View {
        Link(destination: URL(string: license.url)!) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(license.name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text(license.author)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()

                Text(license.licenseType)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        Capsule().fill(Color(hex: badgeColor(for: license.licenseType)))
                    )

                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12, weight: .semibold))
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
        .accessibilityLabel("\(license.name) par \(license.author), licence \(license.licenseType)")
        .accessibilityHint("Ouvre le depot dans Safari")
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
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 4)
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
