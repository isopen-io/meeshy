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
        let loi = SceneShape.layout(in: vue)
        let carte = loi.sceneFrame

        let pixels = try monter(layout: loi, contenu: .plein)
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
        let loi = SceneShape.layout(in: vue)

        let pixels = try monter(layout: loi, contenu: .bandeSeule)
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

    /// **L'immersif est la MÊME carte dans le viewport ENTIER** (directive
    /// porteur du 2026-09-17, 3e message : « On préserve le même fond que pour
    /// la story ! »).
    ///
    /// Il rendait auparavant un aspect-FILL sans fond — la seule surface du
    /// produit qui RETIRAIT des pixels posés par l'auteur, et la seule dont le
    /// hors-champ n'avait aucun peintre. Ce témoin mesure l'inverse : la scène
    /// AJUSTE dans le viewport, son hors-champ est habillé DANS la carte, et
    /// c'est le même fond que partout ailleurs.
    func test_immersive_estLaMemeCarteDansLeViewportEntier() throws {
        let vue = viewport
        let loi = SceneShape.layout(in: vue)
        XCTAssertEqual(loi.backdrop, SceneShape.cardedBackdrop,
                       "l'immersif garde LE MÊME fond que la story")
        XCTAssertEqual(loi.cornerRadius, SceneShape.cardedCornerRadius, "et les mêmes coins")

        let pixels = try monter(layout: loi, contenu: .bandeSeule)
        defer { pixels.dismount() }

        let x = Int((vue.width / 2).rounded())
        let milieu = Int((vue.height / 2).rounded())
        let horsBande = Int((vue.height / 2 - Self.bandeHauteur).rounded())
        let hautDeLaCarte = Int(loi.sceneFrame.minY.rounded())

        XCTAssertTrue(pixels.pixel(x, milieu, matches: Self.bande, tolerance: 8),
                      "fusible : la bande est peinte (\(pixels.hex(x: x, y: milieu)))")
        XCTAssertFalse(pixels.pixel(x, horsBande, matches: Self.sentinelle, tolerance: 8),
                       "le hors-champ de la scène est habillé DANS la carte, jamais laissé nu " +
                       "(\(pixels.hex(x: x, y: horsBande)))")
        XCTAssertTrue(pixels.pixel(x, hautDeLaCarte - 4, matches: Self.sentinelle, tolerance: 8),
                      "et la carte AJUSTE : au-dessus de son bord haut, le viewport reste nu " +
                      "(\(pixels.hex(x: x, y: hautDeLaCarte - 4)))")
    }

    // MARK: - Le montage

    private enum Contenu { case plein, bandeSeule }

    private func monter(layout: SceneShape.Layout,
                        contenu: Contenu) throws -> RenderedPixels {
        let pixels = try RenderedPixels(Harnais(layout: layout, contenu: contenu))
        pixels.settle(borne: 3) { true }
        RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        pixels.capture()
        return pixels
    }

    private struct Harnais: View {
        let layout: SceneShape.Layout
        let contenu: Contenu

        /// **Le harnais pose sa composition par `GeometryReader`, et non par un
        /// simple `ignoresSafeArea()`.** Mesuré : un `ZStack` centré se pose
        /// dans la zone SÛRE, donc la carte descendait de (59 − 34) / 2 = 12,5
        /// pt — assez pour que le bord haut MESURÉ de la carte ne soit plus
        /// celui que la loi prescrit. Le témoin accusait alors la carte pour un
        /// décalage du harnais.
        var body: some View {
            GeometryReader { geo in
                ZStack {
                    SceneCardMountingTests.sentinelle
                    SceneCard(layout: layout, thumbHash: nil) {
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
