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

    // MARK: - La scène plus étroite que l'écran

    /// Relevé au simulateur iPhone SE : la couche de scène fait 375 × 667 pt, le
    /// 9:16 s'y pose sous 12 pt d'air (368,4 × 655), et le socle le réduit, dès
    /// le repos, à la zone libre au-dessus de lui (604 pt de haut). La scène
    /// DESSINÉE commence donc à 17,6 pt du bord : c'est cet écart que le chrome
    /// du repos reprend.
    func test_sceneSideInset_seLitSurLaSceneDessinee_reduiteParLeSocle() {
        let couche = CGRect(x: 0, y: 0, width: 375, height: 667)
        let auRepos: CGFloat = 604.0 / 655.0
        let se = ComposerRestChrome.sceneSideInset(layer: couche, aspectRatio: 9.0 / 16.0, scale: auRepos)
        XCTAssertEqual(se, (375 - 604 * 9.0 / 16.0) / 2, accuracy: 0.01)
        XCTAssertEqual(ComposerRestChrome.sceneSideInset(layer: couche.offsetBy(dx: 20, dy: 0),
                                                         aspectRatio: 9.0 / 16.0, scale: auRepos),
                       se + 20, accuracy: 0.01, "une couche décalée dans la fenêtre décale la scène d'autant")
        XCTAssertEqual(ComposerRestChrome.sceneSideInset(layer: couche, aspectRatio: 9.0 / 16.0, scale: 1),
                       (375 - 655 * 9.0 / 16.0) / 2, accuracy: 0.01)
    }

    func test_sceneSideInset_uneSceneQuiPrendLaLargeur_nePousseRien() {
        XCTAssertEqual(ComposerRestChrome.sceneSideInset(layer: CGRect(x: 0, y: 0, width: 402, height: 800),
                                                         aspectRatio: 9.0 / 16.0, scale: 1), 0)
        XCTAssertEqual(ComposerRestChrome.sceneSideInset(layer: .null, aspectRatio: 9.0 / 16.0, scale: 1), 0)
        XCTAssertEqual(ComposerRestChrome.sceneSideInset(layer: .zero, aspectRatio: 9.0 / 16.0, scale: 1), 0)
    }

    /// Le haut de la scène dessinée : la levée s'ancre au haut du 9:16, qui ne
    /// bouge que du décalage qu'elle applique. Sur le SE, 12 pt d'air au-dessus.
    func test_sceneTop_estLeHautDu916_plusLeDecalageDeLaLevee() {
        let couche = CGRect(x: 0, y: 0, width: 375, height: 667)
        XCTAssertEqual(ComposerRestChrome.sceneTop(layer: couche, aspectRatio: 9.0 / 16.0, offsetY: 0), 12,
                       accuracy: 0.01)
        XCTAssertEqual(ComposerRestChrome.sceneTop(layer: couche.offsetBy(dx: 0, dy: 20), aspectRatio: 9.0 / 16.0,
                                                   offsetY: -5), 27, accuracy: 0.01)
        XCTAssertEqual(ComposerRestChrome.sceneTop(layer: .null, aspectRatio: 9.0 / 16.0, offsetY: 0), 0)
    }

    /// ✕ et ↶ ↷ descendent sous le haut de la scène quand elle commence plus bas
    /// que le chrome ; une scène qui monte au-dessus de lui ne les déplace pas.
    func test_sceneTopInset_poussseLeChromeSousLeHautDeLaScene_jamaisAuDessus() {
        XCTAssertEqual(ComposerRestChrome.sceneTopInset(sceneTop: 12, chromeTop: 0), 12)
        XCTAssertEqual(ComposerRestChrome.sceneTopInset(sceneTop: 50, chromeTop: 62), 0)
    }

    /// Un panneau, une feuille ou le clavier réduisent la scène davantage : ses
    /// options ne la suivent pas, elles gardent l'écart du repos.
    func test_restInset_seFigePendantUneReduction_seRelitAuRepos() {
        XCTAssertEqual(ComposerRestChrome.restInset(measured: 17.6, sceneIsReduced: false, current: 0), 17.6)
        XCTAssertEqual(ComposerRestChrome.restInset(measured: 80, sceneIsReduced: true, current: 17.6), 17.6)
    }

    /// Le relevé au SE l'a montré deux fois : un écart suspendu pendant une
    /// « levée » restait à 0, la scène passant pour levée au repos ; lu sans
    /// l'échelle du repos, il ne valait que 3,3 pt. La réduction qui fige
    /// l'écart est celle d'une feuille ou du clavier (#15226).
    func test_lEcartDuRepos_suitLEchelleDuRepos_etNeSeFigeQueSurUnPanneau() throws {
        let surface = try ComposerSceneArrangementTests.source("ComposerSceneSurface.swift")
        XCTAssertTrue(surface.contains("ComposerRestChrome.sceneSideInset(layer:"))
        XCTAssertTrue(surface.contains("scale: lift.scale"))
        XCTAssertTrue(surface.contains("ComposerRestChrome.restInset(measured:"))
        XCTAssertTrue(surface.contains("ComposerRestChrome.sceneTop(layer:"))
        XCTAssertTrue(surface.contains("sceneTopInset: restSceneTopInset"))
        XCTAssertFalse(surface.contains("sceneLiftInset > 0 ||"))
    }



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

    /// Fond, Mention, Lieu : sur le rail, en entrées directes (#14050), et le
    /// texte du post quand le format en écrit un (#14457) ; le hashtag et la
    /// description restent ailleurs.
    func test_tools_fondMentionLieuSontSurLeRail_leRestePasse() {
        let portes = ComposerRestChrome.tools(offered: ComposerRailDoor.allCases).compactMap(\.door)
        for porte in [ComposerRailDoor.background, .mention, .place, .content] {
            XCTAssertTrue(portes.contains(porte), "\(porte.rawValue) doit être une entrée directe du rail")
        }
        for porte in [ComposerRailDoor.hashtag, .description] {
            XCTAssertFalse(portes.contains(porte), "\(porte.rawValue) doit vivre ailleurs que sur la scène")
        }
    }

    /// **Le rail défile s'il dépasse** : la colonne n'écrase jamais ses
    /// boutons, elle passe en défilement.
    func test_column_scrollsWhenItOverflows() throws {
        let chrome = try ComposerSceneArrangementTests.source("ComposerSceneOverlayChrome.swift")
        XCTAssertTrue(chrome.contains("ViewThatFits(in: .vertical)"), "la colonne se mesure à la hauteur libre")
        XCTAssertTrue(chrome.contains("bodyButtons.modifier(ComposerScrollEdgeCue())"),
                      "au-delà, ses outils défilent, le pied restant posé (#14622)")
        let defilement = try ComposerSceneArrangementTests.source("ComposerScrollEdgeCue.swift")
        XCTAssertTrue(defilement.contains("ScrollView(.vertical, showsIndicators: false)"), "le défilement est vertical")
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

    /// **Ce qui occupe le bas laisse la scène nue** (#14191, jumelle d'Android
    /// #14186) : sous un panneau du bas (fond, cadrage, effets, frise), rien de
    /// ce que la scène portait au repos ne s'y pose plus — ni ✕, ni ↶ ↷, ni la
    /// rangée des diapos, ni la colonne. Seuls la scène et le panneau restent.
    func test_unPanneauEnBas_laisseLaSceneNue() {
        for fond in [etat(panneau: true), etat(panneau: true, frise: true)] {
            XCTAssertFalse(ComposerRestChrome.closeIsShown(fond), "✕ ne se pose plus sur la scène réduite")
            XCTAssertFalse(ComposerRestChrome.historyIsShown(fond), "↶ ↷ non plus")
            XCTAssertFalse(ComposerRestChrome.slideRowIsShown(fond, slideCount: 3), "ni la rangée des diapos")
            XCTAssertFalse(ComposerRestChrome.toolColumnIsShown(fond), "ni la colonne des outils")
        }
    }

    /// ↶ ↷ quittent la scène réduite sans passer au rail droit : le repos réduit
    /// n'a qu'un geste, fermer le panneau.
    func test_unPanneauEnBas_auRepos_retireLHistoriqueSansLeDeplacer() {
        XCTAssertTrue(ComposerRestChrome.historyIsWithdrawn(etat(panneau: true)))
        XCTAssertFalse(ComposerRestChrome.historyIsWithdrawn(etat()), "au repos, ↶ ↷ sont sur la scène")
        XCTAssertFalse(ComposerRestChrome.historyIsWithdrawn(etat(outil: true, panneau: true)),
                       "un outil ouvert garde ↶ ↷ dans SON rail")
    }

    // MARK: - La scène ne se réduit que pour le clavier ou une vraie feuille (#15226)

    /// Décision porteur (Android #15192) : une bande, la frise ou les effets se
    /// posent PAR-DESSUS une scène qui garde sa taille.
    func test_sceneIsReduced_uneBandeOuLaFrise_laisseLaScenePleine() {
        XCTAssertFalse(ComposerRestChrome.sceneIsReduced(etat(panneau: true)),
                       "le fond, le cadrage ou les effets se posent sur la scène")
        XCTAssertFalse(ComposerRestChrome.sceneIsReduced(etat(panneau: true, frise: true)), "la frise aussi")
    }

    /// Un outil ouvert — ses réglages à plat à la place du rail, le dessin —
    /// ne réduit pas la scène.
    func test_sceneIsReduced_unOutilAPlat_laisseLaScenePleine() {
        XCTAssertFalse(ComposerRestChrome.sceneIsReduced(etat(outil: true)))
        XCTAssertFalse(ComposerRestChrome.sceneIsReduced(etat()), "au repos non plus")
    }

    /// Un objet sélectionné remplace la colonne par ses options, sans réduire.
    func test_sceneIsReduced_uneSelection_laisseLaScenePleine() {
        let selection = ComposerRestChrome.State(toolIsOpen: false, writesText: false, cameraIsArmed: false,
                                                 bottomPanelIsOpen: false, timelineIsOpen: false,
                                                 objectIsSelected: true)
        XCTAssertFalse(ComposerRestChrome.sceneIsReduced(selection))
    }

    func test_sceneIsReduced_leClavier_reduitLaScene() {
        let frappe = ComposerRestChrome.State(toolIsOpen: true, writesText: false, cameraIsArmed: false,
                                              bottomPanelIsOpen: false, timelineIsOpen: false,
                                              keyboardIsUp: true)
        XCTAssertTrue(ComposerRestChrome.sceneIsReduced(frappe))
    }

    func test_sceneIsReduced_uneVraieFeuille_reduitLaScene() {
        let feuille = ComposerRestChrome.State(toolIsOpen: false, writesText: false, cameraIsArmed: false,
                                               bottomPanelIsOpen: false, timelineIsOpen: false,
                                               sheetIsRaised: true)
        XCTAssertTrue(ComposerRestChrome.sceneIsReduced(feuille), "une feuille ancrée monte du bas")
    }

    func test_sceneIsReduced_lesProprietesDUnObjet_laissentLaScenePleine() {
        let proprietes = ComposerRestChrome.State(toolIsOpen: false, writesText: false, cameraIsArmed: false,
                                                  bottomPanelIsOpen: false, timelineIsOpen: false,
                                                  objectIsSelected: true, propertiesAreOpen: true)
        XCTAssertFalse(ComposerRestChrome.sceneIsReduced(proprietes),
                       "le cadrage d'une image sélectionnée se pose par-dessus la scène")
    }

    /// La surface lit la loi : plus de réduction calculée à côté d'elle, et la
    /// scène lit le haut du repos sous ce qui se pose par-dessus.
    func test_laSurface_litLaLoiDeReduction_etLeHautDuRepos() throws {
        let surface = try ComposerSceneArrangementTests.source("ComposerSceneSurface.swift")
        XCTAssertTrue(surface.contains("ComposerRestChrome.sceneIsReduced(restState)"))
        XCTAssertTrue(surface.contains("keyboardIsUp: editingTextId != nil"))
        XCTAssertTrue(surface.contains("sheetIsRaised: anchoredSheetTop != nil"))
        XCTAssertTrue(surface.contains("ComposerSceneLift.floorTop("))
        XCTAssertTrue(surface.contains("ComposerSceneLift.restFloorTop("))
        XCTAssertFalse(surface.contains("panelIsOpen("), "aucune réduction par panneau ne survit")
    }

    /// Les propriétés d'un objet sélectionné se posent par-dessus la scène : ses
    /// options restent dans leur colonne, ↶ ↷ et la rangée des diapos partent.
    func test_lesProprietesDUnObjet_gardentSesOptions_retirentLaRangeeDuHaut() {
        let proprietes = ComposerRestChrome.State(toolIsOpen: false, writesText: false, cameraIsArmed: false,
                                                  bottomPanelIsOpen: false, timelineIsOpen: false,
                                                  objectIsSelected: true, propertiesAreOpen: true)
        XCTAssertTrue(ComposerRestChrome.selectionColumnIsShown(proprietes), "les options de l'objet restent")
        XCTAssertFalse(ComposerRestChrome.closeIsShown(proprietes))
        XCTAssertFalse(ComposerRestChrome.historyIsShown(proprietes))
        XCTAssertFalse(ComposerRestChrome.slideRowIsShown(proprietes, slideCount: 3))
    }

    func test_auRepos_laRangeeDesDiaposParait_desDeuxDiapos() {
        XCTAssertTrue(ComposerRestChrome.slideRowIsShown(etat(), slideCount: 2))
        XCTAssertFalse(ComposerRestChrome.slideRowIsShown(etat(), slideCount: 1))
        XCTAssertFalse(ComposerRestChrome.slideRowIsShown(etat(outil: true), slideCount: 3))
    }

    /// Le chrome posé sur la scène lit la loi, pas le seul compte des diapos ;
    /// la surface lui dit quand les propriétés occupent le bas, et le rail
    /// droit ne recueille pas un historique retiré.
    func test_laSurface_brancheLaLoiDeLaSceneReduite() throws {
        let chrome = try ComposerSceneArrangementTests.source("ComposerSceneOverlayChrome.swift")
        XCTAssertTrue(chrome.contains("ComposerRestChrome.slideRowIsShown(state, slideCount: slideCount)"))
        let surface = try ComposerSceneArrangementTests.source("ComposerSceneSurface.swift")
        XCTAssertTrue(surface.contains("propertiesAreOpen: propertiesSheet != nil"))
        XCTAssertTrue(surface.contains("ComposerRestChrome.historyIsWithdrawn(restState)"))
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
