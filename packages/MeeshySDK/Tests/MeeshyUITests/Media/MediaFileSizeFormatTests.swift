import Testing
import Foundation
@testable import MeeshyUI

/// `formatMediaFileSize` is the single SDK-wide byte-size formatter: download
/// badges (image/video), the audio play-button label and upload progress all
/// render through it so a given byte count reads identically everywhere.
/// Before this, the SDK's `AudioPlayerView.formatBytes` used a binary
/// (1024-based) `ByteCountFormatter` while the app hand-rolled a decimal
/// (1000-based) `.formatted(.byteCount(style: .file))` in two separate
/// places — behind a comment that falsely claimed the two matched.
struct MediaFileSizeFormatTests {

    @Test func formatMediaFileSize_returnsNonEmpty_forPositive() {
        #expect(!formatMediaFileSize(870_400).isEmpty)
    }

    @Test func audioPlayerView_formatBytes_delegatesToSharedHelper() {
        // Locks the delegation: AudioPlayerView.formatBytes must never diverge
        // from the single SDK-wide helper again.
        #expect(AudioPlayerView.formatBytes(870_400) == formatMediaFileSize(870_400))
        #expect(AudioPlayerView.formatBytes(1_048_576) == formatMediaFileSize(1_048_576))
    }
}
