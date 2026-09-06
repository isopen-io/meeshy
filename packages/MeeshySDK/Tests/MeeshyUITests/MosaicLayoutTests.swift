import XCTest
import CoreGraphics
@testable import MeeshySDK
@testable import MeeshyUI

/// **La mosaïque d'une publication** (directive porteur 2026-09-06, #5322).
///
/// La règle est pure : elle rend des cadres en fractions et ne sait pas ce
/// qu'elle dispose. Ces témoins l'éprouvent sans monter d'écran — ce qu'aucun
/// test de rendu ne permettrait, la géométrie n'étant observable qu'à travers
/// une largeur d'appareil.
final class MosaicLayoutTests: XCTestCase {

    private let modes = MosaicLayoutMode.allCases
    /// Les modes qui POSENT des tuiles côte à côte — le carrousel en est
    /// exclu : il pagine, donc il ne plafonne ni ne reporte (voir
    /// `test_leCarrousel_pagineTOUTESlesScenes`).
    private let mosaiques: [MosaicLayoutMode] = [.wave, .hero, .reel, .sine]

    // MARK: - Le report

    /// **LE témoin du lot.** « +n sur la dernière des 4 images. »
    ///
    /// Six scènes : quatre tuiles, et la quatrième dit qu'il en reste DEUX.
    func test_sixScenes_rendentQuatreTuiles_laDerniereDisantDeux() {
        for mode in mosaiques {
            let tuiles = MosaicLayout.tiles(sceneCount: 6, mode: mode)
            XCTAssertEqual(tuiles.count, 4, "\(mode)")
            XCTAssertEqual(tuiles.last?.overflow, 2, "\(mode)")
        }
    }

    /// **Le report compte ce qui RESTE, jamais le total.** L'erreur classique
    /// est `+\(scenes.count)` : le badge compte alors les tuiles qu'on a sous
    /// les yeux, et quatre scènes annoncent « +4 » en n'en cachant aucune.
    func test_quatreScenes_neReportentRien() {
        for mode in mosaiques {
            let tuiles = MosaicLayout.tiles(sceneCount: 4, mode: mode)
            XCTAssertEqual(tuiles.count, 4, "\(mode)")
            XCTAssertEqual(tuiles.last?.overflow, 0,
                           "\(mode) : quatre scènes toutes montrées ne cachent rien")
        }
    }

    /// Le report se pose sur la DERNIÈRE tuile et sur elle seule — sans quoi
    /// quatre badges annonceraient quatre fois le même reste.
    func test_leReport_neSePoseQueSurLaDerniere() {
        for mode in mosaiques {
            let tuiles = MosaicLayout.tiles(sceneCount: 9, mode: mode)
            XCTAssertEqual(tuiles.dropLast().filter { $0.overflow > 0 }, [], "\(mode)")
            XCTAssertEqual(tuiles.last?.overflow, 5, "\(mode)")
        }
    }

    /// Dix scènes — le plafond du contrat (`canvas-v3.ts`, `.max(10)`).
    func test_leMaximumDuContrat_reporteSix() {
        XCTAssertEqual(MosaicLayout.overflow(sceneCount: 10), 6)
        XCTAssertEqual(MosaicLayout.visibleCount(sceneCount: 10), 4)
    }

    // MARK: - Les cas dégénérés

    /// **Une mosaïque d'un élément n'est pas une mosaïque.** Une seule scène
    /// occupe tout le cadre, quel que soit le mode déclaré — lui appliquer une
    /// vague la ferait flotter dans une boîte trop grande pour elle.
    func test_uneSeuleScene_occupeToutLeCadre() {
        for mode in modes {
            let tuiles = MosaicLayout.tiles(sceneCount: 1, mode: mode)
            XCTAssertEqual(tuiles.count, 1, "\(mode)")
            XCTAssertEqual(tuiles.first?.width, 1, "\(mode)")
            XCTAssertEqual(tuiles.first?.height, 1, "\(mode)")
        }
    }

    func test_aucuneScene_neRendAucuneTuile() {
        for mode in modes {
            XCTAssertTrue(MosaicLayout.tiles(sceneCount: 0, mode: mode).isEmpty, "\(mode)")
        }
    }

    /// Un compte NÉGATIF ne peut pas venir du fil, mais il peut venir d'une
    /// soustraction en amont. La règle ne doit pas rendre un tableau fantôme.
    func test_unCompteNegatif_neRendRien() {
        XCTAssertTrue(MosaicLayout.tiles(sceneCount: -3, mode: .wave).isEmpty)
        XCTAssertEqual(MosaicLayout.overflow(sceneCount: -3), 0)
    }

