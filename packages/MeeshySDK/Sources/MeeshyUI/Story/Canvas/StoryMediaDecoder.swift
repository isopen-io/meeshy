import AVFoundation
import UIKit

/// Hardware-accelerated media decode utilities for the Story canvas.
/// Wraps `AVAssetImageGenerator` (which uses VideoToolbox HW decode under the
/// hood when available) for fast first-frame extraction on media drop.
/// Target latency: < 100 ms on iPhone SE 3 for a 4K source.
public enum StoryMediaDecoder {

    /// Returns the first frame of a video as `UIImage`, async.
    /// `maxDimension` (optional) caps the longest edge — preserves the
    /// memory budget on 4K sources without forcing the caller into a separate
    /// downscaling pass.
    public nonisolated static func firstFrame(of url: URL,
                                              maxDimension: CGFloat? = nil) async throws -> UIImage? {
        let asset = AVURLAsset(url: url)
        let imageGenerator = AVAssetImageGenerator(asset: asset)
        imageGenerator.appliesPreferredTrackTransform = true
        imageGenerator.requestedTimeToleranceBefore = .zero
        imageGenerator.requestedTimeToleranceAfter  = .zero
        if let dim = maxDimension {
            imageGenerator.maximumSize = CGSize(width: dim, height: dim)
        }
        // iOS 16+ async API. The generator dispatches to VideoToolbox HW decode
        // automatically when the codec/profile is supported by the device.
        let cgImage = try await imageGenerator.image(at: .zero).image
        return UIImage(cgImage: cgImage)
    }
}
