import XCTest
@testable import Meeshy

/// Épinglage du drapeau `lentille_list` pour les suites qui testent le
/// sectionnement LEGACY de la liste de conversations.
///
/// # Pourquoi ce helper existe
///
/// `ConversationListViewModel.groupConversations` choisit entre
/// `legacyGroupConversations` et `lentilleGroupConversations` en lisant
/// `LentilleFeatureFlag.isLentilleListEnabled`, qui interroge
/// `UserDefaults.standard` — c'est-à-dire, pour un bundle de tests HÔTÉ, le
/// domaine de l'APPLICATION. Les suites de groupement legacy tenaient donc leur
/// précondition d'un raisonnement sur une ABSENCE qu'elles ne contrôlaient pas :
/// « la clé `meeshy.flag.lentille_list` n'est écrite par personne ».
///
/// L'élargissement du programme bêta à ce drapeau (2026-08-19,
/// `LentilleFeatureFlag.isCoveredByBetaProgramme`) a AJOUTÉ une entrée à la
/// cascade : `meeshy.pref.beta_features_enabled`. Sur un simulateur où l'app a
/// réellement activé la bêta, cette clé EST présente — et quatre suites se sont
/// mises à recevoir le sectionnement Lentille en croyant vérifier le legacy
/// (`lentille.older` au lieu de `other`, puis un pipeline qui ne converge
/// jamais vers le nombre de sections attendu).
///
/// # Ce que fait l'épinglage
///
/// Poser la clé PROPRE du drapeau à `false` : l'étage 2 de la cascade (valeur
/// explicite du drapeau) prime sur l'étage 3 (préférence bêta), donc le
/// résultat est OFF quoi que porte le domaine hôte. Déterministe, et sans
/// rapport avec l'ordre d'exécution des suites.
///
/// `unpin` retire la clé plutôt que d'écrire `true` : on rend le domaine à son
/// état antérieur au lieu d'y laisser une opinion (résidu inter-suites, cf.
/// `feedback_authservicetests_fails_on_leftover_phase3_session`).
///
/// **Un test ne doit jamais conclure d'une absence qu'il ne maîtrise pas.**
/// Toute nouvelle suite qui exerce le sectionnement legacy doit appeler ces
/// deux méthodes depuis `setUp`/`tearDown`.
extension XCTestCase {

    func pinLentilleListFlagOff(_ defaults: UserDefaults = .standard) {
        defaults.set(false, forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey)
    }

    func unpinLentilleListFlag(_ defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: LentilleFeatureFlag.lentilleList.userDefaultsKey)
    }
}
