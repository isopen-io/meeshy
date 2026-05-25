import Testing
import Foundation
@testable import MeeshyUI

/// Pure helpers tests for AudioPlayerView's size labels rendered under the
/// play-button circle. The visual rendering itself is covered by the iOS
/// QA smoke (Lot E); these tests lock the formatting contract.
struct AudioPlayerViewLabelTests {

    @Test func needsDownload_showsFormattedSize_whenFileSizeKnown() {
        let expected = AudioPlayerView.formatBytes(870_400)
        let label = AudioPlayerView.formattedNeedsDownloadLabel(fileSize: 870_400)
        #expect(label == expected)
        #expect(!label.isEmpty)
    }

    @Test func needsDownload_isEmpty_whenFileSizeIsZero() {
        let label = AudioPlayerView.formattedNeedsDownloadLabel(fileSize: 0)
        #expect(label == "")
    }

    @Test func downloading_showsDownloadedOverTotal_whenBothKnown() {
        let total = AudioPlayerView.formatBytes(870_400)
        let downloaded = AudioPlayerView.formatBytes(408_000)
        let label = AudioPlayerView.formattedDownloadingLabel(
            downloadedBytes: 408_000, totalBytes: 870_400, fallbackFileSize: 0
        )
        #expect(label == "\(downloaded) / \(total)")
    }

    @Test func downloading_fallsBackToFileSize_whenTotalBytesUnknown() {
        let label = AudioPlayerView.formattedDownloadingLabel(
            downloadedBytes: 100_000, totalBytes: 0, fallbackFileSize: 870_400
        )
        let downloaded = AudioPlayerView.formatBytes(100_000)
        let total = AudioPlayerView.formatBytes(870_400)
        #expect(label == "\(downloaded) / \(total)")
    }

    @Test func downloading_isEmpty_whenAllSizesAreZero() {
        let label = AudioPlayerView.formattedDownloadingLabel(
            downloadedBytes: 0, totalBytes: 0, fallbackFileSize: 0
        )
        #expect(label == "")
    }

    @Test func formatBytes_returnsNonEmpty_forPositive() {
        let s = AudioPlayerView.formatBytes(1_048_576)
        #expect(!s.isEmpty)
    }
}
