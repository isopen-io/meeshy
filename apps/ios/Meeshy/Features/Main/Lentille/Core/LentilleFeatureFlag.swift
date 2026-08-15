import Foundation

/// Les deux drapeaux de la Lentille, INDÉPENDANTS l'un de l'autre (workshop
/// §7 — « trois drapeaux, indépendants » : `lentille_list` couvre la liste de
/// conversations, `reading_modes` couvre le fil hérité de #3010 ; le
/// troisième, `riviere_mode`, est porté ailleurs — R-133).
///
/// Ré-preuve M-046 : `MeeshyFeatureFlags` n'existe dans AUCUN fichier Swift du
/// dépôt (`apps/ios`, `packages/MeeshySDK`) — seules des mentions textuelles
/// figurent dans des `.md`. Le contrat Lentille (#3010 E1) documente cette
/// absence : ce type EST le premier mécanisme de drapeau iOS, co-défini avec
/// la Lentille plutôt que réutilisé. Toute évolution ultérieure qui
/// introduirait un `MeeshyFeatureFlags` central doit migrer ces deux cas
/// dedans plutôt que d'en garder un second mécanisme parallèle.
///
/// Résolution, par drapeau : `ProcessInfo.processInfo.environment` (surcharge
/// process — tests UI, TestFlight) PRIME sur `UserDefaults` (bascule cachée
/// des réglages, lot séparé) ; défaut OFF dans les deux cas.
nonisolated enum LentilleFeatureFlag {
    case lentilleList
    case readingModes

    var userDefaultsKey: String {
        switch self {
        case .lentilleList: return "meeshy.flag.lentille_list"
        case .readingModes: return "meeshy.flag.reading_modes"
        }
    }

    var environmentKey: String {
        switch self {
        case .lentilleList: return "MEESHY_FLAG_LENTILLE_LIST"
        case .readingModes: return "MEESHY_FLAG_READING_MODES"
        }
    }

    /// Injectable — les tests passent leur propre `UserDefaults` (jamais
    /// `.standard`, cf. `StoryVisibilityPreferenceStore`) et leur propre
    /// dictionnaire d'environnement, pour ne jamais dépendre du process réel
    /// ni y laisser de résidu. La surcharge process prime : `"1"` force ON,
    /// `"0"` force OFF, toute autre valeur (y compris absente) retombe sur
    /// `UserDefaults`.
    func isEnabled(
        defaults: UserDefaults = .standard,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> Bool {
        switch environment[environmentKey] {
        case "1": return true
        case "0": return false
        default: return defaults.bool(forKey: userDefaultsKey)
        }
    }

    /// Bascule cachée des réglages (câblage UI dans un lot séparé) — écrit
    /// uniquement `UserDefaults`, jamais l'environnement process.
    static func setForDebug(
        _ flag: LentilleFeatureFlag,
        enabled: Bool,
        defaults: UserDefaults = .standard
    ) {
        defaults.set(enabled, forKey: flag.userDefaultsKey)
    }

    static var isLentilleListEnabled: Bool {
        LentilleFeatureFlag.lentilleList.isEnabled()
    }

    static var isReadingModesEnabled: Bool {
        LentilleFeatureFlag.readingModes.isEnabled()
    }
}
