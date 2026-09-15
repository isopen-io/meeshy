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

    // MARK: - Raccourcir, jamais zoomer

    /// **LE témoin de la directive du 2026-09-06** :
    ///
    /// > « Le cadrage de la scène permet d'avoir des cards de Feeds COURTES en
    /// > hauteur et non pas de ZOOMER sur la scène sur les cards ! »
    ///
    /// Un cadre plus étroit que la scène force le rendu à l'AGRANDIR pour
    /// remplir la carte : la scène est alors montrée à une échelle qu'elle n'a
    /// nulle part ailleurs, et le texte de l'auteur y arrive deux fois trop
    /// gros. Le cadre ne resserre donc QUE la hauteur — la largeur reste
    /// pleine, l'échelle reste 1, et la carte raccourcit.
    ///
    /// Éprouvé sur les trois formes qui produisaient un cadre étroit : le
    /// sticker seul (plancher), le fond uni avec un texte, et l'objet au bord.
    func test_leCadre_prendTOUJOURSlaLargeurEntiere() throws {
        let cas: [(String, SceneV3)] = [
            ("un sticker seul", scene([objet(.sticker, x: 0.5, y: 0.5, scale: 0.5)])),
            ("un fond uni + texte", scene([objet(.text, x: 0.5, y: 0.22)])),
            ("un objet au bord", scene([objet(.text, x: 0.02, y: 0.5)])),
            ("une photo paysage", scene([objet(.media, plane: .bg)]))
        ]
        for (quoi, s) in cas {
            let cadre = try XCTUnwrap(SceneFraming.focus(scene: s, backgroundAspect: paysage), quoi)
            XCTAssertEqual(cadre.minX, 0, accuracy: 0.0001, quoi)
            XCTAssertEqual(cadre.width, 1, accuracy: 0.0001,
                           "\(quoi) : un cadre plus étroit que la scène AGRANDIT le rendu — " +
                           "c'est le zoom que la directive refuse")
        }
    }

    /// …et la contrepartie : le cadre RACCOURCIT bel et bien. Sans cette
    /// moitié, « largeur pleine » se satisferait d'un cadre qui couvre tout,
    /// c'est-à-dire d'un cadrage qui ne cadre rien.
    func test_leCadre_raccourcitLaCarte() throws {
        let photo = try XCTUnwrap(
            SceneFraming.focus(scene: scene([objet(.media, plane: .bg)]),
                               backgroundAspect: paysage))
        XCTAssertLessThan(photo.height, 0.5, "une photo paysage tient dans une bande")
        let rapport = try XCTUnwrap(
            SceneFraming.cardAspect(scene: scene([objet(.media, plane: .bg)]),
                                    backgroundAspect: paysage))
        XCTAssertGreaterThan(rapport, 1, "la carte est plus LARGE que haute — donc courte")
    }

    // MARK: - La forme d'un carrousel

    /// **Un carrousel a UNE forme, et c'est la plus HAUTE de ses pages.**
    ///
    /// Une hauteur par page ferait sauter la carte à chaque glissement ; la
    /// forme de la tête de lot couperait le texte des pages plus verticales.
    /// La plus haute ne perd rien de personne — elle laisse du vide, ce qui
    /// est réversible, là où un rognage ne l'est pas.
    func test_leCarrousel_prendLaFormeDeSaPageLaPlusHAUTE() {
        // La scène DÉCLARE la forme de son fond (`aspectRatio` au payload) :
        // sans elle, `cardAspect` n'a rien à resserrer et rend le gabarit 9:16
        // — c'est-à-dire la page la plus haute, ce qui ferait passer le témoin
        // pour la mauvaise raison.
        let paysageDeclare = ObjectV3(id: "bg", kind: .media,
                                      anchor: .free(x: 0.5, y: 0.5), plane: .bg, z: 0,
                                      transform: TransformV3(scale: 1, rotation: 0, opacity: 1),
                                      payload: ["aspectRatio": .number(16.0 / 9.0)])
        let courte = scene([paysageDeclare])                     // paysage → carte courte
        let haute = scene([objet(.text, x: 0.5, y: 0.5)])        // fond uni → plancher
        let document = CanvasV3(scenes: [courte, haute])
        let rapport = SceneCarouselLayout.cardAspect(document: document)
        let rapportCourte = SceneFraming.cardAspect(scene: courte) ?? SceneFraming.sceneAspect
        let rapportHaute = SceneFraming.cardAspect(scene: haute) ?? SceneFraming.sceneAspect
        XCTAssertEqual(rapport, min(rapportCourte, rapportHaute), accuracy: 0.0001)
        XCTAssertLessThan(rapport, rapportCourte,
                          "la page la plus haute impose sa forme — sinon elle serait rognée")
        XCTAssertGreaterThan(rapportCourte, 1,
                             "témoin du témoin : la page paysage doit bien être COURTE, " +
                             "sans quoi la comparaison ci-dessus ne compare rien")
    }

    /// **Une scène qui ne montre RIEN n'impose rien** (mesuré au simulateur
    /// le 2026-09-06).
    ///
    /// Publication composée : la scène 1 porte un texte, la scène 2 n'a qu'un
    /// fond de couleur. La carte du fil rendait **601 pt** — le gabarit 9:16
    /// entier — parce que la scène 2 votait pour lui : son cadrage est `nil`,
    /// donc elle prenait le repli, donc elle gagnait le minimum.
    ///
    /// > **`nil` a deux sens, et un seul justifie le gabarit plein.** Il dit
    /// > « tout est déjà montré » sur une photo qui couvre la scène — et là,
    /// > raccourcir COUPERAIT. Il dit « il n'y a rien à montrer » sur un fond
    /// > nu — et là, raccourcir ne coûte rien. Les traiter pareil fait payer à
    /// > toute la publication la hauteur d'une scène qui n'a aucune exigence.
    func test_uneSceneSansRienDeVisible_nImposePasSonGabarit() {
        let porteuse = scene([objet(.text, x: 0.5, y: 0.5)])       // se cadre
        let nue = scene([objet(.media, plane: .bg)])               // fond sans aspect déclaré
        let rapport = SceneCarouselLayout.cardAspect(document: CanvasV3(scenes: [porteuse, nue]))
        let seule = SceneFraming.cardAspect(scene: porteuse) ?? SceneFraming.sceneAspect
        XCTAssertEqual(rapport, seule, accuracy: 0.0001,
                       "la scène nue n'a rien à protéger : elle ne doit pas ramener " +
                       "toute la publication au gabarit 9:16")
    }

    /// …mais une scène qui montre quelque chose SANS pouvoir se resserrer
    /// impose bien son gabarit : là, raccourcir couperait du contenu. C'est la
    /// moitié qui empêche le correctif ci-dessus de devenir un rognage.
    func test_uneSceneQuiCouvreTout_imposeBienSonGabarit() {
        let couvrante = scene([objet(.text, x: 0.5, y: 0.05),
                               objet(.text, x: 0.5, y: 0.95)])     // haut ET bas : rien à retirer
        let courte = scene([ObjectV3(id: "bg", kind: .media,
                                     anchor: .free(x: 0.5, y: 0.5), plane: .bg, z: 0,
                                     transform: TransformV3(scale: 1, rotation: 0, opacity: 1),
                                     payload: ["aspectRatio": .number(16.0 / 9.0)])])
        let rapport = SceneCarouselLayout.cardAspect(document: CanvasV3(scenes: [courte, couvrante]))
        let rapportCourte = SceneFraming.cardAspect(scene: courte) ?? SceneFraming.sceneAspect
        XCTAssertLessThan(rapport, rapportCourte,
                          "la scène qui couvre tout garde le dernier mot — sinon on la rogne")
    }

    /// Un document dont aucune scène ne se resserre garde le gabarit 9:16 : il
    /// n'y a rien à raccourcir, et lui imposer une autre forme rognerait des
    /// scènes qui tenaient.
    func test_unCarrouselSansCadrage_gardeLeGabaritDeLaScene() {
        let document = CanvasV3(scenes: [scene([]), scene([])])
        XCTAssertEqual(SceneCarouselLayout.cardAspect(document: document),
                       SceneFraming.sceneAspect, accuracy: 0.0001)
        XCTAssertEqual(SceneCarouselLayout.cardAspect(document: CanvasV3(scenes: [])),
                       SceneFraming.sceneAspect, accuracy: 0.0001,
                       "un document vide ne fabrique pas une forme")
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

    // MARK: - Le porteur de cadrage PRÉCÈDE le fond (#6708, mesuré le 2026-09-15)

    /// Le porteur du cadrage, tel que la publication de recette
    /// `6aa98002e361c424e6f58409` le sert : `plane: bg`, ni adresse ni forme,
    /// seulement le `transform` que #6125 pose sur chaque fond neuf.
    /// `CanvasV3.migratedScene` l'émet AVANT les médias de la scène.
    private func porteurDeCadrage() -> ObjectV3 {
        ObjectV3(id: "bg", kind: .media, anchor: .free(x: 0.5, y: 0.5),
                 plane: .bg, z: 0,
                 transform: TransformV3(scale: 1, rotation: 0, opacity: 1),
                 timing: nil, locale: nil,
                 payload: ["transform": .object(["videoFitMode": .string("fit")])])
    }

    /// Le fond publié derrière ce porteur : son identité est celle du média,
    /// jamais `bg`.
    private func fondPublie(aspect: Double, mediaType: String) -> ObjectV3 {
        ObjectV3(id: "fond-publie", kind: .media, anchor: .free(x: 0.5, y: 0.5),
                 plane: .content, z: 1,
                 transform: TransformV3(scale: 1, rotation: 0, opacity: 1),
                 timing: nil, locale: nil,
                 payload: ["isBackground": .bool(true),
                           "aspectRatio": .number(aspect),
                           "loop": .bool(true),
                           "postMediaId": .string("m1"),
                           "mediaURL": .string("https://example.test/m1"),
                           "mediaType": .string(mediaType)])
    }

    /// Une scène de la recette, objet pour objet et dans l'ordre servi.
    private func sceneDeRecette(fond aspect: Double, mediaType: String = "image") -> SceneV3 {
        scene([porteurDeCadrage(), fondPublie(aspect: aspect, mediaType: mediaType)])
    }

    /// **LE témoin de #6708.** Trois scènes dont le fond 1080 × 1920 remplit le
    /// cadre rendaient dans le fil une carte de **338 × 252 pt** : le HAUT et le
    /// BAS de chaque scène sortaient de la carte.
    ///
    /// Le porteur vient en tête et passe `isBackground` par son plan. Élu comme
    /// fond, il n'a aucune forme, donc aucune bande ; le vrai fond entrait alors
    /// parmi les objets ordinaires, où sa boîte d'ancre montait au plancher
    /// `minimumSide`. 0,5625 / 0,42 = 1,339, et 338 / 1,339 = 252.
    func test_unFondPortraitPleinCadre_derriereSonPorteur_neResserreRien() {
        let s = sceneDeRecette(fond: 9.0 / 16.0)
        XCTAssertEqual(SceneFraming.backgroundMedia(in: s)?.id, "fond-publie",
                       "le fond est l'objet qui porte l'IMAGE, pas le porteur de son cadrage")
        XCTAssertNil(SceneFraming.focus(scene: s),
                     "un fond portrait remplit la scène : aucune fenêtre ne doit en couper le haut et le bas")
        XCTAssertNil(SceneFraming.cardFocus(scene: s))
        XCTAssertNil(SceneFraming.cardAspect(scene: s))
    }

    /// …et la carte de cette publication garde le gabarit de la scène : 601 pt
    /// de haut sur les 338 pt de la carte, la scène entière.
    func test_leCarrouselDeLaRecette_gardeLeGabaritDeLaScene() {
        let document = CanvasV3(scenes: (0..<3).map { _ in sceneDeRecette(fond: 9.0 / 16.0) })
        let rapport = SceneCarouselLayout.cardAspect(document: document)
        XCTAssertEqual(rapport, SceneFraming.sceneAspect, accuracy: 0.0001)
        XCTAssertEqual(338 / rapport, 601, accuracy: 1,
                       "la recette mesurait 252 pt : une fenêtre de 42 % de la scène")
    }

    /// **La publication de recette n°3 (capture de 22:17)** : quatre scènes
    /// « Image par image » aux rapports MÉLANGÉS — panorama 4:1, image haute
    /// 1:4, image 16:9, vidéo 16:9. Sa carte mesurait, elle aussi, 338 × 252 pt.
    ///
    /// **Une seule hauteur pour toutes les pages : celle de la page la plus
    /// HAUTE.** Chaque page vote le rapport que `SceneFraming` lui donne, et la
    /// boîte prend le plus vertical (`SceneCarouselLayout`). Une hauteur par
    /// page ferait sauter le texte et la rangée d'actions pendant le glissement.
    /// Aucune page n'exige alors plus de hauteur que la boîte, donc aucune n'est
    /// rognée : les pages plus courtes s'y centrent, entières.
    func test_unCarrouselAuxRapportsMelanges_prendLaHauteurDeSaPageLaPlusHaute() throws {
        let pages = [sceneDeRecette(fond: 4),
                     sceneDeRecette(fond: 0.25),
                     sceneDeRecette(fond: 16.0 / 9.0),
                     sceneDeRecette(fond: 16.0 / 9.0, mediaType: "video")]
        XCTAssertEqual(try XCTUnwrap(SceneFraming.cardAspect(scene: pages[0])), 4, accuracy: 0.001,
                       "le panorama tient dans une bande")
        XCTAssertNil(SceneFraming.cardAspect(scene: pages[1]),
                     "l'image haute remplit la scène : rien à resserrer")
        XCTAssertEqual(try XCTUnwrap(SceneFraming.cardAspect(scene: pages[2])), 16.0 / 9.0, accuracy: 0.001)
        XCTAssertEqual(try XCTUnwrap(SceneFraming.cardAspect(scene: pages[3])), 16.0 / 9.0, accuracy: 0.001)

        let boite = SceneCarouselLayout.cardAspect(document: CanvasV3(scenes: pages))
        XCTAssertEqual(boite, SceneFraming.sceneAspect, accuracy: 0.0001,
                       "la page 1:4 est la plus haute : la carte prend 338 × 601 pt")
        let panorama = try XCTUnwrap(SceneFraming.imageAspect(scene: pages[0]))
        XCTAssertEqual(338 / panorama, 84.5, accuracy: 0.5,
                       "le panorama se montre entier, en bande de 338 × 85 pt centrée dans sa page")
    }

    /// **La moitié qui empêche le correctif de devenir un gabarit plein.** Un
    /// fond PAYSAGE derrière le même porteur reste une bande, et sa carte reste
    /// courte (directive porteur 2026-09-06 ; #6697 mesurait 338 × 190).
    ///
    /// Le porteur ne peint aucun pixel : compté parmi les objets, sa boîte
    /// d'ancre montée au plancher élargirait la bande de 0,32 à 0,42.
    func test_unFondPaysage_derriereSonPorteur_gardeSaCarteCourte() throws {
        let s = sceneDeRecette(fond: 16.0 / 9.0)
        let cadre = try XCTUnwrap(SceneFraming.focus(scene: s))
        XCTAssertEqual(cadre.height, SceneFraming.backgroundBand(aspect: 16.0 / 9.0).height,
                       accuracy: 0.001, "le cadre est la bande, pas la bande unie au porteur")
        XCTAssertEqual(try XCTUnwrap(SceneFraming.cardAspect(scene: s)), 16.0 / 9.0, accuracy: 0.001)
        let carrousel = CanvasV3(scenes: [s, sceneDeRecette(fond: 16.0 / 9.0)])
        XCTAssertEqual(338 / SceneCarouselLayout.cardAspect(document: carrousel), 190, accuracy: 1)
    }

    /// Une scène de TEXTE seul sur son porteur de couleur garde, elle aussi, sa
    /// carte courte : c'est la forme des publications du 2026-09-06.
    func test_uneSceneDeTexteSeul_surSonPorteurDeCouleur_gardeSaCarteCourte() throws {
        let couleur = ObjectV3(id: "bg", kind: .media, anchor: .free(x: 0.5, y: 0.5),
                               plane: .bg, z: 0,
                               transform: TransformV3(scale: 1, rotation: 0, opacity: 1),
                               timing: nil, locale: nil,
                               payload: ["background": .string("#101010")])
        let s = scene([couleur, objet(.text, x: 0.5, y: 0.45)])
        XCTAssertGreaterThan(try XCTUnwrap(SceneFraming.cardAspect(scene: s)), 1,
                             "rien ne remplit la scène : la carte se resserre sur le texte")
    }
}
