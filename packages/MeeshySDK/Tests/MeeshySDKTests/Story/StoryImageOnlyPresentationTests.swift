import XCTest
import CoreGraphics
@testable import MeeshySDK

/// **« Si rien ne sort du cadre de l'image, pas de canvas »** (#6636, directive
/// porteur 2026-09-15).
///
/// La loi rend un VERDICT, jamais une vue : `.canvas` garde la carte 9:16 et
/// ses bandes, `.imageOnly(rect)` dit au lecteur de ne présenter que le
/// rectangle de l'image ajustée. Les cadres des objets arrivent par un
/// mesureur injecté — celui du rendu en production, un dictionnaire ici.
final class StoryImageOnlyPresentationTests: XCTestCase {

    private let scene = CGSize(width: 1080, height: 1920)
    private let paysage = CGSize(width: 1920, height: 1080)
    /// 1080 de large ⇒ 607,5 de haut, centré : il reste 656,25 de chaque côté.
    private let rectPaysage = CGRect(x: 0, y: 656.25, width: 1080, height: 607.5)

    // MARK: - Fabriques

    private func fond(kind: StoryMediaKind = .image,
                      x: Double = 0.5, y: Double = 0.5,
                      scale: Double = 1, rotation: Double = 0) -> StoryMediaObject {
        StoryMediaObject(id: "fond", postMediaId: "pm-fond", kind: kind,
                         aspectRatio: 16.0 / 9.0,
                         x: x, y: y, scale: scale, rotation: rotation,
                         isBackground: true)
    }

    private func effets(fitMode: String? = StoryBackgroundFraming.fit,
                        fond: StoryMediaObject? = nil,
                        textes: [StoryTextObject] = [],
                        medias: [StoryMediaObject] = [],
                        stickers: [StorySticker] = [],
                        lieux: [StoryLocationObject] = [],
                        audios: [StoryAudioPlayerObject] = []) -> StoryEffects {
        var effets = StoryEffects()
        effets.mediaObjects = (fond.map { [$0] } ?? []) + medias
        effets.textObjects = textes
        effets.stickerObjects = stickers
        effets.locationObjects = lieux
        effets.audioPlayerObjects = audios
        effets.backgroundTransform = StoryBackgroundTransform(videoFitMode: fitMode)
        return effets
    }

    private func mesureur(_ cadres: [String: StoryImageOnlyPresentation.Footprint])
        -> (MeeshySceneObject) -> StoryImageOnlyPresentation.Footprint? {
        { cadres[$0.id] }
    }

    private func empreinte(centre: CGPoint, taille: CGSize,
                           rotation: Double = 0) -> StoryImageOnlyPresentation.Footprint {
        StoryImageOnlyPresentation.Footprint(position: centre, size: taille,
                                             rotationDegrees: rotation)
    }

    private func verdict(_ effets: StoryEffects,
                         media: CGSize? = nil,
                         dessin: StoryImageOnlyPresentation.DrawingExtent = .none,
                         cadres: [String: StoryImageOnlyPresentation.Footprint] = [:])
        -> StoryImageOnlyPresentation.Verdict {
        StoryImageOnlyPresentation.resolve(effects: effets,
                                           mediaSize: media ?? paysage,
                                           canvasSize: scene,
                                           drawing: dessin,
                                           footprint: mesureur(cadres))
    }

    // MARK: - Le cas de la capture

    /// **La story de la capture du porteur** : une photo paysage ajustée, rien
    /// d'autre. Le rectangle rendu est celui que `.resizeAspect` peint.
    func test_uneImageAjusteeSEULE_sePresenteCommeLImage() {
        XCTAssertEqual(verdict(effets(fond: fond())), .imageOnly(rectPaysage))
    }

