import SwiftUI
import MeeshySDK

// MARK: - Media Player Context

public enum MediaPlayerContext: Equatable {
    case messageBubble
    case composerAttachment
    case feedPost
    case storyOverlay
    case fullscreen

    public var isCompact: Bool { self == .messageBubble }
    public var isEditable: Bool { self == .composerAttachment }
    public var showsSocialActions: Bool { self == .feedPost }
    public var isImmersive: Bool { self == .storyOverlay || self == .fullscreen }
    public var showsDeleteButton: Bool { self == .composerAttachment }
    public var cornerRadius: CGFloat {
        switch self {
        case .messageBubble: return 14
        case .composerAttachment: return 12
        case .feedPost: return 18
        case .storyOverlay: return 0
        case .fullscreen: return 0
        }
    }
}

// MARK: - Composer Mode

public enum ComposerMode: Equatable {
    case message
    case post
    case status
    case story
    case comment
    case caption

    public var placeholder: String {
        switch self {
        case .message: return "Message..."
        case .post: return "Quoi de neuf ?"
        case .status: return "Votre statut..."
        case .story: return "R\u{00E9}pondre..."
        case .comment: return "Commenter..."
        case .caption: return "Ajouter une l\u{00E9}gende..."
        }
    }

    public var maxLength: Int? {
        switch self {
        case .message: return nil
        case .post: return 5000
        case .status: return 500
        case .story: return 1000
        case .comment: return 2000
        case .caption: return 500
        }
    }

    public var showVoice: Bool {
        switch self {
        case .message, .story: return true
        default: return false
        }
    }

    public var showAttachment: Bool {
        switch self {
        case .message, .post: return true
        default: return false
        }
    }

    public var showLanguageSelector: Bool {
        switch self {
        case .message: return true
        default: return false
        }
    }

    public var sendIcon: String {
        switch self {
        case .post: return "arrow.up.circle.fill"
        default: return "paperplane.fill"
        }
    }
}

// MARK: - Playback Speed

public enum PlaybackSpeed: Double, CaseIterable {
    case x0_8  = 0.8
    case x0_9  = 0.9
    case x1_0  = 1.0
    case x1_25 = 1.25
    case x1_5  = 1.5
    case x1_75 = 1.75
    case x2_0  = 2.0
    case x2_25 = 2.25

    public var label: String {
        switch self {
        case .x0_8:  return "0.8\u{00D7}"
        case .x0_9:  return "0.9\u{00D7}"
        case .x1_0:  return "1\u{00D7}"
        case .x1_25: return "1.25\u{00D7}"
        case .x1_5:  return "1.5\u{00D7}"
        case .x1_75: return "1.75\u{00D7}"
        case .x2_0:  return "2\u{00D7}"
        case .x2_25: return "2.25\u{00D7}"
        }
    }

    public func next() -> PlaybackSpeed {
        let all = PlaybackSpeed.allCases
        guard let idx = all.firstIndex(of: self) else { return .x1_0 }
        return all[(idx + 1) % all.count]
    }
}

// MARK: - Transcription Display Segment

public struct TranscriptionDisplaySegment: Identifiable {
    public let id = UUID()
    public let text: String
    public let startTime: Double
    public let endTime: Double
    public let speakerId: String?
    public let speakerColor: String

    public init(text: String, startTime: Double, endTime: Double, speakerId: String?, speakerColor: String) {
        self.text = text; self.startTime = startTime; self.endTime = endTime
        self.speakerId = speakerId; self.speakerColor = speakerColor
    }

    public static let speakerPalette = ["08D9D6", "FF6B6B", "9B59B6", "F8B500", "2ECC71", "E91E63", "3498DB", "FF7F50"]

    public static func from(_ segment: MessageTranscriptionSegment, speakerIndex: Int = 0) -> TranscriptionDisplaySegment {
        TranscriptionDisplaySegment(
            text: segment.text,
            startTime: segment.startTime ?? 0,
            endTime: segment.endTime ?? 0,
            speakerId: segment.speakerId,
            speakerColor: speakerPalette[speakerIndex % speakerPalette.count]
        )
    }

    public static func buildFrom(_ transcription: MessageTranscription) -> [TranscriptionDisplaySegment] {
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

// MARK: - Document Media Type

public enum DocumentMediaType {
    case pdf, pptx, spreadsheet, generic

    public var icon: String {
        switch self {
        case .pdf: return "doc.richtext"
        case .pptx: return "rectangle.on.rectangle.angled"
        case .spreadsheet: return "tablecells"
        case .generic: return "doc.fill"
        }
    }

    public var label: String {
        switch self {
        case .pdf: return "PDF"
        case .pptx: return "Pr\u{00E9}sentation"
        case .spreadsheet: return "Tableur"
        case .generic: return "Document"
        }
    }

    public var color: String {
        switch self {
        case .pdf: return "EF4444"
        case .pptx: return "F59E0B"
        case .spreadsheet: return "22C55E"
        case .generic: return "3B82F6"
        }
    }

    public static func detect(from attachment: MeeshyMessageAttachment) -> DocumentMediaType {
        let mime = attachment.mimeType.lowercased()
        let name = attachment.originalName.lowercased()
        if mime.contains("pdf") || name.hasSuffix(".pdf") { return .pdf }
        if mime.contains("presentation") || mime.contains("pptx") ||
            name.hasSuffix(".pptx") || name.hasSuffix(".ppt") { return .pptx }
        if mime.contains("spreadsheet") || mime.contains("excel") || mime.contains("csv") ||
            name.hasSuffix(".xlsx") || name.hasSuffix(".xls") || name.hasSuffix(".csv") { return .spreadsheet }
        return .generic
    }
}

// MARK: - Format Helpers

public func formatMediaDuration(_ seconds: TimeInterval) -> String {
    let mins = Int(seconds) / 60
    let secs = Int(seconds) % 60
    return String(format: "%d:%02d", mins, secs)
}

public func formatMediaDurationMs(_ ms: Int) -> String {
    formatMediaDuration(Double(ms) / 1000.0)
}
