import SwiftUI
import CoreImage.CIFilterBuiltins
import MeeshyUI

struct SecurityVerificationView: View {
    let conversationName: String
    let safetyNumber: String
    let theme = ThemeManager.shared
    
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Lock Icon
                    Image(systemName: "lock.shield.fill")
                        .font(.system(size: 64))
                        .foregroundColor(Color(hex: "4ECDC4"))
                        .padding(.top, 40)
                    
                    Text("Vérifier le chiffrement")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                    
                    Text("Les messages et les appels avec \(conversationName) sont chiffrés de bout en bout.")
                        .font(.system(size: 15))
                        .foregroundColor(theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                    
                    // QR Code
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
                    
                    // Safety Number
                    VStack(spacing: 8) {
                        Text("Numéro de sécurité")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(theme.textMuted)
                            .textCase(.uppercase)
                        
                        Text(formatSafetyNumber(safetyNumber))
                            .font(.system(size: 17, weight: .semibold, design: .monospaced))
                            .foregroundColor(theme.textPrimary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }
                    
                    Text("Pour vérifier que vous communiquez de façon sécurisée avec \(conversationName), comparez le numéro ci-dessus avec celui affiché sur son appareil, ou scannez son code QR.")
                        .font(.system(size: 13))
                        .foregroundColor(theme.textMuted)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .padding(.top, 16)
                }
                .padding(.bottom, 40)
            }
            .background(theme.backgroundPrimary.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        dismiss()
                    }) {
                        Text("Terminé").bold()
                            .foregroundColor(Color(hex: "4ECDC4"))
                    }
                }
            }
        }
    }
    
    // Format number into blocks of 5 digits
    private func formatSafetyNumber(_ number: String) -> String {
        let cleanNumber = number.filter { $0.isNumber }
        var result = ""
        for (index, char) in cleanNumber.enumerated() {
            if index > 0 && index % 5 == 0 {
                result += " "
            }
            result += String(char)
        }
        return result.isEmpty ? number : result
    }
    
    private func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)

        if let outputImage = filter.outputImage {
            if let cgimg = context.createCGImage(outputImage, from: outputImage.extent) {
                return UIImage(cgImage: cgimg)
            }
        }
        return nil
    }
}
