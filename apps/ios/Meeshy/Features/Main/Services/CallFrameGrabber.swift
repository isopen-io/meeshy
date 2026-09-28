import CoreGraphics
import CoreImage
import Foundation
import ImageIO

nonisolated struct CallFrameSnapshot: @unchecked Sendable {
    let images: [String: CGImage]

    static let empty = CallFrameSnapshot(images: [:])
}

protocol CallFrameGrabbing: AnyObject, Sendable {
    nonisolated func attach(track: Any?, id: String, isMirrored: Bool)
    nonisolated func keepOnly(_ ids: Set<String>)
    nonisolated func detachAll()
    nonisolated func snapshot(maxDimension: CGFloat?) async -> CallFrameSnapshot
}

nonisolated struct CallGrabbedFrame: Sendable {
    let makeImage: @Sendable () -> CIImage?
}

nonisolated final class CallFrameGrabber: CallFrameGrabbing, @unchecked Sendable {
    private let lock = NSLock()
    private let queue = DispatchQueue(label: "me.meeshy.call.frame-grabber", qos: .userInitiated)
    private let context = CIContext(options: [.cacheIntermediates: false])
    private var frames: [String: CallGrabbedFrame] = [:]
    private var mirroredIds: Set<String> = []
    private var detachers: [String: (identity: ObjectIdentifier, detach: () -> Void)] = [:]

    init() {}

    func attach(track: Any?, id: String, isMirrored: Bool) {
        lock.lock()
        if isMirrored { mirroredIds.insert(id) } else { mirroredIds.remove(id) }
        lock.unlock()
        #if canImport(WebRTC)
        attachWebRTC(track: track, id: id)
        #endif
    }

    func keepOnly(_ ids: Set<String>) {
        lock.lock()
        let stale = detachers.filter { !ids.contains($0.key) }
        stale.keys.forEach { key in
            detachers.removeValue(forKey: key)
            frames.removeValue(forKey: key)
            mirroredIds.remove(key)
        }
        lock.unlock()
        stale.values.forEach { $0.detach() }
    }

    func detachAll() {
        keepOnly([])
    }

    func store(_ frame: CallGrabbedFrame, for id: String) {
        lock.lock()
        defer { lock.unlock() }
        guard detachers[id] != nil else { return }
        frames[id] = frame
    }

    func register(id: String, identity: ObjectIdentifier, detach: @escaping () -> Void) -> Bool {
        lock.lock()
        if detachers[id]?.identity == identity {
            lock.unlock()
            return false
        }
        let previous = detachers[id]
        detachers[id] = (identity, detach)
        frames.removeValue(forKey: id)
        lock.unlock()
        previous?.detach()
        return true
    }

    func snapshot(maxDimension: CGFloat?) async -> CallFrameSnapshot {
        lock.lock()
        let pending = frames
        let mirrored = mirroredIds
        lock.unlock()
        guard !pending.isEmpty else { return .empty }
        return await withCheckedContinuation { continuation in
            queue.async { [self] in
                let images = pending.reduce(into: [String: CGImage]()) { result, entry in
                    guard let source = entry.value.makeImage() else { return }
                    let oriented = mirrored.contains(entry.key) ? source.oriented(.upMirrored) : source
                    let scaled = Self.scaled(oriented, maxDimension: maxDimension)
                    result[entry.key] = self.context.createCGImage(scaled, from: scaled.extent)
                }
                continuation.resume(returning: CallFrameSnapshot(images: images))
            }
        }
    }

    private static func scaled(_ image: CIImage, maxDimension: CGFloat?) -> CIImage {
        let extent = image.extent
        guard let maxDimension, maxDimension > 0 else { return image }
        let longest = max(extent.width, extent.height)
        guard longest > maxDimension else { return image }
        let factor = maxDimension / longest
        return image.transformed(by: CGAffineTransform(scaleX: factor, y: factor))
    }
}

#if canImport(WebRTC)
@preconcurrency import WebRTC

nonisolated final class CallFrameTap: NSObject, RTCVideoRenderer, @unchecked Sendable {
    private let onFrame: @Sendable (RTCVideoFrame) -> Void

    init(onFrame: @escaping @Sendable (RTCVideoFrame) -> Void) {
        self.onFrame = onFrame
        super.init()
    }

    func setSize(_ size: CGSize) {}

    func renderFrame(_ frame: RTCVideoFrame?) {
        guard let frame else { return }
        onFrame(frame)
    }
}

nonisolated extension CallFrameGrabber {
    fileprivate func attachWebRTC(track: Any?, id: String) {
        guard let track = track as? RTCVideoTrack else { return }
        let converter = VideoFrameConverter()
        let tap = CallFrameTap { [weak self] frame in
            let grabbed = CallGrabbedFrame {
                converter.pixelBuffer(from: frame.buffer).map {
                    CIImage(cvPixelBuffer: $0).oriented(CallFrameOrientation.orientation(forRotation: Int(frame.rotation.rawValue)))
                }
            }
            self?.store(grabbed, for: id)
        }
        let isNew = register(id: id, identity: ObjectIdentifier(track)) { [weak track] in
            track?.remove(tap)
        }
        guard isNew else { return }
        track.add(tap)
    }
}
#endif
