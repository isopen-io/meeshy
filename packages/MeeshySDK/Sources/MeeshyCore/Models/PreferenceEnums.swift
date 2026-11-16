import Foundation

// MARK: - Preference Category

public enum PreferenceCategory: String, CaseIterable, Codable, Sendable {
    case privacy, audio, message, notification, video, document, application
}

// MARK: - Enums

public enum EncryptionPreference: String, Codable, CaseIterable, Sendable {
    case disabled, optional, always
}

public enum AudioQuality: String, Codable, CaseIterable, Sendable {
    case low, medium, high, lossless
}

public enum TranscriptionSource: String, Codable, CaseIterable, Sendable {
    case auto, mobile, server
}

public enum TranslatedAudioFormat: String, Codable, CaseIterable, Sendable {
    case mp3, wav, ogg
}

public enum VoiceCloneQuality: String, Codable, CaseIterable, Sendable {
    case fast, balanced, quality
}

public enum VideoQuality: String, Codable, CaseIterable, Sendable {
    case low, medium, high, auto
}

public enum VideoFrameRate: String, Codable, CaseIterable, Sendable {
    case fps15 = "15"
    case fps24 = "24"
    case fps30 = "30"
    case fps60 = "60"
}

public enum VideoResolution: String, Codable, CaseIterable, Sendable {
    case r480p = "480p"
    case r720p = "720p"
    case r1080p = "1080p"
    case auto
}

public enum VideoCodec: String, Codable, CaseIterable, Sendable {
    case vp8 = "VP8"
    case vp9 = "VP9"
    case h264 = "H264"
    case h265 = "H265"
    case av1 = "AV1"
}

public enum VideoLayout: String, Codable, CaseIterable, Sendable {
    case grid, speaker, sidebar
}

public enum SelfViewPosition: String, Codable, CaseIterable, Sendable {
    case topLeft = "top-left"
    case topRight = "top-right"
    case bottomLeft = "bottom-left"
    case bottomRight = "bottom-right"
}

public enum EmojiSkinTone: String, Codable, CaseIterable, Sendable {
    case `default`, light, mediumLight = "medium-light", medium, mediumDark = "medium-dark", dark
}

public enum FontSize: String, Codable, CaseIterable, Sendable {
    case small, medium, large
}

public enum TextAlign: String, Codable, CaseIterable, Sendable {
    case left, center, right
}

public enum AppThemeMode: String, Codable, CaseIterable, Sendable {
    case light, dark, auto
}

public enum LineHeight: String, Codable, CaseIterable, Sendable {
    case tight, normal, relaxed, loose
}

public enum SidebarPosition: String, Codable, CaseIterable, Sendable {
    case left, right
}

public enum DndDay: String, Codable, CaseIterable, Sendable {
    case mon, tue, wed, thu, fri, sat, sun

    /// Map from `Calendar.Component.weekday` (1 = Sunday … 7 = Saturday).
    public static func fromCalendarWeekday(_ weekday: Int) -> DndDay? {
        switch weekday {
        case 1: return .sun
        case 2: return .mon
        case 3: return .tue
        case 4: return .wed
        case 5: return .thu
        case 6: return .fri
        case 7: return .sat
        default: return nil
        }
    }
}
