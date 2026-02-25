import SwiftUI
import NaturalLanguage
import Combine

// MARK: - Sentiment Level

public enum SentimentLevel: String, CaseIterable {
    case veryNegative, negative, slightlyNegative, neutral
    case slightlyPositive, positive, veryPositive

    public var emoji: String {
        switch self {
        case .veryNegative:     return "\u{1F621}"
        case .negative:         return "\u{1F620}"
        case .slightlyNegative: return "\u{1F615}"
        case .neutral:          return "\u{1F610}"
        case .slightlyPositive: return "\u{1F642}"
        case .positive:         return "\u{1F60A}"
        case .veryPositive:     return "\u{1F929}"
        }
    }

    public static func from(score: Double) -> SentimentLevel {
        switch score {
        case ..<(-0.6):       return .veryNegative
        case -0.6..<(-0.3):   return .negative
        case -0.3..<(-0.1):   return .slightlyNegative
        case -0.1...0.1:      return .neutral
        case 0.1..<0.3:       return .slightlyPositive
        case 0.3..<0.6:       return .positive
        default:              return .veryPositive
        }
    }
}

// MARK: - Detected Language

public struct DetectedLanguage: Identifiable {
    public let id: String
    public let code: String
    public let flag: String
    public let name: String

    public init(id: String, code: String, flag: String, name: String) {
        self.id = id; self.code = code; self.flag = flag; self.name = name
    }

    public static let supported: [DetectedLanguage] = [
        DetectedLanguage(id: "fr", code: "fr", flag: "\u{1F1EB}\u{1F1F7}", name: "Fran\u{00E7}ais"),
        DetectedLanguage(id: "en", code: "en", flag: "\u{1F1EC}\u{1F1E7}", name: "English"),
        DetectedLanguage(id: "es", code: "es", flag: "\u{1F1EA}\u{1F1F8}", name: "Espa\u{00F1}ol"),
        DetectedLanguage(id: "de", code: "de", flag: "\u{1F1E9}\u{1F1EA}", name: "Deutsch"),
        DetectedLanguage(id: "ja", code: "ja", flag: "\u{1F1EF}\u{1F1F5}", name: "\u{65E5}\u{672C}\u{8A9E}"),
        DetectedLanguage(id: "ar", code: "ar", flag: "\u{1F1E6}\u{1F1EA}", name: "\u{0627}\u{0644}\u{0639}\u{0631}\u{0628}\u{064A}\u{0629}"),
        DetectedLanguage(id: "zh-Hans", code: "zh", flag: "\u{1F1E8}\u{1F1F3}", name: "\u{4E2D}\u{6587}"),
        DetectedLanguage(id: "pt", code: "pt", flag: "\u{1F1F5}\u{1F1F9}", name: "Portugu\u{00EA}s"),
        DetectedLanguage(id: "it", code: "it", flag: "\u{1F1EE}\u{1F1F9}", name: "Italiano"),
    ]

    public static func find(code: String) -> DetectedLanguage? {
        supported.first { $0.id == code || $0.code == code }
    }
}

// MARK: - Text Analyzer

public class TextAnalyzer: ObservableObject {
    @Published public var sentiment: SentimentLevel = .neutral
    @Published public var language: DetectedLanguage? = nil
    @Published public var languageOverride: DetectedLanguage? = nil
    @Published public var showLanguagePicker = false

    private var debounceTimer: Timer?
    private let debounceInterval: TimeInterval = 0.3
    private let recognizer = NLLanguageRecognizer()

    public init() {}

    public var displayLanguage: DetectedLanguage? {
        languageOverride ?? language
    }

    public func analyze(text: String) {
        debounceTimer?.invalidate()

        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            sentiment = .neutral; language = nil; return
        }

