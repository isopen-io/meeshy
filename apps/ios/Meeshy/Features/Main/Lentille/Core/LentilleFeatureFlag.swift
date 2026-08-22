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
/// (ci-dessous) porte cette cascade à TROIS étages, à l'époque réservée à
/// `.readingModes` — `.lentilleList` restait alors défaut OFF, hors périmètre
/// bêta. **Cette réserve est levée depuis le 2026-08-19** : les deux drapeaux
/// sont couverts, voir `isCoveredByBetaProgramme` pour la loi À DATE et son
/// motif. Le paragraphe ci-dessous décrit donc l'état du 2026-08-16, conservé
/// comme historique :
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
///
/// I-075 — **RETIRÉ le 2026-08-18 (décision produit)**. L'étage 3 ci-dessus
/// faisait qu'une installation N'AYANT RIEN DEMANDÉ ouvrait ses
/// conversations via l'orchestrateur (tap normal ⇒ Focal/Résumé), parce que
/// l'ABSENCE de la clé bêta valait `true`. La décision produit du
/// 2026-08-18 retire ce repli implicite : une installation neuve ouvre en
/// BULLES (comportement historique). L'historique ci-dessus est CONSERVÉ à
/// dessein — il dit ce que le code a fait entre le 2026-08-16 et le
/// 2026-08-18, pas ce qu'il fait aujourd'hui.
///
/// Ce que le retrait change, EXACTEMENT (« absence ⇒ OFF ») :
/// 1. **Absence de toute clé ⇒ OFF.** Ni env, ni `meeshy.flag.reading_modes`,
///    ni `meeshy.pref.beta_features_enabled` ⇒ `false`.
/// 2. **Les choix explicites survivent, dans les deux sens** — l'étage 1
///    (env `MEESHY_FLAG_READING_MODES`, `"1"`/`"0"`) et l'étage 2 (clé
///    `meeshy.flag.reading_modes` posée, `true` ET `false`) sont INCHANGÉS.
/// 3. **L'opt-in bêta VOLONTAIRE n'est pas retiré** : l'étage 3 subsiste,
///    mais n'est consulté que si la préférence bêta est EXPRIMÉE
///    (`BetaFeaturesPreference.isExplicitlySet` — clé écrite, ou surcharge
///    process reconnue). Toggle « Bêta » explicitement ON ⇒ modes de lecture
///    ON, comme avant ; explicitement OFF ⇒ OFF. Seule l'ABSENCE de ce
///    choix ne vaut plus opt-in.
///
/// Portée : `BetaFeaturesPreference` garde son propre défaut ON pour son
/// AUTRE client (l'item « Focal (bêta) » du menu d'appui long), hors décision
/// du 2026-08-18 — voir la docstring de ce type. Le retrait vit ICI, dans la
/// cascade, pas là-bas dans la polarité de défaut.
nonisolated enum LentilleFeatureFlag: CaseIterable {
    case lentilleList
    case readingModes
    /// R-133 — le troisième drapeau annoncé par la doc de tête : couvre
    /// UNIQUEMENT la sélectionnabilité de la peau Rivière. Défaut OFF en
    /// l'absence de tout choix. Il n'avait, à l'origine, que DEUX étages
    /// (env → `defaults.bool`) : la cascade bêta lui était refusée, « la
    /// Rivière reste un choix séparé ». Cette réserve est LEVÉE depuis le
    /// 2026-08-21, le jour où son écran a eu un point d'entrée — voir
    /// `isCoveredByBetaProgramme` pour le motif.
    /// Consommé comme `isRiverFlagEnabled` de
    /// `ReadingModeOrchestrator.ResolveCapabilitiesInput` (amendement R).
    /// `ConversationView.init` le câble depuis le chantier Rivière iOS lot 1
    /// (2026-08-21) et monte `RiverConversationHost` derrière `mode ==
    /// .river` dans le même fichier : la sélection n'est plus une promesse
    /// rompue. Depuis le 2026-08-21, ce drapeau suit AUSSI la bascule
    /// « Activer les bêta » quand il n'a pas de valeur propre — voir
    /// `isCoveredByBetaProgramme`, qui dit pourquoi la réserve R-133 est
    /// levée.
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
    /// - les TROIS drapeaux (`.readingModes`/`.lentilleList` depuis le
    ///   2026-08-19, `.riviereMode` depuis le 2026-08-21) → clé EXPLICITEMENT posée (`object(forKey:) != nil`)
    ///   ⇒ sa valeur ; sinon `BetaFeaturesPreference.isEnabled`, qui naît OFF
    ///   (décision produit du 2026-08-22) — donc `false` sur une installation
    ///   neuve, `true` quand « Activer les bêta » a été basculé.
    /// Drapeaux que la bascule « Activer les bêta » (Réglages) gouverne
    /// lorsqu'ils n'ont pas de valeur propre.
    ///
    /// **Élargissement produit du 2026-08-19** — `.lentilleList` rejoint
    /// `.readingModes`. Le second amendement I-075 (2026-08-16) l'avait
    /// laissé dehors « pour l'instant » ; l'usage a montré le défaut de ce
    /// découpage : la bascule des Réglages était le SEUL interrupteur bêta
    /// offert à l'utilisateur, et `lentille_list` n'en avait AUCUN —
    /// `setForDebug` n'a aucun site d'appel de production. Activer la bêta
    /// n'affichait donc jamais la liste Lentille, sans que rien ne l'explique.
    /// Un seul interrupteur, une seule signification.
    ///
    /// **Élargissement produit du 2026-08-21 — `.riviereMode` rejoint à son
    /// tour.** R-133 l'avait laissé dehors (« la Rivière est un choix séparé
    /// que le programme bêta n'ouvre jamais tout seul ») ; le montage de
    /// l'écran au fil (chantier Rivière iOS, lots 1–2) rend ce découpage
    /// intenable pour la MÊME raison qui a fait entrer `.lentilleList` deux
    /// jours plus tôt : la bascule « Activer les bêta » est le SEUL
    /// interrupteur bêta offert à l'utilisateur, et `riviere_mode` n'en avait
    /// AUCUN — `setForDebug` n'a aucun site d'appel de production, et le seul
    /// moyen d'ouvrir la Rivière était une variable d'environnement de
    /// processus (`MEESHY_FLAG_RIVIERE_MODE=1`), c'est-à-dire un outil de
    /// développement. Un mode conçu, dessiné, prouvé par vecteurs et
    /// désormais monté ne peut pas rester injoignable pour la personne qui
    /// l'a demandé. Un seul interrupteur, une seule signification.
    ///
    /// Ce que l'élargissement NE change PAS : la Rivière ne s'ouvre toujours
    /// que là où la LOI l'autorise (`resolveCapabilities` : ≥ 5 participants
    /// actifs, jamais en `direct`), l'étage 1 (env) et l'étage 2 (clé propre
    /// posée, dans les deux sens) priment toujours, et une préférence bêta
    /// JAMAIS EXPRIMÉE ne vaut toujours pas opt-in (« absence ⇒ OFF »,
    /// retrait du 2026-08-18) — le verrou d'activation
    /// (`RiverActivationLockTests`) reste donc satisfait par le défaut.
    ///
    /// Ce que l'élargissement NE change PAS : l'étage 1 (env) et l'étage 2
    /// (clé propre posée, dans les deux sens) priment toujours, et une
    /// préférence bêta JAMAIS EXPRIMÉE ne vaut toujours pas opt-in
    /// (« absence ⇒ OFF », retrait du 2026-08-18).
    var isCoveredByBetaProgramme: Bool {
        switch self {
        case .readingModes, .lentilleList, .riviereMode: return true
        }
    }

    func isEnabled(
        defaults: UserDefaults = .standard,
        environment: [String: String] = ProcessEnvironmentSnapshot.current
    ) -> Bool {
        switch environment[environmentKey] {
        case "1": return true
        case "0": return false
        default: break
        }
        // Étage 3 — la préférence bêta, qui naît OFF depuis le 2026-08-22 :
        // une installation neuve (rien de posé nulle part) rend `false`, une
        // bêta activée dans les Réglages allume les drapeaux couverts. Le
        // retrait du 2026-08-18 (« une bêta jamais touchée ne vaut pas
        // opt-in ») est désormais porté par la polarité de la préférence
        // elle-même, plus par un prédicat d'expression.
        if isCoveredByBetaProgramme, defaults.object(forKey: userDefaultsKey) == nil {
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
