import XCTest
import CoreGraphics
@testable import Meeshy
import MeeshyUI

/// #4061 — la scène s'ENCASTRE entre les deux rails, elle n'est jamais
/// recouverte.
///
/// **Pourquoi une règle et pas un `.padding` :** le nombre à poser n'est pas un
/// goût de marge, c'est une CONSÉQUENCE. Un rail doit mesurer au moins 44 pt
/// (cible tactile), il lui faut une gouttière pour ne pas toucher la scène et
/// une marge pour ne pas toucher le bord — et la scène prend ce qui reste. Écrit
/// en `.padding(.horizontal, 14)`, ce raisonnement disparaît et la première
/// personne qui trouve la scène « un peu étroite » le rogne sans savoir ce
/// qu'elle casse.
///
/// La loi 6 est ce qui interdit l'autre solution — poser les rails PAR-DESSUS.
/// Un FAB sur la scène occupe exactement la place où un `MeeshyObject` peut
/// vivre : l'aperçu mentirait sur le rendu final.
final class ComposerRailGeometryTests: XCTestCase {

    // MARK: - L'invariant qui définit l'encastrement

    /// **Le seul témoin qui dise vraiment « rien ne recouvre ».** Si la somme
    /// ne fait pas la largeur utile, c'est qu'un pixel est partagé — donc
    /// recouvert.
    ///
    /// Il porte sur l'AIRE DISPONIBLE, pas sur la scène rendue : quand la
    /// hauteur devient contraignante (iPad, paysage), `aspectFitSize` rend une
    /// scène plus ÉTROITE que cette aire — donc encore plus loin des rails.
    /// L'invariant est un plancher de sécurité, jamais une promesse de
    /// remplissage (cf. le témoin iPad plus bas).
    func test_lAireDeLaSceneEtLesDeuxCouloirs_remplissentExactementLaLargeurUtile() {
        for utile in [320.0, 375.0, 402.0, 430.0, 744.0, 1024.0] as [CGFloat] {
            let scene = ComposerRailGeometry.sceneWidth(usableWidth: utile, railsShown: true)
            XCTAssertEqual(scene + 2 * ComposerRailGeometry.lane, utile, accuracy: 0.01,
                           "largeur utile \(utile) : la scène et les deux couloirs ne se referment pas")
        }
    }

    /// La cible tactile est un PLANCHER d'accessibilité, pas un réglage : ce
    /// témoin rougit si quelqu'un rétrécit le rail pour gagner de la scène.
    func test_leRail_neDescendJamaisSousLaCibleTactile() {
        XCTAssertGreaterThanOrEqual(ComposerRailGeometry.railWidth, 44,
                                    "44 pt est le plancher HIG d'une cible tactile.")
    }

    /// Le couloir est la SOMME des trois — l'écrire ailleurs le ferait diverger.
    func test_leCouloir_estLaSommeDeSesTroisParties() {
        XCTAssertEqual(ComposerRailGeometry.lane,
                       ComposerRailGeometry.outerMargin
                       + ComposerRailGeometry.railWidth
                       + ComposerRailGeometry.gutter)
    }

    // MARK: - Sans rails, RIEN ne change

    /// Le lot ne doit pas déplacer la scène là où aucun rail n'est monté : la
    /// valeur historique (14 pt de chaque côté) est conservée telle quelle.
    func test_sansRails_lEncastrementResteCeluiDHier() {
        let utile: CGFloat = 402
        XCTAssertEqual(ComposerRailGeometry.sceneWidth(usableWidth: utile, railsShown: false),
                       utile - 2 * ComposerRailGeometry.legacyInset)
        XCTAssertEqual(ComposerRailGeometry.legacyInset, 14)
    }

    // MARK: - Les chiffres annoncés par la planche

    /// La planche (rév. 27) annonce 278 pt de scène et ≈ 494 pt de haut sur un
    /// iPhone 16 Pro. **Un chiffre publié est une affirmation** : celui-ci se
    /// mesure ici, il ne se recopie pas.
    func test_surIPhone16Pro_lesChiffresDeLaPlancheSontCeuxDuCode() {
        let scene = ComposerRailGeometry.sceneWidth(usableWidth: 402, railsShown: true)
        XCTAssertEqual(scene, 278, accuracy: 0.01)

        let taille = CanvasGeometry.aspectFitSize(
            in: CGSize(width: scene, height: 10_000),
            ratio: CanvasGeometry.portraitRatio)
        XCTAssertEqual(taille.width, 278, accuracy: 0.01)
        XCTAssertEqual(taille.height, 494, accuracy: 1,
                       "9:16 sur 278 pt de large ⇒ ≈ 494 pt de haut.")
    }

    /// **Le 9:16 ne bouge pas** (loi 3) : l'encastrement rétrécit, il ne
    /// déforme pas. Ce témoin rougirait si quelqu'un « rattrapait » la hauteur
    /// perdue en étirant le ratio.
    func test_lEncastrement_neDeformeJamaisLaScene() {
        let scene = ComposerRailGeometry.sceneWidth(usableWidth: 402, railsShown: true)
        let taille = CanvasGeometry.aspectFitSize(
            in: CGSize(width: scene, height: 10_000),
            ratio: CanvasGeometry.portraitRatio)
        XCTAssertEqual(taille.width / taille.height,
                       CanvasGeometry.portraitRatio, accuracy: 0.0001)
    }

