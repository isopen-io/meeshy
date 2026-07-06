//
//  PiPVideoRenderer.swift
//  Meeshy
//
//  Lot 2 (PiP système) — `RTCVideoRenderer` qui alimente une
//  `AVSampleBufferDisplayLayer` à partir du track vidéo distant. Greffé comme
//  2e renderer sur le `RTCVideoTrack` (le `RTCMTLVideoView` plein écran reste le
//  1er). Tourne sur une serial queue dédiée (jamais le main), throttle le
//  framerate (la vignette PiP est petite) et droppe les frames quand le renderer
//  n'absorbe pas (backpressure → pas de fuite mémoire en arrière-plan).
//
//  `nonisolated`/@unchecked Sendable : `renderFrame(_:)` est invoqué depuis le
//  thread de décodage WebRTC — mêmes contraintes que `VideoFilterCapturerDelegate`.
//

import AVFoundation
import CoreMedia
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC

// MARK: - Renderer

nonisolated final class PiPVideoRenderer: NSObject, RTCVideoRenderer, @unchecked Sendable {

    private let displayLayer: AVSampleBufferDisplayLayer
    private let converter: VideoFrameConverter
    private let queue = DispatchQueue(label: "me.meeshy.pip.render", qos: .userInteractive)
    private var minIntervalNs: UInt64
    private let onRotation: (@Sendable (Int) -> Void)?

    private var lastEnqueueNs: UInt64 = 0
    private var lastRotation: Int = -1
    /// Mutated only on `queue` — the peer turned its camera off, so live
    /// frames are dropped and a placeholder is shown instead of the last
    /// live frame frozen indefinitely (spec 2026-06-20 §5.3).
    private var isRemoteVideoMuted = false

    init(displayLayer: AVSampleBufferDisplayLayer,
         maxFrameRate: Int = 15,
         converter: VideoFrameConverter = VideoFrameConverter(),
         onRotation: (@Sendable (Int) -> Void)? = nil) {
        self.displayLayer = displayLayer
        self.converter = converter
        self.minIntervalNs = UInt64(1_000_000_000 / max(1, maxFrameRate))
        self.onRotation = onRotation
        super.init()
    }

    // MARK: RTCVideoRenderer

    nonisolated func setSize(_ size: CGSize) { /* le layer s'adapte via videoGravity */ }

    nonisolated func renderFrame(_ frame: RTCVideoFrame?) {
        guard let frame else { return }
        queue.async { [weak self] in self?.consume(frame) }
    }

    // MARK: - Pipeline (serial queue)

    private func consume(_ frame: RTCVideoFrame) {
        guard !isRemoteVideoMuted else { return }   // peer's camera is off — placeholder is showing instead

        let now = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
        guard now &- lastEnqueueNs >= minIntervalNs else { return }   // throttle

        flushIfFailed()
        guard isReadyForMoreMediaData else { return }                  // backpressure → drop
        guard let sample = converter.makeSampleBuffer(from: frame) else { return }

        lastEnqueueNs = now
        enqueue(sample)
        notifyRotationIfChanged(Int(frame.rotation.rawValue))
    }

    /// Ajuste le framerate cible (thermal-aware). Muté sur la serial queue.
    func setMaxFrameRate(_ fps: Int) {
        let interval = UInt64(1_000_000_000 / max(1, fps))
        queue.async { [weak self] in self?.minIntervalNs = interval }
    }

    /// The peer toggled its camera. While muted, live frames are dropped
    /// (`consume`) and a generic placeholder is enqueued once so the PiP
    /// window never shows the last live frame frozen indefinitely.
    func setRemoteVideoMuted(_ muted: Bool) {
        queue.async { [weak self] in
            guard let self, self.isRemoteVideoMuted != muted else { return }
            self.isRemoteVideoMuted = muted
            if muted {
                self.enqueuePlaceholder()
            }
        }
    }

    private func enqueuePlaceholder() {
        flushIfFailed()
        guard isReadyForMoreMediaData else { return }
        guard let pixelBuffer = VideoFrameConverter.makePlaceholderPixelBuffer(),
              let sample = converter.makeSampleBuffer(
                  pixelBuffer: pixelBuffer,
                  timeStampNs: Int64(clock_gettime_nsec_np(CLOCK_UPTIME_RAW))
              ) else { return }
        enqueue(sample)
    }

    // MARK: - Surface d'enqueue (iOS 16 vs 17+)

    private var isReadyForMoreMediaData: Bool {
        if #available(iOS 17.0, *) { return displayLayer.sampleBufferRenderer.isReadyForMoreMediaData }
        return displayLayer.isReadyForMoreMediaData
    }

    private func enqueue(_ sample: CMSampleBuffer) {
        if #available(iOS 17.0, *) {
            displayLayer.sampleBufferRenderer.enqueue(sample)
        } else {
            displayLayer.enqueue(sample)
        }
    }

    private func flush() {
        if #available(iOS 17.0, *) {
            displayLayer.sampleBufferRenderer.flush()
        } else {
            displayLayer.flush()
        }
    }

    private func flushIfFailed() {
        if #available(iOS 17.0, *) {
            if displayLayer.sampleBufferRenderer.status == .failed {
                displayLayer.sampleBufferRenderer.flush()
                Logger.pipRenderer.warning("PiP sampleBufferRenderer failed → flush")
            }
        } else if displayLayer.status == .failed {
            displayLayer.flush()
            Logger.pipRenderer.warning("PiP displayLayer failed → flush")
        }
    }

    private func notifyRotationIfChanged(_ rotation: Int) {
        guard rotation != lastRotation, let onRotation else { return }
        lastRotation = rotation
        onRotation(rotation)
    }
}

private extension Logger {
    nonisolated static let pipRenderer = Logger(subsystem: "me.meeshy.app", category: "pip")
}
#endif
