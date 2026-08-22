import XCTest
@testable import Meeshy

/// [Q-146/R6-3] LE VERROU D'ACTIVATION — `riviere_mode` ne peut pas devenir
/// ON par défaut tant que l'écran n'a aucun site de montage dans le fil.
///
/// ═══════════════════════════════════════════════════════════════════════
/// POURQUOI CE TÉMOIN EXISTE, ALORS QUE DEUX SUITES VOISINES SEMBLENT DÉJÀ
/// COUVRIR CHACUN DES DEUX FAITS
/// ═══════════════════════════════════════════════════════════════════════
/// `RiverFeatureFlagTests.test_riviereMode_isEnabled_noUserDefaultsValueNo
/// EnvOverride_returnsFalse` prouve que le DÉFAUT du drapeau vaut `false`
/// aujourd'hui. `RiverScreenNotMountedTests.test_riverStreamHost_is
/// ReferencedNowhereOutsideRiviere` prouve que l'ÉCRAN (`RiverStreamHost`)
/// n'a aucun site de montage. Ce sont deux FICHIERS séparés, écrits par des
/// lots séparés (R-133, R-135), qui ne se PARLENT pas — chacun affirme un
/// fait isolé, jamais leur conjonction.
///
/// RED prouvé sur le jumeau web (`riviere-activation-lock.test.ts`, MÊME
/// mécanisme, MÊME raisonnement, appliqué à `resolveRiverModeFlag`) : un lot
/// qui bascule le défaut à `true` (décision produit « on active Rivière »)
/// édite NATURELLEMENT son propre fichier ET la ligne de sa propre suite qui
/// affirme l'ancien défaut — exactement le même geste auto-cohérent que
/// R-135 a fait pour le MENU. Rien, dans les deux suites voisines PRISES
/// SÉPARÉMENT, ne l'en empêche : la suite de drapeau (réécrite) est verte
/// sur son nouveau défaut, la suite de montage ne LIT jamais le drapeau —
/// elle ignore que le défaut a changé. Le raisonnement Swift est identique
/// (mêmes deux fichiers, même absence de lien) ; ce témoin porte donc, côté
/// iOS, EXACTEMENT le même verrou que son jumeau web, plutôt que de
/// documenter le trou sans le fermer.
///
/// ═══════════════════════════════════════════════════════════════════════
/// LA FORME DU VERROU — lier les DEUX faits, jamais un seul
/// ═══════════════════════════════════════════════════════════════════════
/// Ce témoin ne réimplémente NI la résolution du drapeau NI la définition de
/// « monté » — il consomme le même point d'entrée PRODUCTION
/// (`LentilleFeatureFlag.riviereMode.isEnabled(defaults:environment:)`, sans
/// aucune valeur posée : c'est la lecture du vrai défaut, `UserDefaults`
/// isolée et vide comme un appareil neuf) et la MÊME preuve structurelle que
/// `RiverScreenNotMountedTests` (absence de `RiverStreamHost` hors de sa
/// peau — recalculée ici, jamais supposée, avec en PLUS le retrait des
/// commentaires via `AppSourceGuard.stripComments`, pour qu'une docstring
/// qui NOMME `RiverStreamHost` sans le monter ne puisse pas, à elle seule,
/// faire croire à un montage). Il combine les deux en UNE implication :
///
///     defaultIsOn && !isMounted  ⇒  ÉCHEC
///
/// Les trois autres combinaisons (OFF+non-monté — l'état actuel ; OFF+monté ;
/// ON+monté) sont SÛRES et laissées passer : ce verrou n'interdit PAS
/// d'activer Rivière, il interdit de l'activer SANS ÉCRAN. Éditer isolément
/// `LentilleFeatureFlag.riviereMode` ne suffit plus à le faire taire — il
/// faudrait AUSSI monter l'écran, ce qui est précisément la condition que
/// R-137 vient remplir.
///
/// ═══════════════════════════════════════════════════════════════════════
/// CE VERROU EST CELUI DE Q-146 — IL TOMBERA AVEC R-137
/// ═══════════════════════════════════════════════════════════════════════
/// Le jour où un lot monte réellement `RiverStreamHost` (`ConversationView
/// .swift` ou tout autre hôte du fil), `isMounted` devient vrai et cette
/// garde n'a plus d'objection à faire au drapeau ON — elle s'efface d'elle-
/// même, sans qu'il faille la supprimer : c'est un verrou CONDITIONNEL, pas
/// une interdiction gravée. Elle continue cependant d'exister pour la MÊME
/// raison qu'avant : si un jour l'unique hôte disparaît sans qu'aucun autre
/// ne le remplace, ce témoin refermera la porte tout seul.
final class RiverActivationLockTests: XCTestCase {

    private static var meeshyRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Riviere
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func makeIsolatedDefaults() -> UserDefaults {
        UserDefaults(suiteName: "RiverActivationLockTests-\(UUID().uuidString)")!
    }

