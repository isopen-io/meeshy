import Foundation

// MARK: - Language Display

public struct LanguageDisplay {
    public let code: String
    public let flag: String
    public let name: String
    public let color: String

    public init(code: String, flag: String, name: String, color: String = LanguageDisplay.defaultColor) {
        self.code = code
        self.flag = flag
        self.name = name
        self.color = color
    }

    public static let defaultColor = "6B7280"

    public static func colorHex(for code: String) -> String {
        languages[code.lowercased()]?.color ?? defaultColor
    }

    public static func from(code: String?) -> LanguageDisplay? {
        guard let code = code?.lowercased(), let entry = languages[code] else { return nil }
        return LanguageDisplay(code: code, flag: entry.flag, name: entry.name, color: entry.color)
    }

    /// Curated 18-language picker set for message-translation surfaces
    /// (message detail language explorer + transcription language explorer).
    /// An ordered *view* over `languages` — single source for both the
    /// flag/native-name/color data (`languages`) and the picker's iteration
    /// order — previously copied byte-for-byte across three app-side views
    /// (`MessageDetailSheet`, `MessageLanguageDetailView`,
    /// `MessageTranscriptionDetailView`), each with its own duplicate table.
    public static let translationPickerLanguages: [LanguageDisplay] = {
        let orderedCodes = [
            "fr", "en", "es", "de", "ar", "zh", "pt", "it", "ja",
            "ko", "ru", "hi", "tr", "nl", "pl", "vi", "th", "sv"
        ]
        return orderedCodes.compactMap { LanguageDisplay.from(code: $0) }
    }()

    private static let languages: [String: (flag: String, name: String, color: String)] = [
        "fr": ("🇫🇷", "Français", "5E60CE"),
        "en": ("🇬🇧", "English", "2A9D8F"),
        "es": ("🇪🇸", "Español", "F4A261"),
        "de": ("🇩🇪", "Deutsch", "264653"),
        "it": ("🇮🇹", "Italiano", "E76F51"),
        "pt": ("🇵🇹", "Português", "00B4D8"),
        "nl": ("🇳🇱", "Nederlands", "43AA8B"),
        "pl": ("🇵🇱", "Polski", "4D908E"),
        "ro": ("🇷🇴", "Română", "D63384"),
        "sv": ("🇸🇪", "Svenska", "277DA1"),
        "da": ("🇩🇰", "Dansk", "0D6EFD"),
        "fi": ("🇫🇮", "Suomi", "6610F2"),
        "no": ("🇳🇴", "Norsk", "E07A5F"),
        "cs": ("🇨🇿", "Čeština", "198754"),
        "hu": ("🇭🇺", "Magyar", "FD7E14"),
        "el": ("🇬🇷", "Ελληνικά", "0DCAF0"),
        "bg": ("🇧🇬", "Български", "6F42C1"),
        "hr": ("🇭🇷", "Hrvatski", "20C997"),
        "sk": ("🇸🇰", "Slovenčina", "E35D6A"),
        "sl": ("🇸🇮", "Slovenščina", "FFC107"),
        "et": ("🇪🇪", "Eesti", "6EA8FE"),
        "lv": ("🇱🇻", "Latviešu", "79616F"),
        "lt": ("🇱🇹", "Lietuvių", "ADB5BD"),
        "ga": ("🇮🇪", "Gaeilge", "2B9348"),
        "mt": ("🇲🇹", "Malti", "FF6F61"),
        "ru": ("🇷🇺", "Русский", "7209B7"),
        "uk": ("🇺🇦", "Українська", "FFD166"),
        "ar": ("🇸🇦", "العربية", "E9C46A"),
        "he": ("🇮🇱", "עברית", "118AB2"),
        "tr": ("🇹🇷", "Türkçe", "577590"),
        "ja": ("🇯🇵", "日本語", "F28482"),
        "ko": ("🇰🇷", "한국어", "C1292E"),
        "zh": ("🇨🇳", "中文", "E63946"),
        "hi": ("🇮🇳", "हिन्दी", "F4845F"),
        "bn": ("🇧🇩", "বাংলা", "81B29A"),
        "th": ("🇹🇭", "ไทย", "F9C74F"),
        "vi": ("🇻🇳", "Tiếng Việt", "90BE6D"),
        "id": ("🇮🇩", "Bahasa Indonesia", "F2CC8F"),
        "ms": ("🇲🇾", "Bahasa Melayu", "3D405B"),
        "sw": ("🇰🇪", "Kiswahili", "E63946"),
        "am": ("🇪🇹", "አማርኛ", "B5838D"),
    ]
}
