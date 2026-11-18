import UIKit
import CoreImage

/// The QR bitmap is minted on demand, so `ShareLink` — which needs its item at
/// view-construction time — cannot carry it. Wrapping the render in an
/// `Identifiable` value lets `.sheet(item:)` own the presentation instead:
/// SwiftUI anchors the iPad popover and picks the presenting scene.
struct QRShareImage: Identifiable {
    let id = UUID()
    let image: UIImage
}

/// Le QR d'une adresse de lien, à partager en image : la même fabrique pour le détail d'un lien de suivi
/// et celui d'un lien de partage (planches `Lien-Detail` et `Lien-Partage`, #18871).
enum LinkQRCode {
    private static let context = CIContext()

    static func shareImage(for address: String) -> QRShareImage? {
        guard let url = URL(string: address),
              let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(url.absoluteString.data(using: .utf8), forKey: "inputMessage")
        filter.setValue("H", forKey: "inputCorrectionLevel")
        guard let ciImage = filter.outputImage else { return nil }
        let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return QRShareImage(image: UIImage(cgImage: cgImage))
    }
}
