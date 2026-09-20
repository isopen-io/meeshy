import XCTest
import CoreGraphics
import UIKit
@testable import MeeshySDK
@testable import MeeshyUI

/// **Un texte tourné, agrandi et déplacé se dépose sur le sol tel que l'auteur
/// l'a posé** (#7127, demande porteur du 2026-09-19).
///
/// ## Ce que cette suite mesure, et pourquoi elle ne DEVINE rien
///
/// La loi de cadrage décide ce qu'une surface montre d'une scène : la bande du
/// média (`SceneShape.frame`) ou le 9:16 entier, et `SceneFraming.focus` en
/// calcule la fenêtre. Les deux s'appuient sur `SceneShape.anchorBox(of:)`, qui
/// **DEVINE** la boîte d'un objet — un objet de canvas porte une ancre, pas une
/// taille.
///
/// Cette suite confronte cette devinette à ce que le rendu POSE réellement :
///
/// | côté | source | ce qu'il dit |
/// |---|---|---|
/// | la loi | `SceneShape.anchorBox` | une boîte carrée ±`objectPadding × échelle` |
/// | le rendu | `StoryTextLayer` après `configure` | `frame` — l'enveloppe VRAIE du texte tourné |
///
/// **Aucune des deux n'est réécrite ici.** Le document part des familles
/// runtime, passe au fil par la migration RÉELLE (`CanvasV3.migratedScene`), et
/// en revient par le pont RÉEL (`StoryEffects(rendering:sceneIndex:)`) — celui
/// que `MeeshyScenePlayer` emploie. Un témoin qui fabriquerait sa propre
/// conversion mesurerait sa conversion.
///
/// ## Le fait qui a ouvert l'issue
///
/// `anchorBox` lit `transform.scale` et **jamais** `transform.rotation`
/// (`SceneShape.swift:446-458`), et les trois suites qui éprouvaient la loi
/// déclaraient 8 transformations dont les 8 portaient `rotation: 0`. Une boîte
/// tournée de 45° a une enveloppe 1,414 fois plus large : la dimension existait
/// au contrat, voyageait jusqu'au calque (`CATransform3DMakeRotation`), et
/// aucun témoin ne la regardait.
@MainActor
final class SceneFramingRotatedObjectTests: XCTestCase {

    // MARK: - L'espace de mesure

    /// La scène en espace DESIGN : `CanvasGeometry(renderSize:)` pose
    /// `scaleFactor = largeur / 1080`, donc à 1080×1920 l'espace de rendu est
    /// l'espace de design et une fraction se lit en divisant par ces deux
    /// nombres. Mesurer ailleurs ajouterait un facteur sans rien apprendre.
    private static let renderSize = CGSize(width: 1080, height: 1920)

    /// 16:9 — une photo paysage ordinaire, celle qui laisse une bande.
    private static let paysage: Double = 16.0 / 9.0
    /// Un fond à peine plus large que la scène : sa bande couvre presque tout,
    /// et c'est là que la loi a le PLUS de latitude pour se resserrer — donc le
    /// plus d'occasions de couper.
    private static let presqueVertical: Double = 0.60
    /// 9:16 — au gabarit de la scène : elle la remplit, il n'y a pas de bande.
    private static let portrait: Double = 9.0 / 16.0

    // MARK: - Fabriques : les familles runtime, ce que l'auteur a posé

    private func texte(_ contenu: String,
                       x: Double, y: Double,
                       scale: Double,
                       rotation: Double,
                       fontSize: Double = 96) -> StoryTextObject {
        StoryTextObject(id: "t-\(contenu.count)-\(Int(rotation))-\(Int(scale * 100))-\(Int(x * 100))-\(Int(y * 100))",
                        text: contenu,
                        x: x, y: y,
                        scale: scale,
                        rotation: rotation,
                        fontSize: fontSize)
    }

