import CoreImage
import Foundation
import MeeshySDK
import UIKit

/// **LE TEXTE D'UNE LENS** (#11300) — écrit aux polices FERMÉES du contrat
/// (`LensFont`, jamais téléchargées par une lens), centré sur son ancre comme le
/// canevas du web (`textAlign center`, `textBaseline middle`). Une police que
/// l'hôte n'a pas enregistrée cède à la police système, à la même taille : le
/// texte part toujours.
public nonisolated enum LensTextPainter {

    public static func font(_ font: LensFont, pixelSize: Int) -> UIFont {
        let size = CGFloat(pixelSize)
        return UIFont.fontNames(forFamilyName: font.rawValue).first.flatMap { UIFont(name: $0, size: size) }
            ?? UIFont.systemFont(ofSize: size)
    }

    /// `#RRGGBB` ou `#RRGGBBAA` ; une couleur illisible écrit en blanc.
    public static func components(_ hex: String) -> (red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6 || digits.count == 8, let value = UInt64(digits, radix: 16) else { return (1, 1, 1, 1) }
        let rgba = digits.count == 8 ? value : (value << 8) | 0xFF
        let channel = { (shift: UInt64) in CGFloat((rgba >> shift) & 0xFF) / 255 }
        return (channel(24), channel(16), channel(8), channel(0))
    }

    public static func color(_ hex: String) -> UIColor {
        let parts = components(hex)
        return UIColor(red: parts.red, green: parts.green, blue: parts.blue, alpha: parts.alpha)
    }

    /// Le texte rendu, centré en `center` (repère de Core Image, origine en bas).
    static func image(of op: LensTextOp, center: CGPoint) -> CIImage? {
        let text = NSAttributedString(string: op.text, attributes: [
            .font: font(op.font, pixelSize: op.pixelSize),
            .foregroundColor: color(op.color),
        ])
        guard let rendered = CIFilter(name: "CIAttributedTextImageGenerator",
                                      parameters: ["inputText": text, "inputScaleFactor": 1])?.outputImage,
              !rendered.extent.isEmpty, !rendered.extent.isInfinite else { return nil }
        let box = rendered.extent
        return rendered.transformed(by: CGAffineTransform(translationX: center.x - box.midX, y: center.y - box.midY))
    }
}
