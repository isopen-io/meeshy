import CoreGraphics
import CoreImage
import Foundation

/// Un cube de couleur prêt pour `CIColorCubeWithColorSpace` : `dimension`³ entrées
/// RGBA en `Float32`, le rouge le plus rapide, puis le vert, puis le bleu.
public nonisolated struct LensLutCube: Sendable, Equatable {
    public let dimension: Int
    public let data: Data
}

/// **LA LUT D'UNE LENS** (#11300) — le contrat MeeshyLens v1 la déclare par un
/// fichier du pack (`png`/`webp`) en BANDE : N carrés de N × N côte à côte
/// (largeur N², hauteur N), le bleu croissant d'un carré à l'autre, le rouge vers
/// la droite et le vert vers le bas dans chaque carré. N vaut 16, 32 ou 64 —
/// la même lecture que `lutCubeOf` du web (`lens-lut.ts`, W14).
public nonisolated enum LensLutStrip {
    public static let sizes = [16, 32, 64]

    public static func cube(rgba: [UInt8], width: Int, height: Int) -> LensLutCube? {
        let n = height
        guard sizes.contains(n), width == n * n, rgba.count == width * height * 4 else { return nil }
        let values = (0..<(n * n * n * 4)).map { index -> Float32 in
            let channel = index % 4
            guard channel != 3 else { return 1 }
            let entry = index / 4
            let (r, g, b) = (entry % n, (entry / n) % n, entry / (n * n))
            return Float32(rgba[(g * width + b * n + r) * 4 + channel]) / 255
        }
        return LensLutCube(dimension: n, data: values.withUnsafeBufferPointer { Data(buffer: $0) })
    }

    /// Le cube d'une bande décodée, lue en sRGB 8 bits.
    public static func cube(from image: CGImage) -> LensLutCube? {
        let (width, height) = (image.width, image.height)
        guard sizes.contains(height), width == height * height,
              let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        var rgba = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = rgba.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                                          bytesPerRow: width * 4, space: space,
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        return drawn ? cube(rgba: rgba, width: width, height: height) : nil
    }
}

extension LensPass {
    /// La LUT d'une lens, mêlée à l'image d'origine selon son intensité (0 : l'image, 1 : la LUT seule).
    public nonisolated static func lut(_ cube: LensLutCube, intensity: Double) -> LensPass {
        let space = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        let grade = LensPass.lut(cube: cube.data, dimension: cube.dimension, colorSpace: space)
        let weight = min(1, max(0, intensity))
        return LensPass(.lut) { image, input in
            guard weight > 0 else { return image }
            let graded = grade.paint(image, input)
            guard weight < 1 else { return graded }
            return image.applyingFilter("CIDissolveTransition", parameters: [
                kCIInputTargetImageKey: graded,
                kCIInputTimeKey: weight,
            ]).cropped(to: image.extent)
        }
    }
}
