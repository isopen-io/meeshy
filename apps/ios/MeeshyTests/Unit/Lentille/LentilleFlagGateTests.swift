import XCTest
@testable import Meeshy

/// M-046 — le portillon des deux drapeaux Lentille (`lentilleList`,
/// `readingModes`). Toute résolution passe par `isEnabled(defaults:environment:)`,
/// JAMAIS par les `static var isLentilleListEnabled`/`isReadingModesEnabled`
/// (qui lisent `UserDefaults.standard` + le vrai `ProcessInfo` — les appeler
/// ici laisserait un résidu visible au lancement suivant, leçon
/// `reference_outbox_db_path_and_test_residue`). Chaque test fabrique sa
/// propre suite `UserDefaults` UUID, jamais partagée, jamais nettoyée en
/// sortie de process car jamais écrite au vrai domaine.
///
/// I-075 (second amendement produit, 2026-08-16) — `readingModes` cascade
/// désormais vers `BetaFeaturesPreference` (défaut ON) quand sa PROPRE clé
/// n'a jamais été posée. Les tests « défaut » et « indépendance » de ce
/// fichier ont été réécrits en conséquence (une `defaults` fraîche ne veut
/// plus dire « readingModes OFF », elle veut dire « readingModes suit la
/// bêta ») — la cascade complète est prouvée à part, § « Cascade
/// readingModes → BetaFeaturesPreference » en fin de fichier.
///
/// **I-075 RETIRÉ le 2026-08-18 (décision produit).** Le paragraphe
/// ci-dessus est conservé pour l'historique : il décrit ce que ce fichier
/// verrouillait entre le 2026-08-16 et le 2026-08-18. Ce qui est verrouillé
/// AUJOURD'HUI, et que ce lot amende :
/// 1. **Absence de toute clé ⇒ OFF** — une `defaults` fraîche redevient
///    « readingModes OFF » (installation neuve ⇒ ouverture en Bulles).
///    L'ancien témoin discriminant
///    `test_readingModes_envAbsent_keyNeverWritten_betaNeverWritten_returnsTrue`
///    affirmait littéralement l'inverse (`XCTAssertTrue` sur ce décor
///    exact) ; il est retourné en `…_returnsFalse` ci-dessous.
/// 2. **Les choix explicites survivent, dans les deux sens** — env
///    `"1"`/`"0"`, clé `meeshy.flag.reading_modes` `true`/`false` : étages 1
///    et 2 INCHANGÉS, leurs témoins ne bougent pas d'une ligne.
/// 3. **L'opt-in bêta volontaire n'est pas retiré** — toggle « Bêta »
///    EXPLICITEMENT ON ⇒ readingModes ON ; EXPLICITEMENT OFF ⇒ OFF. Seule
///    l'ABSENCE de ce choix ne vaut plus opt-in. Les témoins de l'étage 3
///    qui s'appuyaient sur une bêta ON *implicite* posent désormais le choix
///    explicitement — c'est le seul décor qui change.
///
/// Preuve que le retrait est SURGICAL : sur les 144 combinaisons
/// (env readingModes × clé readingModes × env bêta × clé bêta), 4 seulement
/// changent de verdict — exactement celles où RIEN n'a jamais été exprimé.
final class LentilleFlagGateTests: XCTestCase {

    // MARK: - Fabriques

    private func makeIsolatedDefaults() -> UserDefaults {
        UserDefaults(suiteName: "LentilleFlagGateTests-\(UUID().uuidString)")!
    }

    // MARK: - Défaut OFF (`lentilleList` — INCHANGÉ par l'amendement)

