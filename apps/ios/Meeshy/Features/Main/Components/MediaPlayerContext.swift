import SwiftUI

// ============================================================================
// MARK: - Media Player Context
// ============================================================================

/// Defines WHERE the media component is used — each context has different
/// features, size, interactions and capabilities.
enum MediaPlayerContext: Equatable {
    /// Inside a message bubble — compact, read-only, inline play
    case messageBubble
    /// In the composer attachment zone — editable, deletable, preview before send
    case composerAttachment
    /// In a feed/post card — full width, social actions (like, share)
    case feedPost
    /// In a story overlay — dark, immersive, auto-play
    case storyOverlay
    /// Expanded fullscreen viewer — all controls, zoom/scrub/share
    case fullscreen

    var isCompact: Bool { self == .messageBubble }
    var isEditable: Bool { self == .composerAttachment }
    var showsSocialActions: Bool { self == .feedPost }
    var isImmersive: Bool { self == .storyOverlay || self == .fullscreen }
    var showsDeleteButton: Bool { self == .composerAttachment }
    var cornerRadius: CGFloat {
        switch self {
        case .messageBubble: return 14
        case .composerAttachment: return 12
        case .feedPost: return 18
        case .storyOverlay: return 0
        case .fullscreen: return 0
        }
    }
}

// ============================================================================
// MARK: - Composer Mode
// ============================================================================

/// Defines WHAT the UniversalComposerBar is being used for.
/// Each mode adjusts: placeholder, limits, send label, attachment rules.
enum ComposerMode: Equatable {
    case message         // Conversation message
    case post            // Feed post (long form)
    case status          // Status update (short)
    case story           // Story reply/comment
    case comment         // Comment on a post
    case caption         // Caption on media

    var placeholder: String {
        switch self {
        case .message: return "Message..."
        case .post: return "Quoi de neuf ?"
        case .status: return "Votre statut..."
        case .story: return "Répondre..."
        case .comment: return "Commenter..."
        case .caption: return "Ajouter une légende..."
        }
    }

    var maxLength: Int? {
        switch self {
        case .message: return nil
        case .post: return 5000
        case .status: return 500
        case .story: return 1000
        case .comment: return 2000
        case .caption: return 500
        }
    }

    var showVoice: Bool {
        switch self {
        case .message, .story: return true
        default: return false
        }
    }

    var showAttachment: Bool {
        switch self {
        case .message, .post: return true
        default: return false
        }
    }

    var showLanguageSelector: Bool {
        switch self {
        case .message: return true
        default: return false
        }
    }

    var sendIcon: String {
        switch self {
        case .post: return "arrow.up.circle.fill"
        default: return "paperplane.fill"
        }
    }
}

// ============================================================================
// MARK: - Playback Speed
// ============================================================================

enum PlaybackSpeed: Double, CaseIterable {
    case x0_8  = 0.8
    case x0_9  = 0.9
    case x1_0  = 1.0
    case x1_25 = 1.25
    case x1_5  = 1.5
    case x1_75 = 1.75
    case x2_0  = 2.0
    case x2_25 = 2.25

    var label: String {
        switch self {
        case .x0_8:  return "0.8×"
        case .x0_9:  return "0.9×"
        case .x1_0:  return "1×"
        case .x1_25: return "1.25×"
        case .x1_5:  return "1.5×"
        case .x1_75: return "1.75×"
        case .x2_0:  return "2×"
        case .x2_25: return "2.25×"
        }
    }

    /// Circular cycle on tap
    func next() -> PlaybackSpeed {
        let all = PlaybackSpeed.allCases
        guard let idx = all.firstIndex(of: self) else { return .x1_0 }
        return all[(idx + 1) % all.count]
    }
}

// ============================================================================
// MARK: - Transcription Display Segment
// ============================================================================

struct TranscriptionDisplaySegment: Identifiable {
    let id = UUID()
    let text: String
    let startTime: Double
    let endTime: Double
    let speakerId: String?
    let speakerColor: String

    static let speakerPalette = ["08D9D6", "FF6B6B", "9B59B6", "F8B500", "2ECC71", "E91E63", "3498DB", "FF7F50"]

    static func from(_ segment: MessageTranscriptionSegment, speakerIndex: Int = 0) -> TranscriptionDisplaySegment {
        TranscriptionDisplaySegment(
            text: segment.text,
            startTime: segment.startTime ?? 0,
            endTime: segment.endTime ?? 0,
            speakerId: segment.speakerId,
            speakerColor: speakerPalette[speakerIndex % speakerPalette.count]
        )
    }

    /// Build display segments from a MessageTranscription
    static func buildFrom(_ transcription: MessageTranscription) -> [TranscriptionDisplaySegment] {
        var speakerMap: [String: Int] = [:]
        var nextIndex = 0
        return transcription.segments.map { seg in
            let sid = seg.speakerId ?? "default"
            if speakerMap[sid] == nil {
                speakerMap[sid] = nextIndex
                nextIndex += 1
            }
            return TranscriptionDisplaySegment.from(seg, speakerIndex: speakerMap[sid] ?? 0)
        }
    }
}

// ============================================================================
// MARK: - Clipboard Content Model
// ============================================================================

struct ClipboardContent: Identifiable, Equatable {
    let id: String
    let text: String
    let truncatedPreview: String
    let charCount: Int
    let createdAt: Date

    init(text: String) {
        self.id = "clipboard-\(Int(Date().timeIntervalSince1970 * 1000))"
        self.text = text
        self.charCount = text.count
        self.truncatedPreview = String(text.prefix(200)) + (text.count > 200 ? "..." : "")
        self.createdAt = Date()
    }

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.id == rhs.id }
}

// ============================================================================
// MARK: - Helper: Format duration
// ============================================================================

func formatMediaDuration(_ seconds: TimeInterval) -> String {
    let mins = Int(seconds) / 60
    let secs = Int(seconds) % 60
    return String(format: "%d:%02d", mins, secs)
}

func formatMediaDurationMs(_ ms: Int) -> String {
    formatMediaDuration(Double(ms) / 1000.0)
}
