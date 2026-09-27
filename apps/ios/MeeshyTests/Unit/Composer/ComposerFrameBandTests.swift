import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le panneau CADRE** (#8414, maquette plein écran `iPad.dc.html`) : un média
/// de fond se pose AJUSTÉ ou REMPLI, et les bandes d'un média ajusté prennent le
/// fond que l'auteur choisit — flou, noir, blanc, indigo, sable.
///
/// Il n'ajoute AUCUN bouton : la porte « Fond » l'ouvre dès que la scène a un
/// média de fond, là où une couleur n'aurait plus rien à peindre ; sans média,
/// elle garde sa palette.
final class ComposerFrameBandTests: XCTestCase {

    func test_laPorteFond_ouvreLeCadre_quandLaSceneAUnMediaDeFond() {
        XCTAssertEqual(ComposerSceneBand.forBackgroundDoor(hasBackgroundMedia: true), .frame)
        XCTAssertEqual(ComposerSceneBand.forBackgroundDoor(hasBackgroundMedia: false), .palette)
    }

    func test_leCadre_estUneBandeServie() {
        XCTAssertTrue(ComposerSceneCapabilities.bands.contains(.frame))
        XCTAssertEqual(ComposerSceneBand.opened(.frame, served: ComposerSceneCapabilities.bands), .frame)
    }

    /// **Choisir un fond AJUSTE la scène.** En REMPLI, le média couvre tout :
    /// un fond choisi n'aurait aucune bande où se voir, et le geste serait inerte.
    func test_choisirUnFond_ajusteLaScene_etGardeLeReste() {
        let depart = StoryBackgroundTransform(scale: 1.4, videoFitMode: "fill")
        let apres = ComposerFraming.applying(backdrop: .sand, to: depart)
        XCTAssertEqual(apres?.backdrop, "sand")
        XCTAssertEqual(apres?.videoFitMode, StoryBackgroundFraming.fit)
        XCTAssertEqual(apres?.scale, 1.4, "le cadrage n'emporte pas le zoom")
    }

    func test_choisirLeCadrage_nePerdPasLeFond() {
        let depart = StoryBackgroundTransform(videoFitMode: "fit", backdrop: "indigo")
        let apres = ComposerFraming.applying(fitMode: StoryBackgroundFraming.fill, to: depart)
        XCTAssertEqual(apres?.videoFitMode, "fill")
        XCTAssertEqual(apres?.backdrop, "indigo", "revenir en Ajuster retrouve le fond choisi")
    }

    /// Le cadrage lu par le panneau est celui que le RENDU applique : l'absence
    /// et toute valeur inconnue se rendent REMPLIES (`rendersFilled`), et le
    /// panneau doit dire ce que l'écran montre.
    func test_lePanneau_litLeCadrageRendu() {
        XCTAssertEqual(ComposerFraming.fitMode(of: nil), StoryBackgroundFraming.fill)
        XCTAssertEqual(ComposerFraming.fitMode(of: StoryBackgroundTransform(videoFitMode: "fit")), "fit")
        XCTAssertEqual(ComposerFraming.fitMode(of: StoryBackgroundTransform(videoFitMode: "fill")), "fill")
        XCTAssertEqual(ComposerFraming.backdrop(of: nil), .blur)
    }
}