    /// Un média PLUS vertical que la scène laisse des bandes sur les côtés —
    /// la même règle doit les retirer, sinon elle ne vaut que pour un sens.
    func test_uneImagePORTRAITplusEtroiteQueLaScene_sePresenteCommeLImage() {
        let etroite = CGSize(width: 500, height: 1920)
        XCTAssertEqual(verdict(effets(fond: fond()), media: etroite),
                       .imageOnly(CGRect(x: 290, y: 0, width: 500, height: 1920)))
    }

    // MARK: - Les objets posés

    func test_unTexteEntierementDANSlImage_gardeLImageSeule() {
        let texte = StoryTextObject(id: "t", text: "Bonjour")
        let cadres = ["t": empreinte(centre: CGPoint(x: 540, y: 960),
                                     taille: CGSize(width: 400, height: 120))]
        XCTAssertEqual(verdict(effets(fond: fond(), textes: [texte]), cadres: cadres),
                       .imageOnly(rectPaysage))
    }

    /// **Le texte qui rend le canvas nécessaire** : posé sur la bande basse, il
    /// fait de la scène une surface de composition (#4519).
    func test_unTexteSurUneBANDE_gardeLeCanvas() {
        let texte = StoryTextObject(id: "t", text: "Légende", y: 0.9)
        let cadres = ["t": empreinte(centre: CGPoint(x: 540, y: 1728),
                                     taille: CGSize(width: 400, height: 120))]
        XCTAssertEqual(verdict(effets(fond: fond(), textes: [texte]), cadres: cadres), .canvas)
    }

    /// **Le cadre TRANSFORMÉ, pas le cadre posé.** Le même rectangle tient
    /// droit et déborde une fois tourné : 1000 × 500 à 20° occupe 812 pt de
    /// haut, l'image n'en offre que 607,5. Le fusible (même objet, droit)
    /// empêche qu'une loi qui rendrait toujours `.canvas` passe ce témoin.
    func test_unObjetTOURNEdontUnCoinDeborde_gardeLeCanvas() {
        let texte = StoryTextObject(id: "t", text: "Tourné")
        let droit = ["t": empreinte(centre: CGPoint(x: 540, y: 960),
                                    taille: CGSize(width: 1000, height: 500))]
        let tourne = ["t": empreinte(centre: CGPoint(x: 540, y: 960),
                                     taille: CGSize(width: 1000, height: 500),
                                     rotation: 20)]
        let scene = effets(fond: fond(), textes: [texte])
        XCTAssertEqual(verdict(scene, cadres: droit), .imageOnly(rectPaysage))
        XCTAssertEqual(verdict(scene, cadres: tourne), .canvas)
    }

    /// Un point de tolérance : l'arrondi d'une mesure de texte ne doit pas
    /// ramener la carte, un vrai débordement si.
    func test_laToleranceEstDUNpoint() {
        let texte = StoryTextObject(id: "t", text: "Bord")
        let effleure = ["t": empreinte(centre: CGPoint(x: 540, y: 656.25 + 50 - 0.5),
                                       taille: CGSize(width: 200, height: 100))]
        let deborde = ["t": empreinte(centre: CGPoint(x: 540, y: 656.25 + 50 - 2),
                                      taille: CGSize(width: 200, height: 100))]
        let scene = effets(fond: fond(), textes: [texte])
        XCTAssertEqual(verdict(scene, cadres: effleure), .imageOnly(rectPaysage))
        XCTAssertEqual(verdict(scene, cadres: deborde), .canvas)
    }

