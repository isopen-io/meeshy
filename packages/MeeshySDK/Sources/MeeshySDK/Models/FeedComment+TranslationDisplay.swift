import Foundation

/// **What a comment row shows of its translation** — one rule for the post
/// sheet, the post detail and the story viewer (#13133).
public extension FeedComment {
    /// A translation is served and the original can be named: the row offers
    /// the original / translated chip pair.
    var hasServedTranslation: Bool { translatedContent != nil && originalLanguage != nil }

    func shownText(showOriginal: Bool) -> String { showOriginal ? content : displayContent }

    /// The language the translated chip names: the rank the Prism serves,
    /// else the reader's first language, else French.
    func translatedChipLanguage(readerLanguages: [String]) -> String {
        servedLanguage(preferredLanguages: readerLanguages)?.lowercased() ?? Self.firstLanguage(of: readerLanguages)
    }

    /// No translation yet and the original differs from the reader's first
    /// language: "Translate" is offered on demand.
    func offersTranslationRequest(readerLanguages: [String]) -> Bool {
        guard !hasServedTranslation, let originalLanguage else { return false }
        return originalLanguage.lowercased() != Self.firstLanguage(of: readerLanguages)
    }

    private static func firstLanguage(of readerLanguages: [String]) -> String {
        readerLanguages.first?.lowercased() ?? "fr"
    }
}
