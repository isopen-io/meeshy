import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Ce que la carte de scène PEINT, dans ses deux états** (directive porteur
/// du 2026-09-17, lot #6904).
///
/// `SceneCard` est le composant que les deux plein écrans montent désormais —
/// le cadré d'un post et la carte d'une story. Un témoin de SOURCE dirait
/// qu'ils l'appellent ; celui-ci dit ce que l'appel produit à l'écran, dans une
/// vraie fenêtre, sur les trois choses que la carte fait et qu'elle seule fait :
/// le CADRE, le COIN, la présence du FOND.
///
/// Le contenu monté n'est pas un canvas : c'est une bande centrale opaque
/// entourée de vide — la forme EXACTE de ce qu'un player rend quand il ne sert
/// pas son propre remplissage (`servesLetterboxFill: false`, les quatre
/// montages du lecteur et le cadré de la galerie). C'est ce qui rend le fond de
/// la carte MESURABLE : là où le contenu ne peint rien, on lit soit le fond de
/// la carte, soit la sentinelle posée dessous.
///
/// > Un témoin de fond monté sur un contenu OPAQUE ne pourrait jamais tomber :
/// > le fond serait caché par ce qu'il habille.
@MainActor
final class SceneCardMountingTests: XCTestCase {

    /// Ce qu'on lit là où RIEN n'est peint — ni le contenu, ni le fond de la
    /// carte. Distincte du noir, qui est le sol de `SceneBackdropView`.
    private static let sentinelle = Color(.sRGB, red: 1, green: 0, blue: 1, opacity: 1)
    /// Le « média » : la bande que le contenu peint au milieu de la scène.
    private static let bande = Color(.sRGB, red: 0.176, green: 0.831, blue: 0.451, opacity: 1)
    private static let bandeHauteur: CGFloat = 120

    private var viewport: CGSize {
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.screen.bounds.size }.first
            ?? CGSize(width: 402, height: 874)
    }

    // MARK: - Cadré

    /// **Le cadre et le coin.** La carte a EXACTEMENT les cotes que la loi donne
    /// à la scène, et ses coins sont arrondis au rayon de la loi : le pixel du
    /// coin laisse voir la sentinelle, celui du bord non.
    func test_cadree_laCarteALesCotesDeLaLoi_etSesCoinsSontArrondis() throws {
        let vue = viewport
        let loi = SceneShape.layout(.carded(SceneShape.cardedBackdrop), in: vue)
        let carte = loi.sceneFrame

        let pixels = try monter(layout: loi, visible: nil, contenu: .plein)
        defer { pixels.dismount() }

        let milieuX = Int((vue.width / 2).rounded())
        let hautDeLaCarte = Int(carte.minY.rounded())

        XCTAssertTrue(pixels.pixel(milieuX, Int((vue.height / 2).rounded()),
                                   matches: Self.bande, tolerance: 8),
                      "fusible : le contenu est peint " +
                      "(\(pixels.hex(x: milieuX, y: Int(vue.height / 2))))")
        // La HAUTEUR est la cote que la loi contraint sur un iPhone : la scène
        // 9:16 y prend toute la largeur, donc seul son bord HAUT dit qu'elle
        // n'occupe pas le viewport entier — c'est le défaut mesuré sur F1 (une
        // carte de 402 × 670 au lieu de 402 × 714,7).
        XCTAssertTrue(pixels.pixel(milieuX, hautDeLaCarte + 4, matches: Self.bande, tolerance: 8),
                      "la carte est aussi HAUTE que la scène de la loi " +
                      "(\(pixels.hex(x: milieuX, y: hautDeLaCarte + 4)))")
        XCTAssertTrue(pixels.pixel(milieuX, hautDeLaCarte - 4, matches: Self.sentinelle, tolerance: 8),
                      "et pas plus haute : juste au-dessus, on lit la sentinelle " +
                      "(\(pixels.hex(x: milieuX, y: hautDeLaCarte - 4)))")

        let coinY = hautDeLaCarte + 2
        XCTAssertTrue(pixels.pixel(2, coinY, matches: Self.sentinelle, tolerance: 8),
                      "le coin est ARRONDI au rayon de la loi (\(SceneShape.cardedCornerRadius) pt) : " +
                      "la sentinelle s'y voit (\(pixels.hex(x: 2, y: coinY)))")
        XCTAssertTrue(pixels.pixel(2, Int((vue.height / 2).rounded()),
                                   matches: Self.bande, tolerance: 8),
                      "et l'arrondi ne mord QUE le coin : au milieu du bord, la carte peint " +
                      "(\(pixels.hex(x: 2, y: Int(vue.height / 2))))")
    }

    /// **La présence du fond.** Là où le contenu ne peint pas — la bande d'un
    /// panorama —, c'est le fond de la CARTE qu'on lit, jamais la sentinelle
    /// posée dessous. Sans empreinte, ce fond est le noir de `SceneBackdropView`.
    func test_cadree_leFondHabilleLaBandeDansLaCarte() throws {
        let vue = viewport
        let loi = SceneShape.layout(.carded(SceneShape.cardedBackdrop), in: vue)

        let pixels = try monter(layout: loi, visible: nil, contenu: .bandeSeule)
        defer { pixels.dismount() }

        let x = Int((vue.width / 2).rounded())
        let hautDeLaBande = Int((vue.height / 2 - loi.sceneFrame.height / 4).rounded())

        XCTAssertTrue(pixels.pixel(x, Int(vue.height / 2), matches: Self.bande, tolerance: 8),
                      "fusible : la bande centrale est peinte (\(pixels.hex(x: x, y: Int(vue.height / 2))))")
        XCTAssertFalse(pixels.pixel(x, hautDeLaBande, matches: Self.sentinelle, tolerance: 8),
                       "le hors-champ de la scène est habillé DANS la carte " +
                       "(\(pixels.hex(x: x, y: hautDeLaBande)))")
        XCTAssertTrue(pixels.pixel(x, hautDeLaBande, matches: .black, tolerance: 12),
                      "et c'est le fond de la carte — noir sans empreinte " +
                      "(\(pixels.hex(x: x, y: hautDeLaBande)))")
    }

    // MARK: - Immersif

    /// **La scène COUVRE le viewport, et personne ne peint autour.** Le coin de
    /// l'écran porte le contenu (rayon 0), et là où le contenu ne peint pas, on
    /// lit la sentinelle : `layout.backdrop` est `nil`, donc aucune couche de
    /// fond n'est montée.
    func test_immersive_laSceneCouvreLeViewport_etPersonneNePeintAutour() throws {
        let vue = viewport
        let loi = SceneShape.layout(.immersive, in: vue)
        XCTAssertNil(loi.backdrop, "l'immersif n'a pas de fond à choisir")

        let plein = try monter(layout: loi, visible: vue, contenu: .plein)
        XCTAssertTrue(plein.pixel(2, 2, matches: Self.bande, tolerance: 8),
                      "coins DROITS et scène couvrante : le contenu atteint le coin de l'écran " +
                      "(\(plein.hex(x: 2, y: 2)))")
        XCTAssertTrue(plein.pixel(Int(vue.width) - 3, Int(vue.height) - 3,
                                  matches: Self.bande, tolerance: 8),
                      "jusqu'au coin opposé (\(plein.hex(x: Int(vue.width) - 3, y: Int(vue.height) - 3)))")
        plein.dismount()

        let bande = try monter(layout: loi, visible: vue, contenu: .bandeSeule)
        defer { bande.dismount() }
        let x = Int((vue.width / 2).rounded())
        let horsBande = Int((vue.height / 2 - Self.bandeHauteur).rounded())
        XCTAssertTrue(bande.pixel(x, Int(vue.height / 2), matches: Self.bande, tolerance: 8),
                      "fusible : la bande est peinte (\(bande.hex(x: x, y: Int(vue.height / 2))))")
        XCTAssertTrue(bande.pixel(x, horsBande, matches: Self.sentinelle, tolerance: 8),
                      "PERSONNE ne peint autour d'une scène immersive " +
                      "(\(bande.hex(x: x, y: horsBande)))")
    }

    // MARK: - Le montage

    private enum Contenu { case plein, bandeSeule }

    private func monter(layout: SceneShape.Layout,
                        visible: CGSize?,
                        contenu: Contenu) throws -> RenderedPixels {
        let pixels = try RenderedPixels(Harnais(layout: layout, visible: visible, contenu: contenu))
        pixels.settle(borne: 3) { true }
        RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        pixels.capture()
        return pixels
    }

    private struct Harnais: View {
        let layout: SceneShape.Layout
        let visible: CGSize?
        let contenu: Contenu

        /// **Le harnais pose sa composition par `GeometryReader`, et non par un
        /// simple `ignoresSafeArea()`.** Mesuré : un `ZStack` centré se pose
        /// dans la zone SÛRE, donc la carte descendait de (59 − 34) / 2 = 12,5
        /// pt — assez pour qu'une scène immersive n'atteigne plus le coin HAUT
        /// de l'écran tout en couvrant le coin bas. Le témoin accusait alors la
        /// carte pour un décalage du harnais.
        var body: some View {
            GeometryReader { geo in
                ZStack {
                    SceneCardMountingTests.sentinelle
                    SceneCard(layout: layout, thumbHash: nil, visible: visible) {
                        ZStack {
                            Color.clear
                            switch contenu {
                            case .plein:
                                SceneCardMountingTests.bande
                            case .bandeSeule:
                                SceneCardMountingTests.bande
                                    .frame(height: SceneCardMountingTests.bandeHauteur)
                            }
                        }
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
            .ignoresSafeArea()
        }
    }
}
