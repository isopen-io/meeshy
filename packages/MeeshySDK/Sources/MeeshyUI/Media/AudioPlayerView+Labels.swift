import SwiftUI
import MeeshySDK

// MARK: - Audio Player View

extension AudioPlayerView {
    /// Pure helper testable : retourne la taille formatée (« 850 KB ») ou ""
    /// quand `fileSize` est 0 (inconnu).
    nonisolated public static func formattedNeedsDownloadLabel(fileSize: Int) -> String {
        guard fileSize > 0 else { return "" }
        return MediaFormat.bytes(Int64(fileSize))
    }

    /// Pure helper testable : retourne « 398 KB / 850 KB » ou un fallback
    /// quand un des deux côtés est inconnu.
    nonisolated public static func formattedDownloadingLabel(
        downloadedBytes: Int64,
        totalBytes: Int64,
        fallbackFileSize: Int
    ) -> String {
        let total: Int64 = totalBytes > 0 ? totalBytes : Int64(fallbackFileSize)
        if total <= 0 && downloadedBytes <= 0 { return "" }
        let left = MediaFormat.bytes(downloadedBytes)
        let right = total > 0 ? MediaFormat.bytes(total) : "?"
        return "\(left) / \(right)"
    }
}

/// The progress an audio bubble renders, resolved once and shared by the
/// waveform tint, the percentage chip and the elapsed timecode.
/// `isLive` distinguishes a playing engine (full accent) from a persisted
/// at-rest position (attenuated accent).
nonisolated public struct AudioProgressDisplay: Sendable, Equatable {
    public let fraction: Double
    public let elapsed: TimeInterval
    public let isLive: Bool

    public init(fraction: Double, elapsed: TimeInterval, isLive: Bool) {
        self.fraction = fraction
        self.elapsed = elapsed
        self.isLive = isLive
    }
}
