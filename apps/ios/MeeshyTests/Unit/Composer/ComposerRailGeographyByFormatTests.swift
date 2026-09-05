import XCTest
@testable import Meeshy
@testable import MeeshyUI

/// **La place d'un outil dépend de DEUX termes : l'outil ET le format** (#4893,
/// directive porteur 2026-09-02).
///
/// > « Il faut placer l'outil géolocalisation, hashtag, corpus de texte et
/// > mention à GAUCHE lorsqu'on est en mode Story afin de fixer chaque position
/// > à chaque story, et on laisse en bas pour chaque Réel et Post. À la place de
/// > paragraphe c'est donc le corpus de texte qu'on doit afficher en mode
/// > story. »
///
/// ## Ce que ce lot change dans le modèle
///
/// `ComposerRailDoor.level` était une fonction du seul outil — un `switch`
/// exhaustif sur `self`. Elle devient une fonction du couple, et la raison est
/// dans la directive elle-même : **en Story ces quatre outils POSENT quelque
/// chose de positionnable** (« fixer chaque position à chaque story »), donc
/// niveau OBJET, donc rail gauche. En Réel et en Post ils QUALIFIENT la
/// publication, donc rangée canonique.
///
/// ## Pourquoi le témoin porte sur la RÈGLE et jamais sur une liste
///
/// La leçon est déjà écrite dans `ComposerSceneFloatingRail` : un littéral
/// `[.text, .sticker, .sound, .mention]` y doublait la classification et la
/// contredisait, et seule la copie était appelée. Un témoin qui recopierait la
/// répartition attendue referait la même faute d'un cran — il gèlerait une
/// géographie au lieu de vérifier celle que la règle produit. Tout ce qui suit
/// interroge donc `level(for:)` et les deux rangées qui en dérivent.
final class ComposerRailGeographyByFormatTests: XCTestCase {

    /// Les quatre outils que la directive DÉPLACE, nommés une fois.
    private let outilsMobiles: [ComposerRailDoor] = [.place, .hashtag, .mention, .text]

    /// Ce qui ne bouge pas : la matière qu'on pose (média, son, sticker), le
    /// dessin qui ouvre un mode, et la description qui vise la slide.
    private let outilsFixes: [ComposerRailDoor] = [.media, .sound, .sticker, .drawing, .description]

    // MARK: - Le niveau

    func test_level_enStory_lesQuatreOutilsSePosentSurLaScene() {
        for porte in outilsMobiles {
            XCTAssertEqual(porte.level(for: .story), .object,
                           "\(porte.rawValue) doit être positionnable en Story")
            XCTAssertTrue(porte.level(for: .story).appearsOnCanvas,
                          "\(porte.rawValue) doit rejoindre le rail gauche en Story")
        }
    }

    func test_level_horsStory_lesQuatreOutilsQualifientLaPublication() {
        for format in [ComposerFormat.reel, .post, .status] {
            for porte in outilsMobiles {
                XCTAssertEqual(porte.level(for: format), .publication,
                               "\(porte.rawValue) doit rester en bas en \(format)")
            }
        }
    }

    /// **Un témoin de bascule s'écrit sur ce qui NE bascule PAS aussi.** Sans
    /// lui, rendre `.object` pour tout en Story passerait au vert.
    func test_level_laMatiereEtLeDessinNeChangentJamaisDeCote() {
        for format in ComposerFormat.allComposable {
            XCTAssertEqual(ComposerRailDoor.media.level(for: format), .object, "\(format)")
            XCTAssertEqual(ComposerRailDoor.sound.level(for: format), .object, "\(format)")
            XCTAssertEqual(ComposerRailDoor.sticker.level(for: format), .object, "\(format)")
            XCTAssertEqual(ComposerRailDoor.drawing.level(for: format), .scene, "\(format)")
            XCTAssertEqual(ComposerRailDoor.description.level(for: format), .slide, "\(format)")
        }
    }

