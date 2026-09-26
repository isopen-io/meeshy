import CoreImage
import CoreVideo
import Foundation
import os

// #8063 — l'app en appel, côté réception de la diffusion ReplayKit :
// le socket Unix où l'extension écrit ses trames, et les notifications
// Darwin qui disent « commencé / fini ». Le format est `ScreenShareWire.swift`.

protocol ScreenShareServiceProviding: AnyObject {
    var onBroadcastStarted: (@MainActor () -> Void)? { get set }
    var onBroadcastFinished: (@MainActor () -> Void)? { get set }
    /// Ouvre le socket et s'abonne aux notifications ; idempotent.
    func startListening() -> Bool
    func stopListening()
    /// Demande à l'extension de finir sa diffusion (elle seule peut le faire).
    func requestBroadcastStop()
    func setFrameSink(_ sink: (any ScreenShareFrameSink)?)
}

final class ScreenShareService: ScreenShareServiceProviding {
    var onBroadcastStarted: (@MainActor () -> Void)?
    var onBroadcastFinished: (@MainActor () -> Void)?

    private let server = ScreenShareFrameServer()
    private var observers: [ScreenShareDarwinObserver] = []

    func startListening() -> Bool {
        guard observers.isEmpty else { return true }
        guard let path = ScreenShareIPC.socketURL()?.path, server.start(path: path) else { return false }
        observers = [
            ScreenShareDarwinObserver(name: ScreenShareIPC.broadcastStartedNotification) { [weak self] in
                Task { @MainActor in self?.onBroadcastStarted?() }
            },
            ScreenShareDarwinObserver(name: ScreenShareIPC.broadcastFinishedNotification) { [weak self] in
                Task { @MainActor in self?.onBroadcastFinished?() }
            },
        ]
        return true
    }

    func stopListening() {
        observers = []
        server.stop()
    }

    func requestBroadcastStop() {
        ScreenShareDarwinNotifications.post(ScreenShareIPC.stopRequestedNotification)
    }

    func setFrameSink(_ sink: (any ScreenShareFrameSink)?) {
        server.setSink(sink)
    }
}

/// Le serveur du socket : UNE connexion (l'extension), lue sur une file
/// série ; chaque trame JPEG est décodée en `CVPixelBuffer` BGRA et remise
/// au puits courant. Tout l'état vit sur `queue`.
nonisolated final class ScreenShareFrameServer: @unchecked Sendable {
    private static let readChunk = 256 * 1024

    private let queue = DispatchQueue(label: "me.meeshy.app.screen-share.server")
    private let logger = Logger(subsystem: "me.meeshy.app", category: "screen-share")
    private var listenSource: DispatchSourceRead?
    private var clientSource: DispatchSourceRead?
    private var path: String?
    private var decoder = ScreenShareFrameDecoder()
    private var sink: (any ScreenShareFrameSink)?
    private var pool: CVPixelBufferPool?
    private var poolWidth = 0
    private var poolHeight = 0
    private let context = CIContext(options: [.useSoftwareRenderer: false])

    func start(path: String) -> Bool {
        queue.sync {
            guard listenSource == nil else { return true }
            guard let fd = ScreenShareUnixSocket.makeStreamSocket() else { return false }
            guard ScreenShareUnixSocket.bindAndListen(fd, path: path) else {
                close(fd)
                logger.error("screen share socket bind failed")
                return false
            }
            let source = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
            source.setEventHandler { [weak self] in self?.acceptClient(listenFd: fd) }
            source.setCancelHandler { close(fd) }
            source.resume()
            listenSource = source
            self.path = path
            return true
        }
    }

    func stop() {
        queue.sync {
            clientSource?.cancel()
            clientSource = nil
            listenSource?.cancel()
            listenSource = nil
            if let path { unlink(path) }
            path = nil
            decoder = ScreenShareFrameDecoder()
            sink = nil
            pool = nil
        }
    }

    func setSink(_ sink: (any ScreenShareFrameSink)?) {
        queue.async { self.sink = sink }
    }

    private func acceptClient(listenFd: Int32) {
        let fd = accept(listenFd, nil, nil)
        guard fd >= 0 else { return }
        clientSource?.cancel()
        decoder = ScreenShareFrameDecoder()
        let source = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
        source.setEventHandler { [weak self] in self?.readClient(fd: fd) }
        source.setCancelHandler { close(fd) }
        source.resume()
        clientSource = source
    }

    private func readClient(fd: Int32) {
        var chunk = [UInt8](repeating: 0, count: Self.readChunk)
        let count = read(fd, &chunk, chunk.count)
        guard count > 0 else {
            clientSource?.cancel()
            clientSource = nil
            return
        }
        do {
            let frames = try decoder.append(Data(chunk.prefix(count)))
            if let latest = frames.last { deliver(latest) }
        } catch {
            logger.error("screen share stream corrupted: \(String(describing: error))")
            clientSource?.cancel()
            clientSource = nil
        }
    }

    /// Seule la DERNIÈRE trame d'une lecture part : les précédentes sont déjà
    /// en retard, les encoder ajouterait de la latence sans rien montrer.
    private func deliver(_ frame: ScreenShareFrame) {
        guard let sink, let image = CIImage(data: frame.payload),
              let buffer = makePixelBuffer(width: Int(frame.header.width), height: Int(frame.header.height)) else { return }
        context.render(image, to: buffer)
        sink.push(
            pixelBuffer: buffer,
            rotationDegrees: ScreenShareFrameCodec.rotationDegrees(forOrientation: frame.header.orientation),
            timestampNs: Int64(clamping: frame.header.timestampNs)
        )
    }

    private func makePixelBuffer(width: Int, height: Int) -> CVPixelBuffer? {
        guard width > 0, height > 0 else { return nil }
        if pool == nil || poolWidth != width || poolHeight != height {
            let attributes: [String: Any] = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: width,
                kCVPixelBufferHeightKey as String: height,
                kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
            ]
            var created: CVPixelBufferPool?
            CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, attributes as CFDictionary, &created)
            pool = created
            poolWidth = width
            poolHeight = height
        }
        guard let pool else { return nil }
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer)
        return buffer
    }
}
