import XCTest
import CoreGraphics
@testable import MeeshySDK

/// **Ce que laisse voir un média AJUSTÉ dans une scène figée en 9:16.**
///
/// La scène ne suit plus la forme de son fond (`d75c471d78`). Un média paysage
/// affiché AJUSTÉ n'occupe donc qu'une tranche du canvas, et l'auteur peut
/// écrire, coller et dessiner dans les bandes qui restent : ce sont des pixels
/// que la publication emporte, pas un défaut de cadrage.
///
/// La règle est pure et rend des VALEURS — une épaisseur, un verdict, une liste
/// ordonnée de sources. Ce qui les peint est l'affaire du `CALayer`.
final class StoryLetterboxFillTests: XCTestCase {

    private let scene = CGSize(width: 1080, height: 1920)   // 9:16

    // MARK: - L'épaisseur des bandes

    /// **Le cas de la directive** : un 16:9 dans une scène verticale.
    func test_unMediaPAYSAGE_laisseDeuxBandesHorizontales() {
        let bandes = StoryLetterboxFill.bands(media: CGSize(width: 1920, height: 1080),
                                              canvas: scene)
        guard case .horizontal(let epaisseur) = bandes else {
            return XCTFail("attendu des bandes horizontales, obtenu \(bandes)")
        }
        // 1080 de large ⇒ le média rend 607,5 de haut ; il reste 1312,5 à
        // partager en deux.
        XCTAssertEqual(epaisseur, 656.25, accuracy: 0.5)
    }

    /// La jumelle, et il faut les deux : un média PLUS vertical que la scène
    /// laisse des bandes sur les CÔTÉS. Une règle qui ne verrait que le premier
    /// cas serait juste sur la directive et fausse sur un panorama tourné.
    func test_unMediaPlusVERTICALqueLaScene_laisseDeuxBandesLaterales() {
        let bandes = StoryLetterboxFill.bands(media: CGSize(width: 500, height: 1920),
                                              canvas: scene)
        guard case .vertical(let epaisseur) = bandes else {
            return XCTFail("attendu des bandes verticales, obtenu \(bandes)")
        }
        XCTAssertEqual(epaisseur, 290, accuracy: 0.5)
    }

    /// **Un média À LA FORME de la scène ne laisse rien**, et c'est le fusible
    /// des deux témoins ci-dessus : une règle qui rendrait toujours une bande
    /// les passerait tous les deux en peignant un flou que personne ne voit.
    func test_unMediaDejaEn9x16_neLaisseAucuneBande() {
        XCTAssertEqual(
            StoryLetterboxFill.bands(media: CGSize(width: 1080, height: 1920), canvas: scene),
            .none)
    }

    /// Un demi-point de bande est un artefact d'arrondi, pas une surface de
    /// composition : l'habiller ferait payer un `CALayer` pour rien.
    func test_uneBandeSOUS_leSeuil_neComptePas() {
        let presque = CGSize(width: 1080, height: 1919)
        XCTAssertEqual(StoryLetterboxFill.bands(media: presque, canvas: scene), .none)
    }

    /// Une taille dégénérée ne fabrique pas une bande infinie.
    func test_uneTailleNULLE_neDivisePasParZero() {
        XCTAssertEqual(StoryLetterboxFill.bands(media: .zero, canvas: scene), .none)
        XCTAssertEqual(StoryLetterboxFill.bands(media: scene, canvas: .zero), .none)
    }

    // MARK: - Quand le remplissage est servi

    /// **Le mode LIBRE remplit le canvas — il n'y a rien à habiller.** C'est le
    /// défaut, donc le cas de l'écrasante majorité des scènes : y poser un layer
    /// serait un coût pur (loi 8).
    func test_leRemplissage_neSertQuEnModeAJUSTE() {
        XCTAssertTrue(StoryLetterboxFill.isServed(fitMode: "fit", hasSource: true))
        XCTAssertFalse(StoryLetterboxFill.isServed(fitMode: "fill", hasSource: true))
        XCTAssertFalse(StoryLetterboxFill.isServed(fitMode: nil, hasSource: true))
    }

    /// Sans source, la bande garde le noir cinéma du canvas — jamais un
    /// rectangle fabriqué.
    func test_sansSource_leRemplissageNeSertPas() {
        XCTAssertFalse(StoryLetterboxFill.isServed(fitMode: "fit", hasSource: false))
    }

    // MARK: - Avec QUOI on peint

