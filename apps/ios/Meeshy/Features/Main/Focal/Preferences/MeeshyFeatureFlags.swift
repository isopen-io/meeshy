import Foundation

/// Point d'entrée WS-1 (`focal-implementation-contract.md` §WS-1) pour la
/// question « les modes de lecture sont-ils autorisés ? ».
///
/// RE-PREUVE (F-080) : `grep -rn "reading_modes\|MEESHY_FLAG_READING"
/// apps/ios` montre que le drapeau existe déjà — `LentilleFeatureFlag.readingModes`
/// (M-046, `Lentille/Core/LentilleFeatureFlag.swift`), résolu
/// `ProcessInfo` (`MEESHY_FLAG_READING_MODES`) PRIME sur `UserDefaults`
/// (clé `meeshy.flag.reading_modes` — SI POSÉE EXPLICITEMENT), déjà couvert
/// par `LentilleFlagGateTests`.
///
/// **RE-PREUVE (I-075, second amendement 2026-08-16)** : « défaut OFF »
/// n'est plus vrai. Clé jamais posée ⇒ `LentilleFeatureFlag.readingModes`
/// replie sur `BetaFeaturesPreference.isEnabled` (défaut ON) — le drapeau
/// devient le premier « client » du programme bêta : à l'installation, les
/// modes de lecture sont ACTIFS (l'orchestrateur GELÉ décide au tap normal
/// d'une conversation), et couper « Activer les bêta » (réglages) les
/// désactive tous d'un coup. Voir la docstring de `LentilleFeatureFlag`
/// pour la cascade à trois étages.
///
/// **I-075 RETIRÉ le 2026-08-18 (décision produit) — « défaut OFF » est de
/// nouveau vrai.** Le paragraphe ci-dessus décrit l'état du code entre le
/// 2026-08-16 et le 2026-08-18, conservé pour l'historique. Depuis le
/// retrait, une bêta jamais touchée ne vaut pas opt-in — et depuis le
/// 2026-08-22 la préférence bêta naît elle-même OFF : à l'installation, rien
/// n'étant posé, `isReadingModesEnabled` vaut `false` et le tap normal ouvre
/// en BULLES. L'opt-in volontaire (toggle « Bêta » réellement basculé, ou clé
/// `meeshy.flag.reading_modes` posée) reste intégralement honoré, dans les
/// deux sens.
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

    // MARK: - `agent_grammar` (WS-10, F-089)

    /// « Allumer la grammaire ✦ démasque rétroactivement l'animateur de
    /// production, qui poste aujourd'hui SOUS L'IDENTITÉ DE VRAIS
    /// UTILISATEURS » (contrat §WS-10). Drapeau PROPRE, INDÉPENDANT de
    /// `isReadingModesEnabled` — OFF par défaut, activation soumise à une
    /// décision produit ÉCRITE (§WS-10, risque R14). Tant que le chemin de
    /// production non écrivant (C3, `tasks/lentille-implementation-contract.md`
    /// §5.2) n'existe pas côté serveur, AUCUN agent ne doit activer ce
    /// drapeau — le contrat interdit littéralement de le faire depuis ce
    /// chantier.
    ///
    /// Résolution AUTONOME (pas une délégation à `LentilleFeatureFlag`,
    /// contrairement à `isReadingModesEnabled`) : `Lentille/Core/` est
    /// GELÉ et interdit d'édition dans ce chantier (fichiers interdits,
    /// mission F-089) — ajouter un troisième cas à `LentilleFeatureFlag`
    /// exigerait de l'éditer. Même patron de résolution (`ProcessInfo`
    /// prime sur `UserDefaults`, défaut OFF), clés dédiées.
    private static let agentGrammarUserDefaultsKey = "meeshy.flag.agent_grammar"
    private static let agentGrammarEnvironmentKey = "MEESHY_FLAG_AGENT_GRAMMAR"

    static var isAgentGrammarEnabled: Bool {
        isAgentGrammarEnabled(defaults: .standard, environment: ProcessInfo.processInfo.environment)
    }

    /// Variante injectable — voir `isReadingModesEnabled(defaults:environment:)`,
    /// même règle : jamais `.standard` dans un test.
    static func isAgentGrammarEnabled(
        defaults: UserDefaults,
        environment: [String: String]
    ) -> Bool {
        switch environment[agentGrammarEnvironmentKey] {
        case "1": return true
        case "0": return false
        default: return defaults.bool(forKey: agentGrammarUserDefaultsKey)
        }
    }
}
