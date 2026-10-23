import CoreGraphics
import CoreImage
import Foundation
import MeeshySDK

/// **Les étages d'une lens, dans l'ordre où ils se peignent** (#11298).
///
/// Le fond est remplacé d'abord, pour que l'étalonnage harmonise la personne et
/// son nouveau fond ; les couches du visage se posent sur l'image étalonnée ;
/// le cadre l'entoure ; stickers et texte passent au-dessus du cadre ; les
/// particules au-dessus de tout.
public nonisolated enum LensStage: Int, CaseIterable, Sendable, Comparable {
    case segmentation
    case lut
    case face
    case frame
    case overlays
    case particles

    public static func < (lhs: LensStage, rhs: LensStage) -> Bool { lhs.rawValue < rhs.rawValue }

    /// L'étage d'une couche d'un document MeeshyLens v1 : un sticker ou un
    /// texte ancré au VISAGE le suit, avec les couches du visage ; ancré à
    /// l'écran, il passe au-dessus du cadre.
    public init(layer: LensLayer) {
        switch layer {
        case .lut: self = .lut
        case .frame: self = .frame
        case .particles: self = .particles
        case let .sticker(sticker): self = Self.stage(of: sticker.anchor)
        case let .text(text): self = Self.stage(of: text.anchor)
        }
    }

    private static func stage(of anchor: LensAnchor) -> LensStage {
        guard case .face = anchor else { return .overlays }
        return .face
    }
}

/// Ce que l'hôte sait de l'image qu'il remet : le visage suivi, le masque de
/// la personne (blanc = la personne), l'horloge des animations.
public nonisolated struct LensFrameInput {
    public let face: LensFaceFrame?
    public let personMask: CIImage?
    public let time: TimeInterval

    public init(face: LensFaceFrame? = nil, personMask: CIImage? = nil, time: TimeInterval = 0) {
        self.face = face
        self.personMask = personMask
        self.time = time
    }
}

/// **Une passe de lens** : son étage, et ce qu'elle fait d'une image. Les
/// paramètres sont opaques — une image, un visage, un masque —, le peintre ne
/// sait ni d'où ils viennent ni à quoi la lens sert (SDK Purity).
public nonisolated struct LensPass {
    public let stage: LensStage
    public let paint: (CIImage, LensFrameInput) -> CIImage

    public init(_ stage: LensStage, paint: @escaping (CIImage, LensFrameInput) -> CIImage) {
        self.stage = stage
        self.paint = paint
    }

    /// Le fond remplacé hors de la personne. Sans masque, l'étage s'abstient :
    /// un masque manquant n'efface jamais la personne.
    public static func segmentation(background: CIImage) -> LensPass {
        LensPass(.segmentation) { image, input in
            guard let mask = input.personMask, let fitted = LensGeometry.stretched(mask, to: image.extent) else { return image }
            let fond = background.clampedToExtent().cropped(to: image.extent)
            return image.applyingFilter("CIBlendWithMask", parameters: [
                kCIInputBackgroundImageKey: fond,
                kCIInputMaskImageKey: fitted,
            ]).cropped(to: image.extent)
        }
    }

    /// Une table de couleur (cube RGBA en `Float32`, `dimension`³ entrées). Un
    /// cube dont les octets ne correspondent pas à la dimension laisse l'image.
    public static func lut(cube: Data, dimension: Int, colorSpace: CGColorSpace) -> LensPass {
        LensPass(.lut) { image, _ in
            guard LensGeometry.isValidCube(cube, dimension: dimension) else { return image }
            return image.applyingFilter("CIColorCubeWithColorSpace", parameters: [
                "inputCubeDimension": dimension,
                "inputCubeData": cube,
                "inputColorSpace": colorSpace,
            ]).cropped(to: image.extent)
        }
    }

    /// Une image posée par-dessus : un cadre, un sticker, un texte, une particule.
    public static func overlay(_ overlay: CIImage, stage: LensStage) -> LensPass {
        LensPass(stage) { image, _ in overlay.composited(over: image).cropped(to: image.extent) }
    }
}

/// **LE peintre de lens** (#11298) : l'aperçu caméra, la photo, la vidéo, la
/// retouche et l'appel remettent leurs couches ICI, et l'ordre ne dépend pas
/// de l'hôte. Les couches d'un même étage gardent l'ordre de l'hôte (deux
/// stickers se superposent comme l'auteur les a posés). Un graphe Core Image
/// pur, rendu sur le contexte Metal partagé de la scène.
public nonisolated enum LensPainter {

    public static var context: CIContext { StoryRenderingContext.shared.ciContext }

    public static func paint(_ source: CIImage, passes: [LensPass], input: LensFrameInput) -> CIImage {
        passes.enumerated()
            .sorted { ($0.element.stage, $0.offset) < ($1.element.stage, $1.offset) }
            .reduce(source) { image, entry in entry.element.paint(image, input) }
    }
}

nonisolated enum LensGeometry {
    /// Un masque (souvent en basse définition) étiré sur l'étendue de l'image.
    static func stretched(_ mask: CIImage, to target: CGRect) -> CIImage? {
        let source = mask.extent
        guard !source.isInfinite, source.width > 0, source.height > 0, target.width > 0, target.height > 0 else { return nil }
        let pose = CGAffineTransform(translationX: -source.minX, y: -source.minY)
            .concatenating(CGAffineTransform(scaleX: target.width / source.width, y: target.height / source.height))
            .concatenating(CGAffineTransform(translationX: target.minX, y: target.minY))
        return mask.clampedToExtent().transformed(by: pose).cropped(to: target)
    }

    static func isValidCube(_ cube: Data, dimension: Int) -> Bool {
        dimension >= 2 && dimension <= 64
            && cube.count == dimension * dimension * dimension * 4 * MemoryLayout<Float32>.size
    }
}
