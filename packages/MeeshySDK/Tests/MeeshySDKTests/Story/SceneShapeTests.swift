import XCTest
import CoreGraphics
@testable import MeeshySDK

/// **Une scène a UNE forme, et le plein écran a DEUX états** (décision porteur
/// du 2026-09-17 sur #6896, lot #6904).
///
/// Ces témoins sont PURS : aucune vue n'est montée, aucun simulateur n'est
/// interrogé. C'est ce qui permet d'éprouver la loi que onze hôtes vont
/// consulter sans dépendre de ce que l'un d'eux en fait.
///
/// Les cinq documents d'image seule reprennent les repères publiés par le
/// composer sur staging (#6895) : F1 pano 4:1, F2 portrait 9:16, F3 paysage
/// 16:9, F4 très haut 1:4, plus le carré.
final class SceneShapeTests: XCTestCase {

    // MARK: - Fabriques

    private func objet(_ kind: ObjectKind,
                       plane: Plane = .content,
                       x: Double = 0.5, y: Double = 0.5,
                       scale: Double = 1,
                       payload: [String: CanvasJSONValue] = [:]) -> ObjectV3 {
        ObjectV3(id: UUID().uuidString,
                 kind: kind,
                 anchor: .free(x: x, y: y),
                 plane: plane,
                 z: 0,
                 transform: TransformV3(scale: scale, rotation: 0, opacity: 1),
                 timing: nil,
                 locale: nil,
                 payload: payload)
    }

    /// Un fond à la forme du composer : un objet média qui DÉCLARE son rapport.
    private func fond(_ aspect: Double) -> ObjectV3 {
        objet(.media, plane: .content, payload: [
            "isBackground": .bool(true),
            "mediaURL": .string("https://exemple/f.jpg"),
            "aspectRatio": .number(aspect),
        ])
    }

    /// Un fond à la forme passerelle : `bg` + `mediaId`, AUCUN rapport déclaré.
    private var fondSansRapport: ObjectV3 {
        objet(.media, plane: .bg, payload: ["mediaId": .string("6aaa972f3fd1f8a72d0e38ed")])
    }

    private func scene(_ objets: [ObjectV3], id: String = "s1") -> SceneV3 {
        SceneV3(id: id, objects: objets)
    }

    private let pano: CGFloat = 4.0            // F1 · 4:1
    private let portrait: CGFloat = 9.0 / 16.0 // F2 · 9:16
    private let paysage: CGFloat = 16.0 / 9.0  // F3 · 16:9
    private let tresHaut: CGFloat = 0.25       // F4 · 1:4
    private let carre: CGFloat = 1.0

    // MARK: - 1 · La scène est TOUJOURS 9:16

    /// **UNE constante, et c'est celle-ci.** Tout littéral `9/16` et toute
    /// copie (`CanvasGeometry.portraitRatio`, `SceneFraming.sceneAspect`,
    /// `StoryCanvasAspect.portrait.ratio`) en est une projection.
    func test_laSceneEstToujours9sur16() {
        XCTAssertEqual(SceneShape.aspect, 9.0 / 16.0, accuracy: 1e-12)
        XCTAssertEqual(SceneShape.aspect, 0.5625, accuracy: 1e-12)
    }

    /// La forme d'une scène ne se lit NI dans `carrierAspect`, NI dans le
    /// média : une scène qui porte l'un et l'autre reste 9:16.
    func test_carrierAspectNeChangeRienALaForme() {
        let porteuse = SceneV3(id: "s1",
                               objects: [fond(Double(paysage))],
                               carrierAspect: 1.7778)
        XCTAssertEqual(SceneShape.aspect(of: porteuse), SceneShape.aspect, accuracy: 1e-9)
        XCTAssertEqual(SceneShape.aspect(of: scene([fond(Double(pano))])), SceneShape.aspect, accuracy: 1e-9)
    }

    // MARK: - 2 · La zone du média, posée en FIT

