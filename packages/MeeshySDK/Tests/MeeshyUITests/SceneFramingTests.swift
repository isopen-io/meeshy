import XCTest
import CoreGraphics
@testable import MeeshySDK
@testable import MeeshyUI

/// **Une carte de fil cadre la scène sur son contenu** (directive porteur
/// 2026-09-06).
final class SceneFramingTests: XCTestCase {

    // MARK: - Fabriques

    private func objet(_ kind: ObjectKind,
                       plane: Plane = .content,
                       x: Double = 0.5, y: Double = 0.5,
                       scale: Double = 1) -> ObjectV3 {
        ObjectV3(id: UUID().uuidString,
                 kind: kind,
                 anchor: .free(x: x, y: y),
                 plane: plane,
                 z: 0,
                 transform: TransformV3(scale: scale, rotation: 0, opacity: 1),
                 timing: nil,
                 locale: nil,
                 payload: [:])
    }

    private func scene(_ objets: [ObjectV3]) -> SceneV3 {
        SceneV3(id: "s1", objects: objets)
    }

    /// 16:9 — une photo paysage ordinaire.
    private let paysage: CGFloat = 16.0 / 9.0
    /// 9:16 — une photo verticale, au gabarit de la scène.
    private let portrait: CGFloat = 9.0 / 16.0

    // MARK: - Le cas nominal du porteur : une image seule

    /// **LE témoin du lot.** « Une scène avec juste une image, on affiche
    /// directement cette zone plutôt que toute la scène 9:16. »
    ///
    /// Une photo PAYSAGE est mise en boîte aux lettres sur la scène : sa bande
    /// occupe une fraction de la hauteur, et c'est elle qu'il faut montrer.
    func test_uneImagePaysageSeule_cadreSurSaBande() throws {
        let s = scene([objet(.media, plane: .bg)])
        let cadre = try XCTUnwrap(SceneFraming.focus(scene: s, backgroundAspect: paysage))
        XCTAssertEqual(cadre.width, 1, accuracy: 0.001, "la bande occupe toute la largeur")
        // 9:16 sur 16:9 → une bande de (9/16)/(16/9) ≈ 0.316 de la hauteur.
        XCTAssertLessThan(cadre.height, 0.6, "et une fraction seulement de la hauteur")
        XCTAssertEqual(cadre.midY, 0.5, accuracy: 0.001, "centrée")
    }

    /// **Une photo PORTRAIT remplit déjà la scène** — « si la photo est en mode
    /// portrait ça prend toute la scène ». Il n'y a rien à resserrer, et la
    /// règle rend `nil` plutôt qu'un rectangle plein : c'est ce qui laisse
    /// l'appelant garder son rendu 9:16 sans avoir à comparer.
    func test_uneImagePortraitSeule_neResserreRien() {
        let s = scene([objet(.media, plane: .bg)])
        XCTAssertNil(SceneFraming.focus(scene: s, backgroundAspect: portrait))
    }

    /// Un aspect INCONNU ne fabrique pas de cadre. Le canvas dit qu'un média
    /// est là ; il ne dit jamais quelle forme il a.
    func test_unAspectInconnu_neCadreRien() {
        let s = scene([objet(.media, plane: .bg)])
        XCTAssertNil(SceneFraming.focus(scene: s, backgroundAspect: nil))
    }

    // MARK: - Ce qui accompagne l'image sans la cadrer

    /// **Un son de fond ne cadre rien.** Le porteur les nomme comme des
    /// compagnons de l'image — « et pourquoi pas un son de fond en plus ou un
    /// audio » — pas comme du contenu à montrer. Un objet qui ne produit aucun
    /// pixel ne doit pas élargir le cadre au nom de ce que personne ne voit.
    func test_unSonEtUneMention_nElargissentPasLeCadre() throws {
        let seule = scene([objet(.media, plane: .bg)])
        let accompagnee = scene([objet(.media, plane: .bg),
                                 objet(.audio, x: 0.5, y: 0.05),
                                 objet(.mention, x: 0.5, y: 0.95)])
        let a = try XCTUnwrap(SceneFraming.focus(scene: seule, backgroundAspect: paysage))
        let b = try XCTUnwrap(SceneFraming.focus(scene: accompagnee, backgroundAspect: paysage))
        XCTAssertEqual(a, b)
    }

    /// **…mais un texte POSÉ DESSUS, oui.** « Voire d'autres éléments toujours
    /// sur la zone / par-dessus l'image ». S'il est dans la bande, le cadre ne
    /// bouge pas ; s'il déborde, le cadre s'élargit pour ne pas le couper.
    func test_unTexteHorsDeLaBande_elargitLeCadre() throws {
        let sans = scene([objet(.media, plane: .bg)])
        let avec = scene([objet(.media, plane: .bg), objet(.text, x: 0.5, y: 0.06)])
        let a = try XCTUnwrap(SceneFraming.focus(scene: sans, backgroundAspect: paysage))
        let b = try XCTUnwrap(SceneFraming.focus(scene: avec, backgroundAspect: paysage))
        XCTAssertLessThan(b.minY, a.minY, "le cadre monte pour attraper le texte")
        XCTAssertGreaterThan(b.height, a.height)
    }

