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
        resolve(
            manualOverride: manualOverride,
            originalLanguage: originalLanguage,
            preferredLanguages: preferredLanguages,
            availableLanguages: translatedAudios.map(\.targetLanguage)
        )
    }

    /// **La MÊME loi, exprimée sur des CODES de langue** (#4926).
    ///
    /// Elle existe parce qu'une seconde loi existait déjà :
    /// `ReelAudioLanguageResolver.preferredAudioLanguage`, dans
    /// `ReelsPlayerView.swift`, réécrivait ce parcours de rang mot pour mot —
    /// même règle, même exactitude, autre signature (le réel connaît les codes
    /// de ses pistes TTS, pas les objets). Deux lois JUSTES qui disent la même
    /// chose ne se signalent nulle part le jour où l'une évolue : c'est
    /// exactement le motif que le § Prisme du `CLAUDE.md` racine décrit — « la
    /// réécriture, pas l'appel manquant, a produit trois familles divergentes en
    /// trois cycles ».
    ///
    /// La variante par objets ci-dessus n'est plus qu'une projection de
    /// celle-ci. `ReelAudioLanguageResolverTests` et
    /// `AudioTrackLanguageResolverTests` gardent les deux entrées, inchangées :
    /// leur passage EST la preuve que la convergence ne change aucun verdict.
    ///
    /// Le filtre sur les codes VIDES vient du réel, et il est nécessaire depuis
    /// que `SocialAudioTrack.originalLanguage` peut rendre `""` pour « langue
    /// d'origine inconnue » : sans lui, une chaîne vide dans le prisme
    /// s'égalerait à cette origine inconnue et rendrait `nil` au rang où elle
    /// apparaît. Les deux producteurs de prisme du dépôt écartent déjà les
    /// vides — le filtre garde la loi juste même si un troisième naissait.
    static func resolve(
        manualOverride: String? = nil,
        originalLanguage: String,
        preferredLanguages: [String],
        availableLanguages: [String]
    ) -> String? {
        let available = Set(availableLanguages.map { $0.lowercased() })
        guard !available.isEmpty else { return nil }
        let original = originalLanguage.lowercased()
        if let manual = manualOverride?.lowercased() {
            if manual == original { return nil }
            return available.contains(manual) ? manual : nil
        }
        for lang in preferredLanguages where !lang.isEmpty {
            let lower = lang.lowercased()
            if lower == original { return nil }
            if available.contains(lower) { return lower }
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