    /// **Toutes les familles comptent** — un sticker, un lieu, un média de
    /// premier plan, une puce de son : chacun posé sur la bande garde le canvas.
    func test_chaqueFamilleSurUneBande_gardeLeCanvas() {
        let surLaBande = empreinte(centre: CGPoint(x: 540, y: 200),
                                   taille: CGSize(width: 120, height: 120))
        let place = SharedPlace(latitude: 48.85, longitude: 2.35)
        let scenes: [(String, StoryEffects)] = [
            ("sticker", effets(fond: fond(), stickers: [StorySticker(id: "o", emoji: "🔥")])),
            ("lieu", effets(fond: fond(), lieux: [StoryLocationObject(id: "o", place: place)])),
            ("média", effets(fond: fond(), medias: [StoryMediaObject(id: "o", kind: .image,
                                                                       aspectRatio: 1)])),
            ("son", effets(fond: fond(), audios: [StoryAudioPlayerObject(id: "o")])),
        ]
        for (famille, scene) in scenes {
            XCTAssertEqual(verdict(scene, cadres: ["o": surLaBande]), .canvas,
                           "un \(famille) sur la bande doit garder le canvas")
            XCTAssertEqual(verdict(scene, cadres: ["o": empreinte(centre: CGPoint(x: 540, y: 960),
                                                                  taille: CGSize(width: 120, height: 120))]),
                           .imageOnly(rectPaysage),
                           "un \(famille) dans l'image garde l'image seule")
        }
    }

    /// Un son de FOND ne se voit sur aucun pixel : il n'a pas de cadre à
    /// mesurer, et il ne doit pas ramener la carte.
    func test_unSonDeFOND_neCompteBasCommeUnObjetVisible() {
        let sonDeFond = StoryAudioPlayerObject(id: "fond-sonore", isBackground: true)
        XCTAssertEqual(verdict(effets(fond: fond(), audios: [sonDeFond])), .imageOnly(rectPaysage))
    }

    /// **Fail-closed.** Un objet que le rendu ne sait pas mesurer n'est pas
    /// réputé tenir dans l'image : la carte reste.
    func test_unObjetQuOnNeSaitPasMESURER_gardeLeCanvas() {
        let texte = StoryTextObject(id: "t", text: "?")
        XCTAssertEqual(verdict(effets(fond: fond(), textes: [texte])), .canvas)
    }

    /// Une animation par images clés DÉPLACE l'objet : sa pose de départ ne
    /// dit rien de là où il passera.
    func test_unObjetANIMEparImagesCles_gardeLeCanvas() {
        let anime = StoryTextObject(id: "t", text: "Bouge",
                                    keyframes: [StoryKeyframe(time: 1, x: 0.5, y: 0.05)])
        let cadres = ["t": empreinte(centre: CGPoint(x: 540, y: 960),
                                     taille: CGSize(width: 200, height: 100))]
        XCTAssertEqual(verdict(effets(fond: fond(), textes: [anime]), cadres: cadres), .canvas)
    }

    // MARK: - Le dessin

    func test_unDessinSurUneBande_gardeLeCanvas_etDansLImage_non() {
        let scene = effets(fond: fond())
        XCTAssertEqual(verdict(scene, dessin: .bounds(CGRect(x: 100, y: 100, width: 200, height: 50))),
                       .canvas)
        XCTAssertEqual(verdict(scene, dessin: .bounds(CGRect(x: 100, y: 800, width: 200, height: 50))),
                       .imageOnly(rectPaysage))
        XCTAssertEqual(verdict(scene, dessin: .unmeasurable), .canvas)
    }

    /// Les traits vivent dans l'espace design du rasteriseur, étiré au canvas :
    /// l'emprise d'un trait est projetée, épaisseur comprise.
    func test_lEmpriseDesTraits_estProjeteeEpaisseurComprise() {
        let trait = StoryDrawingStroke(points: [StoryDrawingStrokePoint(x: 100, y: 200),
                                                StoryDrawingStrokePoint(x: 300, y: 400)],
                                       colorHex: "FFFFFF", width: 20)
        let emprise = StoryImageOnlyPresentation.strokeBounds(
            [trait], designSize: CGSize(width: 1080, height: 1920),
            canvasSize: CGSize(width: 540, height: 960))
        XCTAssertEqual(emprise, .bounds(CGRect(x: 40, y: 90, width: 120, height: 120)))
        XCTAssertEqual(StoryImageOnlyPresentation.strokeBounds([], designSize: scene, canvasSize: scene),
                       StoryImageOnlyPresentation.DrawingExtent.none)
    }

    // MARK: - Ce qui garde la carte, par construction