    // MARK: - L'ordre et l'identité

    /// Les tuiles suivent l'ordre des scènes. Un mode qui les mélangerait
    /// ferait lire un récit à l'envers — et la sinusoïde, dont tout l'intérêt
    /// est de guider l'œil dans l'ordre, perdrait sa raison d'être.
    func test_lesTuiles_suiventLOrdreDesScenes() {
        for mode in mosaiques {
            let indices = MosaicLayout.tiles(sceneCount: 7, mode: mode).map(\.sceneIndex)
            XCTAssertEqual(indices, [0, 1, 2, 3], "\(mode)")
        }
        XCTAssertEqual(MosaicLayout.tiles(sceneCount: 7, mode: .carousel).map(\.sceneIndex),
                       [0, 1, 2, 3, 4, 5, 6],
                       "le carrousel pagine tout, dans l'ordre")
    }

    // MARK: - Les quatre géométries sont DISTINCTES

    /// **Quatre modes qui rendraient la même chose ne seraient qu'un.** Le
    /// témoin ne décrit aucune géométrie — il exige seulement qu'elles
    /// diffèrent, ce qui reste vrai si l'une d'elles est retouchée.
    func test_lesQuatreModes_rendentQuatreGeometriesDistinctes() {
        let rendus = modes.map { MosaicLayout.tiles(sceneCount: 4, mode: $0) }
        for i in rendus.indices {
            for j in rendus.indices where j > i {
                XCTAssertNotEqual(rendus[i], rendus[j],
                                  "\(modes[i]) et \(modes[j]) rendent la même disposition")
            }
        }
    }

    /// **La sinusoïde alterne haut / bas** — « une en haut, une en bas, une en
    /// haut, une en bas ». C'est sa définition même, donnée par le porteur.
    func test_laSinusoide_alterneHautEtBas() {
        let tuiles = MosaicLayout.tiles(sceneCount: 4, mode: .sine)
        XCTAssertEqual(tuiles[0].y, 0)
        XCTAssertGreaterThan(tuiles[1].y, 0)
        XCTAssertEqual(tuiles[2].y, 0)
        XCTAssertGreaterThan(tuiles[3].y, 0)
    }

    /// **La vague ondule par la HAUTEUR, pas par la position** — c'est ce qui
    /// la distingue de la sinusoïde, où les tuiles sautent d'un bord à
    /// l'autre. Sans ce témoin, les deux pourraient converger sans que rien
    /// ne rougisse.
    func test_laVague_onduleParLaHauteurEtResteCentree() {
        let tuiles = MosaicLayout.tiles(sceneCount: 4, mode: .wave)
        XCTAssertNotEqual(tuiles[0].height, tuiles[1].height)
        for t in tuiles {
            XCTAssertEqual(t.y, (1 - t.height) / 2, accuracy: 0.0001,
                           "chaque tuile de la vague est centrée verticalement")
        }
    }

    /// **Le hero garde la même grande tuile quel que soit le nombre de
    /// satellites** — c'est ce qui rend la disposition reconnaissable d'un
    /// post à l'autre.
    func test_leHero_gardeLaMemeGrandeTuile() {
        let larges = (2...4).map { MosaicLayout.tiles(sceneCount: $0, mode: .hero)[0].width }
        XCTAssertEqual(Set(larges).count, 1, "la grande tuile ne doit pas dépendre du compte")
        XCTAssertGreaterThan(larges[0], 0.5, "elle doit dominer")
    }

    /// **Le défilement DÉBORDE, et c'est voulu** : l'amorce de la tuile
    /// suivante est ce qui donne envie de pousser. Un mode qui tiendrait dans
    /// la boîte ne serait plus un défilement.
    func test_leDefilement_deborde() {
        let tuiles = MosaicLayout.tiles(sceneCount: 4, mode: .reel)
        XCTAssertGreaterThan(tuiles.last!.x + tuiles.last!.width, 1,
                             "la dernière tuile doit sortir du cadre")
        XCTAssertTrue(tuiles.allSatisfy { $0.height == 1 },
                      "toutes pleine hauteur, comme un réel")
    }

