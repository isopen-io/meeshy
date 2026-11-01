import XCTest
@testable import Meeshy
@testable import MeeshyUI

/// **La scène d'abord, les contrôles posés dessus** (#13839, directive porteur
/// du 2026-10-30) — le témoin INVERSE de `ComposerSceneFloatingRailTests`, qui
/// gardait les deux rangées du plateau (#4561, #4633).
///
/// Au repos, la scène porte : ✕ en haut à gauche, ↶ ↷ seulement avec un
/// historique, la rangée des diapos dès deux diapos, et la colonne des boutons
/// ronds — Texte, Média, Sticker, Son, Dessin, puis Fond, Mention et Lieu en
/// entrées directes (porteur 2026-10-31, #14050), puis ⋯. Le reste vit dans ⋯.
final class ComposerSceneRestChromeTests: XCTestCase {

    private let portesDeLaStory = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                                           format: .story, allowsCapture: true)

    // MARK: - La colonne

    func test_tools_enStory_lesCinqOutils_puisFondMentionLieu_puisPlus() {
        XCTAssertEqual(ComposerRestChrome.tools(offered: portesDeLaStory),
                       [.text, .media, .sticker, .sound, .drawing, .background, .mention, .place, .more],
                       "le même ordre et les mêmes mots qu'Android (#14049)")
    }

    /// Un fond MÉDIA retire la porte de la palette, pas l'entrée « Fond » :
    /// elle sélectionne alors le fond, et son rail d'outils à plat paraît.
    func test_tools_unFondMedia_garde_Fond_quiLeSelectionne() throws {
        let sansPalette = portesDeLaStory.filter { $0 != .background }
        XCTAssertFalse(ComposerRestChrome.tools(offered: sansPalette).contains(.background))
        XCTAssertEqual(ComposerRestChrome.tools(offered: sansPalette, hasBackgroundMedia: true)
                        .filter { $0 == .background }, [.background])
        let repos = try ComposerSceneArrangementTests.source("MeeshyComposerHost+Rest.swift")
        XCTAssertTrue(repos.contains("if tool == .background, let fond = sceneBackgroundMedia?.id { return selectSceneBackground(fond) }"),
                      "avec un média de fond, « Fond » sélectionne le fond au lieu d'ouvrir la palette")
        XCTAssertTrue(repos.contains("hasBackgroundMedia: sceneBackgroundMedia != nil"))
    }

    func test_tools_lePlusEstToujoursLeDernier_memeSansAucunePorte() {
        XCTAssertEqual(ComposerRestChrome.tools(offered: []), [.more],
                       "⋯ porte Fond, Durée, Animation… : il ne disparaît jamais")
    }

    func test_tools_unePorteNonServie_neSePeintPas() {
        let sansSon = portesDeLaStory.filter { $0 != .sound }
        XCTAssertFalse(ComposerRestChrome.tools(offered: sansSon).contains(.sound))
    }

    /// Fond, Mention, Lieu : sur le rail, en entrées directes (#14050) ; le
    /// hashtag, la description et le texte du post restent ailleurs.
    func test_tools_fondMentionLieuSontSurLeRail_leRestePasse() {
        let portes = ComposerRestChrome.tools(offered: ComposerRailDoor.allCases).compactMap(\.door)
        for porte in [ComposerRailDoor.background, .mention, .place] {
            XCTAssertTrue(portes.contains(porte), "\(porte.rawValue) doit être une entrée directe du rail")
        }
        for porte in [ComposerRailDoor.hashtag, .description, .content] {
            XCTAssertFalse(portes.contains(porte), "\(porte.rawValue) doit vivre ailleurs que sur la scène")
        }
    }

    /// **Le rail défile s'il dépasse** : la colonne n'écrase jamais ses
    /// boutons, elle passe en défilement.
    func test_column_scrollsWhenItOverflows() throws {
        let chrome = try ComposerSceneArrangementTests.source("ComposerSceneOverlayChrome.swift")
        XCTAssertTrue(chrome.contains("ViewThatFits(in: .vertical)"), "la colonne se mesure à la hauteur libre")
        XCTAssertTrue(chrome.contains("ScrollView(.vertical, showsIndicators: false) { toolButtons }"),
                      "au-delà, elle défile")
    }

    func test_tools_chaqueBoutonAUnLibelleNonVide() {
        for outil in ComposerRestTool.allCases {
            XCTAssertFalse(ComposerRestChromeCopy.label(outil).isEmpty, "\(outil)")
            XCTAssertFalse(outil.symbol.isEmpty, "\(outil)")
        }
    }

    // MARK: - La rangée des diapos

    func test_showsSlideRow_uneSeuleDiapo_rienEnHaut() {
        XCTAssertFalse(ComposerRestChrome.showsSlideRow(slideCount: 1))
        XCTAssertFalse(ComposerRestChrome.showsSlideRow(slideCount: 0))
    }

    func test_showsSlideRow_desDeuxDiapos_laRangeeParait() {
        XCTAssertTrue(ComposerRestChrome.showsSlideRow(slideCount: 2))
        XCTAssertTrue(ComposerRestChrome.showsSlideRow(slideCount: 10))
    }

    // MARK: - Ce qui paraît, état par état

    private func etat(outil: Bool = false, ecrit: Bool = false, camera: Bool = false,
                      panneau: Bool = false, frise: Bool = false) -> ComposerRestChrome.State {
        ComposerRestChrome.State(toolIsOpen: outil, writesText: ecrit, cameraIsArmed: camera,
                                 bottomPanelIsOpen: panneau, timelineIsOpen: frise)
    }

    func test_auRepos_toutParait() {
        let repos = etat()
        XCTAssertTrue(ComposerRestChrome.topRowIsShown(repos))
        XCTAssertTrue(ComposerRestChrome.historyIsShown(repos))
        XCTAssertTrue(ComposerRestChrome.toolColumnIsShown(repos))
    }

    func test_unOutilOuvert_retireToutLeChromeDuRepos() {
        let dessin = etat(outil: true)
        XCTAssertFalse(ComposerRestChrome.topRowIsShown(dessin))
        XCTAssertFalse(ComposerRestChrome.toolColumnIsShown(dessin))
    }

    func test_onEcrit_rienNeResteSurLaScene() {
        let frappe = etat(ecrit: true)
        XCTAssertFalse(ComposerRestChrome.topRowIsShown(frappe))
        XCTAssertFalse(ComposerRestChrome.toolColumnIsShown(frappe))
    }

    func test_leViseurArme_leRetireAussi() {
        XCTAssertFalse(ComposerRestChrome.topRowIsShown(etat(camera: true)))
        XCTAssertFalse(ComposerRestChrome.toolColumnIsShown(etat(camera: true)))
    }

    /// Un panneau du bas (fond, cadrage, effets) n'a qu'un geste à côté de lui :
    /// le fermer. La colonne s'efface, ✕ reste.
    func test_unPanneauEnBas_effaceLaColonne_gardeLaCroix() {
        let fond = etat(panneau: true)
        XCTAssertTrue(ComposerRestChrome.topRowIsShown(fond))
        XCTAssertFalse(ComposerRestChrome.toolColumnIsShown(fond))
    }

    /// La frise réécrit la slide à sa fermeture : défaire pendant qu'elle est
    /// ouverte serait écrasé.
    func test_laFriseOuverte_masqueLHistorique() {
        let frise = etat(panneau: true, frise: true)
        XCTAssertFalse(ComposerRestChrome.historyIsShown(frise))
        XCTAssertTrue(ComposerRestChrome.topRowIsShown(frise))
    }

    // MARK: - L'historique

    /// « Défaire » et non « Annuler » (relevé iOS du 2026-10-30, écran 04) : le
    /// mot « Annuler » ferme les feuilles. Dans CHAQUE langue du catalogue,
    /// ↶ ne se lit pas comme le bouton qui ferme.
    func test_historyUndo_neSeLitJamaisCommeAnnuler_dansAucuneLangue() throws {
        let catalogue = try JSONSerialization.jsonObject(
            with: Data(contentsOf: Self.appCatalog)) as? [String: Any]
        let cles = try XCTUnwrap(catalogue?["strings"] as? [String: Any])
        let defaire = try XCTUnwrap(Self.values(of: "composer.history.undo", in: cles))
        let annuler = try XCTUnwrap(Self.values(of: "common.cancel", in: cles))
        XCTAssertGreaterThanOrEqual(defaire.count, 7)
        for (langue, mot) in defaire {
            XCTAssertNotEqual(mot, annuler[langue], "↶ se lit « \(mot) » en \(langue), comme le bouton qui ferme")
        }
    }

    private static var appCatalog: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
    }

    private static func values(of key: String, in strings: [String: Any]) -> [String: String]? {
        guard let entree = strings[key] as? [String: Any],
              let langues = entree["localizations"] as? [String: Any] else { return nil }
        return langues.reduce(into: [:]) { acc, paire in
            let unite = (paire.value as? [String: Any])?["stringUnit"] as? [String: Any]
            if let valeur = unite?["value"] as? String { acc[paire.key] = valeur }
        }
    }

    // MARK: - Le son

    func test_soundAction_sansSonDeFond_ouvreLaPorte() {
        XCTAssertEqual(ComposerRestChrome.soundAction(hasBackgroundSound: false, canEditBackgroundSound: true),
                       .openDoor)
    }

    func test_soundAction_avecUnSonDeFondEditable_rouvreSaFeuille() {
        XCTAssertEqual(ComposerRestChrome.soundAction(hasBackgroundSound: true, canEditBackgroundSound: true),
                       .editBackground)
    }

    func test_soundAction_unFondLegacySansEditeur_ouvreLaPorte() {
        XCTAssertEqual(ComposerRestChrome.soundAction(hasBackgroundSound: true, canEditBackgroundSound: false),
                       .openDoor)
    }

    /// La colonne s'alignait sur le bord de la scène : sans la pastille
    /// « Coller », plus large, qui la décalait, ses boutons touchaient ce bord
    /// sur l'iPhone et le débordaient sur le petit écran.
    func test_toolColumnInnerMargin_keepsTheButtonsInsideTheScene() {
        XCTAssertGreaterThanOrEqual(ComposerRestChrome.toolColumnInnerMargin, 8)
    }
}