    /// **Le cas iPad, où la HAUTEUR contraint.** À 744 pt utiles, l'aire de
    /// scène vaut 620 pt — mais un 9:16 de 620 de large ferait 1102 pt de haut,
    /// que l'écran n'a pas. `aspectFitSize` rend alors une scène plus étroite,
    /// centrée : elle s'éloigne des rails au lieu de s'en rapprocher.
    ///
    /// Ce témoin existe parce que l'invariant ci-dessus, lu vite, se
    /// comprendrait comme « la scène touche les deux rails » — ce qui est faux
    /// ici, et le rester est SAIN.
    func test_surIPad_laHauteurContraint_etLaSceneSEloigneDesRails() {
        let aire = ComposerRailGeometry.sceneWidth(usableWidth: 744, railsShown: true)
        XCTAssertEqual(aire, 620, accuracy: 0.01)

        // Une hauteur d'iPad réaliste une fois barre haute et socle retirées.
        let rendue = CanvasGeometry.aspectFitSize(
            in: CGSize(width: aire, height: 820),
            ratio: CanvasGeometry.portraitRatio)

        XCTAssertLessThan(rendue.width, aire,
                          "La hauteur contraint : la scène rendue est plus étroite que son aire.")
        XCTAssertEqual(rendue.height, 820, accuracy: 1,
                       "…et elle occupe toute la hauteur offerte.")
        XCTAssertEqual(rendue.width / rendue.height,
                       CanvasGeometry.portraitRatio, accuracy: 0.0001,
                       "Le 9:16 tient dans les deux régimes (loi 3).")
    }

    // MARK: - Le cas dégénéré

    /// Une largeur plus petite que les deux couloirs ne doit pas produire une
    /// scène NÉGATIVE — qui, passée à `aspectFitSize`, rendrait une taille
    /// absurde plutôt qu'une erreur.
    func test_uneLargeurPlusPetiteQueLesCouloirs_neRendJamaisUneSceneNegative() {
        for utile in [0.0, 40.0, 100.0] as [CGFloat] {
            XCTAssertGreaterThanOrEqual(
                ComposerRailGeometry.sceneWidth(usableWidth: utile, railsShown: true), 0,
                "largeur utile \(utile)")
        }
    }

    // MARK: - Ce que l'encastrement NE touche pas

    /// Les `anchor` d'un `MeeshyObject` sont NORMALISÉS (0…1) : rétrécir la
    /// scène ne déplace donc rien DANS le document. C'est ce qui rend le
    /// changement sûr — et c'est une propriété à vérifier, pas à supposer.
    func test_unePosePlaceeAuCentre_resteAuCentreQuelleQueSoitLaLargeur() {
        let large = CanvasGeometry(renderSize: CGSize(width: 374, height: 665))
        let etroite = CanvasGeometry(renderSize: CGSize(width: 278, height: 494))

        let centreLarge = large.designPoint(forNormalized: CGPoint(x: 0.5, y: 0.5))
        let centreEtroit = etroite.designPoint(forNormalized: CGPoint(x: 0.5, y: 0.5))

        XCTAssertEqual(centreLarge.x, centreEtroit.x, accuracy: 0.01,
                       "L'espace DESIGN garde 1080 de large : l'ancre normalisée ne bouge pas.")
        XCTAssertEqual(centreLarge.y / large.designHeight,
                       centreEtroit.y / etroite.designHeight, accuracy: 0.0001,
                       "…et la fraction verticale est identique dans les deux.")
    }

    // MARK: - La garde de SOURCE : la règle est-elle CONSOMMÉE ?

    private func surfaceSource() throws -> String {
        return AppSourceGuard.stripComments(try AppSourceGuard.composerSurfaceSource())
    }

    private func compact(_ text: String) -> String {
        text.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible.** Sans lui, les deux gardes ci-dessous seraient vertes par
    /// OMISSION le jour où le chemin du fichier change.
    func test_laSourceDeLaSurface_estLisibleEtNonVide() throws {
        let source = try surfaceSource()
        XCTAssertGreaterThan(source.count, 5_000,
                             "Source introuvable ou vide : les gardes qui suivent ne prouveraient rien.")
        XCTAssertTrue(source.contains("EmbeddedSceneCanvas"),
                      "Ce n'est pas le bon fichier.")
    }

    /// Une règle que personne n'applique ne règle rien : la surface doit
    /// DEMANDER son encastrement à `ComposerRailGeometry`.
    func test_laSurface_demandeSonEncastrementALaRegle() throws {
        XCTAssertTrue(
            compact(try surfaceSource()).contains("ComposerRailGeometry.sceneInset(railsShown:"),
            "La scène doit lire son encastrement de la règle, jamais d'un littéral.")
    }

    /// **La garde NÉGATIVE, et c'est elle qui a de la valeur.** Elle rougit le
    /// jour où quelqu'un recode 14 pt en dur sur la scène — le geste exact que
    /// ce lot existe pour rendre impossible, et que rien d'autre ne
    /// signalerait : le rendu serait « juste un peu plus large ».
    func test_lEncastrementDeLaScene_nEstPlusUnLitteral() throws {
        XCTAssertFalse(
            compact(try surfaceSource()).contains(".padding(.horizontal,14)"),
            "L'encastrement de la scène est revenu à un littéral : la raison qui le produit a disparu avec.")
    }
}
