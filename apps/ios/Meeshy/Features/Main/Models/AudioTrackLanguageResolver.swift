import Foundation
import MeeshySDK

/// Langue de PISTE audio effective d'un message — LA loi unique, partagée
/// par la vue (widget audio, segments karaoké) et le moteur
/// (`ConversationViewModel.playAudio`, `setBubbleActiveDisplayLanguage`).
/// Sans elle, le drapeau-toggle changeait le texte pendant que le
/// coordinateur rejouait l'original : audio en langue A, karaoké en
/// langue B.
///
/// Résolution :
/// 1. **Bascule manuelle du drapeau** (`manualOverride`, le
///    `activeDisplayLangCode` de `bubbleLanguageSelections`) : la langue
///    d'origine y vaut « piste originale » (`nil`) ; une langue sans piste
///    traduite retombe sur l'original.
/// 2. **Sinon Prisme** : parcours des langues du lecteur DANS L'ORDRE
///    (`ConversationLanguagePreferences.resolved`) — la langue d'origine
///    gagne à SON rang (règle 3 du Prisme, jamais en court-circuit), la
///    première langue servie par une piste traduite gagne sinon.
///
/// `nil` = piste originale. Miroir de
/// `AudioMediaView.resolvedPreferredTranscriptionLanguage` (qui délègue ici).
nonisolated enum AudioTrackLanguageResolver {

    static func resolve(
        manualOverride: String?,
        originalLanguage: String,
        preferredLanguages: [String],
        translatedAudios: [MessageTranslatedAudio]
    ) -> String? {
        guard !translatedAudios.isEmpty else { return nil }
        let original = originalLanguage.lowercased()
        func hasTrack(_ code: String) -> Bool {
            translatedAudios.contains { $0.targetLanguage.lowercased() == code }
        }
        if let manual = manualOverride?.lowercased() {
            if manual == original { return nil }
            return hasTrack(manual) ? manual : nil
        }
        for lang in preferredLanguages {
            let lower = lang.lowercased()
            if lower == original { return nil }
            if hasTrack(lower) { return lower }
        }
        return nil
    }

    /// URL de la piste effective — la piste traduite désignée par
    /// `language`, sinon l'original. Ne fabrique jamais d'URL : une langue
    /// sans piste retombe sur `originalUrl`.
    static func url(
        for language: String?,
        translatedAudios: [MessageTranslatedAudio],
        originalUrl: String
    ) -> String {
        guard let language else { return originalUrl }
        return translatedAudios.first {
            $0.targetLanguage.lowercased() == language.lowercased()
        }?.url ?? originalUrl
    }
}