        debounceTimer = Timer.scheduledTimer(withTimeInterval: debounceInterval, repeats: false) { [weak self] _ in
            self?.performAnalysis(text: text)
        }
    }

    public func setLanguageOverride(_ lang: DetectedLanguage?) {
        languageOverride = lang; showLanguagePicker = false
    }

    public func reset() {
        debounceTimer?.invalidate()
        sentiment = .neutral; language = nil; languageOverride = nil
    }

    private func performAnalysis(text: String) {
        let cleaned = text.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)

        let score = computeSentiment(text: cleaned)
        DispatchQueue.main.async { self.sentiment = SentimentLevel.from(score: score) }

        recognizer.reset()
        recognizer.processString(cleaned)
        if let dominant = recognizer.dominantLanguage {
            let langCode = dominant.rawValue
            DispatchQueue.main.async { self.language = DetectedLanguage.find(code: langCode) }
        }
    }

    private func computeSentiment(text: String) -> Double {
        let words = text.components(separatedBy: .whitespacesAndNewlines)
            .map { $0.trimmingCharacters(in: .punctuationCharacters) }
            .filter { !$0.isEmpty }
        guard !words.isEmpty else { return 0 }

        var score: Double = 0
        for word in words {
            if let val = Self.positiveWords[word] { score += val }
            else if let val = Self.negativeWords[word] { score += val }
        }
        return max(-1.0, min(1.0, score / Double(words.count) * 2.0))
    }

    // MARK: - Sentiment Dictionaries (FR/EN/ES/DE)

    private static let positiveWords: [String: Double] = [
        "love": 0.8, "amazing": 0.7, "great": 0.6, "awesome": 0.7, "excellent": 0.7,
        "wonderful": 0.7, "fantastic": 0.7, "beautiful": 0.6, "happy": 0.6, "good": 0.4,
        "nice": 0.4, "best": 0.6, "perfect": 0.7, "thanks": 0.4, "thank": 0.4,
        "cool": 0.4, "brilliant": 0.7, "superb": 0.7, "glad": 0.5, "enjoy": 0.5,
        "fun": 0.5, "like": 0.3, "yes": 0.2, "wow": 0.5, "bravo": 0.6,
        "incredible": 0.7, "outstanding": 0.7, "delightful": 0.6, "pleased": 0.5,
        "magnifique": 0.7, "super": 0.6, "genial": 0.7, "adore": 0.8, "aime": 0.6,
        "merci": 0.4, "bien": 0.4, "bon": 0.4, "bonne": 0.4, "parfait": 0.7,
        "incroyable": 0.7, "formidable": 0.7, "heureux": 0.6, "heureuse": 0.6,
        "contente": 0.5, "joie": 0.6, "chouette": 0.5, "top": 0.5,
        "sublime": 0.7, "fantastique": 0.7, "bisous": 0.5,
        "gracias": 0.4, "bueno": 0.4, "buena": 0.4, "excelente": 0.7, "maravilloso": 0.7,
        "increible": 0.7, "perfecto": 0.7, "feliz": 0.6, "amor": 0.7,
        "amigo": 0.4, "amiga": 0.4, "hermoso": 0.6, "hermosa": 0.6, "fantastico": 0.7,
        "danke": 0.4, "gut": 0.4, "toll": 0.6, "wunderbar": 0.7, "fantastisch": 0.7,
        "schon": 0.5, "liebe": 0.7, "freude": 0.6, "prima": 0.5, "perfekt": 0.7,
        "ausgezeichnet": 0.7, "herrlich": 0.6,
    ]

    private static let negativeWords: [String: Double] = [
        "hate": -0.8, "terrible": -0.7, "awful": -0.7, "horrible": -0.7, "bad": -0.5,
        "worst": -0.7, "ugly": -0.6, "stupid": -0.6, "angry": -0.5, "sad": -0.5,
        "annoying": -0.5, "boring": -0.4, "disgusting": -0.7, "pathetic": -0.6,
        "useless": -0.6, "trash": -0.6, "no": -0.2, "never": -0.3, "wrong": -0.4,
        "fail": -0.5, "sucks": -0.6, "disappointed": -0.5, "frustrating": -0.5,
        "nul": -0.6, "nulle": -0.6, "deteste": -0.8, "mauvais": -0.5,
        "mauvaise": -0.5, "moche": -0.5, "triste": -0.5, "colere": -0.5, "ennuyeux": -0.4,
        "degoutant": -0.7, "pourri": -0.6, "pire": -0.6, "honte": -0.5, "stupide": -0.6,
        "imbecile": -0.7, "idiot": -0.6, "merde": -0.7, "chiant": -0.5, "galere": -0.4,
        "enervant": -0.5, "lamentable": -0.6,
        "malo": -0.5, "mala": -0.5, "odio": -0.8,
        "feo": -0.5, "fea": -0.5, "estupido": -0.6, "basura": -0.6,
        "peor": -0.6, "horroroso": -0.7,
        "schlecht": -0.5, "schrecklich": -0.7, "furchtbar": -0.7, "hass": -0.8,
        "hasslich": -0.6, "dumm": -0.6, "langweilig": -0.4, "ekelhaft": -0.7,
        "traurig": -0.5,
    ]
}

// MARK: - Smart Context Zone View

public struct SmartContextZone: View {
    @ObservedObject public var analyzer: TextAnalyzer
    public let accentColor: String
    public let isCompact: Bool
    public var showFlag: Bool = true

    public init(analyzer: TextAnalyzer, accentColor: String, isCompact: Bool, showFlag: Bool = true) {
        self.analyzer = analyzer; self.accentColor = accentColor
        self.isCompact = isCompact; self.showFlag = showFlag
    }

    public var body: some View {
        VStack(spacing: isCompact ? 0 : 2) {
            Text(analyzer.sentiment.emoji)
                .font(.system(size: isCompact ? 20 : 18))
                .scaleEffect(analyzer.sentiment == .neutral ? 1.0 : 1.1)
                .animation(.spring(response: 0.3, dampingFraction: 0.5), value: analyzer.sentiment)

            if showFlag, let lang = analyzer.displayLanguage {
                Button {
                    analyzer.showLanguagePicker = true
                    HapticFeedback.light()
                } label: {
                    Text(lang.flag).font(.system(size: 16))
                }
                .transition(.scale.combined(with: .opacity))
            }
        }
        .frame(width: 36, height: showFlag && analyzer.displayLanguage != nil ? 44 : 36)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isCompact)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: showFlag)
    }
}

