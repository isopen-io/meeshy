import AVFoundation
import CoreGraphics

public extension AVURLAsset {
    /// Loads the first video track and returns the size at which the video is meant to
    /// be displayed (with rotation from `preferredTransform` applied). Returns `nil` if
    /// no video track is available or the metadata can't be read.
    ///
    /// Used by media compression and aspect-ratio-aware UI to share a single source of
    /// truth for "what does this video actually look like on screen".
    static func naturalDisplaySize(of url: URL) async throws -> CGSize? {
        let asset = AVURLAsset(url: url)
        let tracks = try await asset.loadTracks(withMediaType: .video)
        guard let track = tracks.first else { return nil }
        let natural = try await track.load(.naturalSize)
        let transform = try await track.load(.preferredTransform)
        let isPortrait = abs(transform.b) == 1 && abs(transform.c) == 1
        return isPortrait
            ? CGSize(width: natural.height, height: natural.width)
            : natural
    }
}
