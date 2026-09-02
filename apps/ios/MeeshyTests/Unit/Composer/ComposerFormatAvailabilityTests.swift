import XCTest
@testable import Meeshy

/// **Un format qu'on ne peut pas choisir se montre GRISÉ AVEC SA RAISON, jamais
/// absent (#4030, arbitrage posé — il gouverne `1a` `2a` `2k` `3a` `4f`).**
///
/// C'est l'exception nommée à la loi 4, et elle a sa raison propre, écrite dans
/// la doctrine de la vue `2a` : « l'utilisateur apprend la règle au lieu de la
/// deviner ». Masquer « Réel » sur un document sans vidéo n'enseigne rien — la
/// bascule semble ne pas exister. Le montrer éteint, avec « demande une
/// vidéo », enseigne d'un coup d'œil ce qu'il faut apporter.
///
/// Mesuré au simulateur le 2026-08-30 : depuis l'entrée Post, l'éventail
/// n'offrait que **Post et Story**. Réel et Mood étaient invisibles, et rien ne
/// disait pourquoi. C'est le défaut que cette règle ferme.
///
/// La distinction avec la loi 4 tient en une phrase : un CONTRÔLE sans effet
/// est absent, un FORMAT qu'on ne peut pas encore prendre est une règle du
/// produit qu'il faut apprendre à l'auteur.
final class ComposerFormatAvailabilityTests: XCTestCase {

    private let quatre: [ComposerFormat] = [.post, .story, .reel, .status]

    func test_lesFormatsOfferts_sontChoisissables() {
        let verdicts = ComposerFormatAvailability.verdicts(
            candidates: quatre, offered: [.post, .story])

        XCTAssertEqual(verdicts.first(where: { $0.format == .post })?.isChoosable, true)
        XCTAssertEqual(verdicts.first(where: { $0.format == .story })?.isChoosable, true)
    }

    /// **Le témoin qui porte l'arbitrage.** Il tombe sur l'état d'avant — où
    /// Réel et Mood ne figuraient simplement pas dans le menu.
    func test_lesFormatsNonOfferts_restentPresentsMaisEteints() {
        let verdicts = ComposerFormatAvailability.verdicts(
            candidates: quatre, offered: [.post, .story])

        XCTAssertEqual(verdicts.count, 4, "les quatre formats restent au menu")
        for format in [ComposerFormat.reel, .status] {
            let v = verdicts.first(where: { $0.format == format })
            XCTAssertNotNil(v, "« \(format) » ne doit pas disparaître du menu")
            XCTAssertEqual(v?.isChoosable, false)
            XCTAssertFalse(v?.reason?.isEmpty ?? true,
                           "un format éteint SANS raison ne vaut pas mieux qu'un format absent : "
                           + "il dit « non » sans dire quoi faire")
        }
    }

    /// Une raison n'est utile que si elle est PROPRE au format : deux formats
    /// qui refusent pour la même phrase n'apprennent rien.
    func test_chaqueRefus_aSaPropreRaison() {
        let verdicts = ComposerFormatAvailability.verdicts(
            candidates: quatre, offered: [.post])
        let raisons = verdicts.compactMap { $0.reason }
        XCTAssertEqual(Set(raisons).count, raisons.count,
                       "deux formats refusés pour la même phrase n'enseignent rien")
    }

    /// L'ordre du menu ne dépend pas de ce qui est disponible : un format qui
    /// devient choisissable ne doit pas SAUTER de place sous le doigt.
    func test_lOrdreDuMenu_neDependPasDeLaDisponibilite() {
        let a = ComposerFormatAvailability.verdicts(candidates: quatre, offered: [.post]).map(\.format)
        let b = ComposerFormatAvailability.verdicts(candidates: quatre, offered: quatre).map(\.format)
        XCTAssertEqual(a, b)
        XCTAssertEqual(a, quatre)
    }

    /// Le fusible : si la règle rendait tout choisissable sans regarder, le
    /// témoin ci-dessus passerait. On lui donne un cas où elle DOIT refuser.
    func test_unCandidatHorsDeLOffre_nEstJamaisChoisissable() {
        let verdicts = ComposerFormatAvailability.verdicts(candidates: quatre, offered: [])
        XCTAssertTrue(verdicts.allSatisfy { !$0.isChoosable })
    }
}