    /// **Une image qui REMPLIT n'a pas de bande** : rien à retirer. `nil` est
    /// l'alias de « remplir » (`StoryBackgroundFraming.rendersFilled`).
    func test_uneImageQuiREMPLIT_gardeLeCanvas() {
        XCTAssertEqual(verdict(effets(fitMode: StoryBackgroundFraming.fill, fond: fond())), .canvas)
        XCTAssertEqual(verdict(effets(fitMode: nil, fond: fond())), .canvas)
    }

    func test_unFondCOULEURouDEGRADE_gardeLeCanvas() {
        var couleur = effets(fond: nil)
        couleur.background = "#6366F1"
        XCTAssertEqual(verdict(couleur), .canvas)
    }

    /// **La vidéo de fond partage le chemin de l'image** : `StoryBackgroundLayer`
    /// pose `.resizeAspect` sur les deux dès que le mode est `fit`.
    func test_uneVideoDeFondAjustee_suitLaMemeRegle() {
        XCTAssertEqual(verdict(effets(fond: fond(kind: .video))), .imageOnly(rectPaysage))
    }

    /// Un ratio inconnu ne fabrique pas un rectangle.
    func test_unRatioINCONNU_gardeLeCanvas() {
        let scene = effets(fond: fond())
        XCTAssertEqual(StoryImageOnlyPresentation.resolve(effects: scene, mediaSize: nil,
                                                          canvasSize: self.scene,
                                                          footprint: mesureur([:])),
                       .canvas)
    }

    /// Un média déjà à la forme de la scène ne laisse aucune bande.
    func test_unMediaALaFormeDeLaScene_gardeLeCanvas() {
        XCTAssertEqual(verdict(effets(fond: fond()), media: scene), .canvas)
    }

    // MARK: - La pose du fond

    /// L'auteur a ZOOMÉ le fond : l'image couvre alors toute la scène, il n'y
    /// a plus de bande à retirer.
    func test_unFondZoomeQuiCouvreLaScene_gardeLeCanvas() {
        XCTAssertEqual(verdict(effets(fond: fond(scale: 4))), .canvas)
    }

    /// L'auteur a DÉPLACÉ le fond : le rectangle suit la pose, pas le centre.
    func test_unFondDeplace_rendLeRectangleDeplace() {
        XCTAssertEqual(verdict(effets(fond: fond(y: 0.4))),
                       .imageOnly(rectPaysage.offsetBy(dx: 0, dy: -192)))
    }

    /// Un fond TOURNÉ n'est plus un rectangle droit : la carte reste.
    func test_unFondTourne_gardeLeCanvas() {
        XCTAssertEqual(verdict(effets(fond: fond(rotation: 12))), .canvas)
    }

    // MARK: - Le cadre transformé

    /// `frame` a la sémantique de `CALayer.frame` : la boîte englobante des
    /// bornes tournées autour du point d'ancrage, posé sur la position.
    func test_leCadreTransforme_aLaSemantiqueDeCALayerFrame() {
        let quartDeTour = StoryImageOnlyPresentation.Footprint(
            position: CGPoint(x: 100, y: 100), size: CGSize(width: 100, height: 50),
            rotationDegrees: 90)
        XCTAssertEqual(quartDeTour.frame.origin.x, 75, accuracy: 0.001)
        XCTAssertEqual(quartDeTour.frame.origin.y, 50, accuracy: 0.001)
        XCTAssertEqual(quartDeTour.frame.width, 50, accuracy: 0.001)
        XCTAssertEqual(quartDeTour.frame.height, 100, accuracy: 0.001)

        let ancreEnHaut = StoryImageOnlyPresentation.Footprint(
            position: CGPoint(x: 100, y: 100), size: CGSize(width: 100, height: 50),
            anchor: CGPoint(x: 0, y: 0))
        XCTAssertEqual(ancreEnHaut.frame, CGRect(x: 100, y: 100, width: 100, height: 50))
    }
}