    // MARK: - Le fond uni

    /// **« Ou une scène avec un fond uni : on se centre sur la zone où il y a
    /// du contenu. »** Sans média de fond, le cadre est la zone des objets.
    func test_unFondUniAvecUnTexteEnHaut_cadreSurLeTexte() throws {
        let s = scene([objet(.text, x: 0.5, y: 0.22)])
        let cadre = try XCTUnwrap(SceneFraming.focus(scene: s, backgroundAspect: nil))
        XCTAssertLessThan(cadre.midY, 0.5, "le cadre suit le contenu vers le haut")
        XCTAssertLessThan(cadre.height, 1)
    }

    /// **Une scène VIDE ne se cadre pas.** Rien de visible ⇒ rien à montrer de
    /// plus près, et la carte garde son gabarit.
    func test_uneSceneVide_neCadreRien() {
        XCTAssertNil(SceneFraming.focus(scene: scene([]), backgroundAspect: nil))
        XCTAssertNil(SceneFraming.focus(scene: scene([objet(.audio)]), backgroundAspect: nil))
    }

    /// **Le plancher : sous un seuil, on ne cadre plus, on ZOOME.** Un sticker
    /// seul au centre produirait un cadre minuscule et une carte
    /// démesurément agrandie sur un dixième de scène.
    func test_unStickerSeul_neProduitPasUnZoomAbsurde() throws {
        let s = scene([objet(.sticker, x: 0.5, y: 0.5, scale: 0.5)])
        let cadre = try XCTUnwrap(SceneFraming.focus(scene: s, backgroundAspect: nil))
        XCTAssertGreaterThanOrEqual(cadre.width, SceneFraming.minimumSide - 0.001)
        XCTAssertGreaterThanOrEqual(cadre.height, SceneFraming.minimumSide - 0.001)
    }

    // MARK: - Les bornes

    /// **Un objet au bord fait GLISSER le cadre, il ne le rogne pas.** Rogner
    /// rétrécirait le cadre et couperait ce qu'on voulait montrer.
    func test_unObjetAuBord_faitGlisserLeCadreSansLeRogner() throws {
        let centre = try XCTUnwrap(
            SceneFraming.focus(scene: scene([objet(.text, x: 0.5, y: 0.5)]), backgroundAspect: nil))
        let bord = try XCTUnwrap(
            SceneFraming.focus(scene: scene([objet(.text, x: 0.02, y: 0.5)]), backgroundAspect: nil))
        XCTAssertEqual(bord.width, centre.width, accuracy: 0.001,
                       "même largeur : il a glissé, pas rétréci")
        XCTAssertEqual(bord.minX, 0, accuracy: 0.001)
    }

    /// Le cadre reste TOUJOURS dans la scène — un cadre qui déborde
    /// afficherait du vide en croyant montrer du contenu.
    func test_leCadre_resteToujoursDansLaScene() {
        for x in stride(from: 0.0, through: 1.0, by: 0.1) {
            for y in stride(from: 0.0, through: 1.0, by: 0.1) {
                guard let c = SceneFraming.focus(
                    scene: scene([objet(.text, x: x, y: y, scale: 2)]),
                    backgroundAspect: nil) else { continue }
                XCTAssertGreaterThanOrEqual(c.minX, -0.001, "x=\(x) y=\(y)")
                XCTAssertGreaterThanOrEqual(c.minY, -0.001, "x=\(x) y=\(y)")
                XCTAssertLessThanOrEqual(c.maxX, 1.001, "x=\(x) y=\(y)")
                XCTAssertLessThanOrEqual(c.maxY, 1.001, "x=\(x) y=\(y)")
            }
        }
    }

    // MARK: - Le rapport de la carte

    /// **Le rapport se DÉRIVE du cadre, il ne se pose pas.** Un cadre de
    /// fractions `(w, h)` sur une scène 9:16 rend `(w × 9) / (h × 16)` :
    /// largeur et hauteur ne se comparent qu'une fois ramenées à la même
    /// unité, et c'est l'erreur qu'un `w / h` direct commettrait.
    func test_leRapportDeLaCarte_seDeriveDuCadre() throws {
        let s = scene([objet(.media, plane: .bg)])
        let rapport = try XCTUnwrap(SceneFraming.cardAspect(scene: s, backgroundAspect: paysage))
        XCTAssertEqual(rapport, paysage, accuracy: 0.02,
                       "cadrer sur la bande d'une photo 16:9 rend une carte 16:9")
    }

