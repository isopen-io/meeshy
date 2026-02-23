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
    case pdf, pptx, spreadsheet, code(CodeLanguage), generic

    public var icon: String {
        switch self {
        case .pdf: return "doc.richtext"
        case .pptx: return "rectangle.on.rectangle.angled"
        case .spreadsheet: return "tablecells"
        case .code: return "chevron.left.forwardslash.chevron.right"
        case .generic: return "doc.fill"
        }
    }

    public var label: String {
        switch self {
        case .pdf: return "PDF"
        case .pptx: return "Pr\u{00E9}sentation"
        case .spreadsheet: return "Tableur"
        case .code(let lang): return lang.displayName
        case .generic: return "Document"
        }
    }

    public var color: String {
        switch self {
        case .pdf: return "EF4444"
        case .pptx: return "F59E0B"
        case .spreadsheet: return "22C55E"
        case .code(let lang): return lang.color
        case .generic: return "3B82F6"
        }
    }

    public var isCode: Bool {
        if case .code = self { return true }
        return false
    }

    public static func detect(from attachment: MeeshyMessageAttachment) -> DocumentMediaType {
        let mime = attachment.mimeType.lowercased()
        let name = attachment.originalName.lowercased()
        if mime.contains("pdf") || name.hasSuffix(".pdf") { return .pdf }
        if mime.contains("presentation") || mime.contains("pptx") ||
            name.hasSuffix(".pptx") || name.hasSuffix(".ppt") { return .pptx }
        if mime.contains("spreadsheet") || mime.contains("excel") || mime.contains("csv") ||
            name.hasSuffix(".xlsx") || name.hasSuffix(".xls") || name.hasSuffix(".csv") { return .spreadsheet }
        if let lang = CodeLanguage.detect(fileName: name, mimeType: mime) { return .code(lang) }
        return .generic
    }
}

// MARK: - Code Language Detection

public enum CodeLanguage: String, CaseIterable {
    case python, javascript, typescript, swift, c, cpp, java, go, rust
    case ruby, php, shell, css, html, json, yaml, xml, sql
    case markdown, kotlin, scala, dart, lua, perl, r, objectiveC
    case dockerfile, makefile, toml, ini, graphql, protobuf

    public var displayName: String {
        switch self {
        case .python: return "Python"
        case .javascript: return "JavaScript"
        case .typescript: return "TypeScript"
        case .swift: return "Swift"
        case .c: return "C"
        case .cpp: return "C++"
        case .java: return "Java"
        case .go: return "Go"
        case .rust: return "Rust"
        case .ruby: return "Ruby"
        case .php: return "PHP"
        case .shell: return "Shell"
        case .css: return "CSS"
        case .html: return "HTML"
        case .json: return "JSON"
        case .yaml: return "YAML"
        case .xml: return "XML"
        case .sql: return "SQL"
        case .markdown: return "Markdown"
        case .kotlin: return "Kotlin"
        case .scala: return "Scala"
        case .dart: return "Dart"
        case .lua: return "Lua"
        case .perl: return "Perl"
        case .r: return "R"
        case .objectiveC: return "Obj-C"
        case .dockerfile: return "Dockerfile"
        case .makefile: return "Makefile"
        case .toml: return "TOML"
        case .ini: return "INI"
        case .graphql: return "GraphQL"
        case .protobuf: return "Protobuf"
        }
    }

    public var color: String {
        switch self {
        case .python: return "3776AB"
        case .javascript: return "F7DF1E"
        case .typescript: return "3178C6"
        case .swift: return "F05138"
        case .c: return "555555"
        case .cpp: return "00599C"
        case .java: return "ED8B00"
        case .go: return "00ADD8"
        case .rust: return "DEA584"
        case .ruby: return "CC342D"
        case .php: return "777BB4"
        case .shell: return "4EAA25"
        case .css: return "1572B6"
        case .html: return "E34F26"
        case .json: return "292929"
        case .yaml: return "CB171E"
        case .xml: return "0060AC"
        case .sql: return "E38C00"
        case .markdown: return "083FA1"
        case .kotlin: return "7F52FF"
        case .scala: return "DC322F"
        case .dart: return "0175C2"
        case .lua: return "000080"
        case .perl: return "39457E"
        case .r: return "276DC3"
        case .objectiveC: return "438EFF"
        case .dockerfile: return "2496ED"
        case .makefile: return "427819"
        case .toml: return "9C4121"
        case .ini: return "6D8086"
        case .graphql: return "E10098"
        case .protobuf: return "4285F4"
        }
    }

