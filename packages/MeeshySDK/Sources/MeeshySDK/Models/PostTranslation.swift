import Foundation

// MARK: - Post Translation
public struct PostTranslation: Sendable, Codable {
    public let text: String
    public let translationModel: String?
    public let confidenceScore: Double?

    public init(text: String, translationModel: String? = nil, confidenceScore: Double? = nil) {
        self.text = text
        self.translationModel = translationModel
        self.confidenceScore = confidenceScore
    }
}
