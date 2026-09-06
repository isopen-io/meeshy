import XCTest
@testable import MeeshySDK

/// **Une publication à plusieurs slides part avec TOUTES ses scènes**
/// (directives porteur 2026-09-06).
///
/// ## Le défaut mesuré
///
/// Le fil, le détail et le plein écran savent tous montrer plusieurs scènes
/// depuis le 2026-09-06 — mosaïque, carrousel, défilement vertical, tuile qui
/// ouvre SA scène. **Aucune de ces surfaces ne pouvait s'afficher** : le
/// composer publiait sa slide courante et rien d'autre.
///
/// > `CanvasV3(migrating:)` finissait sur `scenes: [scene]` — UNE slide entre,
/// > UNE scène sort. Composer trois slides, en publier une. Le contrat en
/// > autorise dix (`canvas-v3.ts`, `scenes.min(1).max(10)`) depuis le début.
///
/// C'est la forme la plus coûteuse du défaut « une vue sans consommateur » :
/// quatre surfaces livrées, testées, correctes, et rien à leur donner à
/// peindre. Rien ne rougit — il n'y a pas de site où ça pourrait.
///
/// ## Pourquoi l'aller-retour est le témoin central
///
/// La file hors-ligne SÉRIALISE ce qui attend d'être publié, et le rejeu le
/// relit. Un encodage qui porterait dix scènes suivi d'un décodage qui n'en
/// garderait qu'une perdrait tout ce que ce lot ajoute — **au moment précis où
/// le réseau revient**, donc invisible en test manuel connecté.
final class CanvasV3MultiSceneTests: XCTestCase {

    /// Une slide qui porte un texte — assez pour qu'elle « porte quelque
    /// chose » au sens d'O3, donc pour qu'elle émette une scène.
    private func slide(_ texte: String) -> StoryEffects {
        var effets = StoryEffects()
        effets.textObjects = [StoryTextObject(id: "t-\(texte)", text: texte,
                                              x: 0.5, y: 0.5)]
        return effets
    }

    // MARK: - La migration

    /// **LE témoin du lot.** Trois slides composées, trois scènes publiées.
    func test_troisSlides_produisentTroisScenes() {
        let canvas = CanvasV3(migrating: [slide("un"), slide("deux"), slide("trois")])
        XCTAssertEqual(canvas.scenes.count, 3)
    }

    /// **Chaque scène porte une identité DISTINCTE.** La migration gravait
    /// `id: "s1"` en dur ; trois scènes homonymes rendraient l'identité de
    /// lecture du player ambiguë — `hostIdentity` la compose avec l'id de
    /// scène, et deux scènes identiques ne déclencheraient aucun
    /// `identityChanged` à l'avance.
    func test_lesScenes_neSePartagentPasUneIdentite() {
        let canvas = CanvasV3(migrating: [slide("un"), slide("deux"), slide("trois")])
        XCTAssertEqual(Set(canvas.scenes.map(\.id)).count, 3)
        XCTAssertEqual(canvas.scenes.first?.id, "s1",
                       "la PREMIÈRE garde son identité historique — le gateway et le " +
                       "golden partagé la gravent des deux côtés")
    }

    /// **Une slide vide n'émet pas de scène**, et les suivantes ne se décalent
    /// pas pour autant : la règle O3 vaut par slide, comme avant.
    func test_uneSlideVide_nEmetAucuneScene() {
        let canvas = CanvasV3(migrating: [slide("un"), StoryEffects(), slide("trois")])
        XCTAssertEqual(canvas.scenes.count, 2)
    }

    /// **Le plafond du contrat est tenu ICI**, avant le fil : `scenes.max(10)`.
    /// Un canvas de onze scènes serait refusé EN BLOC par la passerelle — donc
    /// la publication entière serait perdue, pas seulement sa onzième scène.
    func test_auDelaDuPlafond_leCanvasResteAcceptable() {
        let canvas = CanvasV3(migrating: (1...15).map { slide("s\($0)") })
        XCTAssertEqual(canvas.scenes.count, 10)
    }

    /// Le son appartient au DOCUMENT, pas à une scène : celui de la première
    /// slide qui en porte un gouverne toute la publication.
    func test_leSonDeFond_estCeluiDuDocument() {
        var avecSon = slide("deux")
        avecSon.backgroundAudioId = "track-42"
        let canvas = CanvasV3(migrating: [slide("un"), avecSon])
        XCTAssertEqual(canvas.sound?.source, .library(soundId: "track-42"))
    }

