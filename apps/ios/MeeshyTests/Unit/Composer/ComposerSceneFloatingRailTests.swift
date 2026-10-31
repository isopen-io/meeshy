import XCTest
@testable import Meeshy
@testable import MeeshyUI

/// **Aucune porte ne se perd au repos** (#13839, directive porteur du
/// 2026-10-30) — le témoin INVERSE de la géographie « deux places, deux
/// niveaux » (#4561), close le même jour.
///
/// Le rail gauche (ce qui se voit sur la scène) et la ligne canonique (ce qui
/// qualifie l'envoi) ont quitté le plateau. Ce qui se POSE est l'un des cinq
/// boutons de la colonne ; ce qui QUALIFIE, ou le fond, vit dans ⋯. Le niveau
/// de chaque porte (`ComposerRailDoor.level`) reste la loi : il dit toujours
/// si le résultat se voit, et c'est lui que le lecteur des portes consulte.
///
/// Ce que ces témoins gardent n'est plus une rangée mais la propriété que la
/// rangée servait : **chaque porte offerte a un chemin, et un seul**.
final class ComposerSceneFloatingRailTests: XCTestCase {

    private func offertes(_ format: ComposerFormat) -> [ComposerRailDoor] {
        ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors, format: format, allowsCapture: true)
    }

    private func portesAuRepos(_ format: ComposerFormat)
        -> (colonne: [ComposerRailDoor], plus: [ComposerRailDoor], socle: [ComposerRailDoor]) {
        let portes = offertes(format)
        let colonne = ComposerRestChrome.tools(offered: portes).compactMap(\.door)
        let plus = ComposerMoreMenuPolicy.entries(.init(addsSlides: true, backgroundMedia: nil,
                                                        offeredDoors: portes, overflow: []))
        let parPlus = plus.compactMap(\.door) + (plus.contains(.background) ? [.background] : [])
        let socle: [ComposerRailDoor] = ComposerPostTextPill.shows(format: format, sceneMounted: true) ? [.content] : []
        return (colonne, parPlus, socle)
    }

    func test_chaquePorteOfferte_aUnChemin_surChaqueFormat() {
        for format in ComposerFormat.allComposable {
            let (colonne, plus, socle) = portesAuRepos(format)
            for porte in offertes(format) where porte != .description {
                XCTAssertTrue(colonne.contains(porte) || plus.contains(porte) || socle.contains(porte),
                              "\(format) : \(porte.rawValue) n'a plus aucun chemin au repos")
            }
        }
    }

    func test_aucunePorte_nADeuxChemins() {
        for format in ComposerFormat.allComposable {
            let (colonne, plus, socle) = portesAuRepos(format)
            XCTAssertTrue(Set(colonne).isDisjoint(with: Set(plus)), "\(format)")
            XCTAssertTrue(Set(colonne + plus).isDisjoint(with: Set(socle)), "\(format)")
        }
    }

    /// La légende du canvas (`.description`) n'est plus une porte de rail : elle
    /// s'ouvre par « ⋯ › Légende », servie en toute circonstance.
    func test_laLegende_estToujoursDansPlus() {
        let plus = ComposerMoreMenuPolicy.entries(.init(addsSlides: false, backgroundMedia: nil,
                                                        offeredDoors: [], overflow: []))
        XCTAssertTrue(plus.contains(.legend))
    }

    func test_ceQuiSePose_estDansLaColonne_ceQuiQualifie_dansPlus() {
        let (colonne, plus, _) = portesAuRepos(.story)
        XCTAssertEqual(colonne, [.text, .media, .sticker, .sound, .drawing])
        XCTAssertEqual(Set(plus), [.background, .mention, .hashtag, .place])
    }

    func test_leTexteDuPost_passeParLeSocle_enPostEtEnReel() {
        for format in [ComposerFormat.post, .reel] {
            let (colonne, plus, socle) = portesAuRepos(format)
            XCTAssertFalse(colonne.contains(.content))
            XCTAssertFalse(plus.contains(.content), "« Texte du post » vit au socle (#13864), plus dans ⋯")
            XCTAssertEqual(socle, [.content])
        }
    }

    func test_sansScene_aucunBoutonDePose() {
        XCTAssertEqual(ComposerRestChrome.tools(offered: offertes(.status)), [.more],
                       "un statut n'a pas de scène : seul ⋯ reste")
    }

    // MARK: - Le niveau reste la loi

    func test_leCorpusDeTexte_poseDansTousLesFormats() {
        for format in [ComposerFormat.post, .story, .reel] {
            XCTAssertEqual(ComposerRailDoor.text.level(for: format), .object, "\(format)")
        }
        XCTAssertFalse(
            ComposerRailDoor.offered(served: [.text], format: .status, allowsCapture: true).contains(.text),
            "sans toile, rien à poser — le corpus ne survit pas au status"
        )
    }

    func test_leNiveau_ditSiLeResultatSeVoit() {
        XCTAssertTrue(ComposerRailLevel.object.appearsOnCanvas)
        XCTAssertTrue(ComposerRailLevel.scene.appearsOnCanvas)
        XCTAssertFalse(ComposerRailLevel.publication.appearsOnCanvas)
        XCTAssertFalse(ComposerRailLevel.slide.appearsOnCanvas)
    }

    // MARK: - Le son

    func test_laPorteSon_estServieSurLaScene() {
        XCTAssertTrue(ComposerSceneCapabilities.doors.contains(.sound))
    }

    func test_lePorteSon_estServieSurTouteScene_etSurAucunStatus() {
        for format in [ComposerFormat.story, .reel, .post] {
            XCTAssertTrue(offertes(format).contains(.sound), "\(format) porte une scène — elle doit accepter un son")
        }
        XCTAssertFalse(offertes(.status).contains(.sound),
                       "un statut n'a pas de scène sur laquelle poser quoi que ce soit")
    }
}
