import Foundation
import MeeshySDK
import MeeshyUI

/// Ce que le lecteur DÉRIVE du contenu d'une story pour la langue de celui qui
/// lit : quelles langues explorer, si le contenu est traduisible ou traduit, la
/// transcription à afficher. Fonctions pures de leurs entrées — le lecteur leur
/// remet la story, la chaîne du Prisme et l'état d'affichage qu'il tient.
enum StoryReaderContentRules {

    /// Sentinelle « Original » de la feuille des langues.
    ///
    /// Une story est multilingue par nature : ses overlays peuvent être écrits
    /// dans des langues différentes. Revenir à l'original ne peut donc PAS se
    /// faire en choisissant la langue d'origine de la story — un overlay rédigé
    /// en français dans une story marquée `en` possède une traduction `en`, qui
    /// serait servie à la place de son texte réel. Aligner tous les bouts sur
    /// une seule langue en efface.
    ///
    /// `StoryTextObject.resolvedText` rend le texte source dès que la chaîne
    /// préférée est vide. « Original » est donc une chaîne VIDE : chaque overlay
    /// retombe sur son propre texte, dans sa propre langue. La valeur choisie ne
    /// peut pas entrer en collision avec un code BCP-47.
    nonisolated static let originalLanguageOverride = "__meeshy.original__"

    /// Helper pur (testable) : prépend l'override langue à la chaine préférée, dédupliqué.
    /// `nil`/vide → chaine de base inchangée. Sinon l'override passe en tête et est retiré
    /// de sa position d'origine (jamais de doublon).
    ///
    /// La sentinelle « Original » VIDE la chaine — voir `originalLanguageOverride`.
    static func viewerLanguageChain(base: [String], override: String?) -> [String] {
        guard let override, !override.isEmpty else { return base }
        if override == originalLanguageOverride { return [] }
        return [override] + base.filter { $0 != override }
    }

    // MARK: - Available Translation Languages

    /// Drapeaux proposés par le strip « Traductions ». Couvre le texte du
    /// CANVAS (`StoryTextObject.sourceLanguage` + clés de ses `translations`)
    /// autant que la légende du post : avant 2026-07-25 seule la légende était
    /// consultée, si bien qu'une story faite de texte sur le canvas — le cas
    /// courant — n'offrait aucune langue à explorer malgré ses traductions.
    ///
    /// Les langues du SON y entrent aussi (#12646) : une langue qui n'existe
    /// qu'en transcription ou en piste traduite se choisit au rail comme les
    /// autres, sans quoi une story parlée n'offrait qu'un « + ».
    static func availableTranslationLanguages(of story: StoryItem?) -> [TranslationLanguage] {
        guard let story else { return [] }
        let textCodes = StoryTextLanguageAvailability.availableLanguages(
            effects: story.storyEffects,
            postTranslations: story.translations
        )
        let soundCodes = StoryAudioTranscript.availableLanguages(effects: story.storyEffects)
        return languages(matching: textCodes + soundCodes)
    }

    /// Les langues dans lesquelles la transcription se LIT — une transcription
    /// vide n'en ouvre aucune. Alimente le sous-menu « Transcription » du menu
    /// « … » (#12646).
    static func transcriptLanguages(effects: StoryEffects?) -> [TranslationLanguage] {
        let codes = (effects?.voiceTranscriptions ?? [])
            .filter { !$0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .map(\.language)
        return languages(matching: codes)
    }

    /// Le sous-menu « Transcription » d'une story : ses langues, celle que la
    /// chaîne du lecteur sert, et le choix que le rail partage.
    static func transcriptMenu(of story: StoryItem?, chain: [String], select: @escaping (String?) -> Void) -> StoryTranscriptMenu {
        let effects = story?.storyEffects
        return StoryTranscriptMenu(
            languages: transcriptLanguages(effects: effects),
            servedLanguage: StoryAudioTranscript.resolve(effects: effects, preferredLanguages: chain)?.language,
            select: select
        )
    }

    /// Le catalogue, dans son ordre, restreint aux codes donnés — comparés sur
    /// leur langue de base (`fr-FR` sert `fr`).
    private static func languages(matching codes: [String]) -> [TranslationLanguage] {
        let bases = Set(codes.compactMap(baseLanguage))
        guard !bases.isEmpty else { return [] }
        return TranslationLanguage.all.filter { bases.contains($0.id.lowercased()) }
    }

    private static func baseLanguage(_ code: String) -> String? {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard let base = trimmed.split(whereSeparator: { $0 == "-" || $0 == "_" }).first else { return nil }
        return String(base)
    }

    static func hasTranslatableContent(_ story: StoryItem?) -> Bool {
        guard let story else { return false }
        // Texte du canvas ET légende — une story faite de texte posé sur le
        // canvas est traduisible même sans légende (corrigé 2026-07-25 : seule
        // la légende comptait, donc le bouton restait absent sur le cas le plus
        // courant).
        if StoryTextLanguageAvailability.hasTranslatableText(
            effects: story.storyEffects, content: story.content) { return true }
        if let effects = story.storyEffects {
            if effects.voiceAttachmentId != nil { return true }
            if let audioObjs = effects.audioPlayerObjects, !audioObjs.isEmpty { return true }
        }
        return false
    }

    static func isContentTranslated(_ story: StoryItem?, languageChain: [String]) -> Bool {
        guard hasTranslatableContent(story),
              let story,
              let translations = story.translations,
              !translations.isEmpty,
              !languageChain.isEmpty else { return false }
        // Prisme : le contenu est affiché via la CHAÎNE préférée complète
        // (systemLanguage > regionalLanguage > customDestination > deviceLocale)
        // — `resolvedText` retourne une traduction dès qu'UNE langue de la chaîne
        // a une entrée. Le badge « translate » doit donc refléter la même logique :
        // tester la chaîne entière, pas seulement la première. Sinon un viewer
        // voyant le contenu traduit dans sa langue SECONDAIRE ne voyait aucun
        // indicateur (incohérent avec le texte/caption affichés — bug 2026-06-01).
        return translations.contains { languageChain.contains($0.language) }
    }

    // MARK: - Voice Caption

    /// - Parameter isRequested: la transcription ne s'affiche QUE sur demande, via le menu « … ».
    static func voiceCaption(effects: StoryEffects?, isRequested: Bool, languageChain: [String]) -> String? {
        // La transcription ne s'affiche QUE sur demande, via le menu « … »
        // (directive user 2026-07-25, item 7a).
        guard isRequested else { return nil }
        // Ne PAS gater sur `voiceAttachmentId` : ce champ n'est écrit par aucun
        // producteur (vérifié sur tout le dépôt le 2026-07-26) — la voix vit
        // dans `audioPlayerObjects`. S'y adosser rendait la bascule inerte pour
        // TOUTES les stories. La seule condition qui vaille est l'existence
        // d'une transcription, ce que tranche le moteur SDK.
        guard let effects else { return nil }
        // Résolution déléguée au moteur du SDK : la chaîne complète des langues
        // préférées d'abord (systemLanguage > regionalLanguage >
        // customDestination > deviceLocale, override d'exploration en tête),
        // puis la langue PARLÉE d'origine. Jamais une traduction arbitraire.
        return StoryAudioTranscript.resolve(effects: effects,
                                            preferredLanguages: languageChain)?.content
    }

    /// La story porte-t-elle une transcription qu'on puisse afficher ?
    /// Pilote l'entrée « Transcription » du menu « … ».
    static func hasAudioTranscript(effects: StoryEffects?) -> Bool {
        guard let effects else { return false }
        return StoryAudioTranscript.hasTranscript(effects: effects)
    }
}