    /// La forme à UNE slide reste exactement ce qu'elle était — c'est ce qui
    /// permet à tout le corpus existant et aux stories de ne rien voir changer.
    func test_uneSeuleSlide_produitLeMemeCanvasQuAvant() {
        let une = slide("seule")
        XCTAssertEqual(CanvasV3(migrating: [une]), CanvasV3(migrating: une))
    }

    // MARK: - L'aller-retour du fil

    /// **Ce qui part revient.** La file hors-ligne encode puis relit ; sans
    /// cette fidélité, une publication différée perdrait ses scènes 2 à 10 au
    /// moment du rejeu — c'est-à-dire quand personne ne regarde.
    ///
    /// Le réservoir des scènes suivantes est `canvasV3`, la propriété que
    /// `init(from:)` remplit DÉJÀ à la lecture d'un document v3. Aucun champ
    /// n'est ajouté : le runtime décrit la slide COURANTE, le document mémorisé
    /// porte les autres.
    func test_lAllerRetour_conserveLesScenes() throws {
        var porteur = slide("un")
        porteur.canvasV3 = CanvasV3(migrating: [slide("un"), slide("deux"), slide("trois")])

        let data = try JSONEncoder().encode(porteur)
        let canvas = try JSONDecoder().decode(CanvasV3.self, from: data)
        XCTAssertEqual(canvas.scenes.count, 3, "l'encodage doit porter les trois scènes")

        let relu = try JSONDecoder().decode(StoryEffects.self, from: data)
        XCTAssertEqual(relu.canvasV3?.scenes.count, 3,
                       "le décodage doit RENDRE le document entier, sans quoi le " +
                       "réencodage de la file perdrait les scènes suivantes")

        let deuxiemeTour = try JSONDecoder().decode(CanvasV3.self,
                                                    from: try JSONEncoder().encode(relu))
        XCTAssertEqual(deuxiemeTour.scenes.count, 3,
                       "encoder → décoder → réencoder est ce que fait la file : " +
                       "le second tour doit valoir le premier")
    }

    /// **Éditer une publication à plusieurs scènes n'en détruit pas les
    /// autres.** C'est un défaut qui existait AVANT ce lot et que personne ne
    /// pouvait voir, faute de publication multi-scènes : rouvrir un post servi
    /// à trois scènes, changer son texte et renvoyer aurait émis UNE scène.
    ///
    /// Le runtime réécrit la PREMIÈRE ; les suivantes viennent du document.
    func test_editerLaPremiereScene_neDetruitPasLesSuivantes() throws {
        var porteur = slide("un")
        porteur.canvasV3 = CanvasV3(migrating: [slide("un"), slide("deux"), slide("trois")])
        porteur.textObjects = [StoryTextObject(id: "t-modifie", text: "un MODIFIÉ",
                                               x: 0.5, y: 0.5)]

        let canvas = try JSONDecoder().decode(CanvasV3.self,
                                              from: try JSONEncoder().encode(porteur))
        XCTAssertEqual(canvas.scenes.count, 3)
        let premierTexte = canvas.scenes.first?.objects.first { $0.kind == .text }
        guard case .string(let texte)? = premierTexte?.payload["text"] else {
            return XCTFail("la première scène doit porter le texte du runtime")
        }
        XCTAssertEqual(texte, "un MODIFIÉ",
                       "la scène 1 vient du RUNTIME — sinon l'édition ne partirait pas")
    }

    /// **La disposition choisie par l'auteur SURVIT à un réencodage.** Elle vit
    /// sur le document, que le runtime v1 n'exprime pas : la jeter à chaque
    /// aller-retour ramènerait silencieusement tout le monde au défaut.
    func test_laDisposition_surVitAuReencodage() throws {
        var porteur = slide("un")
        porteur.canvasV3 = CanvasV3(migrating: [slide("un"), slide("deux")], layout: .hero)
        let canvas = try JSONDecoder().decode(CanvasV3.self,
                                              from: try JSONEncoder().encode(porteur))
        XCTAssertEqual(canvas.layout, .hero)
    }

    /// Une publication d'une seule slide n'invente aucune scène — le réservoir
    /// vide ne fabrique pas de second cadre.
    func test_uneSlideSeule_nEmetQuUneScene() throws {
        let canvas = try JSONDecoder().decode(CanvasV3.self,
                                              from: try JSONEncoder().encode(slide("seule")))
        XCTAssertEqual(canvas.scenes.count, 1)
    }
}
