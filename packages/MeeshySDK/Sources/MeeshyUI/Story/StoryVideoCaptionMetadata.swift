import Foundation
import MeeshySDK

/// Captions metadata attached to a story foreground video by the in-app
/// video editor (`MeeshyVideoEditorView`).
///
/// **Lifecycle** — created by `StoryComposerView` when
/// `MeeshyVideoEditorView` returns a `VideoEditResult` that contains a
/// non-empty `captions` array (the user transcribed the clip). Stored in
/// `StoryComposerViewModel.loadedVideoCaptions[mediaObjectId]`. Read by
/// downstream surfaces — story canvas overlay, exporter — to render the
/// captions on top of the video clip at render time.
///
/// **Why a dedicated struct** vs. reusing `[VideoCaption]` directly :
/// language + transcription text are also useful at render time
/// (subtitle alternatives, accessibility) and travel as a single unit
/// through the composer → renderer pipeline.
public struct StoryVideoCaptionMetadata: Equatable, Sendable {
    /// Time-aligned segments produced by `EdgeTranscriptionService`,
    /// bucketed to fit subtitle line lengths. Times are in **edited
    /// timeline** seconds (already mapped through `editedTime(for:)` —
    /// safe to overlay directly on `AVPlayer.currentTime()`).
    public let captions: [VideoCaption]

    /// Full transcription text — single string, useful for accessibility
    /// labels and metadata indexing.
    public let transcriptionText: String?

    /// ISO language code (e.g. `"fr"`, `"en"`) the audio was transcribed
    /// from. Drives the Prisme Linguistique translation pipeline when
    /// viewers request the subtitles in another language.
    public let languageCode: String?

    public init(
        captions: [VideoCaption],
        transcriptionText: String?,
        languageCode: String?
    ) {
        self.captions = captions
        self.transcriptionText = transcriptionText
        self.languageCode = languageCode
    }

    /// Equality by **content** — two metadatas are equal when their
    /// captions describe the same segments (start, end, text) in the
    /// same order, regardless of the random `VideoCaption.id` minted at
    /// transcription time. Without this, every re-transcription would
    /// produce a "different" metadata even when nothing semantically
    /// changed, breaking SwiftUI's `.onChange` diffing and tripping
    /// optimistic-update reconciliation.
    public static func == (lhs: StoryVideoCaptionMetadata, rhs: StoryVideoCaptionMetadata) -> Bool {
        guard lhs.languageCode == rhs.languageCode,
              lhs.transcriptionText == rhs.transcriptionText,
              lhs.captions.count == rhs.captions.count else {
            return false
        }
        return zip(lhs.captions, rhs.captions).allSatisfy { a, b in
            a.start == b.start && a.end == b.end && a.text == b.text
        }
    }
}
