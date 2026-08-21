import Foundation

/// I-075 — préférence utilisateur « Activer les bêta » (amendement produit
/// 2026-08-16, remplace le drapeau caché `LentilleFeatureFlag.focalDevPreview`
/// qu'une itération précédente de ce lot avait introduit). Gate la visibilité
/// de fonctionnalités bêta PUBLIQUES — aujourd'hui : l'item « Focal (bêta) »
/// du menu d'appui long de la liste de conversations (`ConversationListView`,
/// groupe « Plus d'options »).
///
/// **Type SÉPARÉ de `LentilleFeatureFlag`, pas un troisième `case`** :
/// `LentilleFeatureFlag.isEnabled(defaults:environment:)` retombe sur
/// `defaults.bool(forKey:)` quand l'environnement ne tranche pas — Foundation
/// rend `false` pour une clé absente, ce qui donne à CE type le défaut OFF
/// qu'il documente explicitement (« défaut OFF dans les deux cas »). Cette
/// préférence a la polarité INVERSE (défaut ON) ; la coder comme un troisième
/// `case` de `LentilleFeatureFlag` aurait exigé une branche spéciale dans
/// `isEnabled(defaults:environment:)` — une méthode PARTAGÉE par tous les cas
/// — pour une seule des trois polarités. Un type dédié, même discipline
/// injectable, est la forme la plus honnête.
///
/// **Défaut ON — la distinction qui compte** : `object(forKey:) == nil`
/// (jamais écrite) ⇒ `true`. `UserDefaults.bool(forKey:)` SEUL renverrait
/// `false` pour une clé absente (défaut Foundation), ce qui ferait naître
/// CETTE préférence à OFF pour tout utilisateur n'ayant jamais touché le
/// réglage — l'inverse de ce que « défaut ON » veut dire. D'où
/// `object(forKey:)` d'abord : seule une écriture EXPLICITE (le toggle des
/// réglages, ou un test) peut faire passer la préférence à `false`.
///
/// Résolution : `ProcessInfo.processInfo.environment[environmentKey]` PRIME
/// (`"1"` force ON, `"0"` force OFF, absente ⇒ repli `UserDefaults`) —
/// MÊME discipline injectable que `LentilleFeatureFlag` (les tests passent
/// leur propre `UserDefaults`/dictionnaire d'environnement, jamais
/// `.standard`/le vrai `ProcessInfo`, cf. `StoryVisibilityPreferenceStore`).
///
/// **I-075 RETIRÉ le 2026-08-18 (décision produit) — portée du retrait** :
/// le retrait concerne le CLIENT `reading_modes`, PAS cette préférence-ci.
/// Le second amendement I-075 (2026-08-16) avait fait de
/// `LentilleFeatureFlag.readingModes` un client de ce type, si bien que
/// l'ABSENCE de la clé ci-dessous (défaut ON) valait opt-in aux modes de
/// lecture : toute installation neuve ouvrait ses conversations via
/// l'orchestrateur (Focal/Résumé) au tap normal. C'est CE repli-là qui est
/// retiré — désormais « absence ⇒ OFF » pour `reading_modes`, l'opt-in
/// explicite restant préservé dans les deux sens.
///
/// Ce type, LUI, garde son défaut ON, et c'est délibéré : son AUTRE client —
/// la visibilité de l'item « Focal (bêta) » du menu d'appui long
/// (`ConversationListView+Overlays.swift`, `ConversationContextMenuView`) —
/// n'est PAS visé par la décision du 2026-08-18. Basculer le défaut de CE
/// type à OFF aurait fait disparaître cet item de toute installation neuve :
/// un second changement produit que personne n'a demandé. Le retrait vit
/// donc dans la cascade de `LentilleFeatureFlag.isEnabled(defaults:
/// environment:)`, qui ne consulte plus ce type que s'il est EXPLICITEMENT
/// exprimé — voir `isExplicitlySet(defaults:environment:)` ci-dessous.
///
/// Écriture : `setEnabled(_:defaults:)`, appelée par l'écran de réglages
/// (`SettingsView`, section « Bêta ») à chaque bascule du toggle — CETTE
/// préférence-ci est écrite en plein droit (contrairement au forçage éphémère
/// `Router.pendingForcedReadingMode`, jamais persisté). Ce que la préférence
/// gate reste ÉPHÉMÈRE à l'ouverture : activer les bêta rend l'item « Focal
/// (bêta) » visible, l'item lui-même force Focal pour UNE SEULE ouverture
/// sans jamais toucher `reading_modes` ni la préférence collante de mode
/// (design imposé, inchangé par cet amendement — voir
/// `ReadingModeController.forcedMode`).
nonisolated enum BetaFeaturesPreference {

    static let userDefaultsKey = "meeshy.pref.beta_features_enabled"
    static let environmentKey = "MEESHY_FLAG_BETA_FEATURES"

    /// Injectable — voir la discipline de test de `LentilleFeatureFlag
    /// .isEnabled(defaults:environment:)`.
    static func isEnabled(
        defaults: UserDefaults = .standard,
        environment: [String: String] = ProcessEnvironmentSnapshot.current
    ) -> Bool {
        switch environment[environmentKey] {
        case "1": return true
        case "0": return false
        default:
            // Clé jamais écrite ⇒ TRUE (défaut ON). `bool(forKey:)` seul
            // rendrait `false` ici — voir la docstring du type.
            guard defaults.object(forKey: userDefaultsKey) != nil else { return true }
            return defaults.bool(forKey: userDefaultsKey)
        }
    }

    /// La préférence a-t-elle été EXPRIMÉE, dans un sens ou dans l'autre ?
    ///
    /// Introduit par le retrait I-075 du 2026-08-18. `isEnabled` seul ne peut
    /// PAS répondre à cette question : son défaut ON confond « l'utilisateur a
    /// activé les bêta » et « personne n'a jamais touché au réglage » — les
    /// deux rendent `true`. Or c'est EXACTEMENT la distinction que la décision
    /// produit exige pour `reading_modes` (l'absence ne vaut plus opt-in,
    /// l'opt-in explicite survit). D'où un prédicat séparé, porté par le type
    /// qui possède les deux clés plutôt que reconstitué chez l'appelant.
    ///
    /// « Exprimée » = surcharge process RECONNUE (`"1"`/`"0"` — une valeur
    /// parasite comme `"yes"` n'exprime rien, cohérent avec le repli
    /// `UserDefaults` de `isEnabled`), OU clé `UserDefaults` réellement écrite
    /// (`object(forKey:) != nil` — le toggle des réglages, ou un test).
    ///
    /// Ne dit RIEN de la valeur : `isExplicitlySet == true` avec la
    /// préférence à `false` est le cas « l'utilisateur a coupé les bêta ».
    /// Les appelants enchaînent donc les deux (`isExplicitlySet` puis
    /// `isEnabled`), jamais l'un pour l'autre.
    static func isExplicitlySet(
        defaults: UserDefaults = .standard,
        environment: [String: String] = ProcessEnvironmentSnapshot.current
    ) -> Bool {
        switch environment[environmentKey] {
        case "1", "0": return true
        default: return defaults.object(forKey: userDefaultsKey) != nil
        }
    }

    /// Lecture au vrai domaine (`UserDefaults.standard` + `ProcessInfo
    /// .processInfo`) — réservée au code de production, jamais aux tests
    /// (résidu inter-suites, même règle que `LentilleFeatureFlag
    /// .isLentilleListEnabled`).
    static var isEnabled: Bool {
        isEnabled(defaults: .standard, environment: ProcessEnvironmentSnapshot.current)
    }

    /// Écrit la préférence — toggle des réglages (`SettingsView`, section
    /// « Bêta »). N'écrit QUE `UserDefaults`, jamais l'environnement process.
    static func setEnabled(_ enabled: Bool, defaults: UserDefaults = .standard) {
        defaults.set(enabled, forKey: userDefaultsKey)
    }
}
