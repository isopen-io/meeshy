import Foundation

/// Les trois fonctionnalités de la Lentille, chacune avec son drapeau :
/// `lentilleList` (la liste de conversations), `readingModes` (les modes de
/// lecture du fil) et `riviereMode` (la sélectionnabilité de la Rivière, qui
/// n'est qu'un mode de lecture de plus).
///
/// **Sorties de bêta le 2026-09-14 (directive porteur, #6482).** Elles ont
/// vécu derrière la préférence « Activer les bêta » (I-075, défaut OFF depuis
/// le 2026-08-22). Elles sont désormais actives par défaut et ont chacune leur
/// interrupteur dans les Réglages (section Apparence). Aucune migration de
/// valeurs : les clés propres n'avaient jamais été écrites en production, et
/// la clé de l'ancienne préférence est retirée au lancement
/// (`removeRetiredBetaPreference`).
///
/// Résolution, par drapeau : surcharge process (`"1"`/`"0"`, tests UI et
/// TestFlight) → clé propre si elle a été écrite, dans les deux sens → défaut ON.
nonisolated enum LentilleFeatureFlag: CaseIterable {
    case lentilleList
    case readingModes
    /// Consommé comme `isRiverFlagEnabled` de
    /// `ReadingModeOrchestrator.ResolveCapabilitiesInput` : sans modes de
    /// lecture actifs, la loi ne rend jamais la Rivière sélectionnable.
    case riviereMode

    var userDefaultsKey: String {
        switch self {
        case .lentilleList: return "meeshy.flag.lentille_list"
        case .readingModes: return "meeshy.flag.reading_modes"
        case .riviereMode: return "meeshy.flag.riviere_mode"
        }
    }

    var environmentKey: String {
        switch self {
        case .lentilleList: return "MEESHY_FLAG_LENTILLE_LIST"
        case .readingModes: return "MEESHY_FLAG_READING_MODES"
        case .riviereMode: return "MEESHY_FLAG_RIVIERE_MODE"
        }
    }

    /// Injectable — les tests passent leur propre `UserDefaults` et leur propre
    /// dictionnaire d'environnement, jamais `.standard` ni le vrai
    /// `ProcessInfo`. `"1"` force ON, `"0"` force OFF ; toute autre valeur
    /// retombe sur la clé propre. `bool(forKey:)` et non un cast : une clé posée
    /// en argument de lancement (`-meeshy.flag.lentille_list NO`) est une
    /// chaîne, que seul `bool(forKey:)` sait lire.
    func isEnabled(
        defaults: UserDefaults = .standard,
        environment: [String: String] = ProcessEnvironmentSnapshot.current
    ) -> Bool {
        switch environment[environmentKey] {
        case "1": return true
        case "0": return false
        default: break
        }
        guard defaults.object(forKey: userDefaultsKey) != nil else { return true }
        return defaults.bool(forKey: userDefaultsKey)
    }

    /// L'écrivain des interrupteurs des Réglages — `UserDefaults` seulement,
    /// jamais l'environnement process. Rallumer ÉCRIT `true` plutôt que de
    /// retirer la clé : le choix survit à un futur changement de défaut.
    static func setEnabled(
        _ flag: LentilleFeatureFlag,
        enabled: Bool,
        defaults: UserDefaults = .standard
    ) {
        defaults.set(enabled, forKey: flag.userDefaultsKey)
    }

    /// Outils de développement — même clé que `setEnabled`.
    static func setForDebug(
        _ flag: LentilleFeatureFlag,
        enabled: Bool,
        defaults: UserDefaults = .standard
    ) {
        setEnabled(flag, enabled: enabled, defaults: defaults)
    }

    /// La clé de l'ancienne préférence « Activer les bêta », qui ne gouverne
    /// plus rien depuis le 2026-09-14.
    static let retiredBetaPreferenceKey = "meeshy.pref.beta_features_enabled"

    /// Appelée au lancement (`MeeshyApp.init`) ; sans effet quand la clé est
    /// déjà absente.
    static func removeRetiredBetaPreference(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: retiredBetaPreferenceKey)
    }

    static var isLentilleListEnabled: Bool {
        LentilleFeatureFlag.lentilleList.isEnabled()
    }

    static var isReadingModesEnabled: Bool {
        LentilleFeatureFlag.readingModes.isEnabled()
    }

    static var isRiviereModeEnabled: Bool {
        LentilleFeatureFlag.riviereMode.isEnabled()
    }
}

// MARK: - Instantané d'environnement

/// L'environnement du processus, matérialisé UNE fois.
///
/// `ProcessInfo.processInfo.environment` construit un `[String: String]`
/// complet à CHAQUE lecture (pont Objective-C → Swift). Pris comme paramètre
/// par défaut de `isEnabled(defaults:environment:)`, il était réévalué à
/// chaque appel — et le drapeau `lentille_list` est lu par rang, par passe
/// de body, par aperçu, par décision de carte : une allocation de
/// dictionnaire par rangée et par passe (audit fluidité 2026-08-21, H1/H2).
/// L'environnement d'un processus ne change pas après son lancement ; les
/// tests injectent le leur par paramètre et ne passent jamais par ici.
nonisolated enum ProcessEnvironmentSnapshot {
    static let current: [String: String] = ProcessInfo.processInfo.environment
}
