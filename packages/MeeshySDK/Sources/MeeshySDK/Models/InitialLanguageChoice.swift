import Foundation

/// Le choix INITIAL d'une langue parmi celles qu'un écran sait servir — un défaut
/// de composition (un document légal, un sélecteur), jamais une lecture du Prisme.
/// Les langues préférées passent d'abord, la locale appareil ensuite, puis le repli.
public enum InitialLanguageChoice {

    public static func resolve(
        preferred: [String],
        deviceLocale: String?,
        supported: Set<String>,
        fallback: String
    ) -> String {
        let candidates = preferred + [deviceLocale].compactMap { $0 }
        return candidates
            .lazy
            .map { String($0.prefix(2)).lowercased() }
            .first(where: supported.contains) ?? fallback
    }
}
