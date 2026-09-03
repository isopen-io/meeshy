import Foundation

/// **Le prisme STRICT du lecteur — UNE descente, pour tout ce qui GRAVE ou
/// AFFICHE une traduction dans la conversation.**
///
/// Rangs 1 → 4 du Prisme Linguistique (`systemLanguage`, `regionalLanguage`,
/// `customDestinationLanguage`, locale appareil), dédoublonnés sans casse, la
/// locale appareil normalisée en ISO 639-1 — et AUCUN repli « fr » : une
/// liste vide dit « aucune préférence », et la règle 1 du Prisme sert alors
/// l'ORIGINAL, jamais le premier venu. C'est la différence, voulue, avec
/// `MeeshyUser.preferredContentLanguages`, dont le repli « fr » sert les
/// DÉFAUTS de composition (langue proposée au composer), pas la lecture.
///
/// Deux producteurs vivaient : `ConversationLanguagePreferences.resolved`
/// (app — ce que la BULLE affiche et ce que le chemin REST grave dans
/// `replyToJson`) et `MessagePersistenceActor.readerPrism()` (SDK — ce que le
/// chemin SOCKET grave), qui lisait `preferredContentLanguages`. Ils
/// divergeaient exactement là où rien ne les teste : locale appareil absente
/// du serveur (`Locale.current` d'un côté, rien de l'autre), aucune langue
/// configurée (`[]` contre `["fr"]`). Le MÊME message cité se gravait alors
/// sous deux textes selon le chemin qui l'avait ingéré, et chaque ouverture
/// rejouait un changement de ligne — et un reconfigure — pour un contenu
/// identique. Une seule fonction ferme la classe entière.
public enum ReaderPrism {

    /// La locale appareil qui entre au rang 4 : celle que la passerelle a
    /// persistée (`User.deviceLocale`, en-tête `X-Device-Locale`) quand elle
    /// l'a, sinon celle de l'appareil lui-même — au démarrage à froid, le
    /// serveur n'a pas encore vu ce client.
    public static func deviceLocale(for user: MeeshyUser?, current: Locale = .current) -> String? {
        if let stored = user?.deviceLocale, !stored.isEmpty { return stored }
        return current.language.languageCode?.identifier
    }

    /// Le prisme du lecteur pour `user`. Sans session, la locale de l'appareil
    /// seule : un participant anonyme lit dans sa langue quand une traduction
    /// existe, l'original sinon.
    public static func resolve(for user: MeeshyUser?, current: Locale = .current) -> [String] {
        resolve(
            systemLanguage: user?.systemLanguage,
            regionalLanguage: user?.regionalLanguage,
            customDestinationLanguage: user?.customDestinationLanguage,
            deviceLocale: deviceLocale(for: user, current: current)
        )
    }

    /// La descente elle-même, pure : quatre rangs dans l'ORDRE, chacun ignoré
    /// s'il est vide ou déjà servi (comparaison sans casse — la première
    /// orthographe gagne), la locale appareil normalisée par le miroir Swift
    /// de `language-normalize.ts` et ignorée si elle ne se normalise pas.
    public static func resolve(
        systemLanguage: String?,
        regionalLanguage: String?,
        customDestinationLanguage: String?,
        deviceLocale: String?
    ) -> [String] {
        [systemLanguage, regionalLanguage, customDestinationLanguage, MeeshyUser.normalizeLanguageCode(deviceLocale)]
            .reduce(into: [String]()) { prism, candidate in
                guard let candidate, !candidate.isEmpty,
                      !prism.contains(where: { $0.caseInsensitiveCompare(candidate) == .orderedSame })
                else { return }
                prism.append(candidate)
            }
    }
}
