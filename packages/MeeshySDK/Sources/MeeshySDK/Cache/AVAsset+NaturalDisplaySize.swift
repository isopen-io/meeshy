import AVFoundation
import CoreGraphics

public extension AVAssetTrack {
    /// Returns the size at which this video track is meant to be displayed (with rotation
    /// from `preferredTransform` applied). Uses the cardinal-rotation idiom — same as
    /// AVFoundation's own video orientation handling — rather than `size.applying(transform)`,
    /// to match what the rest of the codebase expects (see `MediaCompressor.compressVideo`).
    func naturalDisplaySize() async throws -> CGSize {
        let natural = try await load(.naturalSize)
        let transform = try await load(.preferredTransform)
        let isPortrait = abs(transform.b) == 1 && abs(transform.c) == 1
        return isPortrait
            ? CGSize(width: natural.height, height: natural.width)
            : natural
    }
}

public extension AVURLAsset {
    /// Loads the first video track and returns its natural display size. Returns `nil` if
    /// no video track is available. Callers that also need other track metadata (frame
    /// rate, codec, etc.) should load the track themselves and use
    /// `AVAssetTrack.naturalDisplaySize()` directly to avoid loading tracks twice.
    static func naturalDisplaySize(of url: URL) async throws -> CGSize? {
        let asset = AVURLAsset(url: url)
        let tracks = try await asset.loadTracks(withMediaType: .video)
        guard let track = tracks.first else { return nil }
        return try await track.naturalDisplaySize()
    }
}
