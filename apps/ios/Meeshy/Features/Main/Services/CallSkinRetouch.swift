import CoreGraphics
import CoreImage
import Foundation

// #9196 — Les deux traitements du visage en appel.
//
// - **Teint naturel**, actif par défaut et imperceptible : chrominance égalisée
//   vers sa moyenne locale, micro-ombres comblées, reflets gras atténués,
//   relevé de luminance plafonné à +4 %. Coupé dès que l'appareil se protège.
// - **Peau lissée**, au curseur : séparation de fréquences — la basse fréquence
//   est lissée en préservant les bords, la texture fine (pores) est réinjectée
//   à 35 % pour que la peau reste de la peau.
//
// Les deux tiennent dans UNE passe Metal (`Shaders/CallSkinRetouch.metal`) qui
// calcule elle-même le masque de peau ; seule la zone du visage est rendue.

/// Ce que l'image courante reçoit, décidé une fois par image depuis le réglage
/// et l'état de l'appareil. `nil` : rien à faire, l'image ne coûte rien de plus.
nonisolated struct CallSkinRetouchPlan: Equatable, Sendable {
    /// Teint naturel, 0…1.
    let tone: Float
    /// Peau lissée, 0…1.
    let smoothing: Float
    /// Part de la texture fine réinjectée par Peau lissée.
    let texture: Float
    /// Relevé des cernes, 0…1.
    let underEye: Float
    /// La passe fine (texture au pixel près) ; dégradée, la texture vient de la
    /// basse fréquence et la passe est économisée.
    let usesFinePass: Bool

    static let textureKept: Float = 0.35
    static let underEyeShare: Float = 0.6

    static func make(config: VideoFilterConfig, ladder: CallVideoDegradation, isConstrained: Bool) -> CallSkinRetouchPlan? {
        let effect = config.activeFaceEffect
        guard !effect.isStylized else { return nil }
        let tone: Float = config.naturalComplexionEnabled && !isConstrained && !ladder.isExhausted ? 1 : 0
        let smoothing: Float = effect == .smoothing && !ladder.isSmoothingDegraded
            ? min(max(config.skinSmoothingIntensity, 0), 1)
            : 0
        guard tone > 0 || smoothing > 0 else { return nil }
        let isDegraded = ladder.tier != .balanced || ladder.isSmoothingDegraded || isConstrained
        return CallSkinRetouchPlan(
            tone: tone,
            smoothing: smoothing,
            texture: textureKept,
            underEye: smoothing * underEyeShare,
            usesFinePass: !isDegraded
        )
    }
}