    /// Un média PLUS LARGE que la scène occupe une bande centrale — pleine
    /// largeur, fraction de hauteur. Jamais rogné.
    func test_unMediaPlusLargeQueLaScene_occupeUneBandeCentrale() {
        let bande = SceneShape.mediaBand(backgroundAspect: pano)
        XCTAssertEqual(bande.width, 1, accuracy: 1e-9)
        XCTAssertEqual(bande.height, SceneShape.aspect / pano, accuracy: 1e-9)   // 0,140625
        XCTAssertEqual(bande.midY, 0.5, accuracy: 1e-9)
        XCTAssertEqual(bande.minX, 0, accuracy: 1e-9)
    }

    /// Un média PLUS ÉTROIT que la scène occupe une colonne centrale — pleine
    /// hauteur, fraction de largeur. La loi décrit les DEUX débordements :
    /// « quelque chose sort-il de la zone » se pose aussi en largeur.
    func test_unMediaPlusEtroitQueLaScene_occupeUneColonneCentrale() {
        let colonne = SceneShape.mediaBand(backgroundAspect: tresHaut)
        XCTAssertEqual(colonne.height, 1, accuracy: 1e-9)
        XCTAssertEqual(colonne.width, tresHaut / SceneShape.aspect, accuracy: 1e-9) // 0,4444
        XCTAssertEqual(colonne.midX, 0.5, accuracy: 1e-9)
        XCTAssertEqual(colonne.minY, 0, accuracy: 1e-9)
    }

    /// Un média AU gabarit couvre la scène entière : il n'y a pas de bande.
    func test_unMediaAuGabarit_couvreLaSceneEntiere() {
        XCTAssertEqual(SceneShape.mediaBand(backgroundAspect: portrait),
                       CGRect(x: 0, y: 0, width: 1, height: 1))
    }

    /// 16:9 et carré, les deux autres repères.
    func test_lesBandesDuPaysageEtDuCarre() {
        XCTAssertEqual(SceneShape.mediaBand(backgroundAspect: paysage).height,
                       0.31640625, accuracy: 1e-6)
        XCTAssertEqual(SceneShape.mediaBand(backgroundAspect: carre).height,
                       0.5625, accuracy: 1e-9)
    }

    /// **Un fond SANS rapport déclaré : la loi ne devine rien.** Elle rend
    /// `nil` et demande le rapport à l'appelant (`post.media` width/height) —
    /// c'est la forme passerelle des repères RECETTE C, et la deviner
    /// fabriquerait un cadrage que rien ne mesure.
    func test_unFondSansRapportDeclare_neSeDevinePas() throws {
        XCTAssertNil(SceneShape.mediaBand(scene: scene([fondSansRapport])))
        let fournie = try XCTUnwrap(SceneShape.mediaBand(scene: scene([fondSansRapport]),
                                                         backgroundAspect: paysage))
        XCTAssertEqual(fournie.height, 0.31640625, accuracy: 1e-6)
    }

    /// Une scène sans fond média n'a aucune zone de média.
    func test_uneSceneSansFondMedia_naAucuneZone() {
        XCTAssertNil(SceneShape.mediaBand(scene: scene([objet(.text)])))
    }

    // MARK: - 3 · Déborde-t-il ? — BINAIRE

    /// **Image seule ⇒ on peut resserrer sur la zone du média.** Les cinq
    /// repères d'image seule rendent tous leur bande.
    func test_imageSeule_resserreSurLaZoneDuMedia() {
        for rapport in [pano, portrait, paysage, tresHaut, carre] {
            let cadre = SceneShape.frame(scene: scene([fond(Double(rapport))]))
            XCTAssertEqual(cadre, .mediaBand(SceneShape.mediaBand(backgroundAspect: rapport)),
                           "rapport \(rapport)")
        }
    }

    /// **Un texte qui reste DANS la zone du média ne change rien** : on
    /// resserre toujours sur elle. Un texte centré sur un fond CARRÉ tient
    /// dans sa bande (0,21875 → 0,78125).
    func test_unTexteDansLaZone_laisseResserrer() {
        let s = scene([fond(Double(carre)), objet(.text, x: 0.5, y: 0.5)])
        XCTAssertEqual(SceneShape.frame(scene: s),
                       .mediaBand(SceneShape.mediaBand(backgroundAspect: carre)))
    }

