import AVFoundation
import CoreImage

/// **La dernière trame de l'objectif, pour l'aperçu en direct** (#9329).
///
/// Une sortie de données vidéo vit dans la session à côté de la photo et du
/// film (iOS 16 les admet ensemble) ; ce guetteur ne GARDE une trame que si un
/// look est choisi — sans look, l'aperçu reste la couche système et rien n'est
/// retenu. Une seule trame en mémoire, sous verrou : le pool de la caméra n'est
/// jamais affamé.
nonisolated final class ComposerCameraFeed: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    let queue = DispatchQueue(label: "me.meeshy.composer.live-look.feed", qos: .userInteractive)

    private let lock = NSLock()
    private var latest: CVPixelBuffer?
    /// L'espace que les trames DÉCLARENT (attachements du tampon), lu une fois
    /// par objectif : le cube les lit dans cet espace, à l'aperçu comme à
    /// l'export.
    private var space: CGColorSpace?
    private var position: AVCaptureDevice.Position = .back
    private var active = false

    override init() {
        super.init()
    }

    /// Couper le guet rend la trame retenue au pool.
    var isActive: Bool {
        get {
            lock.lock()
            defer { lock.unlock() }
            return active
        }
        set {
            lock.lock()
            defer { lock.unlock() }
            active = newValue
            if !newValue { latest = nil }
        }
    }

    /// L'objectif change : la trame de l'autre ne se montre pas une image de trop.
    func setPosition(_ newPosition: AVCaptureDevice.Position) {
        lock.lock()
        defer { lock.unlock() }
        position = newPosition
        latest = nil
        space = nil
    }

    /// La session s'arrête : sa dernière trame ne se montre pas figée au
    /// prochain armement, et retourne au pool.
    func flush() {
        lock.lock()
        defer { lock.unlock() }
        latest = nil
        space = nil
    }

    var declaredSpace: CGColorSpace? {
        lock.lock()
        defer { lock.unlock() }
        return space
    }

    /// La trame la plus récente, redressée comme l'aperçu système.
    func latestImage() -> CIImage? {
        lock.lock()
        let buffer = latest
        let orientation = ComposerLiveLookRule.orientation(for: position)
        lock.unlock()
        return buffer.map { CIImage(cvPixelBuffer: $0).oriented(orientation) }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lock.lock()
        defer { lock.unlock() }
        guard active else { return }
        latest = buffer
        if space == nil {
            space = CVBufferCopyAttachments(buffer, .shouldPropagate)
                .flatMap { CVImageBufferCreateColorSpaceFromAttachments($0)?.takeRetainedValue() }
        }
    }
}
