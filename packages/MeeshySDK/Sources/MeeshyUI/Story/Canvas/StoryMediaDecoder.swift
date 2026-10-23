import Foundation
import UIKit
import MeeshySDK

/// Hardware-accelerated media decode utilities for the Story canvas.
/// La première image passe par `VideoThumbnailGenerator` (#11844), le
/// générateur unique du dépôt (décodage VideoToolbox, cache borné).
/// Target latency: < 100 ms on iPhone SE 3 for a 4K source.
public enum StoryMediaDecoder {

    /// Returns the first frame of a video as `UIImage`, async.
    /// `maxDimension` (optional) caps the longest edge — preserves the
    /// memory budget on 4K sources without forcing the caller into a separate
    /// downscaling pass.
    public nonisolated static func firstFrame(of url: URL,
                                              maxDimension: CGFloat? = nil) async throws -> UIImage? {
        await VideoThumbnailGenerator.shared.image(
            for: .firstFrame(of: url, maxDimension: maxDimension, tolerance: .exact))
    }
}
