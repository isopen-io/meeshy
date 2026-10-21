import Foundation
import MeeshySDK

enum MessageTranslationMerge {

    static func prism(of preferredLanguages: [String]) -> Set<String> {
        Set(preferredLanguages.map { $0.lowercased() })
    }

    static func merging(
        _ incoming: [MessageTranslation],
        into existing: [MessageTranslation],
        prism: Set<String>
    ) -> [MessageTranslation] {
        incoming
            .filter { prism.contains($0.targetLanguage.lowercased()) }
            .reduce(into: existing) { merged, translation in
                guard let index = merged.firstIndex(where: { $0.targetLanguage == translation.targetLanguage }) else {
                    merged.append(translation)
                    return
                }
                merged[index] = translation
            }
    }

    static func translations(from api: [APITextTranslation], originalLanguage: String?) -> [MessageTranslation] {
        api.map {
            MessageTranslation(
                id: $0.id,
                messageId: $0.messageId,
                sourceLanguage: $0.sourceLanguage ?? originalLanguage ?? "auto",
                targetLanguage: $0.targetLanguage,
                translatedContent: $0.translatedContent,
                translationModel: $0.translationModel,
                confidenceScore: $0.confidenceScore
            )
        }
    }

    static func translations(from cached: [TranslationData]) -> [MessageTranslation] {
        cached.map {
            MessageTranslation(
                id: $0.id,
                messageId: $0.messageId,
                sourceLanguage: $0.sourceLanguage,
                targetLanguage: $0.targetLanguage,
                translatedContent: $0.translatedContent,
                translationModel: $0.translationModel,
                confidenceScore: $0.confidenceScore
            )
        }
    }

    static func translations(from records: [TranslationRecord], messageId: String) -> [MessageTranslation] {
        records.map {
            MessageTranslation(
                id: $0.id,
                messageId: messageId,
                sourceLanguage: $0.sourceLanguage ?? "auto",
                targetLanguage: $0.targetLanguage,
                translatedContent: $0.translatedContent,
                translationModel: $0.translationModel,
                confidenceScore: $0.confidenceScore
            )
        }
    }
}
