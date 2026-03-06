import Foundation

public struct LanguageInfo: Sendable {
    public let code: String
    public let name: String
    public let nativeName: String
    public let flag: String
    public let colorHex: String

    public init(code: String, name: String, nativeName: String, flag: String, colorHex: String) {
        self.code = code
        self.name = name
        self.nativeName = nativeName
        self.flag = flag
        self.colorHex = colorHex
    }
}

public enum LanguageData {
    // MARK: - All Languages (translation targets)

    public static let allLanguages: [LanguageInfo] = [
        // Romance
        LanguageInfo(code: "fr", name: "French", nativeName: "Français", flag: "\u{1F1EB}\u{1F1F7}", colorHex: "3B82F6"),
        LanguageInfo(code: "es", name: "Spanish", nativeName: "Español", flag: "\u{1F1EA}\u{1F1F8}", colorHex: "EF4444"),
        LanguageInfo(code: "it", name: "Italian", nativeName: "Italiano", flag: "\u{1F1EE}\u{1F1F9}", colorHex: "22C55E"),
        LanguageInfo(code: "pt", name: "Portuguese", nativeName: "Português", flag: "\u{1F1E7}\u{1F1F7}", colorHex: "16A34A"),
        LanguageInfo(code: "ro", name: "Romanian", nativeName: "Română", flag: "\u{1F1F7}\u{1F1F4}", colorHex: "2563EB"),

        // Germanic
        LanguageInfo(code: "en", name: "English", nativeName: "English", flag: "\u{1F1EC}\u{1F1E7}", colorHex: "6366F1"),
        LanguageInfo(code: "de", name: "German", nativeName: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}", colorHex: "F59E0B"),
        LanguageInfo(code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "\u{1F1F3}\u{1F1F1}", colorHex: "F97316"),
        LanguageInfo(code: "sv", name: "Swedish", nativeName: "Svenska", flag: "\u{1F1F8}\u{1F1EA}", colorHex: "0EA5E9"),
        LanguageInfo(code: "da", name: "Danish", nativeName: "Dansk", flag: "\u{1F1E9}\u{1F1F0}", colorHex: "DC2626"),
        LanguageInfo(code: "no", name: "Norwegian", nativeName: "Norsk", flag: "\u{1F1F3}\u{1F1F4}", colorHex: "1D4ED8"),
        LanguageInfo(code: "af", name: "Afrikaans", nativeName: "Afrikaans", flag: "\u{1F1FF}\u{1F1E6}", colorHex: "059669"),

        // Slavic
        LanguageInfo(code: "ru", name: "Russian", nativeName: "\u{0420}\u{0443}\u{0441}\u{0441}\u{043A}\u{0438}\u{0439}", flag: "\u{1F1F7}\u{1F1FA}", colorHex: "DC2626"),
        LanguageInfo(code: "uk", name: "Ukrainian", nativeName: "\u{0423}\u{043A}\u{0440}\u{0430}\u{0457}\u{043D}\u{0441}\u{044C}\u{043A}\u{0430}", flag: "\u{1F1FA}\u{1F1E6}", colorHex: "FBBF24"),
        LanguageInfo(code: "pl", name: "Polish", nativeName: "Polski", flag: "\u{1F1F5}\u{1F1F1}", colorHex: "E11D48"),
        LanguageInfo(code: "cs", name: "Czech", nativeName: "Čeština", flag: "\u{1F1E8}\u{1F1FF}", colorHex: "1E40AF"),
        LanguageInfo(code: "sk", name: "Slovak", nativeName: "Slovenčina", flag: "\u{1F1F8}\u{1F1F0}", colorHex: "1E3A8A"),
        LanguageInfo(code: "bg", name: "Bulgarian", nativeName: "\u{0411}\u{044A}\u{043B}\u{0433}\u{0430}\u{0440}\u{0441}\u{043A}\u{0438}", flag: "\u{1F1E7}\u{1F1EC}", colorHex: "15803D"),
        LanguageInfo(code: "hr", name: "Croatian", nativeName: "Hrvatski", flag: "\u{1F1ED}\u{1F1F7}", colorHex: "B91C1C"),
        LanguageInfo(code: "sr", name: "Serbian", nativeName: "\u{0421}\u{0440}\u{043F}\u{0441}\u{043A}\u{0438}", flag: "\u{1F1F7}\u{1F1F8}", colorHex: "9F1239"),
        LanguageInfo(code: "sl", name: "Slovenian", nativeName: "Slovenščina", flag: "\u{1F1F8}\u{1F1EE}", colorHex: "0369A1"),

        // Baltic
        LanguageInfo(code: "lt", name: "Lithuanian", nativeName: "Lietuvių", flag: "\u{1F1F1}\u{1F1F9}", colorHex: "CA8A04"),
        LanguageInfo(code: "lv", name: "Latvian", nativeName: "Latviešu", flag: "\u{1F1F1}\u{1F1FB}", colorHex: "7C2D12"),

        // Finno-Ugric
        LanguageInfo(code: "fi", name: "Finnish", nativeName: "Suomi", flag: "\u{1F1EB}\u{1F1EE}", colorHex: "2563EB"),
        LanguageInfo(code: "hu", name: "Hungarian", nativeName: "Magyar", flag: "\u{1F1ED}\u{1F1FA}", colorHex: "B45309"),
        LanguageInfo(code: "et", name: "Estonian", nativeName: "Eesti", flag: "\u{1F1EA}\u{1F1EA}", colorHex: "0284C7"),

        // Hellenic
        LanguageInfo(code: "el", name: "Greek", nativeName: "\u{0395}\u{03BB}\u{03BB}\u{03B7}\u{03BD}\u{03B9}\u{03BA}\u{03AC}", flag: "\u{1F1EC}\u{1F1F7}", colorHex: "1D4ED8"),

        // Turkic
        LanguageInfo(code: "tr", name: "Turkish", nativeName: "Türkçe", flag: "\u{1F1F9}\u{1F1F7}", colorHex: "EF4444"),
        LanguageInfo(code: "az", name: "Azerbaijani", nativeName: "Azərbaycan", flag: "\u{1F1E6}\u{1F1FF}", colorHex: "0891B2"),
        LanguageInfo(code: "kk", name: "Kazakh", nativeName: "\u{049A}\u{0430}\u{0437}\u{0430}\u{049B}\u{0448}\u{0430}", flag: "\u{1F1F0}\u{1F1FF}", colorHex: "0EA5E9"),
        LanguageInfo(code: "uz", name: "Uzbek", nativeName: "O'zbek", flag: "\u{1F1FA}\u{1F1FF}", colorHex: "0D9488"),

        // Semitic
        LanguageInfo(code: "ar", name: "Arabic", nativeName: "\u{0627}\u{0644}\u{0639}\u{0631}\u{0628}\u{064A}\u{0629}", flag: "\u{1F1F8}\u{1F1E6}", colorHex: "15803D"),
        LanguageInfo(code: "he", name: "Hebrew", nativeName: "\u{05E2}\u{05D1}\u{05E8}\u{05D9}\u{05EA}", flag: "\u{1F1EE}\u{1F1F1}", colorHex: "1D4ED8"),
        LanguageInfo(code: "am", name: "Amharic", nativeName: "\u{12A0}\u{121B}\u{122D}\u{129B}", flag: "\u{1F1EA}\u{1F1F9}", colorHex: "16A34A"),

        // Indo-Aryan
        LanguageInfo(code: "hi", name: "Hindi", nativeName: "\u{0939}\u{093F}\u{0928}\u{094D}\u{0926}\u{0940}", flag: "\u{1F1EE}\u{1F1F3}", colorHex: "F97316"),
        LanguageInfo(code: "bn", name: "Bengali", nativeName: "\u{09AC}\u{09BE}\u{0982}\u{09B2}\u{09BE}", flag: "\u{1F1E7}\u{1F1E9}", colorHex: "059669"),
        LanguageInfo(code: "ur", name: "Urdu", nativeName: "\u{0627}\u{0631}\u{062F}\u{0648}", flag: "\u{1F1F5}\u{1F1F0}", colorHex: "16A34A"),
        LanguageInfo(code: "ne", name: "Nepali", nativeName: "\u{0928}\u{0947}\u{092A}\u{093E}\u{0932}\u{0940}", flag: "\u{1F1F3}\u{1F1F5}", colorHex: "DC2626"),
        LanguageInfo(code: "ta", name: "Tamil", nativeName: "\u{0BA4}\u{0BAE}\u{0BBF}\u{0BB4}\u{0BCD}", flag: "\u{1F1EE}\u{1F1F3}", colorHex: "D97706"),

        // Iranian
        LanguageInfo(code: "fa", name: "Persian", nativeName: "\u{0641}\u{0627}\u{0631}\u{0633}\u{06CC}", flag: "\u{1F1EE}\u{1F1F7}", colorHex: "059669"),

        // Caucasian
        LanguageInfo(code: "ka", name: "Georgian", nativeName: "\u{10E5}\u{10D0}\u{10E0}\u{10D7}\u{10E3}\u{10DA}\u{10D8}", flag: "\u{1F1EC}\u{1F1EA}", colorHex: "B91C1C"),
        LanguageInfo(code: "hy", name: "Armenian", nativeName: "\u{0540}\u{0561}\u{0575}\u{0565}\u{0580}\u{0565}\u{0576}", flag: "\u{1F1E6}\u{1F1F2}", colorHex: "EA580C"),

        // East Asian
        LanguageInfo(code: "zh", name: "Chinese", nativeName: "\u{4E2D}\u{6587}", flag: "\u{1F1E8}\u{1F1F3}", colorHex: "DC2626"),
        LanguageInfo(code: "ja", name: "Japanese", nativeName: "\u{65E5}\u{672C}\u{8A9E}", flag: "\u{1F1EF}\u{1F1F5}", colorHex: "E11D48"),
        LanguageInfo(code: "ko", name: "Korean", nativeName: "\u{D55C}\u{AD6D}\u{C5B4}", flag: "\u{1F1F0}\u{1F1F7}", colorHex: "1E40AF"),

        // Southeast Asian
        LanguageInfo(code: "th", name: "Thai", nativeName: "\u{0E44}\u{0E17}\u{0E22}", flag: "\u{1F1F9}\u{1F1ED}", colorHex: "7C3AED"),
        LanguageInfo(code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "\u{1F1FB}\u{1F1F3}", colorHex: "DC2626"),
        LanguageInfo(code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", flag: "\u{1F1EE}\u{1F1E9}", colorHex: "EF4444"),
        LanguageInfo(code: "ms", name: "Malay", nativeName: "Bahasa Melayu", flag: "\u{1F1F2}\u{1F1FE}", colorHex: "1D4ED8"),
        LanguageInfo(code: "tl", name: "Filipino", nativeName: "Filipino", flag: "\u{1F1F5}\u{1F1ED}", colorHex: "2563EB"),
        LanguageInfo(code: "my", name: "Burmese", nativeName: "\u{1019}\u{103C}\u{1014}\u{103A}\u{1019}\u{102C}\u{1018}\u{102C}\u{101E}\u{102C}", flag: "\u{1F1F2}\u{1F1F2}", colorHex: "CA8A04"),
        LanguageInfo(code: "km", name: "Khmer", nativeName: "\u{1797}\u{17B6}\u{179F}\u{17B6}\u{1781}\u{17D2}\u{1798}\u{17C2}\u{179A}", flag: "\u{1F1F0}\u{1F1ED}", colorHex: "1E3A8A"),
        LanguageInfo(code: "lo", name: "Lao", nativeName: "\u{0EA5}\u{0EB2}\u{0EA7}", flag: "\u{1F1F1}\u{1F1E6}", colorHex: "B91C1C"),

        // West African
        LanguageInfo(code: "yo", name: "Yoruba", nativeName: "Yorùbá", flag: "\u{1F1F3}\u{1F1EC}", colorHex: "16A34A"),
        LanguageInfo(code: "ig", name: "Igbo", nativeName: "Igbo", flag: "\u{1F1F3}\u{1F1EC}", colorHex: "15803D"),
        LanguageInfo(code: "ha", name: "Hausa", nativeName: "Hausa", flag: "\u{1F1F3}\u{1F1EC}", colorHex: "059669"),
        LanguageInfo(code: "wo", name: "Wolof", nativeName: "Wolof", flag: "\u{1F1F8}\u{1F1F3}", colorHex: "0D9488"),
        LanguageInfo(code: "bm", name: "Bambara", nativeName: "Bamanankan", flag: "\u{1F1F2}\u{1F1F1}", colorHex: "CA8A04"),
        LanguageInfo(code: "ff", name: "Fulah", nativeName: "Fulfulde", flag: "\u{1F1F8}\u{1F1F3}", colorHex: "0891B2"),
        LanguageInfo(code: "tw", name: "Twi", nativeName: "Twi", flag: "\u{1F1EC}\u{1F1ED}", colorHex: "D97706"),
        LanguageInfo(code: "ee", name: "Ewe", nativeName: "E\u{028B}egbe", flag: "\u{1F1EC}\u{1F1ED}", colorHex: "B45309"),
        LanguageInfo(code: "ak", name: "Akan", nativeName: "Akan", flag: "\u{1F1EC}\u{1F1ED}", colorHex: "EA580C"),

        // Central African / Cameroon
        LanguageInfo(code: "ln", name: "Lingala", nativeName: "Lingála", flag: "\u{1F1E8}\u{1F1E9}", colorHex: "2563EB"),
        LanguageInfo(code: "bas", name: "Bassa", nativeName: "\u{0181}\u{00E0}s\u{00E0}a", flag: "\u{1F1E8}\u{1F1F2}", colorHex: "DC2626"),
        LanguageInfo(code: "byv", name: "Medumba", nativeName: "M\u{0259}d\u{00F9}mb\u{00E0}", flag: "\u{1F1E8}\u{1F1F2}", colorHex: "16A34A"),
        LanguageInfo(code: "dua", name: "Douala", nativeName: "Duálá", flag: "\u{1F1E8}\u{1F1F2}", colorHex: "F59E0B"),
        LanguageInfo(code: "ewo", name: "Ewondo", nativeName: "Ewondo", flag: "\u{1F1E8}\u{1F1F2}", colorHex: "7C3AED"),
        LanguageInfo(code: "fan", name: "Fang", nativeName: "Fang", flag: "\u{1F1E8}\u{1F1F2}", colorHex: "0EA5E9"),

        // East & Southern African
        LanguageInfo(code: "sw", name: "Swahili", nativeName: "Kiswahili", flag: "\u{1F1F0}\u{1F1EA}", colorHex: "0D9488"),
        LanguageInfo(code: "zu", name: "Zulu", nativeName: "isiZulu", flag: "\u{1F1FF}\u{1F1E6}", colorHex: "1E40AF"),
        LanguageInfo(code: "xh", name: "Xhosa", nativeName: "isiXhosa", flag: "\u{1F1FF}\u{1F1E6}", colorHex: "0369A1"),
        LanguageInfo(code: "sn", name: "Shona", nativeName: "chiShona", flag: "\u{1F1FF}\u{1F1FC}", colorHex: "15803D"),
        LanguageInfo(code: "rw", name: "Kinyarwanda", nativeName: "Ikinyarwanda", flag: "\u{1F1F7}\u{1F1FC}", colorHex: "0EA5E9"),
        LanguageInfo(code: "rn", name: "Kirundi", nativeName: "Ikirundi", flag: "\u{1F1E7}\u{1F1EE}", colorHex: "DC2626"),
        LanguageInfo(code: "lg", name: "Luganda", nativeName: "Luganda", flag: "\u{1F1FA}\u{1F1EC}", colorHex: "CA8A04"),
        LanguageInfo(code: "so", name: "Somali", nativeName: "Soomaali", flag: "\u{1F1F8}\u{1F1F4}", colorHex: "2563EB"),
        LanguageInfo(code: "mg", name: "Malagasy", nativeName: "Malagasy", flag: "\u{1F1F2}\u{1F1EC}", colorHex: "16A34A"),
    ]

    // MARK: - Interface Languages (UI only)

    public static let interfaceLanguages: [LanguageInfo] = [
        LanguageInfo(code: "fr", name: "French", nativeName: "Français", flag: "\u{1F1EB}\u{1F1F7}", colorHex: "3B82F6"),
        LanguageInfo(code: "en", name: "English", nativeName: "English", flag: "\u{1F1EC}\u{1F1E7}", colorHex: "6366F1"),
        LanguageInfo(code: "es", name: "Spanish", nativeName: "Español", flag: "\u{1F1EA}\u{1F1F8}", colorHex: "EF4444"),
        LanguageInfo(code: "ar", name: "Arabic", nativeName: "\u{0627}\u{0644}\u{0639}\u{0631}\u{0628}\u{064A}\u{0629}", flag: "\u{1F1F8}\u{1F1E6}", colorHex: "15803D"),
    ]

    // MARK: - Lookup

    public static func info(for code: String) -> LanguageInfo? {
        allLanguages.first(where: { $0.code == code })
    }
}
