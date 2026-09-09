import XCTest
@testable import Meeshy
import MeeshySDK

/// L'ACCORD DES JOURS sur le hero de la flamme.
///
/// Trois formulations de série écrivaient « jours » sans condition — une série
/// d'UN jour affichait donc « 1 jours d'affilée », « Record : 1 jours » et
/// « Encore 1 jours avant le jalon de 7 ».
///
/// **Le défaut ne se voyait dans aucun test parce qu'aucune fixture n'avait la
/// valeur 1.** Les témoins existants exerçaient 5, 6, 11 — tous pluriels, tous
/// d'accord avec le mot figé. Un corpus qui ne contient pas le cas ne peut ni
/// l'infirmer ni le confirmer ; ici c'est une capture à l'œil qui l'a trouvé,
/// après neuf tests verts.
///
/// Le motif de correction est celui du solde de Meeshes : une BRANCHE explicite
/// en Swift et deux clés, plutôt qu'une forme unique — c'est la convention de
/// ce dépôt (`ExplicitPluralLabelTests`).
@MainActor
final class ProgressionStreakPluralTests: XCTestCase {

    /// L'hôte de test tourne en français ; on interroge donc l'accord français,
    /// qui est aussi la langue SOURCE du catalogue.
    private func assertAccorde(_ rendu: String, singulier: String, ligne: UInt = #line) {
        XCTAssertTrue(
            rendu.contains(singulier),
            "« \(rendu) » n'accorde pas au singulier (attendu : « \(singulier) »).",
            line: ligne
        )
        XCTAssertFalse(
            rendu.contains("\(singulier)s"),
            "« \(rendu) » garde le pluriel figé.",
            line: ligne
        )
    }

    func test_uneSerieDUnJour_saccordeAuSingulier() {
        assertAccorde(ProgressionCopy.streak(1), singulier: "1 jour")
    }

    func test_unRecordDUnJour_saccordeAuSingulier() {
        assertAccorde(ProgressionCopy.streakRecord(1), singulier: "1 jour")
    }

    func test_unJourAvantLeJalon_saccordeAuSingulier() {
        // Six jours tenus, jalon à sept : il en reste UN.
        let echelle = EngagementScaleProgress(
            value: 6,
            tiers: [],
            reachedCount: 1,
            previousThreshold: 3,
            nextThreshold: 7,
            progress: 6.0 / 7.0
        )
        assertAccorde(
            ProgressionCopy.nextStep(for: echelle, kind: .streak),
            singulier: "1 jour"
        )
    }

    /// Le pluriel reste pluriel — un correctif d'accord qui casse l'autre cas
    /// n'a fait que déplacer le défaut.
    func test_lePlurielResteAuPluriel() {
        XCTAssertTrue(ProgressionCopy.streak(6).contains("6 jours"), ProgressionCopy.streak(6))
        XCTAssertTrue(ProgressionCopy.streakRecord(11).contains("11 jours"), ProgressionCopy.streakRecord(11))
    }
}
