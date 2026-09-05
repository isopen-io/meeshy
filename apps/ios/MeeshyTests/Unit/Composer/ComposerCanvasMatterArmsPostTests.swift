import XCTest
@testable import Meeshy

/// **Un canvas SANS image doit armer la flèche d'un POST** (directive porteur
/// 2026-09-05 : « des tests de canvas sans image avec texte sticker dessin,
/// avec fond couleur uniquement »).
///
/// ## Le défaut mesuré
///
/// Au simulateur, sur staging : un fond de couleur + un texte posé sur la
/// scène, aucune image. Le composer peint la scène, le rail répond, le texte
/// s'édite — et « Publier » ne part pas. L'écran affichait « Ajoutez du texte,
/// une photo ou un lieu pour publier » au-dessus d'un canvas plein de travail.
///
/// La cause : le terme qui compte la matière d'une SCÈNE était verrouillé sur
/// `selectedFormat == .story`. Le doc-comment le disait délibéré (#4869), avec
/// une raison juste — ne pas armer une flèche dont le canal refuserait ensuite
/// — et une condition explicite : « seule la story publie par ce canal ».
///
/// ## Pourquoi la restriction est tombée
///
/// La condition a changé, et elle a été MESURÉE, pas supposée : `POST /posts`
/// sur la passerelle de staging accepte un corps à `content` vide, sans aucun
/// média, porté par son seul `storyEffects.canvasV3`, et rend le canvas
/// intact. Le canal du post livre donc ce que la flèche promettrait.
///
/// > **Une restriction survit à la condition qui la justifiait.** Le
/// > commentaire disait « il s'élargira le jour où… » ; ce jour était arrivé
/// > sans que rien ne le signale, parce qu'aucun témoin ne relie une garde de
/// > CLIENT à ce que le SERVEUR accepte. Devant une restriction datée, la
/// > question n'est pas « est-elle bien écrite ? » mais **« sa raison est-elle
/// > encore vraie ? »**.
///
/// ## Ce que ces témoins gardent
///
/// La règle passe par `ComposerPublishChannel` — story, post et status
/// s'arment parce que leur canal livre ; le réel reste dehors parce que le
/// sien est `.unsupported`. Une LISTE de formats aurait rendu le même verdict
/// aujourd'hui et se serait tue au format suivant.
final class ComposerCanvasMatterArmsPostTests: XCTestCase {

    private func socle() throws -> String {
        MyStoriesSourceCorpus.strippingComments(
            try MyStoriesSourceCorpus.text(
                of: "Meeshy/Features/Main/Composer/MeeshyComposerHost+Socle.swift"))
    }

    /// Le terme de matière de canvas ne se verrouille plus sur un format NOMMÉ.
    func test_laMatiereDuCanvas_nEstPlusVerrouilleeSurLaStory() throws {
        let source = try socle()
        XCTAssertFalse(
            source.contains("selectedFormat == .story\n                    && ComposerStoryCanvas.hasMatter"),
            "Un canvas de texte, de dessin ou à fond de couleur doit armer la flèche d'un POST : " +
            "verrouiller le terme sur `.story` laisse la flèche éteinte sur un écran plein de travail."
        )
    }

    /// …et il passe par le CANAL, seul juge de ce qui part réellement.
    func test_laMatiereDuCanvas_seLitAuCANAL_pasAUneListe() throws {
        let source = try socle()
        XCTAssertTrue(
            source.contains("ComposerPublishChannel.channel(for: selectedFormat) != .unsupported"),
            "Ce qui décide est le canal — un format dont le canal ne livre rien ne doit pas armer " +
            "la flèche, et un format neuf ne peut pas se glisser dans une liste sans être décidé."
        )
    }

    /// **Le réel reste dehors, et c'est la raison d'origine, intacte.** Son
    /// canal est `.unsupported` : armer sa flèche promettrait ce que rien ne
    /// livre — le défaut exact que #4869 évitait.
    func test_leReel_neSArmePas() {
        XCTAssertEqual(ComposerPublishChannel.channel(for: .reel), .unsupported,
                       "si le réel gagne un canal, ce témoin tombe — et c'est le bon moment " +
                       "pour relire l'élargissement plutôt que de le subir")
    }

    /// Les trois formats dont le canal livre s'arment, et le témoin le dit par
    /// leur canal plutôt qu'en les nommant une seconde fois.
    func test_lesFormatsQuiLivrent_sArment() {
        for format in [ComposerFormat.story, .post, .status] {
            XCTAssertNotEqual(ComposerPublishChannel.channel(for: format), .unsupported,
                              "\(format) publie : la matière de sa scène doit armer sa flèche")
        }
    }
}
