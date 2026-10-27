import CoreImage
import CoreVideo
import Foundation
import ImageIO

/// **Les effets de l'appel, dans la capture du composer** (#10311, directive
/// porteur 2026-10-12 : « ajouter l'icône Effets entre Filtres et Cadres »).
///
/// Les mêmes effets que « Effets de ma caméra » pendant un appel — Lissage de
/// peau, Crapaud, Ange, Démon, Éruption —, peints par le MÊME moteur
/// (`CallFaceEffectsRenderer`) et posés par le peintre unique
/// (`ComposerLookPainter.paint`) : l'aperçu, la bande, la photo, la boucle et la
/// vidéo qui part montrent le même effet. Le visage se lit sur une petite sonde
/// debout, jamais sur l'image entière.
///
/// Trois usages, trois façons de trouver le visage :
/// - `live` — l'aperçu, la bande, la boucle : le suivi de l'appel, sur sa file ;
/// - `export()` — une vidéo qui part : le suivi dans le rendu même, sans retard ;
/// - une photo (`still`) : le visage cherché sur elle, tout de suite.
nonisolated final class ComposerFaceEffects: @unchecked Sendable {

    static let live = ComposerFaceEffects(executor: CallVisionQueueExecutor(label: "me.meeshy.composer.face-landmarks"))

    static func export() -> ComposerFaceEffects {
        ComposerFaceEffects(executor: ComposerInlineVisionExecutor())
    }

    /// La largeur de la sonde où le visage se cherche.
    static let probeWidth: CGFloat = 360

    /// La force du lissage : celle de l'appel par défaut.
    static var intensity: Float { VideoFilterConfig().skinSmoothingIntensity }

    private let renderer: CallFaceEffectsRenderer
    private let detector = VisionFaceLandmarkDetector()
    private let lock = NSLock()
    private var probeOf: ProbeKey?
    private var stillFace: (key: ProbeKey, detection: CallFaceDetection?)?
    private var probe: CVPixelBuffer?
    private var pool: CVPixelBufferPool?
    private var poolSize: CGSize = .zero

    nonisolated deinit {}

    init(executor: any CallVisionExecuting) {
        renderer = CallFaceEffectsRenderer(executor: executor)
    }

    /// `image` reçoit l'effet ; `source`, de même géométrie, dit où est le visage.
    /// Sans effet, rien n'est calculé.
    func apply(_ effect: CallFaceEffect, to image: CIImage, probing source: CIImage, still: Bool) -> CIImage {
        guard effect != .none, !image.extent.isInfinite, image.extent.width > 0, image.extent.height > 0 else {
            return image
        }
        let origine = image.extent.origin
        let debout = image.transformed(by: CGAffineTransform(translationX: -origine.x, y: -origine.y))
        guard let sonde = probe(for: source) else { return image }
        let rendu = still
            ? renderer.render(effect, upright: debout, face: face(of: source, in: sonde, canvas: debout.extent.size),
                              intensity: Self.intensity)
            : renderer.render(effect, on: debout, pixelBuffer: sonde, rotation: 0, intensity: Self.intensity,
                              isDegraded: false)
        return rendu.transformed(by: CGAffineTransform(translationX: origine.x, y: origine.y))
    }

    /// Le visage de la photo, cherché sur sa sonde UNE fois par image : la
    /// retouche la repeint, ses vignettes aussi, sans relancer Vision (#10340).
    private func face(of source: CIImage, in sonde: CVPixelBuffer, canvas: CGSize) -> CallFaceLandmarks? {
        let cle = ProbeKey(image: ObjectIdentifier(source), extent: source.extent)
        lock.lock()
        let detection: CallFaceDetection?
        if let connue = stillFace, connue.key == cle {
            detection = connue.detection
        } else {
            detection = detector.detect(in: sonde, orientation: .up)
            stillFace = (cle, detection)
        }
        lock.unlock()
        return detection.map {
            CallFaceLandmarks.fromNormalized(boundingBox: $0.boundingBox, leftEye: $0.leftEye, rightEye: $0.rightEye,
                                             mouth: $0.mouth, imageSize: canvas)
        }
    }

    /// Une sonde par image source : les cases de la bande peintes depuis la même
    /// trame la partagent.
    private struct ProbeKey: Equatable {
        let image: ObjectIdentifier
        let extent: CGRect
    }

    private func probe(for source: CIImage) -> CVPixelBuffer? {
        let cle = ProbeKey(image: ObjectIdentifier(source), extent: source.extent)
        lock.lock()
        defer { lock.unlock() }
        if cle == probeOf, let probe { return probe }
        let taille = Self.probeSize(of: source.extent.size)
        guard let tampon = makeBuffer(taille) else { return nil }
        let echelle = taille.width / source.extent.width
        let reduite = source
            .transformed(by: CGAffineTransform(translationX: -source.extent.minX, y: -source.extent.minY))
            .transformed(by: CGAffineTransform(scaleX: echelle, y: echelle))
        ComposerLookGPU.context.render(reduite, to: tampon)
        probeOf = cle
        probe = tampon
        return tampon
    }

    /// La sonde garde les proportions de la source, en pixels pairs.
    static func probeSize(of size: CGSize) -> CGSize {
        guard size.width > 0, size.height > 0 else { return .zero }
        let largeur = min(size.width, probeWidth)
        let hauteur = size.height * largeur / size.width
        func pair(_ v: CGFloat) -> CGFloat { CGFloat(max(2, Int(v.rounded(.down)) / 2 * 2)) }
        return CGSize(width: pair(largeur), height: pair(hauteur))
    }

    private func makeBuffer(_ size: CGSize) -> CVPixelBuffer? {
        guard size.width > 0, size.height > 0 else { return nil }
        if pool == nil || poolSize != size {
            let attributs: [String: Any] = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: Int(size.width),
                kCVPixelBufferHeightKey as String: Int(size.height),
                kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
            ]
            var nouveau: CVPixelBufferPool?
            CVPixelBufferPoolCreate(nil, nil, attributs as CFDictionary, &nouveau)
            pool = nouveau
            poolSize = size
            probe = nil
            probeOf = nil
        }
        guard let pool else { return nil }
        var tampon: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &tampon)
        return tampon
    }
}

/// La détection dans le rendu même : chaque trame due est cherchée avant la
/// suivante — un export ne prend aucun retard sur le visage.
nonisolated final class ComposerInlineVisionExecutor: CallVisionExecuting {
    func execute(_ work: @escaping @Sendable () -> Void) {
        work()
    }
}
