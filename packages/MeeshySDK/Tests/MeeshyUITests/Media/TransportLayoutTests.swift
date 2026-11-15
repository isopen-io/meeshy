import XCTest
@testable import MeeshyUI

/// Répartition barre/menu du lifting Liquid Glass (spec 2026-07-11) :
/// `.mute`/`.airplay` restent visibles dans la barre unique, `.speed`/
/// `.loop`/`.pip` migrent dans le menu ⋯ — le bouton ⋯ n'existe que si
/// au moins un item de menu est présent dans le ControlSet.
final class TransportLayoutTests: XCTestCase {

    func test_barItems_galleryControlSet_returnsMuteOnly() {
        let set: MeeshyVideoPlayer.ControlSet = [.playPause, .scrubber, .duration, .speed, .mute, .pip]
        XCTAssertEqual(TransportLayout.barItems(for: set), [.mute])
    }

    func test_menuItems_galleryControlSet_returnsSpeedAndPip() {
        let set: MeeshyVideoPlayer.ControlSet = [.playPause, .scrubber, .duration, .speed, .mute, .pip]
        XCTAssertEqual(TransportLayout.menuItems(for: set), [.speed, .pip])
    }

    func test_barItems_fullscreenDefault_returnsMuteAndAirplay() {
        XCTAssertEqual(
            TransportLayout.barItems(for: .fullscreenDefault),
            [.mute, .airplay]
        )
    }

    func test_menuItems_fullscreenDefault_returnsSpeedLoopPip() {
        XCTAssertEqual(
            TransportLayout.menuItems(for: .fullscreenDefault),
            [.speed, .loop, .pip]
        )
    }

    func test_showsMenuButton_withoutMenuControls_isFalse() {
        let set: MeeshyVideoPlayer.ControlSet = [.playPause, .scrubber, .duration, .mute]
        XCTAssertFalse(TransportLayout.showsMenuButton(for: set))
    }

    func test_showsMenuButton_withAnyMenuControl_isTrue() {
        XCTAssertTrue(TransportLayout.showsMenuButton(for: [.loop]))
        XCTAssertTrue(TransportLayout.showsMenuButton(for: [.speed]))
        XCTAssertTrue(TransportLayout.showsMenuButton(for: [.pip]))
    }

    func test_barAndMenuItems_emptySet_areEmpty() {
        XCTAssertTrue(TransportLayout.barItems(for: .none).isEmpty)
        XCTAssertTrue(TransportLayout.menuItems(for: .none).isEmpty)
        XCTAssertFalse(TransportLayout.showsMenuButton(for: .none))
    }

    // MARK: - Placement — le transport se SÉPARE en deux (#6162)

    /// **Le gabarit historique n'est pas touché.** C'est ce que mesure ce
    /// témoin, et il est le premier parce que quatre surfaces en dépendent :
    /// réels, plein écran SDK, et les deux variantes inline.
    func test_stacked_keepsBothHalves_andItsSkipButtons() {
        XCTAssertTrue(TransportLayout.showsCenter(placement: .stacked))
        XCTAssertTrue(TransportLayout.showsBar(placement: .stacked, controls: .fullscreenDefault))
        XCTAssertTrue(TransportLayout.showsSkip(placement: .stacked, controls: .fullscreenDefault))
        XCTAssertTrue(TransportLayout.showsElapsedTime(placement: .stacked, controls: .fullscreenDefault))
        XCTAssertTrue(TransportLayout.wrapsBarInGlass(placement: .stacked))
    }

    /// **`.center` ne rend QUE le play/pause** — c'est l'affordance première
    /// d'un lecteur, et le plateau de lecture la laisse au centre du média
    /// pendant que la progression descend dans le couloir.
    func test_center_rendersNoBarAtAll() {
        XCTAssertTrue(TransportLayout.showsCenter(placement: .center))
        XCTAssertFalse(TransportLayout.showsBar(placement: .center, controls: .fullscreenDefault),
                       "la barre est descendue au couloir : la couche centrale n'en porte plus")
    }

