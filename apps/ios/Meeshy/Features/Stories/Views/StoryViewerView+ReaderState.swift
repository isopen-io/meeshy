import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Surfaces du reader et contenu dérivé
//
// Ce que le lecteur LIT de son état pour décider — les règles vivent dans
// `StoryReaderSurfaceRules` et `StoryReaderContentRules`, ici seul l'état est lu.

extension StoryViewerView {

    // MARK: - Surfaces du reader

    /// Une surface du reader est ouverte par-dessus la story
    /// (cf. `StoryReaderSurfaceRules.hasActiveFeature`).
    var hasActiveReaderFeature: Bool { // internal for cross-file extension access
        StoryReaderSurfaceRules.hasActiveFeature(
            showLanguageOptions: showLanguageOptions,
            showFullLanguagePicker: showFullLanguagePicker,
            showEmojiStrip: showEmojiStrip,
            showFullEmojiPicker: showFullEmojiPicker,
            showCommentsOverlay: showCommentsOverlay,
            showAudioTranscript: showAudioTranscript
        )
    }

    /// Une surface ouverte embarque sa propre `ScrollView`
    /// (cf. `StoryReaderSurfaceRules.hasScrollableSurface`) — la légende dépliée
    /// en fait partie depuis #4831 (`isCaptionExpanded`).
    var hasScrollableReaderSurface: Bool { // internal for cross-file extension access
        StoryReaderSurfaceRules.hasScrollableSurface(
            showCommentsOverlay: showCommentsOverlay,
            showFullEmojiPicker: showFullEmojiPicker,
            showFullLanguagePicker: showFullLanguagePicker,
            isCaptionExpanded: isCaptionExpanded
        )
    }

    /// Bord supérieur de la surface scrollable à opposer au point de départ du
    /// drag (cf. `StoryReaderSurfaceRules.effectiveScrollableSurfaceTopY`).
    var effectiveScrollableSurfaceTopY: CGFloat? { // internal for cross-file extension access
        StoryReaderSurfaceRules.effectiveScrollableSurfaceTopY(
            showFullEmojiPicker: showFullEmojiPicker,
            showFullLanguagePicker: showFullLanguagePicker,
            measuredTopY: scrollableSurfaceTopY
        )
    }

    /// Referme toute surface ouverte. Idempotent : sans surface, ne fait rien.
    @discardableResult
    func dismissActiveReaderFeature() -> Bool { // internal for cross-file extension access
        guard hasActiveReaderFeature else { return false }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showLanguageOptions = false
            showFullLanguagePicker = false
            showEmojiStrip = false
            showFullEmojiPicker = false
            showCommentsOverlay = false
            showAudioTranscript = false
        }
        return true
    }

    // MARK: - Contenu dérivé de la story courante

    /// Drapeaux proposés par le strip « Traductions »
    /// (cf. `StoryReaderContentRules.availableTranslationLanguages`).
    var availableTranslationLanguages: [TranslationLanguage] {
        StoryReaderContentRules.availableTranslationLanguages(of: currentStory)
    }

    var storyHasTranslatableContent: Bool { // internal for cross-file extension access
        StoryReaderContentRules.hasTranslatableContent(currentStory)
    }

    var isContentTranslated: Bool { // internal for cross-file extension access
        StoryReaderContentRules.isContentTranslated(currentStory, languageChain: resolvedViewerLanguageChain)
    }

    var currentVoiceCaption: String? { // internal for cross-file extension access
        StoryReaderContentRules.voiceCaption(
            effects: currentStory?.storyEffects,
            isRequested: showAudioTranscript,
            languageChain: resolvedViewerLanguageChain
        )
    }

    /// La story porte-t-elle une transcription qu'on puisse afficher ?
    /// Pilote l'entrée « Transcription » du menu « … ».
    var storyHasAudioTranscript: Bool { // internal for cross-file extension access
        StoryReaderContentRules.hasAudioTranscript(effects: currentStory?.storyEffects)
    }
}
