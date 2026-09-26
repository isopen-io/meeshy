import CoreImage
import Foundation
import ImageIO
import ReplayKit
import os

// L'extension Broadcast Upload du partage d'écran d'appel (#8063).
//
// Elle ne parle PAS à la passerelle : elle n'a ni session ni socket
// Socket.IO. Elle remet les trames à l'app en appel, par le socket Unix du
// conteneur App Group, et l'app les injecte dans sa piste vidéo WebRTC.
// Sans app en écoute (aucun appel en cours), la diffusion s'arrête aussitôt
// avec un message qui dit pourquoi.

nonisolated final class SampleHandler: RPBroadcastSampleHandler {
    private let uploader = ScreenShareFrameUploader()
    private var stopObserver: ScreenShareDarwinObserver?
    private var isFinishing = false

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        guard uploader.connect() else {
            finishBroadcastWithError(Self.error(
                String(localized: "broadcast.error.noCall", defaultValue: "Lancez le partage depuis un appel Meeshy en cours.")
            ))
            return
        }
        stopObserver = ScreenShareDarwinObserver(name: ScreenShareIPC.stopRequestedNotification) { [weak self] in
            self?.finishFromApp()
        }
        ScreenShareDarwinNotifications.post(ScreenShareIPC.broadcastStartedNotification)
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video, !isFinishing else { return }
        guard uploader.send(sampleBuffer) else {
            finishFromApp()
            return
        }
    }

    override func broadcastFinished() {
        stopObserver = nil
        uploader.close()
        ScreenShareDarwinNotifications.post(ScreenShareIPC.broadcastFinishedNotification)
    }

    private func finishFromApp() {
        isFinishing = true
        finishBroadcastWithError(Self.error(
            String(localized: "broadcast.stopped", defaultValue: "Partage d'écran arrêté.")
        ))
    }

    private static func error(_ message: String) -> NSError {
        NSError(domain: ScreenShareIPC.extensionBundleIdentifier, code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

/// Encode chaque trame retenue en JPEG réduit et l'écrit sur le socket.
/// Tout se passe sur le fil de `processSampleBuffer` : ReplayKit ne livre pas
/// la trame suivante avant le retour, ce qui fait la contre-pression.
nonisolated final class ScreenShareFrameUploader: @unchecked Sendable {
    private static let maxLongSide = 1280
    private static let jpegQuality = 0.6

    private let lock = NSLock()
    private var fd: Int32 = -1
    private var throttle = ScreenShareFrameThrottle(maxFramesPerSecond: 15)
    private lazy var context = CIContext(options: [.useSoftwareRenderer: false])
    private let logger = Logger(subsystem: ScreenShareIPC.extensionBundleIdentifier, category: "broadcast")

    func connect() -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard let path = ScreenShareIPC.socketURL()?.path,
              let socket = ScreenShareUnixSocket.makeStreamSocket() else { return false }
        guard ScreenShareUnixSocket.connect(socket, path: path) else {
            Darwin.close(socket)
            logger.info("no app listening for screen share")
            return false
        }
        ScreenShareUnixSocket.setSendTimeout(socket, seconds: 2)
        fd = socket
        return true
    }

    /// `false` quand l'app ne lit plus (appel fini, app tuée) : la diffusion
    /// n'a alors plus de destinataire.
    func send(_ sampleBuffer: CMSampleBuffer) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard fd >= 0 else { return false }
        let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let timestampNs = UInt64(max(0, CMTimeGetSeconds(time)) * 1_000_000_000)
        guard throttle.shouldAccept(timestampNs: timestampNs),
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return true }
        let orientation = (CMGetAttachment(
            sampleBuffer,
            key: RPVideoSampleOrientationKey as CFString,
            attachmentModeOut: nil
        ) as? NSNumber)?.uint32Value ?? 1
        guard let encoded = encode(pixelBuffer) else { return true }
        let frame = ScreenShareFrameCodec.encode(
            width: encoded.width,
            height: encoded.height,
            orientation: orientation,
            timestampNs: timestampNs,
            payload: encoded.jpeg
        )
        guard ScreenShareUnixSocket.writeAll(fd, data: frame) else {
            Darwin.close(fd)
            fd = -1
            return false
        }
        return true
    }

    func close() {
        lock.lock(); defer { lock.unlock() }
        guard fd >= 0 else { return }
        Darwin.close(fd)
        fd = -1
    }

    private func encode(_ pixelBuffer: CVPixelBuffer) -> (jpeg: Data, width: UInt32, height: UInt32)? {
        let source = CIImage(cvPixelBuffer: pixelBuffer)
        let factor = ScreenShareScaling.scale(
            width: Int(source.extent.width),
            height: Int(source.extent.height),
            maxLongSide: Self.maxLongSide
        )
        let image = factor < 1 ? source.transformed(by: CGAffineTransform(scaleX: factor, y: factor)) : source
        guard let jpeg = context.jpegRepresentation(
            of: image,
            colorSpace: CGColorSpaceCreateDeviceRGB(),
            options: [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): Self.jpegQuality]
        ) else { return nil }
        return (jpeg, UInt32(image.extent.width.rounded()), UInt32(image.extent.height.rounded()))
    }
}