    /// Le VRAI défaut de production — `UserDefaults` isolée et VIDE (aucune
    /// clé posée), aucune surcharge process : un premier lancement neuf.
    private func riverModeFlagDefaultIsOn() -> Bool {
        LentilleFeatureFlag.riviereMode.isEnabled(defaults: makeIsolatedDefaults(), environment: [:])
    }

    /// MÊME découverte que `RiverScreenNotMountedTests.nonRiviereSwiftFiles`
    /// — jamais recopiée en supposant, toujours re-scannée.
    private func nonRiviereSwiftFiles() throws -> [URL] {
        var results: [URL] = []
        let riviereRoot = Self.meeshyRoot.appendingPathComponent("Features/Main/Riviere")
        guard let enumerator = FileManager.default.enumerator(
            at: Self.meeshyRoot,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            XCTFail("Impossible d'énumérer \(Self.meeshyRoot.path)")
            return []
        }
        for case let url as URL in enumerator {
            if url.path.hasPrefix(riviereRoot.path) {
                enumerator.skipDescendants()
                continue
            }
            if url.pathExtension == "swift" {
                results.append(url)
            }
        }
        return results
    }

    /// `true` si un site de montage RÉEL de l'écran Rivière existe hors de
    /// sa propre peau. Commentaires RETIRÉS avant la recherche
    /// (`AppSourceGuard.stripComments`) — une docstring qui NOMME l'hôte en
    /// le décrivant (comme celle-ci, ou celle de
    /// `RiverScreenNotMountedTests`) ne compte pas comme un montage.
    ///
    /// **Le symbole a changé le 2026-08-21 (chantier Rivière iOS, lot 1) et
    /// ce verrou devait l'apprendre.** Il cherchait `RiverStreamHost` — la
    /// PEAU. Le point d'entrée réellement livré est `RiverConversationHost`,
    /// qui vit dans `Riviere/View/` (avec la peau, dont il est l'assemblage)
    /// et que `ConversationView` monte. Continuer de chercher `RiverStreamHost`
    /// hors de `Riviere/` aurait rendu ce verrou AVEUGLE : il aurait répondu
    /// « aucun écran monté » alors que l'écran l'est, et refusé un défaut ON
    /// parfaitement sûr — un faux positif qui, la fois suivante, se serait
    /// fait désactiver plutôt que corriger. Ce qu'il vérifie est inchangé :
    /// qu'un fichier HORS de la peau monte réellement la Rivière.
    private func riverScreenHasMountSite() throws -> Bool {
        for url in try nonRiviereSwiftFiles() {
            guard let code = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let stripped = AppSourceGuard.stripComments(code)
            if stripped.contains("RiverConversationHost(") || stripped.contains("RiverStreamHost(") {
                return true
            }
        }
        return false
    }

    func test_guardDiscoversFiles_neverSilentlyEmpty() throws {
        let files = try nonRiviereSwiftFiles()
        XCTAssertFalse(files.isEmpty, "Aucun fichier .swift découvert hors Riviere/ — vérifier le chemin de scan.")
    }

    func test_theLock_defaultIsOnAndNotMounted_mustNeverBothBeTrue() throws {
        let defaultIsOn = riverModeFlagDefaultIsOn()
        let isMounted = try riverScreenHasMountSite()
        let unsafeCombination = defaultIsOn && !isMounted

        XCTAssertFalse(
            unsafeCombination,
            "[Q-146/R6-3] `riviere_mode` résout ON par défaut (`LentilleFeatureFlag.riviereMode" +
            ".isEnabled`, UserDefaults isolée et vide) alors qu'aucun site de montage de " +
            "`RiverStreamHost` n'existe hors de sa peau — combinaison dangereuse : un lecteur " +
            "choisirait Rivière et verrait Focal (`clamped-unavailable`), une promesse " +
            "silencieusement rompue. Ce verrou tombe de lui-même (R-137) le jour où un hôte " +
            "réel monte RiverStreamHost dans le fil — jusque-là, le défaut DOIT rester OFF."
        )
    }

    /// Ce test ne PEUT pas échouer indépendamment du précédent (même calcul)
    /// — il existe pour que la sortie d'échec du verrou, lue seule, n'oblige
    /// personne à deviner LEQUEL des deux faits a bougé.
    func test_currentState_bothFactsNamed() throws {
        XCTAssertFalse(
            riverModeFlagDefaultIsOn(),
            "défaut du drapeau — une installation qui n'a RIEN demandé n'ouvre pas la Rivière"
        )
        XCTAssertTrue(
            try riverScreenHasMountSite(),
            "site de montage — depuis le lot 1 (2026-08-21), `ConversationView` monte " +
            "`RiverConversationHost` : c'est la combinaison SÛRE OFF+monté, celle qui laisse " +
            "un futur défaut ON passer sans que ce verrou n'ait rien à objecter."
        )
    }
}
