import SwiftUI
import CoreImage.CIFilterBuiltins
import MeeshyUI

struct SecurityVerificationView: View {
    let conversationName: String
    let safetyNumber: String?
    let theme = ThemeManager.shared

    @Environment(\.dismiss) private var dismiss
    @State private var qrImage: UIImage?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    Image(systemName: "lock.shield.fill")
                        .font(.system(size: 64))
                        .foregroundColor(MeeshyColors.indigo400)
                        .padding(.top, 40)

                    Text(String(localized: "security.verify.title", defaultValue: "End-to-End Encryption", bundle: .main))
                        .font(.title2.bold())
                        .foregroundColor(theme.textPrimary)

                    Text(String(localized: "security.verify.description", defaultValue: "Messages with \(conversationName) are end-to-end encrypted.", bundle: .main))
                        .font(.subheadline)
                        .foregroundColor(theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)

                    if let safetyNumber {
                        verifiedSection(safetyNumber: safetyNumber)
                    } else {
                        pendingSection
                    }
                }
                .padding(.bottom, 40)
            }
            .background(theme.backgroundPrimary.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { dismiss() }) {
                        Text(String(localized: "common.done", defaultValue: "Done", bundle: .main)).bold()
                            .foregroundColor(MeeshyColors.indigo400)
                    }
                }
            }
        }
        // Generate the safety-number QR once, after appear — not on every body
        // re-render (it is deterministic and was rebuilding a fresh CIContext
        // each time).
        .task {
            guard let safetyNumber, qrImage == nil else { return }
            qrImage = Self.generateQRCode(from: safetyNumber)
        }
    }

    // MARK: - Verified (real Signal keys available)

    @ViewBuilder
    private func verifiedSection(safetyNumber: String) -> some View {
        if let qrCode = qrImage {
            Image(uiImage: qrCode)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .frame(width: 200, height: 200)
                .padding(16)
                .background(Color.white)
                .cornerRadius(16)
                .shadow(color: theme.textPrimary.opacity(0.1), radius: 10)
        }

        VStack(spacing: 8) {
            Text(String(localized: "security.verify.safetyNumber.label", defaultValue: "Safety Number", bundle: .main))
                .font(.caption.weight(.medium))
                .foregroundColor(theme.textMuted)
                .textCase(.uppercase)

            Text(formatSafetyNumber(safetyNumber))
                .font(.body.weight(.semibold).monospaced())
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }

        Text(String(localized: "security.verify.howto", defaultValue: "To verify, compare this number with the one shown on \(conversationName)'s device, or scan their QR code.", bundle: .main))
            .font(.caption)
            .foregroundColor(theme.textMuted)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)
            .padding(.top, 16)
    }

    // MARK: - Pending (no real Signal keys yet)

    private var pendingSection: some View {
        VStack(spacing: 16) {
            Image(systemName: "hourglass.circle")
                .font(.system(size: 40))
                .foregroundColor(theme.textMuted)

            Text(String(localized: "security.verify.unavailable.title", defaultValue: "Verification Unavailable", bundle: .main))
                .font(.headline)
                .foregroundColor(theme.textSecondary)

            Text(String(localized: "security.verify.unavailable.description", defaultValue: "Safety number verification will be available once both participants have exchanged their encryption keys.", bundle: .main))
                .font(.caption)
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }
        .padding(.top, 16)
    }

    private func formatSafetyNumber(_ number: String) -> String {
        let cleanNumber = number.filter { $0.isNumber }
        var result = ""
        for (index, char) in cleanNumber.enumerated() {
            if index > 0 && index % 5 == 0 { result += " " }
            result += String(char)
        }
        return result.isEmpty ? number : result
    }

    // CIContext is expensive to create (it sets up the Core Image / GPU
    // pipeline) and is documented as safe to share — build one and reuse it
    // instead of a fresh context on every QR generation.
    nonisolated(unsafe) private static let qrContext = CIContext()

    private static func generateQRCode(from string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        guard let outputImage = filter.outputImage,
              let cgimg = qrContext.createCGImage(outputImage, from: outputImage.extent) else { return nil }
        return UIImage(cgImage: cgimg)
    }
}
