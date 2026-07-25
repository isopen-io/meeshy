import Foundation

/// Quelle version linguistique un lecteur a RÉELLEMENT sous les yeux.
///
/// ## Pourquoi ce n'est pas simplement « sa langue préférée »
///
/// Meeshy affiche le même message dans autant de langues qu'il y a de lecteurs,
/// mais une traduction n'existe pas toujours. Quand elle manque, c'est
/// l'ORIGINAL qui s'affiche : déclarer que le message a été lu dans la langue
/// préférée mentirait précisément là où l'auteur a besoin de savoir — « m'a-t-on
/// lu dans ma langue, ou traduit ? ».
///
/// ## La règle suit celle du TEXTE
///
/// Même ordre, même repli, même interdit que `resolveUserLanguage` côté shared :
/// jamais de repli sur une traduction tierce. L'absence de traduction dans une
/// langue préférée signifie que le contenu y est déjà, ou qu'aucune traduction
/// n'a été produite ; servir une langue sans rapport serait pire que l'original.
///
/// Toute divergence entre cette résolution et celle du texte produirait une
/// statistique fausse — d'où le miroir strict.
///
/// Miroir TypeScript : `apps/web/utils/consumed-language.ts` — mêmes cas.
/// Voir `docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md`.
public enum ConsumedLanguageResolver {

    /// - Parameters:
    ///   - originalLanguage: langue de rédaction du contenu.
    ///   - availableTranslations: langues pour lesquelles une traduction existe.
    ///   - preferredLanguages: préférences du lecteur, DANS L'ORDRE.
    ///   - manualSelection: version explicitement ouverte par le lecteur, qui
    ///     prime sur ses préférences — il a vu celle-là.
    /// - Returns: le code de la version affichée, `nil` s'il est impossible de
    ///   le déterminer. Mieux vaut ne rien rapporter qu'inventer une langue.
    public static func resolve(
        originalLanguage: String?,
        availableTranslations: [String],
        preferredLanguages: [String],
        manualSelection: String? = nil
    ) -> String? {
        let original = MeeshyUser.normalizeLanguageCode(originalLanguage)
        let translations = Set(availableTranslations.compactMap(MeeshyUser.normalizeLanguageCode))

        // Une bascule explicite l'emporte : le lecteur a choisi cette version.
        // Encore faut-il qu'elle existe — un code périmé ne doit pas être pris
        // pour argent comptant.
        if let manual = MeeshyUser.normalizeLanguageCode(manualSelection),
           manual == original || translations.contains(manual) {
            return manual
        }

        for candidate in preferredLanguages.compactMap(MeeshyUser.normalizeLanguageCode) {
            // Le contenu est déjà dans cette langue : c'est l'original qui
            // s'affiche, aucune traduction n'entre en jeu.
            if candidate == original { return original }
            if translations.contains(candidate) { return candidate }
        }

        // Aucune préférence servie : le lecteur voit l'original. `nil` quand
        // même celui-ci est inconnu — rien de fiable à déclarer.
        return original
    }
}
