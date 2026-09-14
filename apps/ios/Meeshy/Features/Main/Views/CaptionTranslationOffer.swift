import Foundation

/// **Ce qu'on offre entre une légende et son invite** (#6504).
///
/// Directive porteur 2026-09-14 : « mettre entre les deux l'icône de traduction,
/// la sélection de la langue d'affichage s'il existe des traductions déjà, ou
/// l'icône pour traduire immédiatement ».
///
/// Pure, et hors de toute vue : la rangée n'a qu'à rendre ce que la règle
/// décide. Elle refuse d'offrir un contrôle qui ne ferait rien (loi 4) — un
/// sélecteur à une seule langue, un « traduire » vers la langue dans laquelle la
/// légende est déjà écrite.
nonisolated enum CaptionTranslationOffer: Equatable {
    /// Rien à offrir.
    case none
    /// Au moins deux langues distinctes : l'origine en tête, puis les
    /// traductions dans l'ordre alphabétique. `active` est la langue affichée.
    case languages(codes: [String], active: String?)
    /// Aucune traduction : on propose de traduire vers `target`, la première
    /// langue préférée du lecteur qui n'est pas celle de la légende.
    case translateNow(target: String)

    static func resolve(originalLanguage: String?,
                        translationLanguages: [String],
                        preferredLanguages: [String],
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
        guard let cible = preferredLanguages
            .map({ $0.lowercased() })
            .first(where: { !$0.isEmpty && $0 != cleOrigine }) else { return .none }
        return .translateNow(target: cible)
    }
}
