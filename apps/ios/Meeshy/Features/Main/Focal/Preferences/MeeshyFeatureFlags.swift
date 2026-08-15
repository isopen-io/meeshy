import Foundation

/// Point d'entrée WS-1 (`focal-implementation-contract.md` §WS-1) pour la
/// question « les modes de lecture sont-ils autorisés ? ».
///
/// RE-PREUVE (F-080) : `grep -rn "reading_modes\|MEESHY_FLAG_READING"
/// apps/ios` montre que le drapeau existe déjà — `LentilleFeatureFlag.readingModes`
/// (M-046, `Lentille/Core/LentilleFeatureFlag.swift`), résolu
/// `ProcessInfo` (`MEESHY_FLAG_READING_MODES`) PRIME sur `UserDefaults`
/// (clé `meeshy.flag.reading_modes`), défaut OFF, déjà couvert par
/// `LentilleFlagGateTests`.
///
/// `LentilleFeatureFlag.swift` anticipe explicitement ce fichier : « Toute
/// évolution ultérieure qui introduirait un `MeeshyFeatureFlags` central
/// doit migrer ces deux cas dedans plutôt que d'en garder un second
/// mécanisme parallèle. » Ce fichier NE DUPLIQUE PAS la résolution — il
/// délègue. Migrer complètement `lentilleList` ici serait hors périmètre de
/// WS-1 (propriété Lentille/I-*, pas Focal/F-*) ; seul `isReadingModesEnabled`
/// est exposé, sous le nom que le contrat Focal attend.
nonisolated enum MeeshyFeatureFlags {

    /// Lecture au vrai domaine (`UserDefaults.standard` + `ProcessInfo.processInfo`).
    /// Réservé au code de production — jamais aux tests (résidu inter-suites,
    /// même règle que `LentilleFeatureFlag`).
    static var isReadingModesEnabled: Bool {
        LentilleFeatureFlag.isReadingModesEnabled
    }

    /// Variante injectable — seule forme utilisée par les tests, pour ne
    /// jamais laisser de résidu dans `UserDefaults.standard`.
    static func isReadingModesEnabled(
        defaults: UserDefaults,
        environment: [String: String]
    ) -> Bool {
        LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment)
    }
}