    private func fond(aspectRatio: Double) -> StoryMediaObject {
        StoryMediaObject(id: "bg-media",
                         postMediaId: "media-1",
                         mediaType: "image",
                         placement: "media",
                         aspectRatio: aspectRatio,
                         x: 0.5, y: 0.5,
                         scale: 1, rotation: 0,
                         isBackground: true)
    }

    /// Le document tel qu'il PART : les familles runtime projetées au fil par la
    /// migration réelle. C'est ce document que la loi lira, et c'est de lui que
    /// le rendu repartira — une seule source, deux lectures.
    private func document(fondAspect: Double?,
                          textes: [StoryTextObject],
                          fitMode: String? = "fit") -> CanvasV3 {
        var effects = StoryEffects()
        effects.textObjects = textes
        if let fondAspect {
            effects.mediaObjects = [fond(aspectRatio: fondAspect)]
            // Le cadrage que le fond a REÇU. `"fit"` est le seul qui laisse une
            // bande : sans lui la loi lit le défaut du renderer, qui REMPLIT
            // (`StoryBackgroundFraming.rendersFilled(nil)`), et aucune bande
            // n'existe — il n'y aurait alors rien à mesurer.
            if let fitMode {
                effects.backgroundTransform = StoryBackgroundTransform(scale: 1, offsetX: 0, offsetY: 0,
                                                                      rotation: 0, videoFitMode: fitMode)
            }
        }
        // `migratedScene` rend `nil` pour une scène VIDE — jamais ici, chaque
        // cas de la planche porte au moins un texte.
        return CanvasV3(scenes: [CanvasV3.migratedScene(effects, id: "s1")].compactMap { $0 })
    }

    // MARK: - La mesure : ce que le rendu POSE

    /// **L'enveloppe RÉELLE d'un texte, en fractions de la scène.**
    ///
    /// Elle vient du calque lui-même : `configure` y pose `bounds` (le texte
    /// mesuré, échelle CUITE dans `fontSize`), `position` (l'ancre placée),
    /// `anchorPoint` (le pivot déclaré) et `transform` (la rotation). `frame`
    /// est alors l'enveloppe alignée sur les axes que CoreAnimation calcule de
    /// ces quatre-là — c'est le PEINTRE qui la rend, pas ce témoin.
    private func enveloppe(du texte: StoryTextObject) -> CGRect {
        let geometry = CanvasGeometry(renderSize: Self.renderSize)
        let layer = StoryTextLayer()
        layer.configure(with: texte, geometry: geometry, mode: .play, renderScale: 1)
        let cadre = layer.frame
        return CGRect(x: cadre.minX / Self.renderSize.width,
                      y: cadre.minY / Self.renderSize.height,
                      width: cadre.width / Self.renderSize.width,
                      height: cadre.height / Self.renderSize.height)
    }

    /// Le texte reconstruit par le pont v3 — celui que le player peindra. On ne
    /// mesure jamais l'objet d'ENTRÉE : la migration pourrait l'avoir remappé,
    /// et c'est le texte SERVI qui se voit.
    private func texteServi(_ document: CanvasV3) throws -> StoryTextObject {
        let effects = StoryEffects(rendering: document, sceneIndex: 0)
        return try XCTUnwrap(effects.textObjects.first)
    }

    // MARK: - 1 · La prémisse : la rotation change ce qui est POSÉ

    /// **Contre-épreuve de la prémisse.** Sans elle, tout ce qui suit pourrait
    /// mesurer une dimension sans effet : si tourner un texte ne changeait pas
    /// son enveloppe, l'absence de rotation dans `anchorBox` serait sans
    /// conséquence, et cette issue n'aurait pas lieu d'être.
    func test_uneRotation_élargitCeQueLeRenduPose() throws {
        let droit = texte("Bonjour le monde", x: 0.5, y: 0.5, scale: 1, rotation: 0)
        let penché = texte("Bonjour le monde", x: 0.5, y: 0.5, scale: 1, rotation: 45)

        let e0 = enveloppe(du: droit)
        let e45 = enveloppe(du: penché)

        XCTAssertGreaterThan(e45.height, e0.height * 1.5,
                             "tourner un texte long de 45° augmente franchement sa hauteur posée")
        XCTAssertLessThan(e45.width, e0.width,
                          "et diminue sa largeur — c'est bien une ROTATION, pas un agrandissement")
    }

