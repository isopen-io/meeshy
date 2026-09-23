import Foundation

/// Source de vérité unique du **son parlé** d'une story : quelle transcription
/// afficher, et quelle variante audio jouer, pour une chaîne de langues donnée.
///
/// Pendant sonore de `StoryTextLanguageAvailability`. Les deux appliquent le
/// Prisme Linguistique, mais leur règle de repli diffère — et c'est délibéré :
///
/// - Le **texte** sans traduction correspondante s'affiche dans son original,
///   que le canvas porte déjà : le résolveur renvoie `nil` et l'appelant ne
///   touche à rien (règle n°1 du Prisme).
/// - La **transcription** n'a pas d'« original déjà affiché ». Si aucune langue
///   préférée ne correspond, il faut bien montrer quelque chose : c'est la
///   première entrée, la langue réellement parlée par convention gateway.
///
/// - L'**audio**, lui, retombe sur `nil` comme le texte : sans variante dans la
///   langue voulue, la piste d'origine continue. Faire jouer une langue
///   arbitraire serait plus déroutant que de ne rien changer.
///
/// **La DESCENTE, elle, est commune** : les deux délèguent à
/// `PrismTranslationResolver` et ne diffèrent que par ce qu'elles font de son
/// `nil`. C'est la seule divergence qui se justifie — la boucle, non : écrite
/// deux fois ici, elle perdait le saut d'une entrée VIDE (une transcription
/// blanche gagnait son rang et s'affichait comme un sous-titre vide) et le
/// départage déterministe de deux entrées qui se canonisent pareil.
public enum StoryAudioTranscript {

    /// Codes de langue dans lesquels le son de la story peut être LU ou ÉCOUTÉ,
    /// triés pour un résultat déterministe.
    ///
    /// Union volontaire des deux gisements : une langue qui n'a qu'une variante
    /// audio (sans transcription) reste proposée — on peut vouloir l'écouter
    /// sans pouvoir la lire, et l'inverse est vrai aussi.
    public static func availableLanguages(effects: StoryEffects?) -> [String] {
        var codes: Set<String> = []
        for transcript in effects?.voiceTranscriptions ?? [] {
            codes.formUnion(normalised(transcript.language))
        }
        for variant in effects?.backgroundAudioVariants ?? [] {
            codes.formUnion(normalised(variant.language))
        }
        return codes.sorted()
    }

    /// Transcription à afficher pour `preferredLanguages`, dans l'ordre de la
    /// chaîne. À défaut de correspondance, la langue parlée d'origine.
    public static func resolve(effects: StoryEffects?,
                               preferredLanguages: [String]) -> StoryVoiceTranscription? {
        guard let transcripts = effects?.voiceTranscriptions, !transcripts.isEmpty else { return nil }
        let served = PrismTranslationResolver.resolve(
            originalLanguage: nil,
            candidates: transcripts.map { PrismCandidate(language: $0.language, value: $0) },
            preferredLanguages: preferredLanguages,
            isServable: { !$0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        )
        return served?.value ?? transcripts.first
    }

    /// Variante audio à jouer pour `preferredLanguages`. `nil` = aucune variante
    /// ne correspond, la piste d'origine reste en place.
    public static func variant(effects: StoryEffects?,
                               preferredLanguages: [String]) -> StoryAudioVariant? {
        guard let variants = effects?.backgroundAudioVariants, !variants.isEmpty else { return nil }
        return PrismTranslationResolver.resolve(
            originalLanguage: nil,
            candidates: variants.map { PrismCandidate(language: $0.language, value: $0) },
            preferredLanguages: preferredLanguages,
            isServable: { !$0.postMediaId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        )?.value
    }

    /// `true` dès qu'une transcription porte du texte. Pilote l'apparition de
    /// l'entrée « Transcription » du menu « … » : sans texte, la basculer
    /// n'afficherait rien.
    public static func hasTranscript(effects: StoryEffects?) -> Bool {
        (effects?.voiceTranscriptions ?? []).contains {
            !$0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    private static func normalised(_ code: String?) -> Set<String> {
        guard let code,
              !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        return [StoryPrismeMatch.base(code)]
    }
}
