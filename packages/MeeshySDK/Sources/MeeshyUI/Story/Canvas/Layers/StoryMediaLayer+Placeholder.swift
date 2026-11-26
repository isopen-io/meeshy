import Foundation
import QuartzCore
import AVFoundation
import UIKit
import os
import MeeshySDK

extension StoryMediaLayer {
    @MainActor
    func applyThumbHashPlaceholder(_ hash: String?) {
        placeholderLayer?.removeFromSuperlayer()
        placeholderLayer = nil
        guard let hash, let img = ThumbHashDecoder.decodeIfAvailable(hash) else { return }
        installPlaceholder(contents: CanvasImageOrientation.displayCGImage(img))
    }

    /// Le voile d'attente sous le player : un ThumbHash, ou l'affiche qui le remplace.
    @MainActor
    func installPlaceholder(contents: Any?) {
        if let existing = placeholderLayer {
            existing.contents = contents
            return
        }
        let placeholder = CALayer()
        placeholder.frame = bounds
        placeholder.contents = contents
        placeholder.contentsGravity = .resizeAspectFill
        placeholder.masksToBounds = true
        // Insert sous l'AVPlayerLayer (placeholderLayer = z minimum). Si
        // l'AVPlayerLayer existe déjà, on insert juste en-dessous.
        if let pl = avPlayerLayer {
            insertSublayer(placeholder, below: pl)
        } else {
            addSublayer(placeholder)
        }
        placeholderLayer = placeholder
    }

    @MainActor
    func fadeOutPlaceholder(duration: TimeInterval) {
        guard let layer = placeholderLayer else { return }
        CATransaction.begin()
        CATransaction.setAnimationDuration(duration)
        CATransaction.setCompletionBlock { [weak self] in
            self?.placeholderLayer?.removeFromSuperlayer()
            self?.placeholderLayer = nil
        }
        layer.opacity = 0
        CATransaction.commit()
    }
}
