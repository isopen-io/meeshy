import Foundation

public extension FeedComment {
    var hasServedTranslation: Bool { false }
    func shownText(showOriginal: Bool) -> String { content }
    func translatedChipLanguage(readerLanguages: [String]) -> String { "" }
    func offersTranslationRequest(readerLanguages: [String]) -> Bool { false }
}
