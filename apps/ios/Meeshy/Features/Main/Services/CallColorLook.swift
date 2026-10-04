import CoreImage
import CoreGraphics
import Foundation
import simd

/// **LES TEINTES D'APPEL, ÉTALONNÉES** (#9289).
///
/// Une teinte n'est plus une chaîne de trois filtres globaux (température, contrôles,
/// exposition) qui tirent la peau avec le reste : c'est UN étalonnage, cuit dans un cube
/// 3D et appliqué en une passe. Il porte une courbe filmique, un virage des ombres et des
/// hautes lumières, une vibrance qui sature d'abord ce qui est terne — et il ÉPARGNE les
/// tons chair : un visage reste un visage sous « Froid » comme sous « Vif ».
///
/// La fonction d'étalonnage est pure (`grade`) ; le cube se calcule une fois par teinte,
/// à la première demande, et se garde.
nonisolated enum CallColorLook {
    static let dimension = 25

    /// Ce qu'une teinte fait à l'image, en réglages lisibles.
    nonisolated struct Recipe: Equatable, Sendable {
        /// Gain par canal, appliqué avant tout (balance des blancs).
        var balance = SIMD3<Float>(1, 1, 1)
        /// Force de la courbe en S (négatif : plus doux, positif : plus de contraste).
        var curve: Float = 0
        /// Relèvement des noirs (rendu mat).
        var blackLift: Float = 0
        /// Teinte ajoutée aux ombres et aux hautes lumières.
        var shadows = SIMD3<Float>(0, 0, 0)
        var highlights = SIMD3<Float>(0, 0, 0)
        /// Vibrance (sature les couleurs ternes d'abord).
        var vibrance: Float = 0
        /// Saturation globale multiplicative.
        var saturation: Float = 1
        /// Part de l'étalonnage de COULEUR que les tons chair n'emportent pas (0…1).
        var skinProtection: Float = 0.7
    }

    /// `nil` : la teinte ne touche à rien (Naturel).
    static func recipe(for preset: VideoFilterPreset) -> Recipe? {
        switch preset {
        case .natural:
            return nil
        case .warm:
            return Recipe(balance: SIMD3(1.035, 1.0, 0.94), curve: 0.22, blackLift: 0.012,
                          shadows: SIMD3(0.012, 0.004, -0.008), highlights: SIMD3(0.03, 0.016, -0.022),
                          vibrance: 0.16, saturation: 1.0, skinProtection: 0.6)
        case .cool:
            return Recipe(balance: SIMD3(0.96, 1.0, 1.05), curve: 0.26, blackLift: 0.0,
                          shadows: SIMD3(-0.012, 0.004, 0.03), highlights: SIMD3(-0.006, 0.004, 0.012),
                          vibrance: 0.1, saturation: 0.98, skinProtection: 0.8)
        case .vivid:
            return Recipe(balance: SIMD3(1, 1, 1), curve: 0.34, blackLift: 0.0,
                          shadows: SIMD3(0, 0, 0.01), highlights: SIMD3(0.01, 0.006, 0),
                          vibrance: 0.45, saturation: 1.04, skinProtection: 0.75)
        case .muted:
            return Recipe(balance: SIMD3(1.01, 1.0, 0.99), curve: -0.18, blackLift: 0.05,
                          shadows: SIMD3(0.006, 0.006, 0.012), highlights: SIMD3(0.012, 0.008, 0.0),
                          vibrance: -0.1, saturation: 0.76, skinProtection: 0.5)
        }
    }

    // MARK: - La fonction d'étalonnage

    /// Étalonne une couleur sRGB (composantes 0…1, encodées gamma). Pure.
    static func grade(_ rgb: SIMD3<Float>, recipe: Recipe) -> SIMD3<Float> {
        let input = clamp(rgb)
        let balanced = clamp(input * recipe.balance)
        let toned = SIMD3(curve(balanced.x, recipe), curve(balanced.y, recipe), curve(balanced.z, recipe))
        let luma = luminance(toned)
        let split = recipe.shadows * ((1 - luma) * (1 - luma)) + recipe.highlights * (luma * luma)
        let tinted = clamp(toned + split)
        let saturated = saturate(tinted, recipe: recipe)
        let skin = skinLikelihood(input)
        let toneOnly = SIMD3(curve(input.x, recipe), curve(input.y, recipe), curve(input.z, recipe))
        let protected = skin * recipe.skinProtection
        return clamp(saturated * (1 - protected) + toneOnly * protected)
    }

    /// La probabilité qu'une couleur soit un ton chair : teinte entre le rouge et l'orangé,
    /// saturation modérée, ni noire ni blanche — toutes carnations confondues.
    static func skinLikelihood(_ rgb: SIMD3<Float>) -> Float {
        let maxC = max(rgb.x, max(rgb.y, rgb.z))
        let minC = min(rgb.x, min(rgb.y, rgb.z))
        let chroma = maxC - minC
        guard maxC > 0.08, chroma > 0.02, rgb.x >= rgb.y, rgb.y >= rgb.z else { return 0 }
        let hue = 60 * (rgb.y - rgb.z) / chroma
        let saturation = chroma / maxC
        let hueWeight = smoothstep(0, 8, hue) * (1 - smoothstep(40, 55, hue))
        let saturationWeight = smoothstep(0.08, 0.18, saturation) * (1 - smoothstep(0.62, 0.8, saturation))
        return hueWeight * saturationWeight
    }

    static func luminance(_ rgb: SIMD3<Float>) -> Float {
        0.2126 * rgb.x + 0.7152 * rgb.y + 0.0722 * rgb.z
    }

    static func saturation(of rgb: SIMD3<Float>) -> Float {
        let maxC = max(rgb.x, max(rgb.y, rgb.z))
        guard maxC > 0 else { return 0 }
        return (maxC - min(rgb.x, min(rgb.y, rgb.z))) / maxC
    }

    private static func curve(_ value: Float, _ recipe: Recipe) -> Float {
        let s = value * value * (3 - 2 * value)
        let shaped = value + (s - value) * recipe.curve
        return recipe.blackLift + shaped * (1 - recipe.blackLift)
    }

    private static func saturate(_ rgb: SIMD3<Float>, recipe: Recipe) -> SIMD3<Float> {
        let luma = luminance(rgb)
        let gain = recipe.saturation * (1 + recipe.vibrance * (1 - saturation(of: rgb)))
        return clamp(SIMD3(repeating: luma) + (rgb - SIMD3(repeating: luma)) * gain)
    }

    private static func smoothstep(_ edge0: Float, _ edge1: Float, _ x: Float) -> Float {
        let t = min(max((x - edge0) / (edge1 - edge0), 0), 1)
        return t * t * (3 - 2 * t)
    }

    private static func clamp(_ rgb: SIMD3<Float>) -> SIMD3<Float> {
        simd_clamp(rgb, SIMD3(repeating: 0), SIMD3(repeating: 1))
    }

    // MARK: - Le cube

    /// Le cube RGBA float32 d'une recette, dans l'ordre que `CIColorCube` attend
    /// (rouge le plus rapide, puis vert, puis bleu).
    static func cubeData(for recipe: Recipe, dimension: Int = dimension) -> Data {
        let step = 1 / Float(dimension - 1)
        let values: [Float] = (0..<dimension).flatMap { b in
            (0..<dimension).flatMap { g in
                (0..<dimension).flatMap { r -> [Float] in
                    let graded = grade(SIMD3(Float(r) * step, Float(g) * step, Float(b) * step), recipe: recipe)
                    return [graded.x, graded.y, graded.z, 1]
                }
            }
        }
        return values.withUnsafeBufferPointer { Data(buffer: $0) }
    }

    /// L'espace du flux d'appel : la caméra WebRTC sert du sRGB.
    static let callColorSpace: CGColorSpace = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()

    /// Applique la teinte à une image ; Naturel la rend telle quelle.
    ///
    /// Le cube lit ses entrées dans `colorSpace` : une photo Display P3 passe le
    /// sien (#9327), sinon ses couleurs hors du gamut sRGB seraient bornées à
    /// l'entrée du cube — l'image pâlirait sous n'importe quelle teinte.
    static func apply(_ preset: VideoFilterPreset, to image: CIImage, cubes: CallColorLookCubes = .shared,
                      colorSpace: CGColorSpace = CallColorLook.callColorSpace) -> CIImage {
        guard let data = cubes.cube(for: preset) else { return image }
        return image.applyingFilter("CIColorCubeWithColorSpace", parameters: [
            "inputCubeDimension": dimension,
            "inputCubeData": data,
            "inputColorSpace": colorSpace,
        ])
    }
}

/// Les cubes calculés, un par teinte, gardés pour l'appel. Lu depuis la file de capture,
/// écrit à la première demande : un verrou suffit, le calcul ne se fait qu'une fois.
nonisolated final class CallColorLookCubes: @unchecked Sendable {
    static let shared = CallColorLookCubes()

    private let lock = NSLock()
    private var cubes: [VideoFilterPreset: Data] = [:]

    func cube(for preset: VideoFilterPreset) -> Data? {
        guard let recipe = CallColorLook.recipe(for: preset) else { return nil }
        lock.lock()
        defer { lock.unlock() }
        if let cached = cubes[preset] { return cached }
        let data = CallColorLook.cubeData(for: recipe)
        cubes[preset] = data
        return data
    }
}
