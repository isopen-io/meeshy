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
                VStack(spacing: MeeshySpacing.xxl) {
                    Image(systemName: "lock.shield.fill")
                        .font(MeeshyFont.relative(64))
                        .foregroundColor(MeeshyColors.indigo400)
                        .padding(.top, MeeshySpacing.xxxl + MeeshySpacing.sm)

                    Text(String(localized: "security.verify.title", defaultValue: "End-to-End Encryption", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    Text(String(localized: "security.verify.description", defaultValue: "Messages with \(conversationName) are end-to-end encrypted.", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                        .foregroundColor(theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, MeeshySpacing.xxxl)

                    if let safetyNumber {
                        verifiedSection(safetyNumber: safetyNumber)
                    } else {
                        pendingSection
                    }
                }
                .padding(.bottom, MeeshySpacing.xxxl + MeeshySpacing.sm)
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
                .padding(MeeshySpacing.lg)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                .shadow(color: theme.textPrimary.opacity(0.1), radius: 10)
        }

        VStack(spacing: MeeshySpacing.sm) {
            Text(String(localized: "security.verify.safetyNumber.label", defaultValue: "Safety Number", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundColor(theme.textMuted)
                .textCase(.uppercase)

            Text(formatSafetyNumber(safetyNumber))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold, design: .monospaced))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, MeeshySpacing.xxl)
        }

        Text(String(localized: "security.verify.howto", defaultValue: "To verify, compare this number with the one shown on \(conversationName)'s device, or scan their QR code.", bundle: .main))
            .font(MeeshyFont.relative(MeeshyFont.captionSize))
            .foregroundColor(theme.textMuted)
            .multilineTextAlignment(.center)
            .padding(.horizontal, MeeshySpacing.xxl)
            .padding(.top, MeeshySpacing.lg)
    }

    // MARK: - Pending (no real Signal keys yet)

    private var pendingSection: some View {
        VStack(spacing: MeeshySpacing.lg) {
            Image(systemName: "hourglass.circle")
                .font(MeeshyFont.relative(40))
                .foregroundColor(theme.textMuted)

            Text(String(localized: "security.verify.unavailable.title", defaultValue: "Verification Unavailable", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                .foregroundColor(theme.textSecondary)

            Text(String(localized: "security.verify.unavailable.description", defaultValue: "Safety number verification will be available once both participants have exchanged their encryption keys.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.captionSize))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, MeeshySpacing.xxl)
        }
        .padding(.top, MeeshySpacing.lg)
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
    private static let qrContext = CIContext()

    private static func generateQRCode(from string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        guard let outputImage = filter.outputImage,
              let cgimg = qrContext.createCGImage(outputImage, from: outputImage.extent) else { return nil }
        return UIImage(cgImage: cgimg)
    }
}
