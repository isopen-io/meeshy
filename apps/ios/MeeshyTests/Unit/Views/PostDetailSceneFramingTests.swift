import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy
@testable import MeeshyUI

/// **La scène du détail se voit entière, avec sa rangée d'actions, au-dessus du
/// composer** (#6696), **au rapport de ce qu'elle montre** (#6697).
///
/// ## Ce que la recette a mesuré (iPhone 16 Pro, 874 pt)
///
/// - la zone de défilement va de la zone sûre haute (y 62) au composer (y 746) :
///   684 pt ;
/// - la scène commence 156 pt sous son haut (y 218) et y occupait 370 × 657 —
///   un `.aspectRatio(9.0 / 16.0)` littéral, sans aucune borne de hauteur ;
/// - son bas passait sous le composer, et J'aime / Commentaires / Republier
///   sortaient de l'écran.
final class PostDetailSceneFramingTests: XCTestCase {

    // MARK: - Fabriques

    private let portrait = CanvasGeometry.portraitRatio
    private let paysage: CGFloat = 16.0 / 9.0
    private let entete: CGFloat = 64

    private func page(width: CGFloat = 402, height: CGFloat = 684,
                      sceneTop: CGFloat? = 156) -> PostDetailSceneFraming.Measures {
        PostDetailSceneFraming.Measures(viewport: CGSize(width: width, height: height),
                                        sceneTop: sceneTop)
    }

    private func taille(_ ratio: CGFloat,
                        _ mesures: PostDetailSceneFraming.Measures) throws -> CGSize {
        try XCTUnwrap(PostDetailSceneFraming.sceneSize(ratio: ratio, measures: mesures,
                                                       headerHeight: entete))
    }

    private var plafondVisible: CGFloat {
        684 - entete - PostDetailSceneFraming.actionsRowReserve
    }

    // MARK: - LE cas de la recette

    func test_uneScenePortrait_tientEntiereAvecSaRangeeDActions_aLOuverture() throws {
        let t = try taille(portrait, page())
        XCTAssertLessThanOrEqual(156 + t.height + PostDetailSceneFraming.actionsRowReserve, 684.001,
                                 "le bas de la scène ou la rangée d'actions passe sous le composer")
        XCTAssertEqual(t.width / t.height, portrait, accuracy: 0.001, "la scène est déformée")
    }

    /// Une scène paysage tenait déjà : elle garde toute la largeur du détail.
    func test_uneScenePaysage_gardeToutLaLargeurDuDetail() throws {
        let t = try taille(paysage, page())
        XCTAssertEqual(t.width, 370, accuracy: 0.001)
        XCTAssertEqual(t.height, 370 / paysage, accuracy: 0.001)
    }

    // MARK: - Un texte long au-dessus de la scène

    /// Un texte qui repousse la scène sous le composer ne la réduit pas à une
    /// vignette : sous la moitié de la largeur du détail, le texte que la scène
    /// porte deviendrait illisible (`CanvasGeometry.scaleFactor = largeur / 1080`).
    func test_unTexteLong_neReduitPasLaSceneSousLaMoitieDeLaLargeur() throws {
        let t = try taille(portrait, page(sceneTop: 600))
        XCTAssertGreaterThanOrEqual(t.width, 370 * PostDetailSceneFraming.minimumWidthFraction - 0.001)
        XCTAssertLessThanOrEqual(t.height, plafondVisible + 0.001)
    }

    /// Où que la scène commence, une fois défilée sous l'en-tête elle se voit
    /// entière avec sa rangée d'actions — aucun contrôle ne la couvre.
    func test_laScene_seVoitToujoursEntiereEnDefilant() throws {
        for haut in stride(from: CGFloat(0), through: 1_000, by: 50) {
            for ratio in [portrait, 1, paysage] {
                let t = try taille(ratio, page(sceneTop: haut))
                XCTAssertLessThanOrEqual(t.height, plafondVisible + 0.001, "haut \(haut), ratio \(ratio)")
                XCTAssertEqual(t.width / t.height, ratio, accuracy: 0.001, "haut \(haut), ratio \(ratio)")
            }
        }
    }

    /// Quand un texte pousse la scène trop bas pour qu'elle tienne à l'ouverture
    /// sans devenir illisible, elle ne rétrécit plus pour rien : elle reprend sa
    /// taille de LECTURE, entière une fois défilée — une scène paysage garde
    /// toute la largeur au lieu de tomber à une vignette.
    func test_uneSceneQuiNePeutPasTenirALOuverture_seLitASaTailleDeLecture() throws {
        let portraitBas = try taille(portrait, page(sceneTop: 600))
        XCTAssertEqual(portraitBas.height, plafondVisible, accuracy: 0.001)
        let paysageBas = try taille(paysage, page(sceneTop: 600))
        XCTAssertEqual(paysageBas.width, 370, accuracy: 0.001)
    }

