//
//  AVSampleBufferDisplayLayer+Meeshy.swift
//  Meeshy
//
//  Lot 2 (PiP système) — le branchement iOS 17 `sampleBufferRenderer` / iOS 16
//  legacy était écrit à l'identique dans `PiPCallController.flushSurface()` et
//  dans `PiPVideoRenderer` (`isReadyForMoreMediaData`, `enqueue`, `flush`,
//  `flushIfFailed`). Site unique désormais.
//
//  `nonisolated` : appelée depuis la serial queue privée de `PiPVideoRenderer`
//  (jamais MainActor) ET depuis `PiPCallController` (MainActor) — une extension
//  non annotée serait MainActor par défaut de module (SE-0466), ce qui
//  forcerait un `await` sur le chemin per-frame du renderer.
//

import AVFoundation
import CoreMedia
import os

nonisolated extension AVSampleBufferDisplayLayer {
    /// `true` si le layer (ou son `sampleBufferRenderer` iOS 17+) peut absorber une frame de plus.
    var isReadyForMoreMediaDataCompat: Bool {
        if #available(iOS 17.0, *) { return sampleBufferRenderer.isReadyForMoreMediaData }
        return isReadyForMoreMediaData
    }

    /// Enfile un `CMSampleBuffer`, via le `sampleBufferRenderer` iOS 17+ ou directement sur le layer avant.
    func enqueueCompat(_ sample: CMSampleBuffer) {
        if #available(iOS 17.0, *) {
            sampleBufferRenderer.enqueue(sample)
        } else {
            enqueue(sample)
        }
    }

    /// Vide la file d'attente (iOS 17+ / legacy).
    func flushCompat() {
        if #available(iOS 17.0, *) {
            sampleBufferRenderer.flush()
        } else {
            flush()
        }
    }

    /// Si le renderer/layer est en échec, le vide (et journalise).
    func flushIfFailedCompat() {
        if #available(iOS 17.0, *) {
            if sampleBufferRenderer.status == .failed {
                sampleBufferRenderer.flush()
                Logger.pip.warning("PiP sampleBufferRenderer failed → flush")
            }
        } else if status == .failed {
            flush()
            Logger.pip.warning("PiP displayLayer failed → flush")
        }
    }
}
