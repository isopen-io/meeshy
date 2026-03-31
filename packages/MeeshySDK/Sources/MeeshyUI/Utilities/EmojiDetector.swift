import SwiftUI

// MARK: - EmojiDetector

public enum EmojiDetector {

    public enum EmojiOnlyResult: Equatable {
        case single
        case double
        case triple
        case notEmojiOnly

        public var fontSize: CGFloat? {
            switch self {
            case .single: return 90
            case .double: return 60
            case .triple: return 45
            case .notEmojiOnly: return nil
            }
        }
    }

    public static func analyze(_ text: String) -> EmojiOnlyResult {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .notEmojiOnly }

        let characters = Array(trimmed)
        guard characters.count <= 3, characters.allSatisfy(\.isEmoji) else {
            return .notEmojiOnly
        }

        switch characters.count {
        case 1: return .single
        case 2: return .double
        case 3: return .triple
        default: return .notEmojiOnly
        }
    }
}

// MARK: - Character Emoji Detection

private extension Character {
    var isEmoji: Bool {
        guard let firstScalar = unicodeScalars.first else { return false }
        if firstScalar.properties.isEmoji && firstScalar.properties.isEmojiPresentation {
            return true
        }
        if unicodeScalars.count > 1 {
            return unicodeScalars.contains { $0.value == 0xFE0F || $0.value == 0x200D }
                || firstScalar.properties.isEmoji
        }
        return false
    }
}