    /// **Un texte qui SORT de la zone du média ⇒ le 9:16 entier, avec son
    /// fond.** C'est le repère F1 : un pano 4:1 dont la bande fait 0,14 de
    /// haut, et un texte centré qui la déborde largement.
    func test_unTexteHorsDeLaZone_montreLeNeufSeizeEntier() {
        let s = scene([fond(Double(pano)), objet(.text, x: 0.5, y: 0.5)])
        XCTAssertEqual(SceneShape.frame(scene: s), .wholeScene)
    }

    /// Le débordement se mesure aussi en LARGEUR : un sticker posé au bord
    /// gauche sort de la colonne d'un média 1:4.
    func test_unStickerHorsDeLaColonne_montreLeNeufSeizeEntier() {
        let s = scene([fond(Double(tresHaut)), objet(.sticker, x: 0.08, y: 0.5)])
        XCTAssertEqual(SceneShape.frame(scene: s), .wholeScene)
    }

    /// **Un objet qui ne peint AUCUN pixel ne fait rien déborder** : un son de
    /// fond et une mention voyagent avec la scène sans s'y peindre.
    func test_unSonEtUneMention_neFontRienDeborder() {
        let s = scene([fond(Double(pano)),
                       objet(.audio, x: 0.5, y: 0.05),
                       objet(.mention, x: 0.5, y: 0.95)])
        XCTAssertEqual(SceneShape.frame(scene: s),
                       .mediaBand(SceneShape.mediaBand(backgroundAspect: pano)))
    }

    /// **Elle échoue FERMÉE.** Sans rapport connu, on ne resserre pas : on
    /// montre le 9:16 entier. Montrer trop coûte du vide ; montrer trop peu
    /// coupe ce que l'auteur a posé.
    func test_sansRapportConnu_montreLeNeufSeizeEntier() {
        XCTAssertEqual(SceneShape.frame(scene: scene([fondSansRapport])), .wholeScene)
        XCTAssertEqual(SceneShape.frame(scene: scene([objet(.text)])), .wholeScene)
    }

    /// Le type est une SOMME, jamais un rapport flottant intermédiaire : le
    /// cadre qu'on montre est l'un des deux, et sa projection en rectangle est
    /// explicite.
    func test_leCadreEstUneSomme_etSaProjectionEstExplicite() {
        XCTAssertEqual(SceneShape.Frame.wholeScene.rect,
                       CGRect(x: 0, y: 0, width: 1, height: 1))
        let bande = SceneShape.mediaBand(backgroundAspect: paysage)
        XCTAssertEqual(SceneShape.Frame.mediaBand(bande).rect, bande)
    }

    // MARK: - Un document à TROIS scènes

    /// Chaque scène répond pour elle-même — le repère F5 (pano, portrait,
    /// paysage) rend trois cadres différents, et la scène portrait n'impose
    /// rien aux deux autres.
    func test_unDocumentATroisScenes_repondSceneParScene() {
        let document = CanvasV3(scenes: [
            scene([fond(Double(pano)), objet(.text, x: 0.5, y: 0.5)], id: "s1"),
            scene([fond(Double(portrait))], id: "s2"),
            scene([fond(Double(paysage))], id: "s3"),
        ])
        XCTAssertEqual(document.scenes.map { SceneShape.frame(scene: $0) }, [
            .wholeScene,
            .mediaBand(SceneShape.mediaBand(backgroundAspect: portrait)),
            .mediaBand(SceneShape.mediaBand(backgroundAspect: paysage)),
        ])
    }

    // MARK: - 4 · Les DEUX plein écrans

    private let portraitViewport = CGSize(width: 402, height: 874)
    private let paysageViewport = CGSize(width: 874, height: 402)

    /// **Cadré** : la scène est AJUSTÉE dans le viewport, arrondie, centrée —
    /// et c'est le PLATEAU qui peint le hors-champ, jamais le canvas en plus.
    func test_cadre_ajusteLaSceneEtLaisseLePlateauPeindreLeHorsChamp() {
        let vue = SceneShape.layout(.carded(.thumbHashDominantColor), in: portraitViewport)
        XCTAssertEqual(vue.sceneFrame.width, 402, accuracy: 0.01)
        XCTAssertEqual(vue.sceneFrame.height, 402 / SceneShape.aspect, accuracy: 0.01) // 714,67
        XCTAssertEqual(vue.sceneFrame.minX, 0, accuracy: 0.01)
        XCTAssertEqual(vue.sceneFrame.midY, 437, accuracy: 0.01)
        XCTAssertEqual(vue.offscreenPainter, .stage)
        XCTAssertEqual(vue.backdrop, .thumbHashDominantColor)
        XCTAssertEqual(vue.cornerRadius, SceneShape.cardedCornerRadius)
    }