    /// **Les ±10 s partent avec le PLACEMENT, pas avec le jeu de contrôles**
    /// (#6162 : « elle ne porte PLUS les boutons −10 s / +10 s », #6163 les
    /// remplace par un geste).
    ///
    /// Le témoin passe `.scrubber` — donc exactement ce qui les faisait naître
    /// jusqu'ici. Les gater sur l'absence d'une option laisserait le prochain
    /// hôte les ressusciter sans le savoir ; les gater sur le placement fait de
    /// leur disparition une LOI du plateau.
    func test_center_neverShowsSkipButtons_evenWithAScrubber() {
        XCTAssertFalse(
            TransportLayout.showsSkip(placement: .center, controls: [.playPause, .scrubber]),
            "aucun ±10 s sur le plateau de lecture — le geste de #6163 les remplace"
        )
        XCTAssertFalse(TransportLayout.showsSkip(placement: .corridor, controls: .fullscreenDefault))
    }

    /// **La bande du couloir est l'autre moitié** : la barre, sans le centre.
    func test_corridor_rendersTheBarWithoutTheCenter() {
        XCTAssertFalse(TransportLayout.showsCenter(placement: .corridor))
        XCTAssertTrue(TransportLayout.showsBar(placement: .corridor,
                                               controls: [.scrubber, .duration, .mute]))
    }

    /// **Une seule durée, à droite, et discrète** (#6162). Le temps écoulé à
    /// gauche double une information que la ligne de progression MONTRE déjà ;
    /// dans un couloir de 44 pt, il la vole à la ligne.
    func test_corridor_showsTheTotalDurationOnly_neverTheElapsedTime() {
        XCTAssertFalse(
            TransportLayout.showsElapsedTime(placement: .corridor, controls: [.scrubber, .duration]),
            "la ligne de progression dit déjà où l'on en est"
        )
        XCTAssertTrue(
            TransportLayout.showsTotalDuration(placement: .corridor, controls: [.scrubber, .duration]),
            "la durée, elle, reste — petite et à droite"
        )
        XCTAssertFalse(
            TransportLayout.showsTotalDuration(placement: .corridor, controls: [.scrubber]),
            "sans `.duration`, aucune durée : la loi 4 vaut ici comme ailleurs"
        )
    }

    /// **Pas de capsule de verre dans le couloir.** Le verre détache un contrôle
    /// posé SUR une image dont on ne connaît pas la luminosité ; le couloir est
    /// un fond noir connu, et la capsule y dessinerait un objet flottant sur
    /// rien.
    func test_corridor_wearsNoGlassCapsule() {
        XCTAssertFalse(TransportLayout.wrapsBarInGlass(placement: .corridor))
    }

    /// Un placement qui n'a rien à rendre ne rend pas une barre vide.
    func test_corridor_withNothingToShow_rendersNoBar() {
        XCTAssertFalse(TransportLayout.showsBar(placement: .corridor, controls: .none))
    }

    // MARK: - La barre prend la largeur de l'écran, le son et (...) vont au rail (#9577)

    func test_corridor_carriesTheProgressAlone_neverTheMuteNorTheMenu() {
        XCTAssertFalse(TransportLayout.showsBarItems(placement: .corridor),
                       "le son et (...) ont quitté la ligne de la barre : elle prend toute la largeur")
        XCTAssertTrue(TransportLayout.showsBarItems(placement: .stacked))
        XCTAssertFalse(TransportLayout.showsBar(placement: .corridor, controls: [.mute, .speed, .pip]),
                       "sans progression à montrer, la bande ne se rend pas pour deux boutons")
    }

    func test_rail_carriesTheMuteAndTheMenu_andNothingElse() {
        XCTAssertTrue(TransportLayout.showsRail(placement: .rail, controls: [.mute, .speed, .pip]))
        XCTAssertFalse(TransportLayout.showsRail(placement: .rail, controls: [.scrubber, .playPause]),
                       "ni son ni menu demandés ⇒ aucun rail (loi 4)")
        XCTAssertFalse(TransportLayout.showsRail(placement: .corridor, controls: .fullscreenDefault))
        XCTAssertFalse(TransportLayout.showsRail(placement: .stacked, controls: .fullscreenDefault))
        XCTAssertFalse(TransportLayout.showsCenter(placement: .rail))
        XCTAssertFalse(TransportLayout.showsBar(placement: .rail, controls: .fullscreenDefault))
        XCTAssertFalse(TransportLayout.showsSkip(placement: .rail, controls: .fullscreenDefault))
    }

    func test_center_showsSkipButtons_onlyWhenTheHostAsksForThem() {
        XCTAssertTrue(TransportLayout.showsSkip(placement: .center, controls: [.playPause, .skip]),
                      "le lecteur plein écran du SDK garde ses ±10 s autour du bouton central")
        XCTAssertFalse(TransportLayout.showsSkip(placement: .center, controls: [.playPause]))
    }
}
