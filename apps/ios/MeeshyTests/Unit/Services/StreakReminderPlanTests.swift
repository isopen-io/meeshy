import XCTest
@testable import Meeshy
import MeeshySDK

/// **Six rappels par jour, et surtout : les cas où il n'y en a AUCUN** (#5902).
///
/// La série est le seul compteur de l'engagement qui se PERD en n'agissant pas.
/// L'app lui consacre un hero entier et ne prévenait jamais qu'elle allait
/// tomber. Ce plan est la règle qui décide QUAND rappeler — pure, donc
/// éprouvable sans horloge ni notification réelle.
///
/// **Ce témoin passe l'essentiel de son temps sur les listes VIDES.** Un
/// planificateur de rappels se juge à ce qu'il REFUSE de planifier : le cas
/// nominal produit six notifications utiles, chaque cas manqué en produit six
/// inutiles — et six notifications inutiles par jour est exactement le bruit
/// qui apprend à ignorer les six suivantes.
final class StreakReminderPlanTests: XCTestCase {

    private let calendrier = Calendar(identifier: .gregorian)

    private func instant(_ heure: Int, _ minute: Int = 0) -> Date {
        var c = DateComponents()
        c.year = 2026; c.month = 9; c.day = 9
        c.hour = heure; c.minute = minute
        return calendrier.date(from: c)!
    }

    private func plan(
        heure: Int,
        minute: Int = 0,
        jours: Int = 9,
        agiAujourdhui: Bool = false,
        autorise: Bool = true
    ) -> [StreakReminderPlan.Rappel] {
        StreakReminderPlan.rappels(
            maintenant: instant(heure, minute),
            calendrier: calendrier,
            serieEnCours: jours,
            aAgiAujourdhui: agiAujourdhui,
            notificationsAutorisees: autorise
        )
    }

    // MARK: - Le cas nominal : trois paires, une heure d'écart

    func test_troisPairesEspaceesDUneHeure() {
        let rappels = plan(heure: 6)
        XCTAssertEqual(rappels.count, 6, "Deux le matin, deux à midi, deux le soir.")

        let heures = rappels.map(\.heure)
        XCTAssertEqual(heures, heures.sorted(), "Les rappels sortent dans l'ordre où ils tomberont.")

        // L'écart d'UNE heure est la directive, et il se vérifie par paire —
        // pas sur la liste entière, dont les écarts inter-paires sont libres.
        for paire in stride(from: 0, to: 6, by: 2) {
            XCTAssertEqual(rappels[paire + 1].heure - rappels[paire].heure, 1,
                           "Les deux rappels d'un même moment sont espacés d'une heure.")
        }
    }

    func test_lesTroisMomentsSontDistincts() {
        let moments = Set(plan(heure: 6).map(\.moment))
        XCTAssertEqual(moments, [.matin, .midi, .soir],
                       "Trois moments, pas trois rappels au même moment.")
    }

    // MARK: - Ce qui doit rendre une liste VIDE

    /// La règle 3 — le cœur du « jusqu'à accomplissement ». Quelqu'un qui a
    /// déjà écrit ce matin n'a plus rien à faire aujourd'hui : le rappeler six
    /// fois est le bruit qui apprend à ignorer.
    func test_leGesteDuJourAnnuleTouteLaJournee() {
        XCTAssertTrue(plan(heure: 6, agiAujourdhui: true).isEmpty,
                      "La série du jour est tenue — il n'y a plus rien à rappeler.")
    }

    /// La règle 1 — on ne planifie que si l'autorisation est DÉJÀ accordée.
    /// Une demande surgie pour un rappel de série serait une intrusion.
    func test_sansAutorisationAucunRappel() {
        XCTAssertTrue(plan(heure: 6, autorise: false).isEmpty)
    }

    /// La règle 2 — rappeler de « tenir » une série à quelqu'un qui n'en a pas
    /// serait une publicité, pas un rappel.
    func test_sansSerieEnCoursAucunRappel() {
        XCTAssertTrue(plan(heure: 6, jours: 0).isEmpty)
    }

    // MARK: - La règle 4 : les heures passées ne se planifient pas

    /// Programmer le matin alors qu'il est 14 h produirait une notification le
    /// LENDEMAIN — au mieux inutile, au pire trompeuse (elle parlerait d'une
    /// série que la nuit a peut-être rompue).
    func test_enDebutDApresMidiLeMatinEstPasse() {
        let rappels = plan(heure: 14)
        XCTAssertTrue(rappels.allSatisfy { $0.moment != .matin },
                      "Le matin est passé : il ne se replanifie pas pour demain.")
        XCTAssertFalse(rappels.isEmpty, "Le soir, lui, est encore devant.")
    }

    func test_tardLeSoirPlusAucunRappel() {
        XCTAssertTrue(plan(heure: 23, minute: 30).isEmpty,
                      "Tout est passé : planifier ici déborderait sur demain.")
    }

    /// La borne exacte : un rappel prévu à l'heure PILE où l'on est ne se
    /// planifie pas — il tomberait dans la seconde, ce qui ressemble à un bug
    /// plus qu'à un rappel.
    func test_lHeurePileNeSePlanifiePas() {
        let premier = plan(heure: 6).first!
        let aLHeurePile = plan(heure: premier.heure)
        XCTAssertFalse(aLHeurePile.contains { $0.heure == premier.heure },
                       "Un rappel dû maintenant n'est pas un rappel.")
    }

    // MARK: - La règle 5 : un seul jeu à la fois

    func test_lesIdentifiantsSontStablesEtDistincts() {
        let a = plan(heure: 6).map(\.identifiant)
        let b = plan(heure: 6).map(\.identifiant)
        XCTAssertEqual(a, b, "Sans identifiants STABLES, chaque ouverture empilerait un jeu de plus.")
        XCTAssertEqual(Set(a).count, a.count, "Deux rappels ne peuvent pas porter le même identifiant.")
    }

    // MARK: - La règle 6 : le texte dit ce qui est EN JEU

    func test_leTexteNommeLesJoursTenus() {
        let corps = plan(heure: 6, jours: 9).first!.corps
        XCTAssertTrue(corps.contains("9"),
                      "Un rappel qui ne dit pas ce qu'on risque de perdre ne dit rien : « \(corps) ».")
    }

    func test_leTexteNeDitJamaisSimplementRevenez() {
        for rappel in plan(heure: 6) {
            XCTAssertFalse(rappel.corps.isEmpty)
            XCTAssertFalse(rappel.titre.isEmpty)
        }
    }
}