    /// **La boîte de la loi GRANDIT quand l'objet tourne** (#7127).
    ///
    /// C'était le défaut : `anchorBox` lisait `transform.scale` et jamais
    /// `transform.rotation`, donc elle rendait la MÊME boîte à 0° et à 45°
    /// pendant que le rendu, lui, posait une enveloppe 1,8 fois plus haute.
    ///
    /// Ce témoin mesure l'axe qui DÉCIDE — la hauteur : c'est le seul sur
    /// lequel une carte de fil se resserre (`SceneFraming.fullWidth`).
    func test_laBoîteDeLaLoi_grandit_quandLObjetTourne() throws {
        let droit = document(fondAspect: nil,
                             textes: [texte("Bonjour le monde", x: 0.5, y: 0.5, scale: 1, rotation: 0)])
        let penché = document(fondAspect: nil,
                              textes: [texte("Bonjour le monde", x: 0.5, y: 0.5, scale: 1, rotation: 45)])

        let boîteDroite = try XCTUnwrap(droit.scenes.first?.objects.first.map(SceneShape.anchorBox(of:)))
        let boîtePenchée = try XCTUnwrap(penché.scenes.first?.objects.first.map(SceneShape.anchorBox(of:)))

        XCTAssertGreaterThan(boîtePenchée.height, boîteDroite.height,
                             "tourner un objet élargit ce qu'il peut peindre en HAUTEUR")
        XCTAssertEqual(boîtePenchée.midY, boîteDroite.midY, accuracy: 0.0001,
                       "et la boîte reste centrée sur l'ancre — la rotation ne déplace rien")
    }

    /// **La CONSÉQUENCE assumée du plafond de largeur, et elle mérite d'être
    /// nommée** : un fond plus ÉTROIT que la scène occupe une colonne, et un
    /// texte wrappé est plus large qu'elle. S'y resserrer couperait les mots
    /// sur les côtés — la loi montre donc le 9:16 entier.
    ///
    /// Ce cas ne figure pas dans la planche, qui ne porte que des fonds plus
    /// LARGES que la scène (les seuls à laisser une bande horizontale) : sans
    /// ce témoin, le plafond changerait ce verdict en silence.
    func test_unTexteSurUneColonne_faitMontrerLaScèneEntière() throws {
        let colonne = 0.35 // un fond bien plus étroit que le 9:16 de la scène
        let doc = document(fondAspect: colonne,
                           textes: [texte("Bonjour le monde", x: 0.5, y: 0.5, scale: 1, rotation: 0)])
        let scene = try XCTUnwrap(doc.scenes.first)
        XCTAssertEqual(SceneShape.frame(scene: scene), .wholeScene,
                       "un texte déborde d'une colonne : on montre tout plutôt que de couper")
    }

    /// **Contre-épreuve : la MÊME colonne, sans texte, reste resserrée.** Sans
    /// elle, le témoin ci-dessus passerait aussi si la loi avait cessé de
    /// resserrer tout court.
    func test_laMêmeColonne_sansTexte_resteResserrée() throws {
        let colonne = 0.35
        let doc = document(fondAspect: colonne, textes: [])
        let scene = try XCTUnwrap(doc.scenes.first)
        XCTAssertEqual(SceneShape.frame(scene: scene),
                       .mediaBand(SceneShape.mediaBand(backgroundAspect: CGFloat(colonne))),
                       "sans rien par-dessus, la colonne du média reste ce qu'on montre")
    }