    /// À l'ouverture, la scène ne devient jamais plus étroite que la moitié du
    /// détail, où que le texte la pose.
    func test_laScene_neDevientJamaisPlusEtroiteQueLaMoitieDuDetail() throws {
        for haut in stride(from: CGFloat(64), through: 900, by: 10) {
            let t = try taille(portrait, page(sceneTop: haut))
            XCTAssertGreaterThanOrEqual(t.width, 370 * PostDetailSceneFraming.minimumWidthFraction - 0.001,
                                        "haut \(haut)")
        }
    }

    // MARK: - Avant la mesure, et sur iPad

    func test_tantQueLaPageNEstPasMesuree_aucuneTailleNestImposee() {
        XCTAssertNil(PostDetailSceneFraming.sceneSize(ratio: portrait,
                                                      measures: PostDetailSceneFraming.Measures(),
                                                      headerHeight: entete))
    }

    /// Le haut de la scène pas encore relevé : la scène se borne à ce qu'on voit
    /// sous l'en-tête, jamais à sa hauteur naturelle.
    func test_unHautInconnu_seBorneSousLEntete() throws {
        let t = try taille(portrait, page(sceneTop: nil))
        XCTAssertLessThanOrEqual(t.height, plafondVisible + 0.001)
    }

    func test_surIPad_laSceneGardeSonPlafondDeLargeur() throws {
        let t = try taille(paysage, page(width: 1_024, height: 1_300, sceneTop: 156))
        XCTAssertEqual(t.width, PostDetailSceneFraming.maxWidth, accuracy: 0.001)
    }

    // MARK: - Le relevé du haut de la scène

    func test_leHautDeLaScene_seReleveAuRepos() {
        let relevee = page(sceneTop: nil).recordingSceneTop(156, scrollOffset: 0)
        XCTAssertEqual(relevee.sceneTop, 156)
    }

    /// Pendant le défilement, le cadre bouge avec le contenu : le relever ferait
    /// changer la taille de la scène sous le doigt.
    func test_leHautDeLaScene_neSeReleveJamaisPendantLeDefilement() {
        let relevee = page(sceneTop: 156).recordingSceneTop(40, scrollOffset: -116)
        XCTAssertEqual(relevee.sceneTop, 156)
    }

    // MARK: - Le rapport servi (#6697)

    private func effets(_ scene: SceneV3) -> StoryEffects {
        var effets = StoryEffects()
        effets.canvasV3 = CanvasV3(scenes: [scene])
        return effets
    }

    private func fondPaysage() -> ObjectV3 {
        ObjectV3(id: "fond", kind: .media, anchor: .free(x: 0.5, y: 0.5), plane: .content, z: 0,
                 transform: TransformV3(),
                 payload: ["isBackground": .bool(true), "aspectRatio": .number(16.0 / 9.0),
                           "postMediaId": .string("m1"), "mediaType": .string("image")])
    }

    func test_leDetail_presenteUneImageSeuleAuRapportDeSonImage() {
        let r = PostDetailSceneFraming.ratio(of: effets(SceneV3(id: "s1", objects: [fondPaysage()])))
        XCTAssertEqual(r, paysage, accuracy: 0.0001)
    }

    /// La scène qui a logé son porteur se cadre comme en plein écran — par la
    /// loi du porteur, jamais par un second littéral.
    func test_leDetail_presenteUneSceneAuRapportDeSonPorteur() {
        let porteuse = SceneV3(id: "s1", objects: [], carrierAspect: 16.0 / 9.0)
        XCTAssertEqual(PostDetailSceneFraming.ratio(of: effets(porteuse)),
                       SceneFullscreenFraming.ratio(of: porteuse), accuracy: 0.0001)
        XCTAssertEqual(PostDetailSceneFraming.ratio(of: effets(porteuse)), paysage, accuracy: 0.0001)
    }

    // MARK: - Une publication à plusieurs scènes (#6708)

    /// Une scène de la publication de recette n°1 : le porteur du cadrage, puis
    /// le fond portrait 1080 × 1920 qui remplit la scène.
    private func scenePortraitDeRecette() -> SceneV3 {
        SceneV3(id: "s1", objects: [
            ObjectV3(id: "bg", kind: .media, anchor: .free(x: 0.5, y: 0.5), plane: .bg, z: 0,
                     transform: TransformV3(),
                     payload: ["transform": .object(["videoFitMode": .string("fit")])]),
            ObjectV3(id: "fond", kind: .media, anchor: .free(x: 0.5, y: 0.5), plane: .content, z: 1,
                     transform: TransformV3(),
                     payload: ["isBackground": .bool(true), "aspectRatio": .number(9.0 / 16.0),
                               "postMediaId": .string("m1"), "mediaType": .string("video")])
        ])
    }

