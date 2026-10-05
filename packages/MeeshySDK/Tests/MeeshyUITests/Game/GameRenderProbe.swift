import SwiftUI
import CoreGraphics

/// Rend une vue en pixels RGBA, hors écran, pour des témoins de COMPORTEMENT :
/// « la pièce n'est pas vide », « l'anneau à 80 % ne ressemble pas à l'anneau à
/// 20 % ». Aucune image de référence : elle serait à enregistrer sur le runtime
/// qui juge, et dirait seulement « pareil qu'hier », pas « juste ».
@MainActor
struct GameRenderProbe {
    let width: Int
    let height: Int
    let rgba: [UInt8]

    static func render<V: View>(_ view: V, width: CGFloat = 120, height: CGFloat = 120) -> GameRenderProbe? {
        let renderer = ImageRenderer(content: view.frame(width: width, height: height))
        renderer.scale = 2
        guard let image = renderer.cgImage else { return nil }
        let w = image.width
        let h = image.height
        var buffer = [UInt8](repeating: 0, count: w * h * 4)
        let drawn = buffer.withUnsafeMutableBytes { raw -> Bool in
            guard let context = CGContext(
                data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        return drawn ? GameRenderProbe(width: w, height: h, rgba: buffer) : nil
    }

    /// La part des pixels non transparents, de 0 à 1.
    var coverage: Double {
        let opaque = stride(from: 3, to: rgba.count, by: 4).filter { rgba[$0] > 8 }.count
        return Double(opaque) / Double(width * height)
    }

    /// L'écart moyen par octet avec `other`, de 0 (identiques) à 255.
    func distance(to other: GameRenderProbe) -> Double {
        guard rgba.count == other.rgba.count, !rgba.isEmpty else { return .infinity }
        let total = zip(rgba, other.rgba).reduce(0) { $0 + abs(Int($1.0) - Int($1.1)) }
        return Double(total) / Double(rgba.count)
    }

    /// `true` quand le coin haut-gauche est transparent — la brique ne peint pas son cadre.
    var cornerIsTransparent: Bool { rgba[3] < 8 }
}