    // MARK: - Les deux rangées

    func test_sideRow_enStory_porteLesQuatreOutilsDeplaces() {
        let gauche = ComposerSceneFloatingRail.sideRow(from: ComposerRailDoor.canonicalRail,
                                                       format: .story)
        for porte in outilsMobiles {
            XCTAssertTrue(gauche.contains(porte), "\(porte.rawValue) manque au rail gauche en Story")
        }
    }

    func test_lowRow_enPost_porteLesQuatreOutilsDeplaces() {
        let bas = ComposerSceneFloatingRail.lowRow(from: ComposerRailDoor.canonicalRail,
                                                   format: .post)
        for porte in outilsMobiles {
            XCTAssertTrue(bas.contains(porte), "\(porte.rawValue) manque à la rangée du bas en Post")
        }
    }

    /// La partition tient sur CHAQUE format — c'est la propriété qui empêche
    /// qu'une porte se perde entre deux rangées ou s'y montre deux fois.
    func test_lesDeuxRangeesFormentUnePartition_surChaqueFormat() {
        for format in ComposerFormat.allComposable {
            let toutes = ComposerRailDoor.canonicalRail
            let gauche = ComposerSceneFloatingRail.sideRow(from: toutes, format: format)
            let bas = ComposerSceneFloatingRail.lowRow(from: toutes, format: format)
            XCTAssertEqual(gauche.count + bas.count, toutes.count, "\(format)")
            XCTAssertTrue(Set(gauche).isDisjoint(with: Set(bas)), "\(format)")
            XCTAssertEqual(Set(gauche).union(bas), Set(toutes), "\(format)")
        }
    }

    /// **La bascule doit se VOIR** : les deux rangées d'une Story et celles d'un
    /// Post ne peuvent pas être identiques, sinon la règle ne fait rien.
    func test_laGeographieDunePostEtDuneStorySontDifferentes() {
        let toutes = ComposerRailDoor.canonicalRail
        XCTAssertNotEqual(ComposerSceneFloatingRail.sideRow(from: toutes, format: .story),
                          ComposerSceneFloatingRail.sideRow(from: toutes, format: .post))
    }

    // MARK: - Ce que chaque format OFFRE

    /// « À la place de paragraphe c'est donc le corpus de texte qu'on doit
    /// afficher en mode story. »
    func test_offered_enStory_pasDeParagraphe_maisLeCorpusDeTexte() {
        let offertes = ComposerRailDoor.offered(served: Set(ComposerRailDoor.canonicalRail),
                                                format: .story, allowsCapture: true)
        XCTAssertFalse(offertes.contains(.description),
                       "le paragraphe n'a pas de place en Story — la description y EST le contenu")
        XCTAssertTrue(offertes.contains(.text),
                      "le corpus de texte prend sa place")
    }

    func test_offered_enPostEtEnReel_leParagrapheEstServi() {
        for format in [ComposerFormat.post, .reel] {
            let offertes = ComposerRailDoor.offered(served: Set(ComposerRailDoor.canonicalRail),
                                                    format: format, allowsCapture: true)
            XCTAssertTrue(offertes.contains(.description),
                          "la légende du canvas doit être atteignable en \(format)")
        }
    }

    /// Le `status` n'a pas de toile : la règle de `offered` ne doit pas se
    /// laisser contredire par la bascule — aucune porte de niveau objet n'y
    /// survit, et les quatre outils déplacés y sont justement `.publication`.
    func test_offered_enStatus_aucunePorteNapparaitSurLaToile() {
        let offertes = ComposerRailDoor.offered(served: Set(ComposerRailDoor.canonicalRail),
                                                format: .status, allowsCapture: true)
        for porte in offertes {
            XCTAssertFalse(porte.level(for: .status).appearsOnCanvas,
                           "\(porte.rawValue) apparaît sur une toile qui n'existe pas")
        }
    }
}
