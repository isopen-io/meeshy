import Foundation

/// **Ce qu'on offre entre une légende et son invite** (#6504).
///
/// Directive porteur 2026-09-14 : « mettre entre les deux l'icône de traduction,
/// la sélection de la langue d'affichage s'il existe des traductions déjà, ou
/// l'icône pour traduire immédiatement » — et cette icône « ouvre la feuille
/// habituelle de traduction, celle des messages, des audios, pour demander une
/// traduction de ce contenu dans la langue souhaitée ».
///
/// Pure, et hors de toute vue : la rangée n'a qu'à rendre ce que la règle
/// décide. La feuille propose toutes les langues : l'icône n'est un contrôle
/// inerte que si la langue d'origine est inconnue (loi 4).
nonisolated enum CaptionTranslationOffer: Equatable {
    /// Rien à offrir.
    case none
    /// Au moins deux langues distinctes : l'origine en tête, puis les
    /// traductions dans l'ordre alphabétique. `active` est la langue affichée.
    case languages(codes: [String], active: String?)
    /// Aucune autre langue à choisir : l'icône ouvre la feuille de traduction.
    case translate

    static func resolve(originalLanguage: String?,
                        translationLanguages: [String],
                        activeLanguage: String?) -> CaptionTranslationOffer {
        let origine = originalLanguage.flatMap { $0.isEmpty ? nil : $0 }
        let cleOrigine = origine?.lowercased()

        let traductions = translationLanguages
            .filter { !$0.isEmpty && $0.lowercased() != cleOrigine }
            .reduce(into: [String]()) { vus, code in
                if !vus.contains(where: { $0.lowercased() == code.lowercased() }) { vus.append(code) }
            }
            .sorted { $0.lowercased() < $1.lowercased() }
        let codes = (origine.map { [$0] } ?? []) + traductions

        if codes.count >= 2 {
            return .languages(codes: codes, active: activeLanguage)
        }
        return origine == nil ? .none : .translate
    }
}
