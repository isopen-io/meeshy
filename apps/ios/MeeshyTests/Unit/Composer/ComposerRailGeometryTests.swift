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
/// Un FAB sur la scène occupe exactement la place où un `MeeshySceneObject` peut
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
    /// PLEIN ÉCRAN (maquette 2026-09-27, #8370) : les rails FLOTTENT sur la
    /// scène — elle ne cède plus aucune largeur aux couloirs.
    func test_pleinEcran_laSceneOccupeToute_laLargeurUtile() {
        for utile in [320.0, 375.0, 402.0, 430.0, 744.0, 1024.0] as [CGFloat] {
            XCTAssertEqual(ComposerRailGeometry.sceneWidth(usableWidth: utile, railsShown: true), utile,
                           accuracy: 0.01, "largeur utile \(utile) : un couloir retire encore de la place à la scène")
        }
        XCTAssertEqual(ComposerRailGeometry.floatingInset, 0)
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

    /// Plein écran (#8370) : sur un iPhone 16 Pro, l'aire de la scène est la
    /// largeur entière — 402 pt, donc ≈ 715 pt de haut en 9:16 (contre 278 ×
    /// 494 à l'époque des couloirs). **Un chiffre publié est une affirmation** :
    /// celui-ci se mesure ici, il ne se recopie pas.
    func test_surIPhone16Pro_laSceneGagneLaLargeurDesCouloirs() {
        let scene = ComposerRailGeometry.sceneWidth(usableWidth: 402, railsShown: true)
        XCTAssertEqual(scene, 402, accuracy: 0.01)

        let taille = CanvasGeometry.aspectFitSize(
            in: CGSize(width: scene, height: 10_000),
            ratio: CanvasGeometry.portraitRatio)
        XCTAssertEqual(taille.width, 402, accuracy: 0.01)
        XCTAssertEqual(taille.height, 715, accuracy: 1,
                       "9:16 sur 402 pt de large ⇒ ≈ 715 pt de haut.")
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
        XCTAssertEqual(aire, 744, accuracy: 0.01)

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

    /// Les `anchor` d'un `MeeshySceneObject` sont NORMALISÉS (0…1) : rétrécir la
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

    // MARK: - Le volet de description DÉGAGE les rails flottants (#8388)

    /// **Il tirait sa marge des COULOIRS** (`sceneInset(railsShown: true) + 10`).
    /// Depuis la scène plein écran (#8370), `sceneInset` vaut zéro : la marge est
    /// tombée à 10 pt et le volet — « Touchez pour écrire » — s'est étalé
    /// par-dessus les dernières entrées des deux rails, qui flottent désormais à
    /// cette hauteur. La marge qui dégage un rail est ce qu'un rail RÉSERVE :
    /// `lane`.
    func test_leVoletDeLaScene_degageLesRails() throws {
        let surface = compact(AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/ComposerSceneSurface.swift")))
        XCTAssertTrue(surface.contains("EmbeddedSceneCanvas"), "Ce n'est pas la surface de scène.")
        XCTAssertTrue(surface.contains("descriptionPanel.padding(.leading,ComposerRailGeometry.lane).padding(.trailing,ComposerRailGeometry.tileLane)"),
                      "Le volet de la scène doit se retirer du rail de portes à gauche et du rail de tuiles à droite.")
        XCTAssertFalse(surface.contains("sceneInset(railsShown:true)+10"),
                       "La marge du volet ne peut plus se lire des couloirs, qui valent zéro.")
    }

    /// Le MÊME volet est monté sous le canvas de l'ATELIER (#4742), où les rails
    /// flottent aussi : même marge, lue de la même règle.
    func test_leVoletDeLAtelier_degageLesRails() throws {
        let hote = compact(AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource()))
        XCTAssertTrue(hote.contains("volet.padding(.horizontal,ComposerRailGeometry.lane)"),
                      "Le volet de l'atelier doit se retirer de la largeur d'un rail de chaque côté.")
    }

    // MARK: - La scène prend le viewport (#8370)

    /// **La carte se cadre sur l'écran ENTIER**, et le chrome flotte dessus.
    /// Elle vivait dans une `VStack` entre la barre haute et les rangées du bas,
    /// qui lui prenaient chacune sa hauteur : elle ne pouvait jamais occuper le
    /// viewport (retour porteur 2026-09-27). Deux calques frères désormais.
    func test_laScene_estUnCalquePleinEcran_sousLeChrome() throws {
        let surface = compact(AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/ComposerSceneSurface.swift")))
        XCTAssertTrue(surface.contains("varbody:someView{ZStack{sceneLetterboxsceneLayerchromeLayer}"),
                      "Le letterbox, la scène et le chrome sont trois calques empilés, dans cet ordre.")
        XCTAssertTrue(surface.contains("SceneBackdropView(backdrop:.thumbHash,thumbHash:floorHash)"),
                      "Ce que la carte laisse est le SOL de la scène : le thumbhash de son résultat, comme le lecteur.")
        XCTAssertTrue(surface.contains("StorySlideRenderer.computeThumbHash(slide:slide,"),
                      "Le sol se peint du composite de la slide — ce que la publication emporte.")
        guard let debut = surface.range(of: "privatevarsceneLayer:someView{"),
              let fin = surface.range(of: "privatevarchromeLayer:someView{") else {
            return XCTFail("Les deux calques ont changé de nom — la garde doit être re-pointée.")
        }
        let scene = surface[debut.upperBound..<fin.lowerBound]
        XCTAssertTrue(scene.contains(".padding(.top,ComposerTopBar.height+4)"),
                      "La scène se pose sous la barre haute, jamais sous la croix (directive 2026-09-27).")
        XCTAssertTrue(scene.contains(".ignoresSafeArea(.keyboard)"),
                      "Le clavier ne pousse pas la scène.")
        XCTAssertTrue(surface.contains(".statusBarHidden(true)"),
                      "La barre de statut s'efface : la croix monte dans la rangée de la Dynamic Island.")
        XCTAssertFalse(scene.contains("ComposerTopBar("),
                       "Aucun chrome ne se loge dans le calque de la scène.")
        XCTAssertFalse(surface.contains("pushesToThumb:true"),
                       "Aucun rail de la scène ne s'étire sur sa hauteur.")
        XCTAssertTrue(surface.contains("onRedo:onRedo,pushesToThumb:false,labeledTiles:true)"),
                      "Le rail droit flotte sans ressort, en tuiles libellées comme la création de post.")
    }

    // MARK: - Ce qu'une rangée requiert, et ce qui déborde (#4582)

    /// **Le débordement de la rangée d'outils est ARITHMÉTIQUE.**
    ///
    /// Sept contrôleurs de texte plus le `(x)` faisaient huit entrées — huit
    /// contrôleurs depuis l'EFFET (#4870), donc neuf. À 44 pt de cible tactile
    /// et 10 pt d'écart : `8 × 44 + 7 × 10 = 422 pt` déjà, `9 × 44 + 8 × 10 =
    /// 476 pt` désormais, quand un iPhone de 393 pt en offre 373 une fois les
    /// marges retirées.
    ///
    /// Il ne dépend ni du contenu, ni de la locale, ni de la taille de texte —
    /// il tient à un compte d'entrées. C'est ce qui le rend calculable, donc
    /// éprouvable sans monter d'écran.
    func test_huitEntrees_neTiennentPasSurUnTelephone() {
        let requise = ComposerRailGeometry.rowWidth(entries: 8)
        XCTAssertEqual(requise, 422, accuracy: 0.01)

        let offerte = ComposerRailGeometry.availableRowWidth(screenWidth: 393)
        XCTAssertEqual(offerte, 373, accuracy: 0.01)
        XCTAssertGreaterThan(ComposerRailGeometry.rowOverflow(entries: 8, available: offerte), 0,
                             "la rangée déborde — et SwiftUI ne la clippe pas, il la dessine par-dessus les bords")
    }

    /// **Et il commence bien AVANT l'appareil de développement.** Vu sur
    /// 393 pt, il commence à 375 — le plus étroit iPhone supporté. Une rangée
    /// se mesure LÀ.
    func test_leDebordement_commenceAvantLAppareilDeDeveloppement() {
        let etroit = ComposerRailGeometry.availableRowWidth(
            screenWidth: ComposerRailGeometry.narrowestSupportedScreenWidth)
        XCTAssertGreaterThan(ComposerRailGeometry.rowOverflow(entries: 8, available: etroit), 0)
        XCTAssertGreaterThan(ComposerRailGeometry.rowOverflow(entries: 7, available: etroit), 0,
                             "sept entrées ne tiennent pas non plus — #4379 le disait de l'axe vertical")
    }

    /// Le fusible : une règle qui rendrait toujours un débordement ferait
    /// défiler des rangées qui tiennent, et coûterait le repère du doigt pour
    /// rien.
    func test_uneRangeeCourte_tientSansDefiler() {
        let offerte = ComposerRailGeometry.availableRowWidth(screenWidth: 393)
        XCTAssertEqual(ComposerRailGeometry.rowOverflow(entries: 4, available: offerte), 0)
        XCTAssertEqual(ComposerRailGeometry.rowWidth(entries: 0), 0)
        XCTAssertEqual(ComposerRailGeometry.rowWidth(entries: 1), ComposerRailGeometry.railWidth)
    }

    /// **La rangée horizontale DÉFILE, et le `(x)` reste hors du défilement.**
    ///
    /// Le faire défiler avec le reste l'enverrait hors champ précisément quand
    /// il y a le plus de contrôleurs — c'est-à-dire quand on en a le plus
    /// besoin. Le rail promet que « la position que le doigt apprend pour sortir
    /// ne dépend pas du nombre de contrôleurs » ; un `(x)` qui défile en fait
    /// une promesse creuse.
    func test_laRangeeHorizontale_defile_etLaSortieResteEpinglee() throws {
        var racine = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { racine = racine.deletingLastPathComponent() }
        let url = racine.appendingPathComponent(
            "Meeshy/Features/Main/Composer/ComposerLeadingRail.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(brut.contains("struct ComposerLeadingRail"),
                      "ce n'est pas le rail — la garde lirait à côté")
        let code = AppSourceGuard.stripComments(brut)
            .components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertTrue(code.contains("ScrollView(.horizontal,showsIndicators:false)"))
        // Le `(x)` est posé APRÈS la fermeture du ScrollView, donc hors de lui.
        let apresDefilement = code.components(separatedBy: "ScrollView(.horizontal").last ?? ""
        XCTAssertTrue(apresDefilement.contains("exitButton"),
                      "la sortie doit rester hors du défilement")
    }

    /// **L'écart vient de la RÈGLE, jamais d'un littéral recopié.** Deux
    /// valeurs, l'une dans la vue et l'autre dans le calcul, rendraient la
    /// mesure fausse sans que rien ne rougisse — la rangée déborderait
    /// exactement de leur différence.
    func test_lEcart_aUnSeulSite() throws {
        var racine = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { racine = racine.deletingLastPathComponent() }
        let url = racine.appendingPathComponent(
            "Meeshy/Features/Main/Composer/ComposerLeadingRail.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertFalse(code.contains("HStack(spacing:10)"),
                       "l'écart doit venir de ComposerRailGeometry.entrySpacing")
        XCTAssertFalse(code.contains("VStack(spacing:10)"))
    }
}