    /// Sans cadre, pas de rapport : la carte garde le sien.
    func test_sansCadre_aucunRapportNEstImpose() {
        XCTAssertNil(SceneFraming.cardAspect(scene: scene([]), backgroundAspect: nil))
        XCTAssertNil(SceneFraming.cardAspect(scene: scene([objet(.media, plane: .bg)]),
                                             backgroundAspect: portrait))
    }

    /// La bande d'un média AU GABARIT de la scène couvre tout — donc rien à
    /// resserrer. C'est la frontière exacte entre les deux cas du porteur.
    func test_unMediaAuGabaritDeLaScene_couvreToutePlein() {
        let bande = SceneFraming.backgroundBand(aspect: SceneFraming.sceneAspect)
        XCTAssertEqual(bande, CGRect(x: 0, y: 0, width: 1, height: 1))
    }

    // MARK: - La forme RÉELLE du fil (mesurée le 2026-09-06)

    /// Un fond tel que la production l'écrit : `plane: content`,
    /// `isBackground: true` et `aspectRatio` au payload.
    private func fondReel(aspect: Double) -> ObjectV3 {
        ObjectV3(id: "bg", kind: .media, anchor: .free(x: 0.5, y: 0.5),
                 plane: .content, z: 0,
                 transform: TransformV3(scale: 1, rotation: 0, opacity: 1),
                 timing: nil, locale: nil,
                 payload: ["isBackground": .bool(true),
                           "aspectRatio": .number(aspect),
                           "postMediaId": .string("m1"),
                           "mediaType": .string("image")])
    }

    /// **LE témoin de la correction du 2026-09-06.** Une première version de
    /// la règle ne reconnaissait un fond qu'au plan `bg`. Mesuré sur le fil de
    /// production : un fond réel arrive en `plane: content` avec
    /// `isBackground: true`. La règle n'aurait donc RIEN cadré, sur aucune
    /// publication réelle, tout en passant ses propres tests.
    ///
    /// > Une règle qui interroge le contrat sans regarder les données passe à
    /// > côté de ce que les données disent. Le contrat autorisait les deux
    /// > écritures ; une seule est employée.
    func test_unFondEnPlanContent_estReconnuCommeFond() throws {
        let s = scene([fondReel(aspect: 16.0 / 9.0)])
        XCTAssertNotNil(SceneFraming.backgroundMedia(in: s))
        let cadre = try XCTUnwrap(SceneFraming.focus(scene: s))
        XCTAssertLessThan(cadre.height, 0.6, "sa bande, pas toute la scène")
    }

    /// **La scène DÉCLARE la forme de son fond.** Le payload porte
    /// `aspectRatio` : la règle n'a besoin ni du post, ni d'une résolution par
    /// identifiant, ni d'un téléchargement.
    ///
    /// C'est ce qui permet à une carte de cadrer AVANT que la moindre image
    /// n'arrive — donc sans saut de mise en page quand elle arrive.
    func test_laScene_declareLaFormeDeSonFond() {
        XCTAssertEqual(SceneFraming.backgroundAspect(in: scene([fondReel(aspect: 1.5)])), 1.5)
        XCTAssertNil(SceneFraming.backgroundAspect(in: scene([objet(.text)])))
    }

    /// **Le fond ne compte pas DEUX fois.** Il est exclu de la boucle des
    /// objets par IDENTITÉ, pas par plan : filtré sur `.bg`, il y serait entré
    /// comme un objet ordinaire et sa boîte d'ancre aurait élargi le cadre
    /// autour du centre — annulant précisément le resserrement sur sa bande.
    func test_leFond_nElargitPasLeCadreCommeUnObjetOrdinaire() throws {
        let s = scene([fondReel(aspect: 16.0 / 9.0)])
        let cadre = try XCTUnwrap(SceneFraming.focus(scene: s))
        let bande = SceneFraming.backgroundBand(aspect: 16.0 / 9.0)
        XCTAssertEqual(cadre.height, bande.height, accuracy: 0.001,
                       "le cadre est la bande, pas la bande unie à une boîte d'ancre")
    }

    /// Un paramètre explicite l'emporte sur la déclaration — pour l'appelant
    /// qui connaît mieux, parce qu'il a les pixels sous les yeux.
    func test_unAspectImpose_lEmporteSurLaDeclaration() throws {
        let s = scene([fondReel(aspect: 16.0 / 9.0)])
        let impose = try XCTUnwrap(SceneFraming.focus(scene: s, backgroundAspect: 1.0))
        let declare = try XCTUnwrap(SceneFraming.focus(scene: s))
        XCTAssertNotEqual(impose.height, declare.height, accuracy: 0.001)
    }
}