    func test_lentilleList_isEnabled_noUserDefaultsValueNoEnvOverride_returnsFalse() {
        let defaults = makeIsolatedDefaults()

        XCTAssertFalse(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - UserDefaults seul

    func test_isEnabled_userDefaultsTrueNoEnvOverride_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey)

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    /// `readingModes` EXPLICITEMENT posée à `false` ⇒ `false`, MÊME avec la
    /// bêta ON par défaut sur cette `defaults` fraîche — la clé explicite est
    /// l'étage 2 de la cascade, avant la bêta (étage 3).
    func test_isEnabled_readingModesUserDefaultsExplicitlyFalse_noEnvOverride_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - La surcharge process prime

    func test_isEnabled_envOne_primesOverUserDefaultsFalse_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey)
        let environment = [LentilleFeatureFlag.lentilleList.environmentKey: "1"]

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: environment))
    }

    func test_isEnabled_envZero_primesOverUserDefaultsTrue_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "0"]

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment))
    }

    /// `readingModes` : l'environnement prime même sur la cascade bêta —
    /// `env: "0"` force OFF alors que la clé readingModes n'a jamais été
    /// posée (qui, seule, résoudrait vers la bêta, ON par défaut).
    func test_isEnabled_readingModes_envZero_primesEvenWhenKeyNeverWrittenAndBetaDefaultsOn() {
        let defaults = makeIsolatedDefaults()
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "0"]

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment))
    }

    // MARK: - Indépendance des deux drapeaux
    //
    // Réécrits pour l'amendement : `readingModes` posée EXPLICITEMENT des
    // deux côtés (jamais une `defaults` fraîche, qui résoudrait maintenant
    // vers la bêta) — la discrimination reste sur `lentilleList` seul.

    func test_isEnabled_lentilleListOnReadingModesExplicitlyOff_flagsAreIndependent() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey)
        defaults.set(false, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_isEnabled_readingModesOnLentilleListOff_flagsAreIndependent() {
        let defaults = makeIsolatedDefaults()
        let environment = [LentilleFeatureFlag.readingModes.environmentKey: "1"]

        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment))
        XCTAssertFalse(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: environment))
    }

    /// Une bêta NON EXPRIMÉE ne suffit pas — c'est le « absence ⇒ OFF » du
    /// retrait du 2026-08-18, qui survit à l'élargissement du 2026-08-19.
    /// Une installation neuve n'allume donc rien toute seule, malgré le
    /// défaut ON de `BetaFeaturesPreference`.
    func test_betaFeaturesNeverExpressed_doesNotEnableLentilleList() {
        let defaults = makeIsolatedDefaults()
        // `defaults` fraîche ⇒ BetaFeaturesPreference résout déjà à `true`
        // (défaut ON) sans rien poser explicitement.
        XCTAssertFalse(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]), "Décor : la préférence bêta naît OFF (décision produit 2026-08-22).")

        XCTAssertFalse(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    /// **Élargissement produit du 2026-08-19** — « Activer les bêta » allume
    /// AUSSI la liste Lentille, plus seulement les modes de lecture.
    ///
    /// Motif : la bascule des réglages était le seul interrupteur bêta offert
    /// à l'utilisateur, et `lentille_list` n'en avait AUCUN — `setForDebug`
    /// n'a aucun site d'appel de production. Une personne qui activait la
    /// bêta ne pouvait donc pas voir la liste Lentille, ni comprendre
    /// pourquoi. Un seul interrupteur, une seule signification.
    func test_betaFeaturesExplicitlyOn_enablesLentilleList() {
        let defaults = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(true, defaults: defaults)

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    /// Symétrie : couper la bêta explicitement coupe la liste.
    func test_betaFeaturesExplicitlyOff_disablesLentilleList() {
        let defaults = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(false, defaults: defaults)

        XCTAssertFalse(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    /// La clé propre du drapeau PRIME toujours sur la bêta (étage 2 > étage
    /// 3) — c'est le seul moyen de couper la liste Lentille seule sans
    /// renoncer au reste du programme bêta.
    func test_lentilleListExplicitlyOff_beatsBetaOn() {
        let defaults = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(true, defaults: defaults)
        defaults.set(false, forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey)

        XCTAssertFalse(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    /// **Recalibré EN CONSCIENCE le 2026-08-21 — SECOND témoin du même fait.**
    ///
    /// Il affirmait, avec R-133, que la Rivière reste HORS du programme bêta.
    /// C'était vrai tant qu'elle n'avait pas d'écran monté ; ça ne l'est plus
    /// depuis que `ConversationView` la monte : la bascule « Activer les bêta »
    /// est le SEUL interrupteur offert à l'utilisateur, et sans elle la Rivière
    /// n'était joignable que par une variable d'environnement de processus.
    ///
    /// Ce témoin est le JUMEAU de
    /// `RiverFeatureFlagTests.test_riviereMode_followsTheBetaSwitch_onlyWhen
    /// ItHasBeenExpressed` — recalibré le même jour, il ne l'avait pas été
    /// parce que la suite Rivière seule avait été rejouée. C'est la suite
    /// COMPLÈTE qui l'a rattrapé : deux gardes du même fait vivent dans deux
    /// dossiers différents, et n'en corriger qu'une laisse l'autre rougir.
    ///
    /// Ce qu'il protégeait — « une installation qui n'a RIEN demandé n'ouvre
    /// pas la Rivière » — reste vérifié, par le cas d'absence ci-dessous.
    func test_betaFeaturesExplicitlyOn_enablesRiviereMode_sinceItsScreenIsMounted() {
        let expressed = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(true, defaults: expressed)

        XCTAssertTrue(
            LentilleFeatureFlag.riviereMode.isEnabled(defaults: expressed, environment: [:]),
            "Bêta explicitement ON ⇒ la Rivière devient sélectionnable — sous réserve de la " +
            "LOI (≥ 5 participants actifs, jamais en `direct`), qui reste la seule porte."
        )
    }

    /// Le fait que le témoin d'origine protégeait vraiment : une préférence
    /// bêta JAMAIS EXPRIMÉE ne vaut pas opt-in (« absence ⇒ OFF », retrait
    /// I-075 du 2026-08-18). Sans lui, le recalibrage ci-dessus aurait
    /// remplacé une garde par rien.
    func test_betaFeaturesNeverExpressed_stillNeverEnablesRiviereMode() {
        let untouched = makeIsolatedDefaults()

        XCTAssertFalse(
            BetaFeaturesPreference.isEnabled(defaults: untouched, environment: [:]),
            "Décor : la préférence bêta naît OFF (décision produit 2026-08-22)."
        )
        XCTAssertFalse(
            LentilleFeatureFlag.riviereMode.isEnabled(defaults: untouched, environment: [:])
        )
    }

    // MARK: - setForDebug

    func test_setForDebug_enabledTrue_isEnabledReturnsTrue() {
        let defaults = makeIsolatedDefaults()

        LentilleFeatureFlag.setForDebug(.lentilleList, enabled: true, defaults: defaults)

        XCTAssertTrue(LentilleFeatureFlag.lentilleList.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_setForDebug_enabledFalseAfterTrue_isEnabledReturnsFalse() {
        let defaults = makeIsolatedDefaults()
        LentilleFeatureFlag.setForDebug(.readingModes, enabled: true, defaults: defaults)

        LentilleFeatureFlag.setForDebug(.readingModes, enabled: false, defaults: defaults)

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    func test_setForDebug_doesNotAffectTheOtherFlag() {
        let defaults = makeIsolatedDefaults()
        // readingModes posée explicitement à false : décor hérité du second
        // amendement I-075 (où une `defaults` fraîche résolvait readingModes
        // à `true` via la cascade bêta). Le retrait du 2026-08-18 rendrait
        // cette écriture facultative — elle est CONSERVÉE parce qu'elle rend
        // le test explicite sur ce qu'il prouve (`setForDebug(.lentilleList,
        // …)` n'écrit QUE la clé lentilleList) au lieu de le faire reposer
        // sur un défaut d'absence.
        LentilleFeatureFlag.setForDebug(.readingModes, enabled: false, defaults: defaults)

        LentilleFeatureFlag.setForDebug(.lentilleList, enabled: true, defaults: defaults)

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    // MARK: - Cascade readingModes → BetaFeaturesPreference (I-075 RETIRÉ le 2026-08-18)
    //
    // Trois étages : env → clé propre EXPLICITE → préférence bêta (qui naît
    // OFF depuis le 2026-08-22 : une bêta jamais touchée vaut OFF, une bêta
    // activée dans les Réglages allume les drapeaux couverts).

    /// LE test discriminant du RETRAIT : env absent, clé `reading_modes`
    /// JAMAIS posée, bêta JAMAIS posée ⇒ `readingModes.isEnabled` doit être
    /// `false`. Installation neuve, personne n'a rien demandé ⇒ ouverture en
    /// BULLES (comportement historique).
    ///
    /// AVANT (2026-08-16 → 2026-08-18) ce même décor était verrouillé à
    /// `true` par `…_betaNeverWritten_returnsTrue` : « à l'installation, le
    /// système de modes de lecture est actif par défaut ». C'est CE verrou
    /// que la décision produit du 2026-08-18 retire.
    ///
    /// Depuis le 2026-08-22 la préférence bêta naît OFF elle aussi : « absence »
    /// et « éteint » sont la même chose, et la cascade n'a plus besoin de
    /// distinguer une bêta exprimée d'une bêta jamais touchée. Le décor est
    /// ré-affirmé plutôt que supposé.
    func test_readingModes_envAbsent_keyNeverWritten_betaNeverWritten_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        XCTAssertFalse(
            BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]),
            "Décor : la préférence bêta naît OFF (décision produit 2026-08-22)."
        )

        XCTAssertFalse(
            LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]),
            "Absence de toute clé ⇒ OFF (décision produit 2026-08-18) : une installation neuve ouvre en Bulles."
        )
    }

    /// Le pendant de l'opt-in : la MÊME absence de clé `reading_modes`, mais
    /// la bêta EXPLICITEMENT activée par l'utilisateur ⇒ `true`. L'opt-in
    /// volontaire n'est pas retiré — seule l'ABSENCE de choix cesse de valoir
    /// opt-in. Paire discriminante avec le test ci-dessus : mêmes entrées à
    /// une écriture explicite près, verdicts opposés.
    func test_readingModes_keyNeverWritten_betaExplicitlyTrue_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(true, defaults: defaults)

        XCTAssertTrue(
            LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]),
            "Toggle « Bêta » explicitement ON ⇒ modes de lecture ON, comme avant le retrait."
        )
    }

    /// Même opt-in, exprimé par la SURCHARGE PROCESS de la bêta plutôt que
    /// par la clé — `MEESHY_FLAG_BETA_FEATURES=1` est un choix explicite de
    /// plein droit (tests UI, TestFlight), donc il rouvre l'étage 3.
    func test_readingModes_keyNeverWritten_betaEnvOne_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        let environment = [BetaFeaturesPreference.environmentKey: "1"]

        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment))
    }

    /// Une valeur d'environnement PARASITE n'exprime rien : `isEnabled` de la
    /// bêta la traite déjà comme absente (repli `UserDefaults`), donc le
    /// retrait la traite comme « aucun choix » ⇒ OFF. Sans ce témoin, une
    /// implémentation qui testerait `environment[betaKey] != nil` au lieu de
    /// `"1"/"0"` passerait inaperçue.
    func test_readingModes_keyNeverWritten_betaEnvUnrecognized_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        let environment = [BetaFeaturesPreference.environmentKey: "yes"]

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: environment))
    }

    /// Bêta explicitement OFF (clé `reading_modes` toujours absente) ⇒
    /// `readingModes.isEnabled` retombe à `false` — couper « Activer les
    /// bêta » rend tout le système inactif.
    func test_readingModes_keyNeverWritten_betaExplicitlyOff_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        BetaFeaturesPreference.setEnabled(false, defaults: defaults)

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    /// Clé `reading_modes` posée EXPLICITEMENT à `false` ⇒ `false`, MÊME si
    /// la bêta est ON — seul moyen de couper `reading_modes` seul sans
    /// toucher au reste du programme bêta.
    ///
    /// Amendé par le retrait du 2026-08-18 : la bêta est désormais posée
    /// EXPLICITEMENT à `true` au lieu de compter sur son défaut ON implicite.
    /// Sans ce changement de décor le test resterait vert mais cesserait
    /// d'être discriminant — l'étage 3 rendrait OFF de toute façon (bêta non
    /// exprimée), si bien que le test ne prouverait plus que l'étage 2 GAGNE
    /// sur l'étage 3, seulement qu'ils concordent.
    func test_readingModes_keyExplicitlyFalse_betaExplicitlyOn_returnsFalse() {
        let defaults = makeIsolatedDefaults()
        defaults.set(false, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        BetaFeaturesPreference.setEnabled(true, defaults: defaults)
        XCTAssertTrue(BetaFeaturesPreference.isEnabled(defaults: defaults, environment: [:]), "Décor : la bêta doit être ON (explicite) pour que ce test soit discriminant.")

        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    /// Clé `reading_modes` posée EXPLICITEMENT à `true` ⇒ `true`, MÊME si la
    /// bêta est OFF — l'étage 2 (clé explicite) gagne toujours sur l'étage 3
    /// (bêta), dans les deux sens.
    func test_readingModes_keyExplicitlyTrue_betaOff_returnsTrue() {
        let defaults = makeIsolatedDefaults()
        defaults.set(true, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        BetaFeaturesPreference.setEnabled(false, defaults: defaults)

        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]))
    }

    /// Round-trip complet sur la MÊME `defaults`, réécrit pour le retrait du
    /// 2026-08-18 — le parcours part maintenant de OFF au lieu de partir de
    /// ON :
    /// 1. rien n'est posé ⇒ `false` (le retrait lui-même) ;
    /// 2. bêta EXPLICITEMENT ON ⇒ `true` (l'opt-in volontaire, préservé) ;
    /// 3. bêta EXPLICITEMENT coupée ⇒ `false` (l'opt-out, préservé) ;
    /// 4. clé readingModes EXPLICITE à `true` malgré la bêta coupée ⇒ `true`
    ///    (étage 2 gagne sur étage 3, inchangé).
    ///
    /// AVANT, l'étape 1 était `XCTAssertTrue(…, "Étage 3 (bêta ON
    /// implicite).")` — c'est exactement l'assertion que la décision produit
    /// retourne.
    func test_readingModes_cascadeRoundTrip_allStages() {
        let defaults = makeIsolatedDefaults()
        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]), "Rien d'exprimé ⇒ OFF (retrait 2026-08-18).")

        BetaFeaturesPreference.setEnabled(true, defaults: defaults)
        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]), "Étage 3 — opt-in bêta EXPLICITE, préservé par le retrait.")

        BetaFeaturesPreference.setEnabled(false, defaults: defaults)
        XCTAssertFalse(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]), "Étage 3 (bêta coupée).")

        defaults.set(true, forKey: LentilleFeatureFlag.readingModes.userDefaultsKey)
        XCTAssertTrue(LentilleFeatureFlag.readingModes.isEnabled(defaults: defaults, environment: [:]), "Étage 2 (clé explicite) gagne sur l'étage 3 (bêta toujours coupée).")
    }
}
