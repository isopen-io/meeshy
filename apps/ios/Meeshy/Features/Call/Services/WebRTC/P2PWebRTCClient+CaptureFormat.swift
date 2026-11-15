import AVFoundation
import Foundation

#if canImport(WebRTC)
@preconcurrency import WebRTC

/// **Ce que la caméra d'un appel capture, selon le palier** (#11293). La caméra
/// descend avec l'encodeur et avec l'état thermique : un capteur qui tourne en
/// 720p30 pendant que l'encodeur n'envoie que du 360p chauffe pour rien.
nonisolated struct CallCaptureCeiling: Equatable, Sendable {
    let width: Int
    let height: Int
    let fps: Int

    static let hd = CallCaptureCeiling(width: Int(VideoConfig.hd720p30.maxResolution.width),
                                       height: Int(VideoConfig.hd720p30.maxResolution.height),
                                       fps: VideoConfig.hd720p30.maxFrameRate)
    static let reduced = CallCaptureCeiling(width: 640, height: 480, fps: 24)

    /// Réduite dès que l'appareil chauffe (`.serious` et au-delà) ou que
    /// l'encodeur n'envoie plus que du 360p ou moins.
    static func following(scaleDownBy: Double, thermal: ProcessInfo.ThermalState) -> CallCaptureCeiling {
        thermal.rawValue >= ProcessInfo.ThermalState.serious.rawValue || scaleDownBy >= 2 ? .reduced : .hd
    }

    /// La sortie de la source vidéo : la taille et la cadence que l'encodeur
    /// enverra, jamais au-dessus de la capture.
    static func sourceOutput(scaleDownBy: Double, framerate: Int, capture: CallCaptureCeiling) -> CallCaptureCeiling {
        let height = min(capture.height, Int((Double(hd.height) / max(1, scaleDownBy)).rounded()))
        let width = min(capture.width, height * 16 / 9)
        return CallCaptureCeiling(width: width, height: height, fps: max(1, min(capture.fps, framerate)))
    }
}

/// Choix du format de capture caméra d'un appel.
extension AVCaptureDevice {
    func callCaptureFormat(within ceiling: CallCaptureCeiling) -> AVCaptureDevice.Format? {
        // Préférer un format <=720p qui supporte 30fps. Sans le filtre fps,
        // l'iPhone Pro peut sélectionner un format slow-motion 720p@120/240fps
        // (où minFrameRate=maxFrameRate=120) — `RTCCameraVideoCapturer.startCapture`
        // est alors appelé en fps=120, ce qui produit `FigCaptureSourceRemote
        // err=-17281` (kCMIOHardwareDeviceUnsupportedFormatError) sur certains
        // devices et gaspille batterie/CPU sur tous.
        // Ceiling derived from VideoConfig.hd720p30 so the camera picker and the
        // encoding config stay in sync when the preset is updated.
        let targetFPS = Float64(ceiling.fps)
        let maxW = Int32(ceiling.width)
        let maxH = Int32(ceiling.height)
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
    func callFrameRate(within ceiling: CallCaptureCeiling) -> Int {
        // Visons 30fps pour les appels vidéo (assez lisse, ~2x moins de CPU/batterie
        // que 60fps). Si le format ne contient pas 30 dans une de ses ranges
        // (ex: format slow-mo pure 120fps-only), fallback sur la valeur la plus
        // proche de 30 atteignable — JAMAIS le maxFrameRate brut, qui pour un
        // format 120fps-only ferait crasher `startCapture` avec
        // `FigCaptureSourceRemote err=-17281`.
        let target = Float64(ceiling.fps)
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

/// La source et la caméra d'un appel suivent l'encodeur (#11293).
extension P2PWebRTCClient {
    /// À chaque `applyVideoEncoding` : la source livre à l'encodeur la taille et
    /// la cadence qu'il enverra, et le plafond de capture est noté pour le
    /// prochain choix de format (le changement de caméra, sérialisé par
    /// `WebRTCService`, le rechoisit).
    func adaptCaptureSource(scaleDownBy: Double, framerate: Int) {
        captureCeiling = CallCaptureCeiling.following(scaleDownBy: scaleDownBy, thermal: ProcessInfo.processInfo.thermalState)
        let sortie = CallCaptureCeiling.sourceOutput(scaleDownBy: scaleDownBy, framerate: framerate, capture: captureCeiling)
        localVideoTrack_?.source.adaptOutputFormat(toWidth: Int32(sortie.width), height: Int32(sortie.height),
                                                   fps: Int32(sortie.fps))
    }

    var liveCameraUniqueID: String? {
        videoCapturer?.captureSession.inputs.lazy.compactMap { ($0 as? AVCaptureDeviceInput)?.device.uniqueID }.first
    }
}

#endif
