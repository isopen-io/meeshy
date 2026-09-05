import XCTest
import MeeshySDK
@testable import Meeshy

/// **Une publication à PLUSIEURS scènes, et chaque forme de canvas** (directive
/// porteur 2026-09-05).
///
/// > « Il faut essayer d'avoir des tests avec 4-5 scènes […] des tests de
/// > canvas sans image avec texte sticker dessin, avec fond couleur uniquement,
/// > sans fond coloré, avec musique de fond […] et les images doivent être
/// > rendues dans l'ordre. »
///
/// ## Pourquoi en TÉMOINS et pas au simulateur
///
/// Chacune de ces formes demande une composition manuelle — ouvrir le composer,
/// poser la matière, publier, relire le serveur. J'en ai fait une dizaine pour
/// un SEUL cas ce soir. Six formes × deux surfaces au doigt, c'est une soirée
/// pour une photographie ; en témoins, c'est une seconde et ça rougit à chaque
/// régression.
///
/// > Une passe manuelle prouve un INSTANT. Un témoin prouve un INVARIANT — et
/// > c'est l'invariant que le porteur demande : « assure-toi que ça sorte bien
/// > dans le FIL et dans la vue de détail ».
///
/// Ce que ces témoins couvrent est la loi que le lot d'aujourd'hui a posée :
/// **tout `postMediaId` d'un canvas publié appartient au post**. Ce qu'ils ne
/// couvrent pas — le rendu à l'œil — reste au simulateur, et c'est pourquoi
/// l'ORDRE est vérifié ici sur la donnée qui le porte.
final class CanvasMultiSceneAdoptionTests: XCTestCase {

    // MARK: - Fabriques