    /// Le même cadré sur un viewport PAYSAGE : la scène est bornée par la
    /// hauteur, et reste centrée.
    func test_cadre_surUnViewportPaysage_estBorneParLaHauteur() {
        let vue = SceneShape.layout(.carded(.black), in: paysageViewport)
        XCTAssertEqual(vue.sceneFrame.height, 402, accuracy: 0.01)
        XCTAssertEqual(vue.sceneFrame.width, 402 * SceneShape.aspect, accuracy: 0.01) // 226,125
        XCTAssertEqual(vue.sceneFrame.midX, 437, accuracy: 0.01)
        XCTAssertEqual(vue.sceneFrame.minY, 0, accuracy: 0.01)
        XCTAssertEqual(vue.offscreenPainter, .stage)
        XCTAssertEqual(vue.backdrop, .black)
    }

    /// **Immersif** : la scène occupe le viewport ENTIER, son contenu visible
    /// centré. Rien ne reste à peindre autour — donc PERSONNE ne le peint, et
    /// c'est ce qui retire la troisième couche de #6806.
    func test_immersif_occupeLeViewportEntier_etPersonneNePeintAutour() {
        let vue = SceneShape.layout(.immersive, in: portraitViewport)
        XCTAssertEqual(vue.sceneFrame.height, 874, accuracy: 0.01)
        XCTAssertEqual(vue.sceneFrame.width, 874 * SceneShape.aspect, accuracy: 0.01) // 491,625
        XCTAssertEqual(vue.sceneFrame.midX, 201, accuracy: 0.01, "le contenu reste centré")
        XCTAssertEqual(vue.sceneFrame.minY, 0, accuracy: 0.01)
        XCTAssertEqual(vue.offscreenPainter, .none)
        XCTAssertNil(vue.backdrop)
        XCTAssertEqual(vue.cornerRadius, 0)
    }

    /// L'immersif sur un viewport PAYSAGE déborde en hauteur, centré.
    func test_immersif_surUnViewportPaysage_debordeEnHauteurCentre() {
        let vue = SceneShape.layout(.immersive, in: paysageViewport)
        XCTAssertEqual(vue.sceneFrame.width, 874, accuracy: 0.01)
        XCTAssertEqual(vue.sceneFrame.height, 874 / SceneShape.aspect, accuracy: 0.01) // 1553,78
        XCTAssertEqual(vue.sceneFrame.midY, 201, accuracy: 0.01)
        XCTAssertEqual(vue.sceneFrame.minX, 0, accuracy: 0.01)
        XCTAssertEqual(vue.offscreenPainter, .none)
    }

    /// Le cadré couvre TOUJOURS moins que le viewport, l'immersif toujours
    /// autant ou plus : c'est la différence entre les deux états, et elle se
    /// dit sans regarder un pixel.
    func test_lesDeuxEtatsSeDistinguentParCeQuIlsCouvrent() {
        for viewport in [portraitViewport, paysageViewport] {
            let cadre = SceneShape.layout(.carded(.thumbHash), in: viewport).sceneFrame
            let immersif = SceneShape.layout(.immersive, in: viewport).sceneFrame
            XCTAssertTrue(cadre.width <= viewport.width && cadre.height <= viewport.height)
            XCTAssertTrue(immersif.width >= viewport.width - 0.01
                          && immersif.height >= viewport.height - 0.01)
        }
    }

    /// Un viewport dégénéré ne fabrique pas un cadre non fini : la loi rend un
    /// cadre vide plutôt qu'une division par zéro.
    func test_unViewportDegenere_neFabriquePasDeCadreNonFini() {
        for mode in [SceneShape.Fullscreen.carded(.black), .immersive] {
            let vue = SceneShape.layout(mode, in: .zero)
            XCTAssertTrue(vue.sceneFrame.width.isFinite && vue.sceneFrame.height.isFinite)
            XCTAssertEqual(vue.sceneFrame, .zero)
        }
    }
}
