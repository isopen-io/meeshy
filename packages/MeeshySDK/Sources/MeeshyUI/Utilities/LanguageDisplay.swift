import Foundation

// MARK: - Language Display

public struct LanguageDisplay {
    public let code: String
    public let flag: String
    public let name: String

    public init(code: String, flag: String, name: String) {
        self.code = code
        self.flag = flag
        self.name = name
    }

    public static func from(code: String?) -> LanguageDisplay? {
        guard let code = code?.lowercased(), let entry = languages[code] else { return nil }
        return LanguageDisplay(code: code, flag: entry.flag, name: entry.name)
    }

    private static let languages: [String: (flag: String, name: String)] = [
        "fr": ("🇫🇷", "Français"),
        "en": ("🇬🇧", "English"),
        "es": ("🇪🇸", "Español"),
        "de": ("🇩🇪", "Deutsch"),
        "it": ("🇮🇹", "Italiano"),
        "pt": ("🇵🇹", "Português"),
        "nl": ("🇳🇱", "Nederlands"),
        "pl": ("🇵🇱", "Polski"),
        "ro": ("🇷🇴", "Română"),
        "sv": ("🇸🇪", "Svenska"),
        "da": ("🇩🇰", "Dansk"),
        "fi": ("🇫🇮", "Suomi"),
        "no": ("🇳🇴", "Norsk"),
        "cs": ("🇨🇿", "Čeština"),
        "hu": ("🇭🇺", "Magyar"),
        "el": ("🇬🇷", "Ελληνικά"),
        "bg": ("🇧🇬", "Български"),
        "hr": ("🇭🇷", "Hrvatski"),
        "sk": ("🇸🇰", "Slovenčina"),
        "sl": ("🇸🇮", "Slovenščina"),
        "et": ("🇪🇪", "Eesti"),
        "lv": ("🇱🇻", "Latviešu"),
        "lt": ("🇱🇹", "Lietuvių"),
        "ga": ("🇮🇪", "Gaeilge"),
        "mt": ("🇲🇹", "Malti"),
        "ru": ("🇷🇺", "Русский"),
        "uk": ("🇺🇦", "Українська"),
        "ar": ("🇸🇦", "العربية"),
        "he": ("🇮🇱", "עברית"),
        "tr": ("🇹🇷", "Türkçe"),
        "ja": ("🇯🇵", "日本語"),
        "ko": ("🇰🇷", "한국어"),
        "zh": ("🇨🇳", "中文"),
        "hi": ("🇮🇳", "हिन्दी"),
        "bn": ("🇧🇩", "বাংলা"),
        "th": ("🇹🇭", "ไทย"),
        "vi": ("🇻🇳", "Tiếng Việt"),
        "id": ("🇮🇩", "Bahasa Indonesia"),
        "ms": ("🇲🇾", "Bahasa Melayu"),
        "sw": ("🇰🇪", "Kiswahili"),
        "am": ("🇪🇹", "አማርኛ"),
    ]
}