    /// **Le détail RENDU d'un carrousel de scènes portrait** (#6708, recette du
    /// 2026-09-15 à 22:40 puis sur la tête de la PR #6764).
    ///
    /// Un premier témoin interrogeait la LOI (`sceneSize` au rapport de
    /// `boxAspect`) et passait au vert, pendant que le simulateur rendait la
    /// scène en 370 × 657 pt, son bas sous le composer, « J'aime » hors champ.
    /// Une loi juste que la vue ne lit pas ne protège rien : ce témoin monte donc
    /// la VRAIE vue du détail et mesure ce qu'elle POSE.
    ///
    /// Aucun appel ne quitte le processus : l'API et les sockets pointent vers
    /// un hôte fermé le temps du montage, et `viewPost` / `registerDetailOpen`
    /// échouent sans rien écrire.
    @MainActor
    func test_leDetailRenduDUnCarrouselPortrait_tientEntierAuDessusDuComposer() throws {
        let origine = MeeshyConfig.shared.apiBaseURL
        MeeshyConfig.shared.apiBaseURL = "http://127.0.0.1:9/api/v1"
        defer { MeeshyConfig.shared.apiBaseURL = origine }

        var effets = StoryEffects()
        effets.canvasV3 = CanvasV3(scenes: [scenePortraitDeRecette(), scenePortraitDeRecette(),
                                            scenePortraitDeRecette()])
        var post = FeedPost(id: "6a0000000000000000006708", author: "Demo", authorId: "a1",
                            content: "", timestamp: Date())
        post.storyEffects = effets

        let ecran = RenderedScreen(
            PostDetailView(postId: post.id, initialPost: post)
                .environmentObject(StatusViewModel())
                .environmentObject(StoryViewModel())
                .environmentObject(Router())
        )
        defer { ecran.dismount() }

        let libelleScene = String(localized: "feed.scene.mosaic.tile", defaultValue: "Scène \(1)", bundle: .main)
        let libelleComposer = String(localized: "composer.a11y.openAttachMenu",
                                     defaultValue: "Ouvrir le menu des pièces jointes", bundle: .main)
        let libelleJaime = String(localized: "a11y.post.like", defaultValue: "J'aime", bundle: .main)

        var scene: CGRect?
        var composer: CGRect?
        var jaime: CGRect?
        let echeance = Date().addingTimeInterval(6)
        repeat {
            scene = ecran.frame(labeledPrefix: libelleScene)
            composer = ecran.frame(labeledPrefix: libelleComposer)
            jaime = ecran.frame(labeledPrefix: libelleJaime)
            if let s = scene, let c = composer, let j = jaime,
               s.maxY <= c.minY + 0.5, j.maxY <= c.minY + 0.5 { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        } while Date() < echeance

        let c = try XCTUnwrap(composer, "le composer du détail n'est pas rendu")
        let s = try XCTUnwrap(scene, "la scène 1 n'est pas rendue")
        XCTAssertEqual(s.width / s.height, portrait, accuracy: 0.01, "scène \(s) : déformée ou rognée")
        XCTAssertLessThan(s.width, 370, "scène \(s) : une 9:16 entière tient par des bandes latérales")
        XCTAssertLessThanOrEqual(s.maxY, c.minY + 0.5,
                                 "scène \(s) : son bas passe sous le composer \(c)")
        let j = try XCTUnwrap(jaime, "« J'aime » n'est pas rendu — la rangée d'actions est hors champ")
        XCTAssertLessThanOrEqual(j.maxY, c.minY + 0.5, "« J'aime » \(j) passe sous le composer \(c)")
    }

    func test_uneScene9x16_nechangePasDeRapport() {
        let texte = ObjectV3(id: "t", kind: .text, anchor: .free(x: 0.5, y: 0.5), plane: .content,
                             z: 1, transform: TransformV3(), payload: ["text": .string("Bonjour")])
        XCTAssertEqual(PostDetailSceneFraming.ratio(of: effets(SceneV3(id: "s1", objects: [texte]))),
                       portrait, accuracy: 0.0001)
        XCTAssertEqual(PostDetailSceneFraming.ratio(of: nil), portrait, accuracy: 0.0001)
    }
}