    /// **Contre-épreuve : à 0°, la loi n'a pas changé de verdict en hauteur.**
    /// Élargir la boîte de tout objet aurait fait payer à chaque carte du fil
    /// une hauteur qu'aucun contenu ne réclame ; la largeur d'un objet ne
    /// descend dans sa hauteur QUE par la rotation.
    func test_àRotationNulle_laHauteurDeLaBoîteEstCelleDAvant() throws {
        let droit = document(fondAspect: nil,
                             textes: [texte("Bonjour", x: 0.5, y: 0.5, scale: 1, rotation: 0)])
        let boîte = try XCTUnwrap(droit.scenes.first?.objects.first.map(SceneShape.anchorBox(of:)))
        XCTAssertEqual(boîte.height, SceneShape.objectPadding * 2, accuracy: 0.0001,
                       "la marge historique, inchangée")
    }

    // MARK: - 2 · La propriété qui compte : rien de posé n'est coupé

    /// Un cas de la planche de recette.
    private struct Cas {
        let libellé: String
        let fondAspect: Double?
        let texte: String
        let x: Double
        let y: Double
        let scale: Double
        let rotation: Double
    }

    /// Ce qu'un cas RÉVÈLE — la ligne de la planche.
    private struct Relevé {
        let cas: Cas
        /// Le verdict de la loi : la bande du média, ou le 9:16 entier.
        let cadre: SceneShape.Frame
        /// La fenêtre de carte que `SceneFraming` retient, `nil` = rien à resserrer.
        let fenêtre: CGRect?
        /// L'enveloppe RÉELLE du texte servi, en fractions de scène.
        let posé: CGRect
        /// La part du texte qui tombe dans la scène — au-delà, le rognage
        /// préexiste au cadrage et ne lui est pas imputable.
        let visible: CGRect
        /// Ce que la fenêtre retient réellement.
        let retenu: CGRect

        /// **Le texte est-il coupé PAR LE CADRAGE ?** On compare au VISIBLE :
        /// un texte que l'auteur a posé à moitié hors de la scène était déjà
        /// tronqué à la composition.
        var coupé: Bool {
            guard !visible.isNull, visible.height > 0 else { return false }
            return visible.minY < retenu.minY - 0.001 || visible.maxY > retenu.maxY + 0.001
        }
    }

    private func relevé(_ cas: Cas) throws -> Relevé {
        let doc = document(fondAspect: cas.fondAspect,
                           textes: [texte(cas.texte, x: cas.x, y: cas.y,
                                          scale: cas.scale, rotation: cas.rotation)])
        let scene = try XCTUnwrap(doc.scenes.first)
        let posé = enveloppe(du: try texteServi(doc))
        let fenêtre = SceneFraming.focus(scene: scene)
        let scèneEntière = CGRect(x: 0, y: 0, width: 1, height: 1)
        return Relevé(cas: cas,
                      cadre: SceneShape.frame(scene: scene),
                      fenêtre: fenêtre,
                      posé: posé,
                      visible: posé.intersection(scèneEntière),
                      retenu: fenêtre ?? scèneEntière)
    }

    /// La planche : trois fonds × deux longueurs × trois échelles × cinq
    /// rotations × quatre positions. Les positions balaient le centre, le haut,
    /// le bas et un hors-axe — c'est au BORD d'une bande qu'une devinette
    /// coupe, jamais au centre.
    private var planche: [Cas] {
        var cas: [Cas] = []
        let fonds: [(String, Double?)] = [("16:9", Self.paysage),
                                          ("0,60", Self.presqueVertical),
                                          ("9:16", Self.portrait),
                                          ("sans fond", nil)]
        let textes = [("court", "Salut"), ("long", "Bonjour le monde entier et tout ce qui va avec")]
        let positions: [(String, Double, Double)] = [("centre", 0.5, 0.5),
                                                     ("haut", 0.5, 0.20),
                                                     ("bas", 0.5, 0.85),
                                                     ("hors-axe", 0.28, 0.35)]
        for (nomFond, fondAspect) in fonds {
            for (nomTexte, contenu) in textes {
                for scale in [1.0, 2.0, 3.0] {
                    for rotation in [0.0, 15.0, 45.0, 90.0, -30.0] {
                        for (nomPos, x, y) in positions {
                            cas.append(Cas(libellé: "fond \(nomFond) · texte \(nomTexte) · ×\(scale) · \(Int(rotation))° · \(nomPos)",
                                           fondAspect: fondAspect,
                                           texte: contenu, x: x, y: y,
                                           scale: scale, rotation: rotation))
                        }
                    }
                }
            }
        }
        return cas
    }

