import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un canvas publié ne peut désigner que des médias que le post POSSÈDE**
/// (#5280).
///
/// ## Ce que ce témoin remplace
///
/// Rien — et c'est le point. Le défaut a vécu parce qu'AUCUN site ne pouvait
/// rougir : les deux fichiers existent, les deux requêtes répondent 200, le
/// canvas est bien formé et le post a bien un média. Il ne manquait qu'une
/// ÉGALITÉ entre deux identifiants, et une égalité qui n'est écrite nulle part
/// ne peut pas être fausse.
///
/// > **Un identifiant orphelin ne produit ni erreur, ni journal, ni rendu
/// > partiel : il produit du BLANC.** Le lecteur cherche l'id dans
/// > `post.media`, ne le trouve pas, et peint une scène vide — ce qui ressemble
/// > à un contenu que l'auteur n'aurait pas composé.
final class CanvasMediaAdoptionTests: XCTestCase {

    private func media(_ postMediaId: String, background: Bool = false) -> StoryMediaObject {
        StoryMediaObject(id: UUID().uuidString,
                         postMediaId: postMediaId,
                         aspectRatio: 1,
                         isBackground: background)
    }

    private func effects(_ objets: [StoryMediaObject]) -> StoryEffects {
        var e = StoryEffects()
        e.mediaObjects = objets
        return e
    }

    // MARK: - Le cas mesuré

    /// **La reproduction exacte du défaut de staging.** Le canvas désigne
    /// l'identité de la PRÉ-MONTÉE ; le post porte celle créée à la
    /// publication.
    func test_lIdentiteDeLaPreMontee_estUnOrphelin() {
        let canvas = effects([media("6a9c52c22fe27d0b04dda8d9", background: true)])

        XCTAssertEqual(
            CanvasMediaAdoption.orphanIds(in: canvas, postMediaIds: ["6a9c52e32fe27d0b04dda8da"]),
            ["6a9c52c22fe27d0b04dda8d9"],
            "Le canvas désigne une ligne PostMedia que le post ne possède pas — la scène "
            + "se peindra VIDE, sans qu'aucune requête n'échoue.")
        XCTAssertFalse(CanvasMediaAdoption.isCoherent(canvas, postMediaIds: ["autre"]))
    }

    /// Après l'adoption : le canvas et le post nomment la MÊME ligne.
    func test_apresAdoption_leCanvasEstCoherent() {
        let canvas = effects([media("m-1", background: true)])
        XCTAssertTrue(CanvasMediaAdoption.isCoherent(canvas, postMediaIds: ["m-1"]))
        XCTAssertTrue(CanvasMediaAdoption.orphanIds(in: canvas, postMediaIds: ["m-1"]).isEmpty)
    }

    /// **Le fond ET les premiers plans sont soumis à la même règle.** Le
    /// correctif du 2026-09-05 ne portait que sur le FOND — c'était le cas
    /// mesuré — et la boucle des premiers plans adopte déjà. Ce témoin dit que
    /// la règle ne connaît pas cette distinction : elle vaut pour tout objet.
    func test_laRegle_neDistinguePasLeFondDuPremierPlan() {
        let canvas = effects([media("bon", background: true), media("orphelin")])
        XCTAssertEqual(CanvasMediaAdoption.orphanIds(in: canvas, postMediaIds: ["bon"]),
                       ["orphelin"])
    }

    /// **Un `postMediaId` VIDE n'est pas un orphelin.** C'est un objet dont
    /// l'asset manquait à la publication — déjà journalisé
    /// (`publish foreground media asset missing`) et délibérément laissé hors
    /// de `mediaIds`. Le compter ici ferait rougir le témoin sur un cas que le
    /// code traite déjà, en connaissance de cause.
    func test_unIdentifiantVide_nEstPasUnOrphelin() {
        let canvas = effects([media(""), media("bon")])
        XCTAssertTrue(CanvasMediaAdoption.orphanIds(in: canvas, postMediaIds: ["bon"]).isEmpty)
    }

    /// Un canvas sans média (texte seul) est cohérent par construction — c'est
    /// la forme qui publiait CORRECTEMENT pendant que celle avec photo se
    /// peignait blanche, et qui a masqué le défaut sur tous les posts de test.
    func test_unCanvasDeTexteSeul_estCoherent() {
        XCTAssertTrue(CanvasMediaAdoption.isCoherent(StoryEffects(), postMediaIds: []))
    }
}

private extension CanvasMediaAdoption {
    static func isCoherent(_ effects: StoryEffects, postMediaIds: [String]) -> Bool {
        isCoherent(effects: effects, postMediaIds: postMediaIds)
    }
}
