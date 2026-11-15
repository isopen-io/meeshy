//
//  PiPVideoSampleBufferView.swift
//  Meeshy
//
//  Lot 2 (PiP système) — surface de rendu adossée à une `AVSampleBufferDisplayLayer`,
//  hébergée par l'`AVPictureInPictureVideoCallViewController`. Le `PiPVideoRenderer`
//  enfile les `CMSampleBuffer` dessus ; la rotation des frames distantes
//  (`RTCVideoFrame.rotation`) est appliquée au niveau du layer.
//

import UIKit
import AVFoundation

final class PiPVideoSampleBufferView: UIView {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    override class var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }

    var displayLayer: AVSampleBufferDisplayLayer {
        guard let layer = layer as? AVSampleBufferDisplayLayer else {
            fatalError("layerClass garantit AVSampleBufferDisplayLayer")
        }
        return layer
    }

    private var appliedRotation: Int = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
        displayLayer.videoGravity = .resizeAspectFill
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) indisponible") }

    /// Applique la rotation (0/90/180/270°) émise par le décodeur. No-op si inchangée.
    func applyRotation(_ degrees: Int) {
        guard degrees != appliedRotation else { return }
        appliedRotation = degrees
        let radians = CGFloat(degrees) * .pi / 180
        displayLayer.setAffineTransform(CGAffineTransform(rotationAngle: radians))
    }
}