    /// **LE témoin du lot : plus AUCUNE coupe n'est imputable à la rotation**
    /// (#7127).
    ///
    /// Un cas coupé dont le JUMEAU à 0° — mêmes fond, texte, échelle et
    /// position — ne l'est pas accuse la rotation, et elle seule. Avant le
    /// correctif ils étaient 13 sur 480 ; il n'en reste aucun.
    ///
    /// C'est la bonne forme d'assertion parce qu'elle est INDIFFÉRENTE à ce qui
    /// reste : la planche coupe encore 20 cas, tous déjà coupés sans pivot (un
    /// texte wrappé sur plusieurs lignes est plus haut que la marge devinée —
    /// #7128). Un témoin posé sur le total mêlerait deux défauts et rougirait
    /// pour le mauvais.
    func test_aucuneCoupe_nEstPlusImputableÀLaRotation() throws {
        var relevés: [String: Relevé] = [:]
        for cas in planche {
            relevés[clé(cas)] = try relevé(cas)
        }

        let imputables = relevés.values.filter { r in
            guard r.coupé, r.cas.rotation != 0 else { return false }
            guard let droit = relevés[cléÀPlat(r.cas)] else { return false }
            return !droit.coupé
        }

        let détail = imputables.prefix(8).map { r in
            String(format: "  %@ — posé y∈[%.3f, %.3f], retenu y∈[%.3f, %.3f]",
                   r.cas.libellé, r.posé.minY, r.posé.maxY, r.retenu.minY, r.retenu.maxY)
        }.joined(separator: "\n")
        XCTAssertTrue(imputables.isEmpty, """
        \(imputables.count) cas coupent un texte que leur jumeau SANS rotation garde entier :
        \(détail)
        """)
    }

    /// Clé d'un cas, et la MÊME clé avec la rotation remise à plat : c'est le
    /// couple qui isole ce que la rotation coûte.
    private func clé(_ c: Cas) -> String {
        "\(c.fondAspect.map { String(format: "%.3f", $0) } ?? "nil")|\(c.texte.count)|\(c.scale)|\(c.rotation)|\(c.x),\(c.y)"
    }

    private func cléÀPlat(_ c: Cas) -> String {
        "\(c.fondAspect.map { String(format: "%.3f", $0) } ?? "nil")|\(c.texte.count)|\(c.scale)|0.0|\(c.x),\(c.y)"
    }

    /// **Le cliquet de ce qui RESTE** — la dette de #7128, tenue à sa mesure.
    ///
    /// Elle est ici plutôt que dans l'issue parce qu'une dette qu'aucun témoin
    /// ne borne s'aggrave en silence : ce cliquet dit combien de cas coupent
    /// encore, de combien, et sous quelles conditions. **Trois propriétés
    /// STRUCTURELLES** l'accompagnent, et ce sont elles qui portent le sens —
    /// un compte seul dirait « 20 » sans dire de quoi.
    func test_cliquet_ceQuiCoupeEncore_estLeTexteWrappéÀGrandeÉchelle() throws {
        let relevés = try planche.map { try relevé($0) }
        let coupés = relevés.filter(\.coupé)

        XCTAssertTrue(coupés.allSatisfy { $0.cas.texte.count > 20 },
                      "seul le texte WRAPPÉ sur plusieurs lignes est coupé — jamais un texte court")
        XCTAssertTrue(coupés.allSatisfy { $0.cas.scale >= 2 },
                      "et jamais à l'échelle 1 : c'est la HAUTEUR des lignes qui déborde, pas l'objet")
        XCTAssertTrue(coupés.allSatisfy { $0.cas.fondAspect != Self.portrait },
                      "un fond au gabarit de la scène ne resserre rien, donc ne coupe rien")

        let perte = coupés.map { r -> CGFloat in
            max(0, r.retenu.minY - r.visible.minY) + max(0, r.visible.maxY - r.retenu.maxY)
        }.max() ?? 0
        XCTAssertLessThanOrEqual(coupés.count, 20,
                                 "cliquet #7128 : 59 avant le correctif de rotation, 20 après")
        XCTAssertLessThanOrEqual(perte, 0.09,
                                 "cliquet #7128 : la pire perte était 0,240 de la hauteur, elle est 0,084")
    }

