import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **#4083 — écrire le style d'un texte depuis un IDENTIFIANT, pas depuis un
/// binding.**
///
/// `TextEditToolOptions` écrit la famille typographique par un
/// `@Binding var textObject` : juste pour un panneau qui POSSÈDE l'objet le
/// temps d'une édition, inutilisable pour la bande de spécimen, qui n'a qu'un
/// id et un rappel.
///
/// > Sans ce site, le spécimen aurait dû se fabriquer un binding — c'est-à-dire
/// > une SECONDE écriture du même champ, à faire diverger au premier effet de
/// > bord ajouté d'un côté.
@MainActor
final class StoryComposerTextStyleTests: XCTestCase {

    func test_updateTextStyle_ecritLaFamilleSurLObjetVise() {
        let vm = StoryComposerViewModel()
        var texte = StoryTextObject(id: "t1", text: "Bonjour")
        texte.textStyle = StoryTextStyle.classic.rawValue
        var autre = StoryTextObject(id: "t2", text: "Autre")
        autre.textStyle = StoryTextStyle.bold.rawValue
        vm.currentEffects.textObjects = [texte, autre]

        vm.updateTextStyle(id: "t1", style: .neon)

        XCTAssertEqual(vm.currentEffects.textObjects.first { $0.id == "t1" }?.parsedTextStyle, .neon)
        XCTAssertEqual(vm.currentEffects.textObjects.first { $0.id == "t2" }?.parsedTextStyle, .bold,
                       "Écrire sur un objet ne doit rien changer chez son voisin.")
    }

    /// Un identifiant inconnu ne crée rien et ne lève rien — même contrat que
    /// `updateTextContent` juste au-dessus dans la source. Deux écritures du
    /// même tableau qui se comporteraient différemment devant l'absence se
    /// relisent deux fois.
    func test_updateTextStyle_surUnIdentifiantInconnu_neFabriqueRien() {
        let vm = StoryComposerViewModel()
        vm.currentEffects.textObjects = [StoryTextObject(id: "t1", text: "Bonjour")]

        vm.updateTextStyle(id: "fantome", style: .neon)

        XCTAssertEqual(vm.currentEffects.textObjects.count, 1)
        XCTAssertEqual(vm.currentEffects.textObjects.first?.id, "t1")
    }

    /// Les dix-huit familles sont écrivables — le spécimen les offre toutes, et
    /// une famille qui ne s'écrirait pas serait une vignette inerte de plus.
    func test_lesDixHuitFamilles_seLaissentEcrire() {
        let vm = StoryComposerViewModel()
        vm.currentEffects.textObjects = [StoryTextObject(id: "t1", text: "Bonjour")]

        XCTAssertEqual(StoryTextStyle.allCases.count, 18)
        for style in StoryTextStyle.allCases {
            vm.updateTextStyle(id: "t1", style: style)
            XCTAssertEqual(vm.currentEffects.textObjects.first?.parsedTextStyle, style,
                           "La famille \(style.rawValue) ne s'écrit pas.")
        }
    }
}
