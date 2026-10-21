import AVFoundation
import Foundation

#if canImport(WebRTC)
@preconcurrency import WebRTC

/// Choix du format de capture caméra d'un appel.
extension AVCaptureDevice {
    var callCaptureFormat: AVCaptureDevice.Format? {
        // Préférer un format <=720p qui supporte 30fps. Sans le filtre fps,
        // l'iPhone Pro peut sélectionner un format slow-motion 720p@120/240fps
        // (où minFrameRate=maxFrameRate=120) — `RTCCameraVideoCapturer.startCapture`
        // est alors appelé en fps=120, ce qui produit `FigCaptureSourceRemote
        // err=-17281` (kCMIOHardwareDeviceUnsupportedFormatError) sur certains
        // devices et gaspille batterie/CPU sur tous.
        // Ceiling derived from VideoConfig.hd720p30 so the camera picker and the
        // encoding config stay in sync when the preset is updated.
        let targetFPS = Float64(VideoConfig.hd720p30.maxFrameRate)
        let maxW = Int32(VideoConfig.hd720p30.maxResolution.width)
        let maxH = Int32(VideoConfig.hd720p30.maxResolution.height)
        let supports30fps: (AVCaptureDevice.Format) -> Bool = { f in
            f.videoSupportedFrameRateRanges.contains { $0.minFrameRate <= targetFPS && targetFPS <= $0.maxFrameRate }
        }

        let supported = RTCCameraVideoCapturer.supportedFormats(for: self)
        let sorted = supported.sorted { f1, f2 in
            let d1 = CMVideoFormatDescriptionGetDimensions(f1.formatDescription)
            let d2 = CMVideoFormatDescriptionGetDimensions(f2.formatDescription)
            return d1.width * d1.height < d2.width * d2.height
        }

        if let format = sorted.last(where: { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return d.width <= maxW && d.height <= maxH && supports30fps(f)
        }) {
            return format
        }

        if let format = sorted.last(where: { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return d.width <= maxW && d.height <= maxH
        }) {
            return format
        }

        return sorted.first(where: supports30fps) ?? supported.last
    }
}

/// Cadence de capture visée pour un format.
extension AVCaptureDevice.Format {
    var callFrameRate: Int {
        // Visons 30fps pour les appels vidéo (assez lisse, ~2x moins de CPU/batterie
        // que 60fps). Si le format ne contient pas 30 dans une de ses ranges
        // (ex: format slow-mo pure 120fps-only), fallback sur la valeur la plus
        // proche de 30 atteignable — JAMAIS le maxFrameRate brut, qui pour un
        // format 120fps-only ferait crasher `startCapture` avec
        // `FigCaptureSourceRemote err=-17281`.
        let target: Float64 = 30
        let ranges = videoSupportedFrameRateRanges
        if ranges.contains(where: { $0.minFrameRate <= target && target <= $0.maxFrameRate }) {
            return Int(target)
        }
        let candidates = ranges.flatMap { range in
            [max(range.minFrameRate, min(range.maxFrameRate, target)), range.minFrameRate, range.maxFrameRate]
        }
        let closest = candidates.min(by: { abs($0 - target) < abs($1 - target) }) ?? target
        return Int(closest)
    }
}

#endif
