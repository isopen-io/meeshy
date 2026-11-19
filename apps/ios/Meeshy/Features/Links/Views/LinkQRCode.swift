import SwiftUI
import UIKit
import CoreImage
import MeeshySDK
import MeeshyUI

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


/// Le QR d'un lien à montrer en grand : son adresse et le nom que la feuille affiche.
struct LinkQRPresentation: Identifiable, Equatable {
    let address: String
    let title: String

    var id: String { address }

    /// L'adresse sans son schéma, telle qu'on la lit sous le code.
    var displayedAddress: String {
        address.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
    }
}

/// Le QR d'un lien, en grand (K31 ; planches `Lien-Detail`, `Lien-Partage`, `Lien-Communaute`) : le geste « QR » et la
/// vignette du billet l'agrandissent, comme sur la face Liens. « Partager le QR code » remet l'image à la feuille
/// système, depuis la feuille.
struct LinkQRSheet: View {
    let presentation: LinkQRPresentation
    let tint: Color

    @Environment(\.dismiss) private var dismiss
    @State private var shared: QRShareImage?

    var body: some View {
        LinksPage(title: presentation.title, accent: tint, glyph: .close, onBack: { dismiss() }) {
            VStack(spacing: MeeshySpacing.xl) {
                MeeshyCodeCard(payload: URL(string: presentation.address)?.absoluteString, label: TrackingDetailCopy.qr,
                               caption: presentation.displayedAddress, tint: tint, style: .plain, size: .large,
                               tilt: .none)
                    .accessibilityIdentifier("link.qr.code")
                MeeshyButton(TrackingDetailCopy.shareQR, systemImage: "square.and.arrow.up", kind: .primary,
                             width: .fill, tint: tint,
                             action: { shared = LinkQRCode.shareImage(for: presentation.address) })
                    .disabled(URL(string: presentation.address) == nil)
                    .accessibilityIdentifier("link.qr.share")
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.xl)
        }
        .sheet(item: $shared) { qr in ShareSheet(activityItems: [qr.image]) }
    }
}
