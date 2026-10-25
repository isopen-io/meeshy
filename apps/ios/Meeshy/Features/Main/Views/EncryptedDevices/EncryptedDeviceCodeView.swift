import CoreImage.CIFilterBuiltins
import SwiftUI
import MeeshyUI

/// Mon code d'appairage vers UN de mes appareils (#13009) : le QR, qui seul
/// approuve, et les 60 chiffres en 12 groupes, pour information — leur
/// comparaison à l'œil n'approuve rien (spec § 3.5, #13005).
struct EncryptedDeviceCodeView: View {
    let shown: EncryptedDevicesViewModel.ShownCode

    @State private var image: UIImage?
    private var theme: ThemeManager { ThemeManager.shared }
    private let columns = Array(repeating: GridItem(.flexible(), spacing: MeeshySpacing.sm), count: 4)

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            qr
            LazyVGrid(columns: columns, spacing: MeeshySpacing.sm) {
                ForEach(Array(shown.groups.enumerated()), id: \.offset) { _, group in
                    Text(group)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold, design: .monospaced))
                        .foregroundStyle(theme.textPrimary)
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(
                format: String(localized: "e2ee.devices.code.digits.a11y", defaultValue: "Chiffres du code : %@", bundle: .main),
                shown.groups.joined().map(String.init).joined(separator: " ")
            ))
            Text(String(localized: "e2ee.devices.code.digits.note", defaultValue: "Ces chiffres sont donnés pour information : seule la lecture du code approuve un appareil.", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.smallSize))
                .foregroundStyle(theme.textMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .task(id: shown.code.qrPayload) { image = PairingQRImage.make(from: shown.code.qrPayload) }
    }

    @ViewBuilder
    private var qr: some View {
        if let image {
            Image(uiImage: image)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: 240, maxHeight: 240)
                .padding(MeeshySpacing.lg)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                .accessibilityLabel(String(localized: "e2ee.devices.code.qr.a11y", defaultValue: "Code d’appairage de cet appareil, à lire avec votre autre appareil", bundle: .main))
        } else {
            ProgressView().frame(width: 240, height: 240)
        }
    }
}

/// Le QR d'un texte, par CoreImage. Le contexte est coûteux à créer et sûr à
/// partager : un seul pour l'app.
enum PairingQRImage {
    private static let context = CIContext()

    static func make(from text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage,
              let cgImage = context.createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
