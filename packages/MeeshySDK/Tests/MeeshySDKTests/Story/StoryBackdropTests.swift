import XCTest
@testable import MeeshySDK

/// **Le fond d'un média AJUSTÉ — le choix de l'auteur** (#8414, panneau Cadre
/// de la maquette plein écran, `docs/product/composer-plein-ecran/iPad.dc.html`).
///
/// Un média ajusté laisse des bandes. Elles se peignaient toujours du flou du
/// média ; l'auteur choisit désormais leur fond parmi cinq : flou, noir, blanc,
/// indigo, sable. Le contrat est COMMUN au web (`backgroundTransform.backdrop`),
/// d'où ses valeurs brutes et ses teintes figées ici.
final class StoryBackdropTests: XCTestCase {

    func test_lesCinqFonds_etLeurOrdre_sontCeuxDeLaMaquette() {
        XCTAssertEqual(StoryBackdrop.allCases.map(\.rawValue),
                       ["blur", "black", "white", "indigo", "sand"])
    }

    /// L'absence est le FLOU — le comportement d'avant le panneau, que toutes
    /// les scènes déjà publiées gardent sans migration.
    func test_labsenceEtUneValeurInconnue_rendentLeFlou() {
        XCTAssertEqual(StoryBackdrop.resolve(nil), .blur)
        XCTAssertEqual(StoryBackdrop.resolve("néon"), .blur)
        XCTAssertEqual(StoryBackdrop.resolve("sand"), .sand)
    }

    /// Les teintes du contrat commun avec le web — un écart ici ferait lire
    /// deux fonds différents à la même scène.
    func test_lesTeintes_sontCellesDuContratCommun() {
        XCTAssertNil(StoryBackdrop.blur.solidHex, "le flou n'est pas une teinte")
        XCTAssertEqual(StoryBackdrop.black.solidHex, "000000")
        XCTAssertEqual(StoryBackdrop.white.solidHex, "F5F5F4")
        XCTAssertEqual(StoryBackdrop.indigo.solidHex, "312E81")
        XCTAssertEqual(StoryBackdrop.sand.solidHex, "FDE68A")
    }

    /// Le choix voyage dans le transform du fond, à côté du cadrage, et y rend
    /// le transform NON neutre : sinon `isIdentity` le jetterait à l'écriture.
    func test_leFond_voyageDansLeTransform_etSurvitAuJSON() throws {
        let transform = StoryBackgroundTransform(videoFitMode: "fit", backdrop: "sand")
        XCTAssertFalse(transform.isIdentity)
        XCTAssertFalse(StoryBackgroundTransform(backdrop: "black").isIdentity)
        let relu = try JSONDecoder().decode(StoryBackgroundTransform.self,
                                            from: JSONEncoder().encode(transform))
        XCTAssertEqual(relu.backdrop, "sand")
        XCTAssertEqual(relu.videoFitMode, "fit")
    }
}