    private func media(_ id: String, postMediaId: String = "", background: Bool = false)
        -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: postMediaId, aspectRatio: 1, isBackground: background)
    }

    private func effets(_ objets: [StoryMediaObject]) -> StoryEffects {
        var e = StoryEffects()
        e.mediaObjects = objets
        return e
    }

    /// Une publication de `n` scènes, chacune avec son média de fond — la forme
    /// nominale d'un carrousel composé.
    private func scenesAvecMedia(_ n: Int) -> StoryEffects {
        effets((0..<n).map { media("obj-\($0)", background: true) })
    }

    // MARK: - 1. Plusieurs scènes, chacune adoptée

    /// **Cinq scènes, cinq médias, cinq adoptions.** Le cas que le porteur
    /// nomme : une publication à 4-5 scènes doit sortir entière.
    func test_cinqScenes_adoptentChacuneLeurMedia() {
        let avant = scenesAvecMedia(5)
        let ponts: [String?] = (0..<5).map { "obj-\($0)" }
        let ids = Dictionary(uniqueKeysWithValues: (0..<5).map { ($0, "srv-\($0)") })
        let urls = Dictionary(uniqueKeysWithValues: (0..<5).map { ($0, "u/\($0).jpg") })

        let apres = CanvasMediaAdoption.adopting(
            avant, objectIdsBySourceIndex: ponts,
            idsBySourceIndex: ids, urlsBySourceIndex: urls)

        XCTAssertEqual(apres?.mediaObjects?.map(\.postMediaId),
                       ["srv-0", "srv-1", "srv-2", "srv-3", "srv-4"])
        XCTAssertTrue(CanvasMediaAdoption.isCoherent(
            effects: apres ?? StoryEffects(), postMediaIds: (0..<5).map { "srv-\($0)" }))
    }

    /// **L'ORDRE est celui des fichiers, et il ne se mélange pas.** C'est la
    /// demande explicite du porteur — « les images doivent être rendues dans
    /// l'ordre » —, et c'est la donnée qui le porte : chaque objet reçoit l'id
    /// du fichier de SA position, jamais celui du voisin.
    ///
    /// Le témoin brouille délibérément l'ordre des PONTS pour prouver que
    /// l'appariement se fait par identifiant d'objet et non par rang de
    /// parcours : si la boucle se contentait de l'ordre, ce cas tomberait.
    func test_lOrdre_suitLeFichier_pasLeParcours() {
        let avant = effets([media("a", background: true), media("b"), media("c")])
        // position 0 → l'objet « c », position 2 → l'objet « a »
        let ponts: [String?] = ["c", "b", "a"]
        let ids = [0: "srv-c", 1: "srv-b", 2: "srv-a"]
        let urls = [0: "u/c.jpg", 1: "u/b.jpg", 2: "u/a.jpg"]

        let apres = CanvasMediaAdoption.adopting(
            avant, objectIdsBySourceIndex: ponts, idsBySourceIndex: ids, urlsBySourceIndex: urls)

        let parId = Dictionary(uniqueKeysWithValues:
            (apres?.mediaObjects ?? []).map { ($0.id, $0.postMediaId) })
        XCTAssertEqual(parId["a"], "srv-a", "l'objet `a` prend l'id de SA position, la 2")
        XCTAssertEqual(parId["b"], "srv-b")
        XCTAssertEqual(parId["c"], "srv-c", "…et `c` celui de la 0, pas celui du premier objet")
    }

    /// **Un fichier sauté ne décale pas les suivants.** Un upload qui échoue
    /// est passé (best-effort) ; l'index d'origine s'enregistre au lieu de se
    /// déduire d'une longueur. Sans cela, l'image 3 porterait la légende et
    /// l'identité de l'image 2.
    func test_unFichierSaute_neDecalePasLesSuivants() {
        let avant = scenesAvecMedia(3)
        let ponts: [String?] = ["obj-0", "obj-1", "obj-2"]
        // le fichier d'index 1 n'a pas été téléversé
        let ids = [0: "srv-0", 2: "srv-2"]
        let urls = [0: "u/0.jpg", 2: "u/2.jpg"]

        let apres = CanvasMediaAdoption.adopting(
            avant, objectIdsBySourceIndex: ponts, idsBySourceIndex: ids, urlsBySourceIndex: urls)

        XCTAssertEqual(apres?.mediaObjects?.map(\.postMediaId), ["srv-0", "", "srv-2"],
                       "le trou reste un trou — il ne se comble pas avec le voisin")
        XCTAssertTrue(CanvasMediaAdoption.isCoherent(
            effects: apres ?? StoryEffects(), postMediaIds: ["srv-0", "srv-2"]),
                      "un objet sans identité n'est pas un orphelin : il est journalisé en amont")
    }

    // MARK: - 2. Les formes SANS média

    /// **Texte, sticker, dessin — aucun média, donc rien à adopter, et surtout
    /// rien à casser.** Ces canvas se publiaient CORRECTEMENT pendant que celui
    /// à photo se peignait blanc : c'est précisément ce qui a masqué le défaut
    /// pendant des jours.
    func test_unCanvasSansMedia_traverseIntact() {
        var texteSeul = StoryEffects()
        texteSeul.background = "#101828"

        let apres = CanvasMediaAdoption.adopting(
            texteSeul, objectIdsBySourceIndex: [], idsBySourceIndex: [:], urlsBySourceIndex: [:])

        XCTAssertEqual(apres?.background, "#101828", "le fond de COULEUR survit")
        XCTAssertTrue(CanvasMediaAdoption.isCoherent(
            effects: apres ?? StoryEffects(), postMediaIds: []))
    }

    /// **Un fond de couleur seul, sans le moindre fichier.** Le post n'a aucun
    /// média : la cohérence est vraie par vacuité, et le canvas doit sortir
    /// avec sa couleur.
    func test_fondCouleurSeul_sansAucunFichier() {
        var couleur = StoryEffects()
        couleur.background = "#FF5A5F"
        couleur.mediaObjects = []

        let apres = CanvasMediaAdoption.adopting(
            couleur, objectIdsBySourceIndex: nil, idsBySourceIndex: [:], urlsBySourceIndex: [:])

        XCTAssertEqual(apres?.background, "#FF5A5F")
        XCTAssertTrue(CanvasMediaAdoption.orphanIds(
            in: apres ?? StoryEffects(), postMediaIds: []).isEmpty)
    }

    /// **Sans fond du tout** — ni couleur ni image. Rien ne doit être inventé.
    func test_sansAucunFond_rienNEstInvente() {
        let vide = StoryEffects()
        let apres = CanvasMediaAdoption.adopting(
            vide, objectIdsBySourceIndex: ["obj-absent"],
            idsBySourceIndex: [0: "srv-0"], urlsBySourceIndex: [0: "u/0.jpg"])

        XCTAssertNil(apres?.background)
        XCTAssertTrue((apres?.mediaObjects ?? []).isEmpty,
                      "un pont qui ne désigne aucun objet ne FABRIQUE pas d'objet")
    }

    // MARK: - 3. Ce que l'adoption ne doit PAS toucher

    /// **La musique de fond survit à l'adoption.** Elle vit sur un autre champ
    /// (`backgroundAudioVariants`) et n'a rien à voir avec les médias visuels —
    /// mais une adoption qui reconstruirait les effets au lieu de les MUTER la
    /// perdrait en silence, et le canvas partirait muet.
    func test_laMusiqueDeFond_survitALAdoption() {
        var avecSon = scenesAvecMedia(2)
        avecSon.backgroundAudioId = "sound-42"
        avecSon.backgroundAudioStart = 3.5

        let apres = CanvasMediaAdoption.adopting(
            avecSon, objectIdsBySourceIndex: ["obj-0", "obj-1"],
            idsBySourceIndex: [0: "srv-0", 1: "srv-1"],
            urlsBySourceIndex: [0: "u/0.jpg", 1: "u/1.jpg"])

        XCTAssertEqual(apres?.backgroundAudioId, "sound-42",
                       "adopter les IMAGES ne touche pas au SON")
        XCTAssertEqual(apres?.backgroundAudioStart, 3.5)
        XCTAssertEqual(apres?.mediaObjects?.map(\.postMediaId), ["srv-0", "srv-1"])
    }

    /// **Un objet DÉJÀ correct n'est pas retouché.** Le cas d'une re-publication
    /// ou d'une édition : ce que le pont ne désigne pas reste tel quel plutôt
    /// que d'être vidé. Effacer ce qu'on ne sait pas remplacer transforme un
    /// doute en perte.
    func test_unObjetHorsDuPont_resteIntact() {
        let avant = effets([media("connu", background: true),
                            media("inconnu", postMediaId: "deja-bon")])

        let apres = CanvasMediaAdoption.adopting(
            avant, objectIdsBySourceIndex: ["connu"],
            idsBySourceIndex: [0: "srv-0"], urlsBySourceIndex: [0: "u/0.jpg"])

        let parId = Dictionary(uniqueKeysWithValues:
            (apres?.mediaObjects ?? []).map { ($0.id, $0.postMediaId) })
        XCTAssertEqual(parId["connu"], "srv-0")
        XCTAssertEqual(parId["inconnu"], "deja-bon", "ce que le pont ignore n'est pas effacé")
    }
}
