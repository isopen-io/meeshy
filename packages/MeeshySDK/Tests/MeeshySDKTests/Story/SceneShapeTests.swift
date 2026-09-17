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

    /// Un fond à la forme du composer : un objet média qui DÉCLARE son rapport
    /// ET son cadrage explicite (`fit`) — ce que #6125 pose sur chaque fond
    /// neuf. Les témoins de containment (§ 3) portent sur le débordement, pas
    /// sur la résolution du cadrage : la déclarer ici les en découple, pour
    /// que `test_unFondSansCadrageDeclare_estTraiteCommeUnRemplissage`
    /// ci-dessous reste la SEULE source de vérité sur l'absence de cadrage.
    private func fond(_ aspect: Double) -> ObjectV3 {
        objet(.media, plane: .content, payload: [
            "isBackground": .bool(true),
            "mediaURL": .string("https://exemple/f.jpg"),
            "aspectRatio": .number(aspect),
            "transform": .object(["videoFitMode": .string(StoryBackgroundFraming.fit)]),
        ])
    }

    /// Un fond à la forme passerelle : `bg` + `mediaId`, AUCUN rapport déclaré,
    /// AUCUN cadrage déclaré — le repère RECETTE C.
    private var fondSansRapport: ObjectV3 {
        objet(.media, plane: .bg, payload: ["mediaId": .string("6aaa972f3fd1f8a72d0e38ed")])
    }

    /// Un fond qui DÉCLARE son rapport ET son cadrage EXPLICITE — le porteur
    /// `.bg` séparé du contenu, forme F1-F7 des repères publiés. `cadrage`
    /// est ce que le double-tap fond a posé (`StoryBackgroundFraming.fit` /
    /// `.fill`).
    private func fond(_ aspect: Double, cadrage: String) -> [ObjectV3] {
        [objet(.media, plane: .bg, payload: ["transform": .object(["videoFitMode": .string(cadrage)])]),
         fond(aspect)]
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
    func test_unFondSansRapportDeclare_neSeDevinePas() {
        XCTAssertNil(SceneShape.mediaBand(scene: scene([fondSansRapport])))
    }

    /// **L'absence de cadrage suit le même défaut que le RENDERER : REMPLIR —
    /// pas ajuster** (revue #6904, tour 2).
    ///
    /// `StoryBackgroundFraming.rendersFilled` est le site unique du dépôt qui
    /// le dit : « `nil` n'est pas un état, c'est un ALIAS de "remplir" », et
    /// « le défaut du RENDERER reste "remplir" ». Avant ce correctif,
    /// `mediaBand(scene:)` ne comparait `declaredFitMode` qu'à `"fill"` —
    /// une ABSENCE tombait dans le même chemin que `"fit"` et calculait une
    /// bande que le renderer ne peint jamais (il remplit et rogne, sans
    /// laisser de fond visible). Un hôte qui s'y resserrerait ROGNERAIT le
    /// média — exactement le défaut que le correctif précédent (c042fdbf84)
    /// visait, reproduit un cran plus loin sur le repère RECETTE C
    /// (`bg{mediaId}` seul, sans `videoFitMode`) et tout le publié d'avant
    /// #6125.
    func test_unFondSansCadrageDeclare_estTraiteCommeUnRemplissage() {
        let s = scene([fondSansRapport])
        XCTAssertEqual(SceneShape.mediaBand(scene: s, backgroundAspect: paysage),
                       SceneShape.unitRect)
        XCTAssertFalse(SceneShape.frame(scene: s, backgroundAspect: paysage).tightensAnything)
    }

    /// Une scène sans fond média n'a aucune zone de média.
    func test_uneSceneSansFondMedia_naAucuneZone() {
        XCTAssertNil(SceneShape.mediaBand(scene: scene([objet(.text)])))
    }

    /// **Un fond posé en `fill` REMPLIT la scène — aucune bande à peindre.**
    ///
    /// `mediaBand` ne lisait que `payload.aspectRatio`, jamais le cadrage
    /// (`transform.videoFitMode`) que le double-tap fond choisit
    /// (`StoryBackgroundFraming`). Pour un fond posé en REMPLISSAGE explicite,
    /// elle calculait quand même une bande au rapport de l'image — une bande
    /// que rien ne montre, puisque le renderer couvre déjà toute la scène. Un
    /// hôte qui suivrait cette bande pour resserrer le cadre présenté
    /// ROGNERAIT un média qui, à l'écran, couvre le 9:16 en entier.
    func test_unFondPoseEnFill_neRendAucuneBande() {
        let s = scene(fond(Double(paysage), cadrage: StoryBackgroundFraming.fill))
        XCTAssertEqual(SceneShape.mediaBand(scene: s), SceneShape.unitRect)
    }

    /// Le même fond, explicitement en `fit`, garde sa bande normale — le
    /// cadrage par défaut du composer (`posedFitMode`) n'est pas affecté.
    func test_unFondPoseEnFit_gardeSaBande() throws {
        let s = scene(fond(Double(paysage), cadrage: StoryBackgroundFraming.fit))
        let bande = try XCTUnwrap(SceneShape.mediaBand(scene: s))
        XCTAssertEqual(bande.height, 0.31640625, accuracy: 1e-6)
    }

    /// **`frame` hérite du même correctif** : resserrer sur la bande d'un fond
    /// REMPLI ferait exactement le rognage que la loi doit refuser. Un fond en
    /// `fill` rend donc `.mediaBand(unitRect)` — un cadre qui ne resserre rien,
    /// pas `.wholeScene` : les deux sont visuellement identiques (§ `Frame.
    /// tightensAnything`), mais `frame` reste dérivé de `mediaBand(scene:)`, un
    /// site unique.
    func test_unFondPoseEnFill_neConseillePasDeResserrer() {
        let s = scene(fond(Double(paysage), cadrage: StoryBackgroundFraming.fill))
        XCTAssertFalse(SceneShape.frame(scene: s).tightensAnything)
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

    // MARK: - 4 · LA carte de la scène

    private let portraitViewport = CGSize(width: 402, height: 874)
    private let paysageViewport = CGSize(width: 874, height: 402)

    /// **La carte : la scène AJUSTÉE, centrée, sur le fond de la story**
    /// (directive porteur du 2026-09-17, 3e message — « On préserve le même
    /// fond que pour la story ! »).
    func test_laCarte_ajusteLaSceneEtPorteLeFondDeLaStory() {
        let vue = SceneShape.layout(in: portraitViewport, immersive: false)
        XCTAssertEqual(vue.sceneFrame.width, 402, accuracy: 0.01)
        XCTAssertEqual(vue.sceneFrame.height, 402 / SceneShape.aspect, accuracy: 0.01) // 714,67
        XCTAssertEqual(vue.sceneFrame.minX, 0, accuracy: 0.01)
        XCTAssertEqual(vue.sceneFrame.midY, 437, accuracy: 0.01)
        XCTAssertEqual(vue.backdrop, SceneShape.cardedBackdrop)
        XCTAssertEqual(vue.cornerRadius, SceneShape.cardedCornerRadius)
    }

    /// La même carte sur un viewport PAYSAGE : la scène est bornée par la
    /// hauteur, et reste centrée.
    func test_laCarte_surUnViewportPaysage_estBorneeParLaHauteur() {
        let vue = SceneShape.layout(in: paysageViewport, immersive: false)
        XCTAssertEqual(vue.sceneFrame.height, 402, accuracy: 0.01)
        XCTAssertEqual(vue.sceneFrame.width, 402 * SceneShape.aspect, accuracy: 0.01) // 226,125
        XCTAssertEqual(vue.sceneFrame.midX, 437, accuracy: 0.01)
        XCTAssertEqual(vue.sceneFrame.minY, 0, accuracy: 0.01)
        XCTAssertEqual(vue.backdrop, SceneShape.cardedBackdrop)
    }

    /// **La carte ne ROGNE jamais** — c'est ce que le second état faisait, et
    /// c'est ce que la directive retire. Elle tient TOUJOURS dans le viewport
    /// qu'on lui donne, au rapport de la scène, et jamais autrement.
    ///
    /// Un témoin qui ne regarderait qu'un viewport ne pourrait pas le dire :
    /// sur un viewport exactement 9:16, la carte rognée et la carte ajustée
    /// rendent le MÊME cadre — c'est la forme de la leçon 261 (« un témoin de
    /// rang s'écrit sur un rang AUTRE que le premier »).
    func test_laCarte_tientToujoursDansSonViewport_etGardeLeRapportDeLaScene() {
        let viewports = [portraitViewport, paysageViewport,
                         CGSize(width: 402, height: 402),
                         CGSize(width: 402, height: 402 / SceneShape.aspect),
                         CGSize(width: 1194, height: 834)]
        for viewport in viewports {
            let cadre = SceneShape.layout(in: viewport, immersive: false).sceneFrame
            XCTAssertLessThanOrEqual(cadre.width, viewport.width + 0.01, "\(viewport)")
            XCTAssertLessThanOrEqual(cadre.height, viewport.height + 0.01, "\(viewport)")
            XCTAssertEqual(cadre.width / cadre.height, SceneShape.aspect, accuracy: 0.0001,
                           "\(viewport)")
            XCTAssertEqual(cadre.midX, viewport.width / 2, accuracy: 0.01, "\(viewport)")
            XCTAssertEqual(cadre.midY, viewport.height / 2, accuracy: 0.01, "\(viewport)")
        }
    }

    /// **Un IMMERSIF n'est pas une autre forme : c'est un autre VIEWPORT.**
    /// L'écran entier rend une carte PLUS GRANDE que la zone libre du plateau,
    /// au même rapport et sur le même fond — la seule chose qui change AVEC
    /// l'état est le RAYON (directive B du 2026-09-18, témoins ci-dessous).
    func test_unImmersif_estLaMemeCarte_dansUnViewportPlusGrand() {
        let plateau = CGSize(width: portraitViewport.width - 32,
                             height: portraitViewport.height - 200)
        let cadre = SceneShape.layout(in: plateau, immersive: false)
        let immersif = SceneShape.layout(in: portraitViewport, immersive: true)

        XCTAssertGreaterThan(immersif.sceneFrame.width, cadre.sceneFrame.width)
        XCTAssertEqual(immersif.backdrop, cadre.backdrop)
    }

    // MARK: - 5 · Les angles exacts en plein écran (directive B du 2026-09-18)

    /// **« Lorsqu'on met en plein écran, il faut enlever l'arrondi sur le
    /// composant et garder les bords angle exacte ! »** — directive porteur du
    /// 2026-09-18, verbatim.
    ///
    /// En IMMERSIF la carte n'a AUCUN rayon ; en CADRÉ elle garde les 22 pt de
    /// la story. C'est la LOI qui le dit, jamais l'hôte : la galerie rendait 22
    /// dans ses deux états parce qu'elle ne passait aucun état, et seul le
    /// lecteur de stories avait des coins droits au plein bord — par son
    /// animation, pas par la forme.
    func test_unImmersif_naAucunRayon_etUnCadreGardeCeluiDeLaStory() {
        XCTAssertEqual(SceneShape.layout(in: portraitViewport, immersive: true).cornerRadius,
                       SceneShape.immersiveCornerRadius)
        XCTAssertEqual(SceneShape.immersiveCornerRadius, 0,
                       "« garder les bords angle exacte » — un angle droit n'a pas de rayon")
        XCTAssertEqual(SceneShape.layout(in: portraitViewport, immersive: false).cornerRadius,
                       SceneShape.cardedCornerRadius)
        XCTAssertNotEqual(SceneShape.immersiveCornerRadius, SceneShape.cardedCornerRadius,
                          "fusible : deux constantes égales rendraient les deux témoins " +
                          "ci-dessus indiscernables")
    }

    /// **Seul le RAYON change avec l'état — jamais le cadre ni le fond.** Le
    /// témoin est celui qui empêche la directive B d'être lue comme « l'immersif
    /// remplit » : c'est exactement ce que le 3e message du 2026-09-17 a retiré,
    /// et un état qui changerait aussi le cadre le ressusciterait en silence.
    func test_lEtat_neChangeQueLeRayon_jamaisLeCadreNiLeFond() {
        for viewport in [portraitViewport, paysageViewport,
                         CGSize(width: 402, height: 402),
                         CGSize(width: 1194, height: 834)] {
            let cadre = SceneShape.layout(in: viewport, immersive: false)
            let immersif = SceneShape.layout(in: viewport, immersive: true)

            XCTAssertEqual(cadre.sceneFrame, immersif.sceneFrame, "\(viewport)")
            XCTAssertEqual(cadre.backdrop, immersif.backdrop, "\(viewport)")
            XCTAssertNotEqual(cadre.cornerRadius, immersif.cornerRadius, "\(viewport)")
        }
    }

    /// Un viewport dégénéré ne fabrique pas un cadre non fini : la loi rend un
    /// cadre vide plutôt qu'une division par zéro — et elle garde son fond,
    /// pour qu'un hôte dégénéré ne devienne pas la surface sans peintre.
    func test_unViewportDegenere_neFabriquePasDeCadreNonFini() {
        let vue = SceneShape.layout(in: .zero, immersive: false)
        XCTAssertTrue(vue.sceneFrame.width.isFinite && vue.sceneFrame.height.isFinite)
        XCTAssertEqual(vue.sceneFrame, .zero)
        XCTAssertEqual(vue.backdrop, SceneShape.cardedBackdrop)
    }
}
