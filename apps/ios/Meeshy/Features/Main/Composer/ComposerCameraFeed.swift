import AVFoundation
import CoreImage
import QuartzCore

/// **La dernière trame de l'objectif, pour l'aperçu en direct** (#9329).
///
/// Une sortie de données vidéo vit dans la session à côté de la photo et du
/// film (iOS 16 les admet ensemble) ; ce guetteur ne GARDE une trame que si
/// quelqu'un la peint — l'aperçu d'un look, ou la bande et sa miniature choisie
/// dès le viseur armé (#9351) ; sinon rien n'est retenu. Une seule trame en mémoire, sous verrou : le pool de la caméra n'est
/// jamais affamé.
nonisolated final class ComposerCameraFeed: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, ComposerFrameSourcing,
    @unchecked Sendable {
    let queue = DispatchQueue(label: "me.meeshy.composer.live-look.feed", qos: .userInteractive)

    private let lock = NSLock()
    private var latest: CVPixelBuffer?
    /// L'espace que les trames DÉCLARENT (attachements du tampon), lu une fois
    /// par objectif : le cube les lit dans cet espace, à l'aperçu comme à
    /// l'export.
    private var space: CGColorSpace?
    private var position: AVCaptureDevice.Position = .back
    /// L'objectif qui a PRIS la trame retenue — lu sur sa connexion, jamais
    /// sur l'état publié : pendant une bascule, une trame de l'ancien objectif
    /// ne se redresse pas comme celles du nouveau (#9464).
    private var latestPosition: AVCaptureDevice.Position = .back
    private var active = false
    /// Une bascule attend la prochaine trame de l'ancien objectif, look ou non.
    private var wantsHold = false
    private var held: CIImage?
    /// Une source sert PLUSIEURS peintres — l'aperçu et la bande —, chacun
    /// sous son identifiant.
    private var frameHandlers: [ObjectIdentifier: @Sendable (TimeInterval) -> Void] = [:]

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
        held = nil
        wantsHold = false
        space = nil
    }

    var declaredSpace: CGColorSpace? {
        lock.lock()
        defer { lock.unlock() }
        return space
    }

    /// La trame la plus récente, redressée comme l'aperçu système — selon
    /// l'objectif qui l'a prise.
    func latestImage() -> CIImage? {
        lock.lock()
        let buffer = latest
        let orientation = ComposerLiveLookRule.orientation(for: latestPosition)
        lock.unlock()
        return buffer.map { CIImage(cvPixelBuffer: $0).oriented(orientation) }
    }

    /// L'objectif de la trame retenue ; `nil` sans trame.
    var latestFramePosition: AVCaptureDevice.Position? {
        lock.lock()
        defer { lock.unlock() }
        return latest == nil ? nil : latestPosition
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let objectif = (connection.inputPorts.first?.input as? AVCaptureDeviceInput)?.device.position
        guard ingest(buffer, position: objectif ?? publishedPosition) else { return }
        let presentation = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        announce(at: presentation.isValid ? presentation.seconds : CACurrentMediaTime())
    }

    private var publishedPosition: AVCaptureDevice.Position {
        lock.lock()
        defer { lock.unlock() }
        return position
    }

    /// Une trame arrive de `position`. `true` ⇒ elle est retenue pour l'aperçu
    /// et les peintres sont prévenus.
    @discardableResult
    func ingest(_ buffer: CVPixelBuffer, position objectif: AVCaptureDevice.Position) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if wantsHold {
            wantsHold = false
            held = CIImage(cvPixelBuffer: buffer).oriented(ComposerLiveLookRule.orientation(for: objectif))
        }
        guard active else { return false }
        latest = buffer
        latestPosition = objectif
        if space == nil {
            space = CVBufferCopyAttachments(buffer, .shouldPropagate)
                .flatMap { CVImageBufferCreateColorSpaceFromAttachments($0)?.takeRetainedValue() }
        }
        return true
    }

    // MARK: - La trame qui couvre une bascule (#9464)

    /// La prochaine trame sera gardée, même sans look — une seule.
    func requestHold() {
        lock.lock()
        defer { lock.unlock() }
        held = nil
        wantsHold = true
    }

    /// La trame gardée, rendue une fois.
    func takeHeldFrame() -> CIImage? {
        lock.lock()
        defer { lock.unlock() }
        let image = held
        held = nil
        wantsHold = false
        return image
    }

    /// Sur la file de la session, AVANT la bascule : la prochaine trame de
    /// l'objectif encore en place, attendue au plus `timeout`.
    func holdNextFrame(timeout: TimeInterval) -> CIImage? {
        requestHold()
        let echeance = Date().addingTimeInterval(timeout)
        while Date() < echeance {
            lock.lock()
            let image = held
            lock.unlock()
            if image != nil { return takeHeldFrame() }
            Thread.sleep(forTimeInterval: 0.005)
        }
        return takeHeldFrame()
    }

    /// Poser ou retirer le sien ne touche jamais celui d'un autre peintre.
    func setFrameHandler(_ handler: (@Sendable (_ presentedAt: TimeInterval) -> Void)?, for owner: ObjectIdentifier) {
        lock.lock()
        frameHandlers[owner] = handler
        lock.unlock()
    }

    private func announce(at presentedAt: TimeInterval) {
        lock.lock()
        let prevenir = active ? Array(frameHandlers.values) : []
        lock.unlock()
        prevenir.forEach { $0(presentedAt) }
    }

    #if DEBUG
    func announceForTesting(at presentedAt: TimeInterval = 0) { announce(at: presentedAt) }

    /// La trame de la caméra de recette (#9351), comme une trame de l'objectif arrière.
    func inject(_ buffer: CVPixelBuffer) {
        guard ingest(buffer, position: .back) else { return }
        announce(at: CACurrentMediaTime())
    }
    #endif
}
