import Foundation

/// Source de vérité unique des langues dans lesquelles le **texte** d'une story
/// est lisible — donc des drapeaux que le viewer propose à l'exploration.
///
/// Le texte d'une story vit à deux endroits, et les deux comptent :
/// - les `StoryTextObject` du canvas — le texte réellement AFFICHÉ, chacun
///   portant sa `sourceLanguage` et son dictionnaire `translations` ;
/// - la légende du post (`StoryItem.content` + `StoryItem.translations`).
///
/// Avant 2026-07-25 seule la légende était consultée : une story composée
/// uniquement de texte sur le canvas — le cas le plus courant — n'offrait aucune
/// langue à explorer alors que ses traductions existaient.
///
/// Les codes sont normalisés en base ISO 639-1 (`fr-FR`, `FR` et `fr` donnent une
/// seule entrée `fr`), car le sélecteur du viewer raisonne en drapeaux.
/// Pendant : `StoryAudioAvailability`, qui répond à la question sonore.
public enum StoryTextLanguageAvailability {

    /// Codes de langue disponibles pour le contenu textuel, triés
    /// alphabétiquement pour un résultat déterministe. L'ordre d'affichage
    /// final reste décidé par l'appelant (`TranslationLanguage.all`, puis
    /// `LanguageUsageTracker`).
    ///
    /// L'union est volontaire : une langue couverte par un seul texte reste
    /// proposée, les autres textes retombant sur leur original — c'est
    /// exactement la règle n°1 du Prisme Linguistique.
    public static func availableLanguages(effects: StoryEffects?,
                                          postTranslations: [StoryTranslation]?) -> [String] {
        var codes: Set<String> = []

        for text in effects?.textObjects ?? [] where !text.text.trimmed.isEmpty {
            codes.formUnion(normalised(text.sourceLanguage))
            for (language, _) in text.translations ?? [:] {
                codes.formUnion(normalised(language))
            }
        }

        for translation in postTranslations ?? [] {
            codes.formUnion(normalised(translation.language))
        }

        return codes.sorted()
    }

    /// `true` dès qu'il existe un texte à traduire — sur le canvas ou en
    /// légende. Pilote l'apparition du bouton « Traductions » : sans texte, le
    /// bouton n'aurait rien à offrir.
    public static func hasTranslatableText(effects: StoryEffects?, content: String?) -> Bool {
        if let content, !content.trimmed.isEmpty { return true }
        return (effects?.textObjects ?? []).contains { !$0.text.trimmed.isEmpty }
    }

    /// Un code vide ou blanc n'est pas une langue — il ne doit jamais produire
    /// de drapeau. Renvoyer un `Set` (vide ou singleton) permet au call site de
    /// rester une simple `formUnion` sans `if let` imbriqué.
    private static func normalised(_ code: String?) -> Set<String> {
        guard let code, !code.trimmed.isEmpty else { return [] }
        return [StoryPrismeMatch.base(code)]
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
