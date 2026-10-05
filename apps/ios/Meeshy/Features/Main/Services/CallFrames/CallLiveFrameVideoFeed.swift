import CoreImage
import CoreVideo
import Foundation
import ImageIO

/// Une vidéo de l'appel à poser dans une case : la piste (local ou distante) et son miroir.
nonisolated struct CallLiveFrameVideoSource: @unchecked Sendable {
    let track: Any
    let isMirrored: Bool
}

/// La dernière image REÇUE de chaque piste — jamais celle qu'on envoie, qui ne porte pas le cadre.
protocol CallLiveFrameVideoFeeding: AnyObject, Sendable {
    nonisolated func attach(_ sources: [String: CallLiveFrameVideoSource])
    nonisolated func detachAll()
    nonisolated func latestImages() -> [String: CIImage]
}

/// **LES IMAGES DU CADRE EN DIRECT** (#9214) — une prise sur chaque piste affichée (la même
/// que celle du Montage, `CallFrameTap`), qui garde la DERNIÈRE image de chaque personne
/// sous verrou. Une image par personne au plus en mémoire ; tout se détache quand le cadre
/// s'en va, rien ne survit à l'écran.
nonisolated final class CallLiveFrameVideoFeed: CallLiveFrameVideoFeeding, @unchecked Sendable {
    private struct Latest {
        let buffer: CVPixelBuffer
        let orientation: CGImagePropertyOrientation
    }

    private let lock = NSLock()
    private var latest: [String: Latest] = [:]
    private var mirroredIds: Set<String> = []
    private var detachers: [String: (identity: ObjectIdentifier, detach: () -> Void)] = [:]

    init() {}

    deinit {
        detachers.values.forEach { $0.detach() }
    }

    func attach(_ sources: [String: CallLiveFrameVideoSource]) {
        lock.lock()
        mirroredIds = Set(sources.filter { $0.value.isMirrored }.keys)
        let stale = detachers.filter { sources[$0.key] == nil }
        stale.keys.forEach { key in
            detachers.removeValue(forKey: key)
            latest.removeValue(forKey: key)
        }
        lock.unlock()
        stale.values.forEach { $0.detach() }
        #if canImport(WebRTC)
        sources.forEach { id, source in attachWebRTC(track: source.track, id: id) }
        #endif
    }

    func detachAll() {
        attach([:])
    }

    func latestImages() -> [String: CIImage] {
        lock.lock()
        let frames = latest
        let mirrored = mirroredIds
        lock.unlock()
        return frames.reduce(into: [String: CIImage]()) { result, entry in
            let upright = CIImage(cvPixelBuffer: entry.value.buffer).oriented(entry.value.orientation)
            result[entry.key] = mirrored.contains(entry.key) ? upright.oriented(.upMirrored) : upright
        }
    }

    func store(_ buffer: CVPixelBuffer, orientation: CGImagePropertyOrientation, for id: String) {
        lock.lock()
        defer { lock.unlock() }
        guard detachers[id] != nil else { return }
        latest[id] = Latest(buffer: buffer, orientation: orientation)
    }

    /// `false` si la même piste est déjà prise pour `id` : rien à refaire.
    func register(id: String, identity: ObjectIdentifier, detach: @escaping () -> Void) -> Bool {
        lock.lock()
        if detachers[id]?.identity == identity {
            lock.unlock()
            return false
        }
        let previous = detachers[id]
        detachers[id] = (identity, detach)
        latest.removeValue(forKey: id)
        lock.unlock()
        previous?.detach()
        return true
    }
}

#if canImport(WebRTC)
@preconcurrency import WebRTC

nonisolated extension CallLiveFrameVideoFeed {
    fileprivate func attachWebRTC(track: Any, id: String) {
        guard let track = track as? RTCVideoTrack else { return }
        let converter = VideoFrameConverter()
        let tap = CallFrameTap { [weak self] frame in
            guard let buffer = converter.pixelBuffer(from: frame.buffer) else { return }
            self?.store(buffer, orientation: CallFrameOrientation.orientation(forRotation: Int(frame.rotation.rawValue)), for: id)
        }
        let isNew = register(id: id, identity: ObjectIdentifier(track)) { [weak track] in
            track?.remove(tap)
        }
        guard isNew else { return }
        track.add(tap)
    }
}
#endif