/// Le masque de peau en ellipses, dans le repère de l'image redressée : le
/// visage incliné selon la ligne des yeux, et ce qui n'est PAS de la peau —
/// yeux, sourcils, bouche. Les repères manquants sont estimés depuis la boîte.
nonisolated struct CallSkinMaskGeometry: Equatable, Sendable {
    nonisolated struct Ellipse: Equatable, Sendable {
        let center: CGPoint
        let radii: CGSize

        func offset(by origin: CGPoint) -> Ellipse {
            Ellipse(center: CGPoint(x: center.x - origin.x, y: center.y - origin.y), radii: radii)
        }

        func contains(_ point: CGPoint, rotation: CGVector) -> Bool {
            let dx = point.x - center.x
            let dy = point.y - center.y
            let x = dx * rotation.dx + dy * rotation.dy
            let y = -dx * rotation.dy + dy * rotation.dx
            return (x * x) / (radii.width * radii.width) + (y * y) / (radii.height * radii.height) <= 1
        }

        var vector: CIVector {
            CIVector(x: center.x, y: center.y, z: radii.width, w: radii.height)
        }
    }

    static let maxTilt: CGFloat = .pi / 4

    let face: Ellipse
    let leftEye: Ellipse
    let rightEye: Ellipse
    let leftBrow: Ellipse
    let rightBrow: Ellipse
    let mouth: Ellipse
    let leftUnderEye: Ellipse
    let rightUnderEye: Ellipse
    /// (cos, sin) de l'inclinaison de la ligne des yeux.
    let rotation: CGVector

    init(landmarks: CallFaceLandmarks) {
        let box = landmarks.bounds
        let w = box.width
        let h = box.height
        let estimatedY = box.minY + h * 0.62
        let eyes = [
            landmarks.leftEye ?? CGPoint(x: box.midX - w * 0.2, y: estimatedY),
            landmarks.rightEye ?? CGPoint(x: box.midX + w * 0.2, y: estimatedY)
        ].sorted { $0.x < $1.x }
        let tilt = min(max(atan2(eyes[1].y - eyes[0].y, eyes[1].x - eyes[0].x), -Self.maxTilt), Self.maxTilt)
        let rotation = CGVector(dx: cos(tilt), dy: sin(tilt))
        let up = CGVector(dx: -rotation.dy, dy: rotation.dx)
        func shifted(_ point: CGPoint, by distance: CGFloat) -> CGPoint {
            CGPoint(x: point.x + up.dx * distance, y: point.y + up.dy * distance)
        }
        let eyeMid = CGPoint(x: (eyes[0].x + eyes[1].x) / 2, y: (eyes[0].y + eyes[1].y) / 2)

        self.rotation = rotation
        face = Ellipse(center: shifted(CGPoint(x: box.midX, y: box.midY), by: h * 0.08), radii: CGSize(width: w * 0.52, height: h * 0.62))
        leftEye = Ellipse(center: eyes[0], radii: CGSize(width: w * 0.13, height: h * 0.075))
        rightEye = Ellipse(center: eyes[1], radii: CGSize(width: w * 0.13, height: h * 0.075))
        leftBrow = Ellipse(center: shifted(eyes[0], by: h * 0.11), radii: CGSize(width: w * 0.15, height: h * 0.045))
        rightBrow = Ellipse(center: shifted(eyes[1], by: h * 0.11), radii: CGSize(width: w * 0.15, height: h * 0.045))
        mouth = Ellipse(center: landmarks.mouth ?? shifted(eyeMid, by: -h * 0.40), radii: CGSize(width: w * 0.21, height: h * 0.10))
        leftUnderEye = Ellipse(center: shifted(eyes[0], by: -h * 0.11), radii: CGSize(width: w * 0.12, height: h * 0.05))
        rightUnderEye = Ellipse(center: shifted(eyes[1], by: -h * 0.11), radii: CGSize(width: w * 0.12, height: h * 0.05))
    }

    /// La zone rendue : l'ellipse du visage, quelle que soit son inclinaison.
    func region(in canvas: CGRect) -> CGRect {
        let reach = max(face.radii.width, face.radii.height) * 1.02
        return CGRect(x: face.center.x - reach, y: face.center.y - reach, width: reach * 2, height: reach * 2)
            .intersection(canvas)
            .integral
    }

    /// Vrai si le point est de la peau pour la géométrie (avant la chrominance).
    func isSkin(_ point: CGPoint) -> Bool {
        face.contains(point, rotation: rotation)
            && ![leftEye, rightEye, leftBrow, rightBrow, mouth].contains { $0.contains(point, rotation: rotation) }
    }
}

