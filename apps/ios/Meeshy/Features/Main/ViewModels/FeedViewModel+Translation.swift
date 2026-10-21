import Foundation
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

extension FeedViewModel {
    // MARK: - Translation

    func setTranslationOverride(postId: String, language: String) {
        guard let index = posts.firstIndex(where: { $0.id == postId }),
              let translation = posts[index].translations?[language] else { return }
        posts[index].translatedContent = translation.text
        manualTranslationOverrides.insert(postId)
    }

    /// Re-resolves the post's displayed language back to the Prisme default
    /// (undoes a manual flag-tap override). Previously did an exact-key
    /// dictionary lookup on `userLanguage` alone — case-sensitive AND only
    /// ever consulting the FIRST preferred language, so a francophone with
    /// `["de", "fr"]` preferred languages (or any uppercase-cased locale
    /// string) lost their translation even though "fr" matched further down
    /// the chain. `resolved(preferredLanguages:)` walks the FULL chain
    /// case-insensitively, matching the same algorithm used everywhere else
    /// in the Prisme (never `translations.first`).
    func clearTranslationOverride(postId: String) {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
        posts[index] = posts[index].resolved(preferredLanguages: preferredLanguages)
        manualTranslationOverrides.remove(postId)
    }

    func requestTranslation(postId: String, targetLanguage: String) async {
        do {
            try await postService.requestTranslation(postId: postId, targetLanguage: targetLanguage)
        } catch {
            // Translation will arrive via socket event
        }
    }
}
