import XCTest
@testable import Meeshy

/// #4080 (vue `2b`) — **le viseur vit dans la scène, et les trois pastilles ne
/// sont pas trois médias.**
final class ComposerSceneCameraTests: XCTestCase {

    /// Un statut n'a pas de scène : pas de viseur. La liste VIDE l'exprime, et
    /// elle doit s'accorder avec `offersCapture`, qui refuse déjà le geste —
    /// deux règles voisines qui rendraient deux verdicts laisseraient une
    /// rangée de pastilles au-dessus d'un geste impossible.
    func test_leStatut_neSertAucunMode_commeLeGesteLeRefuse() {
        XCTAssertTrue(ComposerSceneCamera.modes(for: .status).isEmpty)
        XCTAssertFalse(ComposerSceneCaptureGesture.offersCapture(
            backgroundIsEmpty: true, format: .status))
    }

    /// **Le réel n'offre pas PHOTO.** C'est le témoin qui discrimine : sur
    /// story et post, servir trois pastilles ou deux rend la même rangée
    /// plausible ; ici seule la règle juste retire la bonne.
    func test_leReel_neSertPasLaPhoto() {
        XCTAssertEqual(ComposerSceneCamera.modes(for: .reel), [.video, .handsFree])
        XCTAssertFalse(ComposerSceneCamera.modes(for: .reel).contains(.photo))
    }

    func test_storyEtPost_serventLesTroisPastilles() {
        for format in [ComposerFormat.story, .post] {
            XCTAssertEqual(ComposerSceneCamera.modes(for: format), [.photo, .video, .handsFree])
        }
    }

    /// **Le mode d'ouverture est le premier SERVI, jamais un littéral.** Sans
    /// cette dérivation, un réel s'ouvrirait sur une pastille PHOTO que sa
    /// propre rangée ne montre pas.
    func test_leModeDOuverture_estToujoursServiParSaPropreRangée() {
        // `ComposerFormat` n'est pas `CaseIterable` — les quatre cas sont
        // écrits ici, et le témoin de cardinalité ci-dessous garde la liste :
        // un cinquième format ferait tomber ce dernier, pas celui-ci en silence.
        for format in [ComposerFormat.story, .post, .reel, .status] {
            guard let ouverture = ComposerSceneCamera.initialMode(for: format) else {
                XCTAssertTrue(ComposerSceneCamera.modes(for: format).isEmpty,
                              "\(format) n'ouvre sur rien mais sert des modes")
                continue
            }
            XCTAssertTrue(ComposerSceneCamera.modes(for: format).contains(ouverture),
                          "\(format) ouvre sur \(ouverture), absent de sa rangée")
        }
    }

    /// **Le garde-fou de la liste écrite à la main.** `ComposerFormat` n'est
    /// pas `CaseIterable` ; le témoin ci-dessus énumère donc quatre cas en
    /// dur. Celui-ci tombe si un cinquième format naît — sans lui, la boucle
    /// passerait au vert en ignorant le nouveau venu, ce qui est exactement la
    /// forme d'un témoin qui se périme sans rougir.
    func test_lesQuatreFormats_sontToujoursQuatre() {
        let servis: [ComposerFormat] = [.story, .post, .reel, .status]
        for format in servis {
            switch format {
            case .story, .post, .reel, .status: continue
            }
        }
        XCTAssertEqual(servis.count, 4)
    }

    // MARK: - Le relâchement, où les trois modes divergent

    /// **MAINS LIBRES continue de tourner** — c'est toute sa raison d'être.
    /// Le traiter comme `video` le rendrait indiscernable de lui, et la
    /// troisième pastille deviendrait un doublon de la deuxième.
    func test_mainsLibres_continueDeTournerAuRelâchement() {
        XCTAssertEqual(
            ComposerSceneCamera.stageAfterRelease(mode: .handsFree, stage: .recording),
            .recording)
    }

    func test_laVidéoTenue_seClôtAuRelâchement() {
        XCTAssertEqual(
            ComposerSceneCamera.stageAfterRelease(mode: .video, stage: .recording),
            .armed)
    }

    /// Relâcher hors enregistrement ne change rien — un geste qui n'a rien
    /// commencé ne peut rien clore, et rendre `.armed` ici armerait un viseur
    /// éteint.
    func test_relâcherHorsEnregistrement_neChangeRien() {
        for mode in ComposerSceneCameraMode.allCases {
            for étape in [ComposerSceneCameraStage.off, .armed] {
                XCTAssertEqual(
                    ComposerSceneCamera.stageAfterRelease(mode: mode, stage: étape), étape)
            }
        }
    }

    /// **Une entrée, pas un mode** (§2b) : après la pose, le viseur se retire.
    func test_aprèsLaPose_leViseurSeRetire() {
        XCTAssertEqual(ComposerSceneCamera.stageAfterCapture, .off)
    }

    // MARK: - La pose réutilise la règle de la galerie

    /// La cible le prescrit mot pour mot — « la même règle que la galerie ».
    /// Ce témoin garde la RÉUTILISATION : si quelqu'un recopiait la règle chez
    /// la caméra, il faudrait qu'elle rende encore ces deux verdicts, et une
    /// copie diverge au premier format ajouté.
    func test_laPose_suitLaRègleDeLaGalerie() {
        XCTAssertEqual(
            ComposerMediaPlacement.role(door: .sceneRail, currentSlideHasBackground: false),
            .background)
        XCTAssertEqual(
            ComposerMediaPlacement.role(door: .sceneRail, currentSlideHasBackground: true),
            .foreground)
    }

    // MARK: - Le libellé DIT le geste

    /// **Le bas de la cible n'est pas décoratif.** Figé sur « maintenir pour
    /// filmer », il mentirait sur deux des trois pastilles — et c'est la
    /// phrase que l'auteur lit pour savoir quoi faire de son doigt.
    func test_chaqueCoupleModeÉtape_aSaProprePhrase() {
        var vues = Set<String>()
        for mode in ComposerSceneCameraMode.allCases {
            for étape in ComposerSceneCameraStage.allCases {
                vues.insert(ComposerSceneCamera.hintKey(mode: mode, stage: étape))
            }
        }
        // PHOTO en dit une seule (son geste ne dépend pas de l'étape) ; VIDÉO
        // et MAINS LIBRES en disent deux chacune — tenir/relâcher, démarrer/arrêter.
        XCTAssertEqual(vues.count, 5)
    }

    func test_laPhrase_changeQuandLaVidéoTourne() {
        XCTAssertNotEqual(
            ComposerSceneCamera.hintKey(mode: .video, stage: .armed),
            ComposerSceneCamera.hintKey(mode: .video, stage: .recording))
        XCTAssertNotEqual(
            ComposerSceneCamera.hintKey(mode: .handsFree, stage: .armed),
            ComposerSceneCamera.hintKey(mode: .handsFree, stage: .recording))
    }
}
