import SwiftUI
import MeeshySDK

// MARK: - Audio Player View

extension AudioPlayerView {
    /// Pure helper testable : retourne la taille formatée (« 850 KB ») ou ""
    /// quand `fileSize` est 0 (inconnu).
    nonisolated public static func formattedNeedsDownloadLabel(fileSize: Int) -> String {
        guard fileSize > 0 else { return "" }
        return AudioPlayerView.formatBytes(Int64(fileSize))
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
        let left = AudioPlayerView.formatBytes(downloadedBytes)
        let right = total > 0 ? AudioPlayerView.formatBytes(total) : "?"
        return "\(left) / \(right)"
    }

    /// Delegates to the single SDK-wide `formatMediaFileSize` helper so the
    /// audio play-button label, the download badges (image/video) and the
    /// upload progress bar always render the exact same string for the same
    /// byte count. Previously this used its own binary (1024-based)
    /// `ByteCountFormatter` while the app's `AttachmentDownloader.fmt` used a
    /// decimal (1000-based) one — despite a comment claiming they matched.
    nonisolated public static func formatBytes(_ bytes: Int64) -> String {
        formatMediaFileSize(bytes)
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
