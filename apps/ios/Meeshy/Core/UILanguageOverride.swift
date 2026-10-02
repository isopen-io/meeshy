import Foundation
import MeeshySDK

// MARK: - UI Language Override (Prisme Linguistique)

/// Force le chrome de l'app (menus, boutons, libellés système) dans la langue
/// principale configurée de l'utilisateur (`MeeshyUser.systemLanguage`) plutôt
/// que la locale de l'appareil — le Prisme Linguistique appliqué au chrome :
/// l'utilisateur consomme TOUT dans sa langue préférée.
///
/// Mécanisme : on écrit `AppleLanguages` dans `UserDefaults`. iOS lit cette clé
/// UNE seule fois au démarrage du process → l'override prend effet au prochain
/// (re)lancement (acceptable : l'app est relancée aux tests).
///
/// Garde-fous : on ne force JAMAIS une langue absente du catalogue traduit —
/// sinon `String(localized:)` afficherait la source française à côté de
/// libellés traduits, et l'écran deviendrait un panachage de deux langues.
/// Un cache nil/vide/non-supporté ⇒ no-op total (iOS garde la locale appareil).
/// Aucune de ces opérations ne peut crasher.
enum UILanguageOverride {
    /// Langues réellement traduites dans les catalogues. Toute langue hors de
    /// cet ensemble est refusée.
    ///
    /// La liste est explicite plutôt que dérivée de `Bundle.main.localizations` :
    /// une langue peut être déclarée dans le bundle bien avant d'être traduite,
    /// et c'est la traduction — pas la déclaration — qui décide si l'affichage
    /// tient debout. `LocalizationCatalogGuardTests` vérifie que les deux
    /// restent d'accord, pour que cette liste ne puisse pas se périmer en
    /// silence comme elle l'a fait pour l'allemand et le portugais.
    ///
    /// `it` et `ar` rejoignent la liste le 2026-07-25 : les deux catalogues
    /// (app + SDK), l'extension de notification et les descriptions
    /// d'autorisation y sont complets à 100 %.
    /// `nonisolated` : une simple liste de codes, lue aussi bien depuis
    /// `MeeshyApp.init()` que depuis les tests, hors du main actor.
    nonisolated static let supportedUICodes: [String] = ["fr", "en", "es", "de", "pt-BR", "it", "ar"]

    private static let cacheKey = "meeshy.ui.language"
    private static let appleLanguagesKey = "AppleLanguages"
    private static let explicitKey = "meeshy.ui.language.explicit"

    /// Sentinelle « suivre la langue principale » — un choix, pas une langue.
    nonisolated static let automaticCode = "auto"

    /// Langues proposées dans les Réglages, hors sentinelle. Dérivée de ce que
    /// l'app sait réellement afficher : la liste des choix ne peut pas
    /// s'écarter des catalogues.
    nonisolated static var selectableCodes: [String] { supportedUICodes }

    /// Langue d'affichage retenue : le choix explicite de l'auteur s'il est
    /// posé ET livré, sinon la langue principale du compte.
    ///
    /// Le repli n'est pas un détail. `AppearancePreferences.interfaceLanguage`
    /// vaut « en » par défaut pour tout le monde : faire primer cette
    /// préférence telle quelle aurait basculé en anglais l'interface de chaque
    /// utilisateur qui n'y a jamais touché. Le choix explicite vit donc à part,
    /// et son absence rend la main à la langue principale.
    nonisolated static func resolvedCode(explicit: String?, fallback: String?) -> String? {
        if let explicit, explicit != automaticCode, let code = normalized(explicit) {
            return code
        }
        return normalized(fallback)
    }

    /// Choix explicite de langue d'interface. `nil` = automatique.
    static var explicitChoice: String? {
        get { UserDefaults.standard.string(forKey: explicitKey) }
        set {
            if let newValue, newValue != automaticCode, normalized(newValue) != nil {
                UserDefaults.standard.set(newValue, forKey: explicitKey)
            } else {
                UserDefaults.standard.removeObject(forKey: explicitKey)
            }
        }
    }

    /// Normalise un code de langue vers un code UI supporté, ou `nil`.
    /// - Comparaison insensible à la casse contre `supportedUICodes`.
    /// - `pt` (ou `pt_PT`, `pt-BR`…) → `pt-BR` (seule variante portugaise traduite).
    /// - Sinon réduit à la base 2-lettres lowercase et re-teste l'appartenance.
    nonisolated static func normalized(_ raw: String?) -> String? {
        guard let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        let lower = trimmed.lowercased()
        if let exact = supportedUICodes.first(where: { $0.lowercased() == lower }) {
            return exact
        }
        let base = lower.split(whereSeparator: { $0 == "-" || $0 == "_" })
            .first.map(String.init) ?? lower
        if base == "pt" { return "pt-BR" }
        return supportedUICodes.first(where: { $0.lowercased() == base })
    }

    /// Mémorise la langue UI depuis la préférence utilisateur. No-op si la
    /// langue n'est pas supportée (la valeur précédente / la locale appareil
    /// reste en place).
    static func cache(from systemLanguage: String?) {
        guard let code = normalized(systemLanguage) else { return }
        UserDefaults.standard.set(code, forKey: cacheKey)
    }

    /// Applique l'override au tout début du lancement (à appeler depuis
    /// `MeeshyApp.init()`). No-op si rien n'est choisi ni mis en cache.
    static func applyIfNeeded() {
        guard let code = resolvedCode(explicit: explicitChoice,
                                      fallback: UserDefaults.standard.string(forKey: cacheKey))
        else { return }
        UserDefaults.standard.set([code], forKey: appleLanguagesKey)
    }

    // MARK: - Langue des notifications (#8951)

    /// La langue que l'app publie à ses extensions de notification : le choix
    /// résolu (explicite, sinon la langue principale), sinon la localisation
    /// que l'app affiche. Jamais `nil` tant que l'app affiche quelque chose —
    /// une extension qui ne lit rien parle la langue de l'APPAREIL.
    nonisolated static func interfaceCode(explicit: String?, fallback: String?, running: String?) -> String? {
        resolvedCode(explicit: explicit, fallback: fallback) ?? running
    }

    /// Publie la langue d'interface dans le groupe d'app. Rend `true` si elle
    /// a changé.
    @discardableResult
    static func publishInterfaceLanguage(
        to store: InterfaceLanguageProviding = AppGroupInterfaceLanguageStore()
    ) -> Bool {
        let code = interfaceCode(
            explicit: explicitChoice,
            fallback: UserDefaults.standard.string(forKey: cacheKey),
            running: Bundle.main.preferredLocalizations.first
        )
        guard store.publishedCode != code else { return false }
        store.publish(code)
        return true
    }

    /// Après un changement de langue (réglage, langue principale du compte) :
    /// les extensions la lisent à la prochaine notification, et les actions
    /// enregistrées par l'app se réenregistrent dans la même langue.
    static func refreshNotificationLanguage() {
        guard publishInterfaceLanguage() else { return }
        AppDelegate.registerNotificationCategories()
    }
}
