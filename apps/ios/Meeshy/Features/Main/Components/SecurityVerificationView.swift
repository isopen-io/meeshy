import SwiftUI
import CoreImage.CIFilterBuiltins
import MeeshyUI

struct SecurityVerificationView: View {
    let conversationName: String
    let safetyNumber: String?
    let theme = ThemeManager.shared

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    Image(systemName: "lock.shield.fill")
                        .font(.system(size: 64))
                        .foregroundColor(Color(hex: "4ECDC4"))
                        .padding(.top, 40)

                    Text("Chiffrement de bout en bout")
                        .font(.title2.bold())
                        .foregroundColor(theme.textPrimary)

                    Text("Les messages avec \(conversationName) sont chiffrés de bout en bout.")
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
                        Text("Terminé").bold()
                            .foregroundColor(Color(hex: "4ECDC4"))
                    }
                }
            }
        }
    }

    // MARK: - Verified (real Signal keys available)

    @ViewBuilder
    private func verifiedSection(safetyNumber: String) -> some View {
        if let qrCode = generateQRCode(from: safetyNumber) {
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
            Text("Numéro de sécurité")
                .font(.caption.weight(.medium))
                .foregroundColor(theme.textMuted)
                .textCase(.uppercase)

            Text(formatSafetyNumber(safetyNumber))
                .font(.body.weight(.semibold).monospaced())
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }

        Text("Pour vérifier, comparez ce numéro avec celui affiché sur l'appareil de \(conversationName), ou scannez son code QR.")
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

            Text("Vérification non disponible")
                .font(.headline)
                .foregroundColor(theme.textSecondary)

            Text("La vérification du numéro de sécurité sera disponible une fois que les deux participants auront échangé leurs clés de chiffrement.")
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

    private func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        guard let outputImage = filter.outputImage,
              let cgimg = context.createCGImage(outputImage, from: outputImage.extent) else { return nil }
        return UIImage(cgImage: cgimg)
    }
}