    public var highlightJsName: String {
        switch self {
        case .python: return "python"
        case .javascript: return "javascript"
        case .typescript: return "typescript"
        case .swift: return "swift"
        case .c: return "c"
        case .cpp: return "cpp"
        case .java: return "java"
        case .go: return "go"
        case .rust: return "rust"
        case .ruby: return "ruby"
        case .php: return "php"
        case .shell: return "bash"
        case .css: return "css"
        case .html: return "xml"
        case .json: return "json"
        case .yaml: return "yaml"
        case .xml: return "xml"
        case .sql: return "sql"
        case .markdown: return "markdown"
        case .kotlin: return "kotlin"
        case .scala: return "scala"
        case .dart: return "dart"
        case .lua: return "lua"
        case .perl: return "perl"
        case .r: return "r"
        case .objectiveC: return "objectivec"
        case .dockerfile: return "dockerfile"
        case .makefile: return "makefile"
        case .toml: return "ini"
        case .ini: return "ini"
        case .graphql: return "graphql"
        case .protobuf: return "protobuf"
        }
    }

    private static let extensionMap: [String: CodeLanguage] = {
        var map: [String: CodeLanguage] = [:]
        let pairs: [(CodeLanguage, [String])] = [
            (.python, ["py", "pyw", "pyi"]),
            (.javascript, ["js", "mjs", "cjs", "jsx"]),
            (.typescript, ["ts", "tsx", "mts", "cts"]),
            (.swift, ["swift"]),
            (.c, ["c", "h"]),
            (.cpp, ["cpp", "cc", "cxx", "hpp", "hxx", "hh"]),
            (.java, ["java"]),
            (.go, ["go"]),
            (.rust, ["rs"]),
            (.ruby, ["rb", "gemspec"]),
            (.php, ["php"]),
            (.shell, ["sh", "bash", "zsh", "fish", "ksh"]),
            (.css, ["css", "scss", "sass", "less"]),
            (.html, ["html", "htm", "xhtml"]),
            (.json, ["json", "jsonc", "json5"]),
            (.yaml, ["yaml", "yml"]),
            (.xml, ["xml", "xsl", "xsd", "svg", "plist"]),
            (.sql, ["sql"]),
            (.markdown, ["md", "mdx", "markdown"]),
            (.kotlin, ["kt", "kts"]),
            (.scala, ["scala", "sc"]),
            (.dart, ["dart"]),
            (.lua, ["lua"]),
            (.perl, ["pl", "pm"]),
            (.r, ["r", "rmd"]),
            (.objectiveC, ["m", "mm"]),
            (.toml, ["toml"]),
            (.ini, ["ini", "cfg", "conf"]),
            (.graphql, ["graphql", "gql"]),
            (.protobuf, ["proto"]),
        ]
        for (lang, exts) in pairs {
            for ext in exts { map[ext] = lang }
        }
        return map
    }()

    private static let mimeMap: [String: CodeLanguage] = [
        "text/x-python": .python,
        "application/javascript": .javascript, "text/javascript": .javascript,
        "application/typescript": .typescript, "text/typescript": .typescript,
        "text/x-swift": .swift,
        "text/x-c": .c, "text/x-csrc": .c,
        "text/x-c++": .cpp, "text/x-c++src": .cpp,
        "text/x-java": .java, "text/x-java-source": .java,
        "text/x-go": .go,
        "text/x-rustsrc": .rust,
        "text/x-ruby": .ruby, "application/x-ruby": .ruby,
        "application/x-php": .php, "text/x-php": .php,
        "application/x-sh": .shell, "text/x-shellscript": .shell,
        "text/css": .css,
        "text/html": .html,
        "application/json": .json,
        "text/yaml": .yaml, "application/x-yaml": .yaml,
        "text/xml": .xml, "application/xml": .xml,
        "application/sql": .sql,
        "text/markdown": .markdown,
    ]

    private static let fileNameMap: [String: CodeLanguage] = [
        "dockerfile": .dockerfile,
        "makefile": .makefile,
        "gnumakefile": .makefile,
        "rakefile": .ruby,
        "gemfile": .ruby,
        "podfile": .ruby,
        ".bashrc": .shell, ".zshrc": .shell, ".bash_profile": .shell,
        ".gitignore": .ini,
        ".env": .ini,
        ".editorconfig": .ini,
    ]

    public static func detect(fileName: String, mimeType: String) -> CodeLanguage? {
        let lower = fileName.lowercased()

        if let lang = fileNameMap[lower] { return lang }

        let baseName = (lower as NSString).lastPathComponent
        if let lang = fileNameMap[baseName] { return lang }

        if let dotIdx = lower.lastIndex(of: ".") {
            let ext = String(lower[lower.index(after: dotIdx)...])
            if let lang = extensionMap[ext] { return lang }
        }

        if let lang = mimeMap[mimeType.lowercased()] { return lang }

        if mimeType.hasPrefix("text/x-") || mimeType.hasPrefix("application/x-") {
            return nil
        }

        return nil
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
