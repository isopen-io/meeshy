//
//  AVSampleBufferDisplayLayer+Meeshy.swift
//  Meeshy
//
//  Lot 2 (PiP système) — le branchement iOS 17 `sampleBufferRenderer` / iOS 16
//  legacy était écrit à l'identique dans `PiPCallController.flushSurface()` et
//  dans `PiPVideoRenderer` (`isReadyForMoreMediaData`, `enqueue`, `flush`,
//  `flushIfFailed`). Site unique désormais.
//
//  Depuis le SDK iOS 27, les propriétés du layer (`sampleBufferRenderer`,
//  `isReadyForMoreMediaData`, `status`) sont isolées au MainActor, alors que
//  `PiPVideoRenderer` enfile depuis sa serial queue privée. Le récepteur est donc
//  résolu UNE fois sur le MainActor (`PiPSampleSink.init`), puis utilisé hors du
//  main par le protocole `AVQueuedSampleBufferRendering`, que le renderer iOS 17+
//  comme le layer legacy satisfont sans isolation.
//

import AVFoundation
import CoreMedia
import MeeshySDK
import os

nonisolated struct PiPSampleSink: @unchecked Sendable {
    private let target: any AVQueuedSampleBufferRendering

    @MainActor
    init(layer: AVSampleBufferDisplayLayer) {
        if #available(iOS 17.0, *) {
            target = layer.sampleBufferRenderer
        } else {
            target = layer
        }
    }

    /// `true` si le récepteur peut absorber une frame de plus.
    var isReadyForMoreMediaData: Bool { target.isReadyForMoreMediaData }

    func enqueue(_ sample: sending CMSampleBuffer) { target.enqueue(sample) }

    func flush() { target.flush() }

    /// Si le récepteur est en échec, le vide (et journalise).
    func flushIfFailed() {
        guard hasFailed else { return }
        target.flush()
        Logger.pip.warning("PiP sample buffer sink failed → flush")
    }

    private var hasFailed: Bool {
        if #available(iOS 17.0, *), let renderer = target as? AVSampleBufferVideoRenderer {
            return renderer.status == .failed
        }
        // Layer legacy (iOS 16) : `status` est isolé au MainActor sous le SDK
        // iOS 27 ; KVC le lit sans franchir l'isolation (propriété KVO-conforme).
        guard let raw = (target as? NSObject)?.value(forKey: "status") as? Int else { return false }
        return raw == AVQueuedSampleBufferRenderingStatus.failed.rawValue
    }
}