    /// **Le défaut mesuré au simulateur, le jour même de l'écriture de cette
    /// règle.** Une photo paysage choisie dans la photothèque, passée en
    /// AJUSTÉ : bande NUE. `StoryThumbHashEnricher` ne calcule les hachages
    /// qu'à la PUBLICATION — un média que l'auteur vient de poser n'en a
    /// aucun. Une règle qui n'accepte que le hachage est donc inerte
    /// exactement là où elle a été demandée.
    ///
    /// > La question « qui AFFICHE ce que je viens de résoudre ? » a une
    /// > jumelle qu'on oublie plus souvent : **« qui ALIMENTE ce que je viens
    /// > de résoudre, et à quel moment ? »** Une source qui n'arrive qu'après
    /// > la publication est absente de toute la composition.
    func test_sansAucunHachage_leBitmapDejaStampePeintLaBande() {
        XCTAssertEqual(
            StoryLetterboxFill.source(hasStampedBitmap: true, hashes: []),
            .stampedBitmap,
            "l'atelier n'a QUE le bitmap — une règle qui l'ignore n'y peint rien")
    }

    /// Le bitmap PASSE DEVANT le hachage quand les deux existent : il est en
    /// mémoire, il est exact, et le hachage n'en est qu'une approximation.
    func test_leBitmap_passeDevantLeHachage() {
        XCTAssertEqual(
            StoryLetterboxFill.source(hasStampedBitmap: true, hashes: ["fond"]),
            .stampedBitmap)
    }

    /// Le hachage garde le DÉMARRAGE À FROID du lecteur — le seul moment où le
    /// bitmap n'est pas encore là, et celui où quelques dizaines d'octets
    /// valent une image entière.
    func test_sansBitmap_leHachagePeintLaBande() {
        XCTAssertEqual(
            StoryLetterboxFill.source(hasStampedBitmap: false, hashes: ["", "fond"]),
            .thumbHash("fond"),
            "…et une source vide n'est pas une source")
    }

    /// **Le fusible.** Une règle qui rendrait toujours une source ferait poser
    /// un layer vide sur chaque scène ajustée.
    func test_sansRien_aucuneSource() {
        XCTAssertEqual(StoryLetterboxFill.source(hasStampedBitmap: false, hashes: []), .none)
        XCTAssertEqual(StoryLetterboxFill.source(hasStampedBitmap: false, hashes: ["", ""]), .none)
    }

    // MARK: - La cascade des sources

    private func media(_ id: String, hash: String?,
                       background: Bool = false, z: Int = 0) -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: "pm-\(id)", kind: .image,
                         aspectRatio: 16.0 / 9.0,
                         isBackground: background, zIndex: z, thumbHash: hash)
    }

    func test_leFondPasseEnPREMIER() {
        var effets = StoryEffects()
        effets.thumbHash = "slide"
        effets.mediaObjects = [media("fg", hash: "avant", z: 9),
                               media("bg", hash: "fond", background: true)]

        XCTAssertEqual(StoryLetterboxFill.candidateHashes(effects: effets).first, "fond",
                       "c'est le fond qu'on encadre — ses pixels touchent la bande")
    }

    /// **Sans fond, les collages de premier plan servent** — « inclure ceux des
    /// médias ajoutés en foreground si nécessaire ». Le plus HAUT d'abord :
    /// c'est lui qui donne la teinte de la scène.
    func test_sansFond_lesCollagesDePremierPlanServent_leePlusHautDAbord() {
        var effets = StoryEffects()
        effets.mediaObjects = [media("bas", hash: "dessous", z: 1),
                               media("haut", hash: "dessus", z: 7)]

        XCTAssertEqual(StoryLetterboxFill.candidateHashes(effects: effets),
                       ["dessus", "dessous"])
    }

    /// Le composite de slide ferme la marche : il décrit la scène ENTIÈRE, donc
    /// il habille bien l'extérieur du canvas et mal l'intérieur d'une bande.
    func test_leCompositeDeSlide_estLeDernierRecours() {
        var effets = StoryEffects()
        effets.thumbHash = "slide"
        XCTAssertEqual(StoryLetterboxFill.candidateHashes(effects: effets), ["slide"])
    }

    /// **Le fusible de la cascade.** Une règle qui rendrait toujours une liste
    /// vide passerait les trois témoins d'ORDRE ci-dessus sans rien servir —
    /// et une qui rendrait des doublons ferait décoder deux fois la même image.
    func test_lesSourcesVidesEtLesDoublons_sontEcartes() {
        var effets = StoryEffects()
        effets.thumbHash = "meme"
        effets.mediaObjects = [media("bg", hash: "meme", background: true),
                               media("fg", hash: "", z: 3),
                               media("autre", hash: nil, z: 2)]

        XCTAssertEqual(StoryLetterboxFill.candidateHashes(effects: effets), ["meme"],
                       "une source vide n'est pas une source, et un doublon se décode deux fois")
    }

    func test_uneSceneSansAucunMedia_neRendAucuneSource() {
        XCTAssertTrue(StoryLetterboxFill.candidateHashes(effects: StoryEffects()).isEmpty)
    }
}