    /// **Les trois MOSAÏQUES tiennent dans leur boîte** — seul le défilement
    /// déborde. Une tuile hors cadre serait rognée sans que rien ne le dise.
    func test_lesMosaiques_tiennentDansLaBoite() {
        for mode in modes where mode != .reel {
            for t in MosaicLayout.tiles(sceneCount: 4, mode: mode) {
                XCTAssertLessThanOrEqual(t.x + t.width, 1.0001, "\(mode) déborde en largeur")
                XCTAssertLessThanOrEqual(t.y + t.height, 1.0001, "\(mode) déborde en hauteur")
                XCTAssertGreaterThanOrEqual(t.x, -0.0001, "\(mode)")
                XCTAssertGreaterThanOrEqual(t.y, -0.0001, "\(mode)")
            }
        }
    }

    /// Aucun mode ne doit rendre une tuile illisible sur le plus étroit des
    /// appareils servis — c'est là que le `+N` deviendrait un point.
    func test_lesQuatreModes_tiennentSurLePlusPetitAppareil() {
        for mode in modes {
            XCTAssertTrue(MosaicLayout.fitsNarrowestDevice(mode: mode),
                          "\(mode) rend une tuile sous 44 pt sur 375 pt de large")
        }
    }

    // MARK: - La légende

    /// **LE témoin de la seconde directive** : « en mode mosaïque il n'y a pas
    /// de légende, mais en mode défilement ou scène unique on laisse la
    /// légende. »
    ///
    /// La raison est géométrique, pas décorative : une mosaïque montre
    /// plusieurs visuels à la fois, et une légende y serait ambiguë —
    /// laquelle des quatre tuiles décrit-elle ?
    func test_uneMosaique_neMontrePasDeLegende() {
        for mode in [MosaicLayoutMode.wave, .hero, .sine] {
            XCTAssertFalse(MosaicLayout.showsCaption(mode: mode, visualCount: 4), "\(mode)")
            XCTAssertTrue(MosaicLayout.isMosaic(mode: mode, visualCount: 4), "\(mode)")
        }
    }

    /// Le défilement ne montre qu'un visuel à la fois : la légende y a un
    /// sujet, et un seul.
    func test_leDefilement_montreLaLegende() {
        XCTAssertTrue(MosaicLayout.showsCaption(mode: .reel, visualCount: 4))
        XCTAssertFalse(MosaicLayout.isMosaic(mode: .reel, visualCount: 4))
    }

    /// **Le COMPTE prime sur le mode.** Un post d'un seul visuel montre sa
    /// légende même s'il déclare une vague — il n'y a pas de mosaïque à un
    /// élément, donc aucune ambiguïté à lever.
    ///
    /// Sans cette priorité, un post-photo unique déclarant `hero` perdrait sa
    /// légende : exactement le défaut corrigé le 2026-09-05, réintroduit par
    /// une règle plus récente.
    func test_unVisuelSeul_montreSaLegendeQuelQueSoitLeMode() {
        for mode in modes {
            XCTAssertTrue(MosaicLayout.showsCaption(mode: mode, visualCount: 1), "\(mode)")
            XCTAssertTrue(MosaicLayout.showsCaption(mode: mode, visualCount: 0), "\(mode)")
        }
    }

    // MARK: - Le défilement image par image

    /// **Le carrousel montre UN visuel à la fois, donc il porte sa légende** —
    /// même raison que le défilement, et c'est ce qui en fait un défaut
    /// acceptable pour tout le corpus.
    func test_leCarrousel_montreSaLegende() {
        XCTAssertTrue(MosaicLayout.showsCaption(mode: .carousel, visualCount: 4))
        XCTAssertFalse(MosaicLayout.isMosaic(mode: .carousel, visualCount: 4))
    }

    /// **Un carrousel se PAGINE ; une mosaïque se pose.** Les quatre autres
    /// modes rendent des cadres à peindre côte à côte ; celui-ci rend des
    /// PAGES, et la vue monte un défilement au lieu d'un empilement.
    ///
    /// Le prédicat vit ici pour la même raison qu'`isMosaic` : le jour où un
    /// sixième mode arrive, une seule ligne décide de quel côté il tombe.
    func test_leCarrousel_estLeSeulModePAGINE() {
        XCTAssertTrue(MosaicLayout.isPaged(mode: .carousel))
        for mode in [MosaicLayoutMode.wave, .hero, .reel, .sine] {
            XCTAssertFalse(MosaicLayout.isPaged(mode: mode), "\(mode)")
        }
    }

