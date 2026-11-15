import XCTest
@testable import MeeshyUI

/// **Le plan de lecture d'une image animée** (#4925).
///
/// `UIImage.animatedImage(with:duration:)` répartit ses images UNIFORMÉMENT.
/// Servir directement les N images d'un GIF avec la somme de leurs délais joue
/// donc l'animation à cadence constante — un défaut plus difficile à voir
/// qu'une absence d'animation, donc pire : ça bouge, ça a l'air de marcher, et
/// la pose qui devait durer une seconde passe en un dixième.
final class AnimatedImageTimingTests: XCTestCase {

    // MARK: - La décision de conception : nil pour ce qui n'est pas animé

    /// **`nil` plutôt qu'un plan à une image.** Un chemin animé qui accepterait
    /// le cas fixe ferait payer à chaque avatar et chaque vignette un
    /// `UIImageView` et un tableau de frames. La distinction est la valeur de
    /// retour, jamais un drapeau posé à côté.
    func test_uneSeuleImage_nEstPasUneAnimation() {
        XCTAssertNil(AnimatedImageTiming.plan(delays: []))
        XCTAssertNil(AnimatedImageTiming.plan(delays: [0.1]))
    }

    func test_deuxImages_sontUneAnimation() {
        XCTAssertNotNil(AnimatedImageTiming.plan(delays: [0.1, 0.1]))
    }

    // MARK: - La cadence

    func test_desDelaisUNIFORMES_neRepetentRien() throws {
        let plan = try XCTUnwrap(AnimatedImageTiming.plan(delays: [0.04, 0.04, 0.04]))
        XCTAssertEqual(plan.repeats, [1, 1, 1])
        XCTAssertEqual(plan.unit, 0.04, accuracy: 0.0001)
        XCTAssertEqual(plan.duration, 0.12, accuracy: 0.0001)
    }

    /// **Le cas qui justifie tout le type.** 40 / 40 / 200 ms : sans
    /// rééchantillonnage, `UIImage` jouerait trois images de 93 ms chacune — la
    /// pose de 200 ms serait DEUX FOIS TROP COURTE et les deux autres deux fois
    /// trop longues.
    func test_uneImageLENTE_estREPETEE_pasAcceleree() throws {
        let plan = try XCTUnwrap(AnimatedImageTiming.plan(delays: [0.04, 0.04, 0.20]))
        XCTAssertEqual(plan.repeats, [1, 1, 5], "l'image de 200 ms occupe 5 unités de 40 ms")
        XCTAssertEqual(plan.totalFrames, 7)
        XCTAssertEqual(plan.unit, 0.04, accuracy: 0.0001)
    }

    /// **Le fusible de la cadence.** Le plan doit RESTITUER la durée d'origine :
    /// c'est la seule assertion qui tombe si le rééchantillonnage se trompe de
    /// facteur, et elle ne dépend d'aucun détail d'implémentation.
    func test_laDureeDuCycle_egaleLaSommeDesDelais() throws {
        let delais = [0.04, 0.04, 0.20, 0.08]
        let plan = try XCTUnwrap(AnimatedImageTiming.plan(delays: delais))
        XCTAssertEqual(plan.duration, delais.reduce(0, +), accuracy: 0.0001)
    }

    /// Et le témoin qui prouve que la règle DÉCIDE de quelque chose : sans
    /// répétition, la même durée serait répartie sur 4 images au lieu de 9.
    func test_sansRepetition_laCadenceSeraitFausse() throws {
        let delais = [0.04, 0.04, 0.20, 0.08]
        let plan = try XCTUnwrap(AnimatedImageTiming.plan(delays: delais))
        XCTAssertNotEqual(plan.totalFrames, delais.count,
                          "sans cette différence, le rééchantillonnage ne sert à rien")
    }

    // MARK: - Les délais que le format NE MESURE PAS

    /// Un délai nul ou minuscule est une CONVENTION — « aussi vite que
    /// possible » — écrite par de vieux encodeurs. Tous les navigateurs et
    /// Apple la remontent à 10 cs. Sans cette règle le PGCD tombe à 1 cs, et
    /// trois images en produiraient trois cents.
    func test_unDelaiNEGLIGEABLE_vaut100ms() throws {
        let plan = try XCTUnwrap(AnimatedImageTiming.plan(delays: [0, 0.001, 0.01]))
        XCTAssertEqual(plan.repeats, [1, 1, 1])
        XCTAssertEqual(plan.unit, AnimatedImageTiming.defaultDelay, accuracy: 0.0001)
        XCTAssertEqual(plan.duration, 0.3, accuracy: 0.0001)
    }

    func test_unDelaiNEGLIGEABLE_nExplosePasLeCycle() throws {
        let plan = try XCTUnwrap(AnimatedImageTiming.plan(delays: [0, 0, 0, 0.2]))
        XCTAssertLessThanOrEqual(plan.totalFrames, 6,
                                 "0 ms lu littéralement produirait des centaines d'images")
    }

    // MARK: - L'explosion combinatoire

    /// Des délais premiers entre eux donnent un PGCD de 1 cs. C'est CORRECT et
    /// peu coûteux tant que le cycle reste borné — les images sont PARTAGÉES,
    /// un `CGImage` répété n'est pas un bitmap de plus.
    func test_desDelaisPREMIERSentreEux_donnentLuniteLaPlusFine() throws {
        let plan = try XCTUnwrap(AnimatedImageTiming.plan(delays: [0.07, 0.11]))
        XCTAssertEqual(plan.repeats, [7, 11])
        XCTAssertEqual(plan.unit, 0.01, accuracy: 0.0001)
    }

    /// Au-delà du plafond, l'unité se RELÂCHE — la cadence s'approche, le cycle
    /// ne s'ampute pas. Tronquer perdrait des images ; arrondir perd des
    /// millisecondes.
    func test_auDelaDuPlafond_luniteSeRelache_etLeCycleResteENTIER() throws {
        let delais = (0..<60).map { Double(7 + ($0 % 13)) / 100 }
        let plan = try XCTUnwrap(AnimatedImageTiming.plan(delays: delais))
        XCTAssertLessThanOrEqual(plan.totalFrames, AnimatedImageTiming.maximumFrames)
        XCTAssertEqual(plan.repeats.count, delais.count,
                       "chaque image du fichier reste dans le plan")
    }

    /// **Aucune image ne sort du cycle**, même quand son délai devient
    /// négligeable devant l'unité relâchée. Une image qui disparaît est une
    /// animation qui saute.
    func test_aucuneImage_neDisparaitDuCycle() throws {
        let delais = [2.0] + Array(repeating: 0.02, count: 40)
        let plan = try XCTUnwrap(AnimatedImageTiming.plan(delays: delais))
        XCTAssertEqual(plan.repeats.count, delais.count)
        XCTAssertTrue(plan.repeats.allSatisfy { $0 >= 1 },
                      "une image répétée zéro fois n'est plus jouée du tout")
    }

    /// Un délai négatif ou absurde ne fabrique jamais un plan vide : il retombe
    /// sur la convention. Les données viennent d'un fichier, pas de nous.
    func test_unDelaiABSURDE_neCassePasLePlan() throws {
        let plan = try XCTUnwrap(AnimatedImageTiming.plan(delays: [-1, 0.1]))
        XCTAssertEqual(plan.repeats.count, 2)
        XCTAssertTrue(plan.repeats.allSatisfy { $0 >= 1 })
        XCTAssertGreaterThan(plan.duration, 0)
    }
}
