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
///
/// I-075 — un troisième cas `focalDevPreview` a vécu ICI un temps (item de
/// menu « Focal (dev) »), REMPLACÉ par décision produit (amendement
/// 2026-08-16) : la garde de visibilité de l'item « Focal (bêta) » n'est plus
/// un drapeau de développement cachée mais une PRÉFÉRENCE UTILISATEUR de
/// plein droit, défaut ON — voir `BetaFeaturesPreference`
/// (`Lentille/Core/BetaFeaturesPreference.swift`), un type SÉPARÉ plutôt
/// qu'un troisième cas ici : le patron `isEnabled(defaults:environment:)` de
/// ce fichier retombe sur `defaults.bool(forKey:)` (défaut `false` en
/// l'absence de clé), inadapté à un défaut ON. `BetaFeaturesPreference`
/// réutilise la MÊME discipline injectable (defaults + environment en
/// paramètres, jamais `.standard`/le vrai `ProcessInfo` en test) sans forcer
/// ce fichier à distinguer deux polarités de défaut.
///
/// I-075 — SECOND amendement produit (2026-08-16, prime sur le premier) :
/// `readingModes` devient le PREMIER « client » du programme bêta.
/// `BetaFeaturesPreference` ne se contente plus de gater un item de menu —
/// « Activer les bêta » ON active tout le système de modes de lecture au TAP
/// NORMAL d'une conversation (l'orchestrateur GELÉ décide Bulles/Résumé/
/// Focal/Rivière comme toujours, avec les données réelles). `isEnabled`
/// (ci-dessous) porte cette cascade à TROIS étages, réservée à
/// `.readingModes` — `.lentilleList` NE CHANGE PAS (reste défaut OFF, hors
/// périmètre bêta pour l'instant) :
/// 1. `environment[environmentKey]` — surcharge process, INCHANGÉE (tests/CI).
/// 2. `defaults.object(forKey: userDefaultsKey) != nil` — la clé
///    `meeshy.flag.reading_modes` a été posée EXPLICITEMENT (réglages cachés
///    historiques, ou un test) : SA valeur gouverne, MÊME si elle vaut
///    `false` avec la bêta ON — c'est le seul moyen de couper `reading_modes`
///    seul sans toucher au reste du programme bêta.
/// 3. Sinon (clé jamais posée) : replie sur `BetaFeaturesPreference.isEnabled`
///    (défaut ON) — à l'installation, `reading_modes` est donc ON par la
///    bêta, et couper « Activer les bêta » rend TOUT le système inactif
///    (chemins historiques bit-à-bit, `.bubbles`).
nonisolated enum LentilleFeatureFlag {
    case lentilleList
    case readingModes
    /// R-133 — le troisième drapeau annoncé par la doc de tête : couvre
    /// UNIQUEMENT la sélectionnabilité de la peau Rivière. Défaut OFF, DEUX
    /// étages seulement (env → `defaults.bool`), comme `lentilleList` —
    /// jamais de cascade bêta (réservée à `readingModes`, docstring
    /// ci-dessus, second amendement I-075) : activer le programme bêta
    /// n'ouvre JAMAIS la Rivière tout seul, elle reste un choix séparé.
    /// Consommé comme `isRiverFlagEnabled` de
    /// `ReadingModeOrchestrator.ResolveCapabilitiesInput` (amendement R) —
    /// AUCUN site de montage ne câble encore cette entrée (R-135, hors
    /// périmètre de ce lot) : à drapeau OFF ou ON, `resolveCapabilities`
    /// reçoit son défaut `false` tant que ce câblage n'existe pas, donc le
    /// mode ne s'ouvre nulle part — snapshot OFF identique par construction,
    /// pas par gate applicatif.
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

    /// Injectable — les tests passent leur propre `UserDefaults` (jamais
    /// `.standard`, cf. `StoryVisibilityPreferenceStore`) et leur propre
    /// dictionnaire d'environnement, pour ne jamais dépendre du process réel
    /// ni y laisser de résidu. La surcharge process prime : `"1"` force ON,
    /// `"0"` force OFF, toute autre valeur (y compris absente) retombe :
    /// - `.lentilleList` → `defaults.bool(forKey:)` (défaut `false`, INCHANGÉ) ;
    /// - `.readingModes` → clé EXPLICITEMENT posée (`object(forKey:) != nil`)
    ///   ⇒ sa valeur ; sinon `BetaFeaturesPreference.isEnabled` (défaut
    ///   `true` — second amendement I-075, docstring du type ci-dessus).
    func isEnabled(
        defaults: UserDefaults = .standard,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> Bool {
        switch environment[environmentKey] {
        case "1": return true
        case "0": return false
        default: break
        }
        if case .readingModes = self, defaults.object(forKey: userDefaultsKey) == nil {
            return BetaFeaturesPreference.isEnabled(defaults: defaults, environment: environment)
        }
        return defaults.bool(forKey: userDefaultsKey)
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

    static var isRiviereModeEnabled: Bool {
        LentilleFeatureFlag.riviereMode.isEnabled()
    }
}