    /// **Un carrousel ne CACHE rien — donc il ne reporte rien.**
    ///
    /// Le plafond de quatre existe parce qu'au-delà une mosaïque cesse d'être
    /// lisible d'un coup d'œil. Un carrousel ne montre pas d'un coup d'œil :
    /// il se parcourt. Lui appliquer le plafond enfermerait les scènes 5 à 10
    /// derrière un « +6 » que rien n'ouvrirait — le défaut même que la
    /// mosaïque a corrigé, réintroduit par la disposition par DÉFAUT.
    func test_leCarrousel_pagineTOUTESlesScenes() {
        XCTAssertEqual(MosaicLayout.pageCount(sceneCount: 10, mode: .carousel), 10)
        XCTAssertEqual(MosaicLayout.tiles(sceneCount: 10, mode: .carousel).count, 10)
        XCTAssertEqual(MosaicLayout.tiles(sceneCount: 10, mode: .carousel).last?.overflow, 0,
                       "rien n'est caché : il n'y a rien à reporter")
    }

    /// Les quatre autres modes gardent leur plafond — le carrousel ne le lève
    /// que pour lui.
    func test_lesQuatreMosaiques_gardentLeurPlafond() {
        for mode in [MosaicLayoutMode.wave, .hero, .reel, .sine] {
            XCTAssertEqual(MosaicLayout.pageCount(sceneCount: 10, mode: mode), 4, "\(mode)")
        }
    }

    /// Chaque page occupe TOUT le cadre : c'est ce qui la distingue d'une
    /// tuile, et ce qui interdit à la page suivante de dépasser comme le fait
    /// le défilement `.reel`.
    func test_uneePageDeCarrousel_occupeToutLeCadre() {
        for t in MosaicLayout.tiles(sceneCount: 3, mode: .carousel) {
            XCTAssertEqual(t.width, 1, accuracy: 0.0001)
            XCTAssertEqual(t.height, 1, accuracy: 0.0001)
        }
    }

    // MARK: - Le champ de fil

    /// **Le défaut de lecture est le DÉFILEMENT IMAGE PAR IMAGE** (directive
    /// porteur 2026-09-06), et il vient de la règle — jamais d'un `??` recopié
    /// chez chaque consommateur, qui donnerait deux défauts dans deux vues.
    ///
    /// > « Prendre l'exemple de la publication […] avec 2 images, le
    /// > défilement image par image est aussi un mode de mosaïque à prendre et
    /// > ce doit être le mode par défaut ! »
    ///
    /// C'est le mode que TOUTE publication antérieure au champ `layout`
    /// recevra — donc le corpus entier. Il est choisi pour ça : il ne suppose
    /// rien du nombre de visuels, ne rétrécit aucune tuile, et montre la
    /// légende parce qu'il n'affiche qu'un sujet à la fois.
    func test_unCanvasSansDisposition_retombeSurLeDefilementImageParImage() {
        let canvas = CanvasV3(scenes: [])
        XCTAssertNil(canvas.layout)
        XCTAssertEqual(canvas.resolvedLayout, .carousel)
        XCTAssertEqual(MosaicLayoutMode.fallback, .carousel)
    }

    /// **Un mode INCONNU ne fait pas échouer le canvas.** Un client plus
    /// récent peut écrire une cinquième disposition ; un post qui ne rend rien
    /// coûte infiniment plus qu'un post rendu dans une autre disposition.
    func test_uneDispositionInconnue_retombeSansCasserLeDecodage() throws {
        let json = #"{"v":3,"layout":"kaleidoscope"}"#
        let canvas = try JSONDecoder().decode(CanvasV3.self, from: Data(json.utf8))
        XCTAssertEqual(canvas.layout, .carousel)
        XCTAssertEqual(canvas.resolvedLayout, .carousel)
    }

    /// Le champ voyage : ce que l'auteur choisit se grave et se relit.
    func test_laDisposition_faitLAllerRetourSurLeFil() throws {
        for mode in modes {
            let source = CanvasV3(scenes: [], layout: mode)
            let data = try JSONEncoder().encode(source)
            let relu = try JSONDecoder().decode(CanvasV3.self, from: data)
            XCTAssertEqual(relu.layout, mode)
        }
    }

    /// **Un canvas SANS disposition n'en encode aucune.** Le champ est
    /// additif : le graver à `wave` par défaut ferait mentir toutes les
    /// publications antérieures sur un choix que leur auteur n'a jamais fait.
    func test_unCanvasSansDisposition_nEncodeAucunChamp() throws {
        let data = try JSONEncoder().encode(CanvasV3(scenes: []))
        let texte = String(decoding: data, as: UTF8.self)
        XCTAssertFalse(texte.contains("layout"))
    }
}