    /// **Contre-épreuve du témoin ci-dessus** : il DOIT pouvoir tomber. Un
    /// texte dont l'enveloppe sort franchement d'une fenêtre resserrée est
    /// reconnu comme coupé — sans quoi le vert du témoin principal ne
    /// prouverait rien.
    func test_leTémoinSaitReconnaîtreUnTexteCoupé() throws {
        let cas = Cas(libellé: "contre-épreuve", fondAspect: Self.presqueVertical,
                      texte: "Bonjour le monde entier et tout ce qui va avec",
                      x: 0.5, y: 0.5, scale: 1, rotation: 0)
        let r = try relevé(cas)
        // On resserre à la main une fenêtre minuscule au centre : l'enveloppe du
        // texte la dépasse forcément, donc `coupé` doit le dire.
        let étroite = Relevé(cas: cas, cadre: r.cadre,
                             fenêtre: CGRect(x: 0, y: 0.49, width: 1, height: 0.02),
                             posé: r.posé, visible: r.visible,
                             retenu: CGRect(x: 0, y: 0.49, width: 1, height: 0.02))
        XCTAssertTrue(étroite.coupé,
                      "une fenêtre de 2 % de hauteur coupe un texte posé en son centre")

        // Et la MÊME mécanique ne crie pas sur une fenêtre qui contient tout :
        // sans ce second côté, `coupé` pourrait être vrai par construction.
        let large = Relevé(cas: cas, cadre: r.cadre,
                           fenêtre: CGRect(x: 0, y: 0, width: 1, height: 1),
                           posé: r.posé, visible: r.visible,
                           retenu: CGRect(x: 0, y: 0, width: 1, height: 1))
        XCTAssertFalse(large.coupé, "la scène entière ne coupe rien")
    }

    // MARK: - 3 · La planche de recette, imprimée

    /// **La recette que le porteur demande, en chiffres.** Elle n'assertit
    /// rien : elle IMPRIME ce que chaque combinaison produit, pour que le
    /// verdict soit lisible sans relancer la suite. Les assertions sont dans
    /// les témoins ci-dessus.
    func test_planche_imprimeCeQueChaqueCasDépose() throws {
        var lignes: [String] = [
            "cas | verdict loi | fenêtre y | posé y | visible y | coupé"
        ]
        for cas in planche {
            let r = try relevé(cas)
            let fenêtre = r.fenêtre.map { String(format: "[%.3f,%.3f]", $0.minY, $0.maxY) } ?? "—"
            lignes.append(String(format: "%@ | %@ | %@ | [%.3f,%.3f] | [%.3f,%.3f] | %@",
                                 cas.libellé,
                                 r.cadre.tightensAnything ? "bande" : "scène entière",
                                 fenêtre,
                                 r.posé.minY, r.posé.maxY,
                                 r.visible.isNull ? 0 : r.visible.minY,
                                 r.visible.isNull ? 0 : r.visible.maxY,
                                 r.coupé ? "OUI" : "non"))
        }
        print("=== PLANCHE 7127 ===\n" + lignes.joined(separator: "\n") + "\n=== FIN PLANCHE ===")
    }
}