/// Le noyau Metal, chargé une fois depuis la bibliothèque de l'app. `nil` si la
/// bibliothèque manque : la retouche retombe alors sur un lissage Core Image.
nonisolated enum CallSkinRetouchKernel {
    static let functionName = "meeshySkinRetouch"

    nonisolated(unsafe) static let shared: CIColorKernel? = {
        guard let url = Bundle(for: CallSkinRetouchBundleToken.self).url(forResource: "default", withExtension: "metallib"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? CIColorKernel(functionName: functionName, fromMetalLibraryData: data)
    }()
}

nonisolated private final class CallSkinRetouchBundleToken {}

/// Applique un plan sur une image redressée dont le visage est connu.
nonisolated enum CallSkinRetoucher {
    static let downsample: CGFloat = 0.25
    static let lowPassSigma: CGFloat = 0.03
    static let finePassSigma: CGFloat = 0.004

    static func apply(
        _ plan: CallSkinRetouchPlan,
        to image: CIImage,
        face: CallFaceLandmarks,
        canvas: CGRect,
        kernel: CIColorKernel? = CallSkinRetouchKernel.shared
    ) -> CIImage {
        let geometry = CallSkinMaskGeometry(landmarks: face)
        let region = geometry.region(in: canvas)
        guard !region.isNull, !region.isEmpty else { return image }
        let width = face.bounds.width

        // Tout est calculé à l'origine de la zone : le filtre guidé apparie
        // l'image fine et sa réduction par leurs tailles, pas leurs origines.
        let local = image.cropped(to: region)
            .transformed(by: CGAffineTransform(translationX: -region.minX, y: -region.minY))
        let extent = CGRect(origin: .zero, size: region.size)
        let lowPass = Self.lowPass(of: local, extent: extent, faceWidth: width)

        guard let kernel else {
            return Self.fallback(plan, local: local, lowPass: lowPass, extent: extent, geometry: geometry, region: region, over: image)
        }
        let finePass = plan.usesFinePass
            ? local.clampedToExtent().applyingGaussianBlur(sigma: Double(max(0.8, width * finePassSigma))).cropped(to: extent)
            : lowPass
        let origin = region.origin
        let arguments: [Any] = [
            local, lowPass, finePass,
            geometry.face.offset(by: origin).vector,
            CIVector(x: geometry.rotation.dx, y: geometry.rotation.dy),
            geometry.leftEye.offset(by: origin).vector,
            geometry.rightEye.offset(by: origin).vector,
            geometry.leftBrow.offset(by: origin).vector,
            geometry.rightBrow.offset(by: origin).vector,
            geometry.mouth.offset(by: origin).vector,
            geometry.leftUnderEye.offset(by: origin).vector,
            geometry.rightUnderEye.offset(by: origin).vector,
            CIVector(x: CGFloat(plan.tone), y: CGFloat(plan.smoothing), z: CGFloat(plan.texture), w: CGFloat(plan.underEye))
        ]
        guard let retouched = kernel.apply(extent: extent, arguments: arguments) else { return image }
        return retouched
            .transformed(by: CGAffineTransform(translationX: region.minX, y: region.minY))
            .composited(over: image)
    }

    /// Basse fréquence qui respecte les bords : réduite, floutée, puis remontée
    /// à pleine résolution guidée par l'image (contours des yeux, de la mâchoire
    /// et des cheveux intacts).
    static func lowPass(of local: CIImage, extent: CGRect, faceWidth: CGFloat) -> CIImage {
        let small = local.clampedToExtent()
            .transformed(by: CGAffineTransform(scaleX: downsample, y: downsample))
            .applyingGaussianBlur(sigma: Double(max(1, faceWidth * downsample * lowPassSigma)))
            .cropped(to: CGRect(x: 0, y: 0, width: extent.width * downsample, height: extent.height * downsample))
        return local.applyingFilter("CIEdgePreserveUpsampleFilter", parameters: [
            "inputSmallImage": small,
            "inputSpatialSigma": 3,
            "inputLumaSigma": 0.12
        ]).cropped(to: extent)
    }

    /// Sans noyau : Peau lissée seule, basse fréquence fondue dans l'ellipse du
    /// visage. Teint naturel, imperceptible par contrat, n'a pas d'équivalent
    /// honnête en filtres standard : il attend le noyau.
    private static func fallback(
        _ plan: CallSkinRetouchPlan,
        local: CIImage,
        lowPass: CIImage,
        extent: CGRect,
        geometry: CallSkinMaskGeometry,
        region: CGRect,
        over image: CIImage
    ) -> CIImage {
        guard plan.smoothing > 0 else { return image }
        let face = geometry.face.offset(by: region.origin)
        let gradient = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": CIVector(x: 0, y: 0),
            "inputRadius0": face.radii.width * 0.6,
            "inputRadius1": face.radii.width,
            "inputColor0": CIColor(red: CGFloat(plan.smoothing), green: CGFloat(plan.smoothing), blue: CGFloat(plan.smoothing)),
            "inputColor1": CIColor(red: 0, green: 0, blue: 0)
        ])?.outputImage ?? CIImage(color: .black)
        let ellipse = gradient
            .transformed(by: CGAffineTransform(scaleX: 1, y: face.radii.height / max(face.radii.width, 1)))
            .transformed(by: CGAffineTransform(translationX: face.center.x, y: face.center.y))
            .cropped(to: extent)
        return lowPass
            .applyingFilter("CIBlendWithMask", parameters: [
                kCIInputBackgroundImageKey: local,
                kCIInputMaskImageKey: ellipse
            ])
            .cropped(to: extent)
            .transformed(by: CGAffineTransform(translationX: region.minX, y: region.minY))
            .composited(over: image)
    }
}
