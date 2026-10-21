import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Video capture ceiling

/// Video capture/encoding ceiling. Kept as a single source of truth so the
/// camera format picker (`P2PWebRTCClient.selectFormat`) and the encoding
/// config stay in sync when the preset is updated.
struct VideoConfig: Sendable {
    let maxResolution: CGSize
    let maxFrameRate: Int

    static let hd720p30 = VideoConfig(
        maxResolution: CGSize(width: 1280, height: 720),
        maxFrameRate: 30
    )
}
