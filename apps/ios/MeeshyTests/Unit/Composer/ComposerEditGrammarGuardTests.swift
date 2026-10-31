import XCTest
@testable import Meeshy

/// **La garde cumulative de la grammaire d'édition** (#13974, spec
/// `2026-10-31-grammaire-edition-compositeur.md` § 2) : une option d'édition
/// n'a que trois places — le rail remplacé, des rails superposés par niveaux,
/// une feuille basse —, jamais un menu flottant ni le haut à droite. Chaque
/// lot y ajoute sa famille.
///
/// - I-E1 : le FOND image ou vidéo.
/// - I-E3 : l'IMAGE posée.
final class ComposerEditGrammarGuardTests: XCTestCase {

    private func composer(_ nom: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Composer/\(nom)"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    private func composerFolder() throws -> [(String, String)] {
        let dossier = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer")
        let noms = try FileManager.default.contentsOfDirectory(atPath: dossier.path).filter { $0.hasSuffix(".swift") }
        return try noms.map { nom in
            (nom, AppSourceGuard.stripComments(try String(contentsOf: dossier.appendingPathComponent(nom),
                                                          encoding: .utf8)))
        }
    }

    // MARK: - I-E1 : le fond

    func test_background_hasNoFloatingMenuLeft() throws {
        for (nom, code) in try composerFolder() {
            XCTAssertFalse(code.contains("ComposerBackgroundMenu"), "\(nom) : le menu du fond est parti")
            XCTAssertFalse(code.contains("backgroundMenuObjectId"), nom)
            XCTAssertFalse(code.contains("applyBackgroundMenu"), nom)
        }
        let menu = try composer("ComposerSceneMenu.swift")
        XCTAssertFalse(menu.contains("casebackground("), "le menu de verre ne sert plus le fond")
    }

    func test_background_longPress_selectsLikeTheTap() throws {
        let surfaces = try composer("MeeshyComposerHost+Surfaces.swift")
        XCTAssertTrue(surfaces.contains("onBackgroundMediaLongPressed:{selectSceneBackground($0)}"),
                      "l'appui long sur le fond le sélectionne, comme le toucher")
        let edition = try composer("MeeshyComposerHost+BackgroundEdit.swift")
        XCTAssertTrue(edition.contains("funcselectSceneBackground(_id:String){sceneSelectionRelay.selectSceneItem(id)"))
    }

    func test_background_replace_posesThenReplaces_onlyAtThePose() throws {
        let intake = try composer("MeeshyComposerHost+Intake.swift")
        XCTAssertTrue(intake.contains("ifletposeeParLeRail,!replaceBackgroundIfPending(with:poseeParLeRail){"),
                      "le média posé par « Remplacer » devient le fond")
        XCTAssertTrue(intake.contains("funcabandonRailPosing(){railPosesNextMedia=falsebackgroundReplacementId=nil"),
                      "un sélecteur parti sans rien rendre oublie le remplacement")
        let edition = try composer("MeeshyComposerHost+BackgroundEdit.swift")
        XCTAssertTrue(edition.contains("case.camera:host.sceneCaptureReplacesBackgroundId=idhost.armSceneCamera()"),
                      "la prise du viseur remplace le fond à la pose (#8716)")
    }

    func test_background_remove_isConfirmed_andGoesThroughTheRetraction() throws {
        let edition = try composer("MeeshyComposerHost+BackgroundEdit.swift")
        XCTAssertTrue(edition.contains("case.remove:host.backgroundSourcesAreOpen=falsehost.backgroundRemovalId=id"),
                      "Retirer demande d'abord confirmation")
        XCTAssertTrue(edition.contains("retractMedia(objectIds:[id])"), "le retrait passe par le meuble (#6577)")
        XCTAssertTrue(try composer("MeeshyComposerHost+SceneMenu.swift").contains("backgroundRemovalConfirmed("),
                      "la confirmation est montée sur la pile")
    }

    func test_background_putOnScene_togglesThePlane_neverAZIndex() throws {
        let edition = try composer("MeeshyComposerHost+BackgroundEdit.swift")
        XCTAssertTrue(edition.contains("case.putOnScene:host.backgroundSourcesAreOpen=falsehost.viewModel.toggleBackground(id:id)selectSceneItem(id)"))
    }

    // MARK: - I-E3 : l'image posée

    func test_placedImage_modifyIsTheLevelsOfTheTree_itsActionsGoThroughTheScene() throws {
        let relais = try composer("MeeshyComposerHost+BackgroundModify.swift")
        XCTAssertTrue(relais.contains("case.setAsBackground,.replaceBackground:performMediaExtra(.setAsBackground,on:id)"),
                      "Mettre en fond passe par makeSceneBackground, qui retire l'ancien fond")
        XCTAssertTrue(relais.contains("case.makeSticker:performMediaExtra(.makeSticker,on:id)"))
        let selection = try composer("MeeshyComposerHost+Selection.swift")
        XCTAssertTrue(selection.contains("case.mediaSheet:host.beginInlineEdit(id,purpose:.modify)"),
                      "Modifier d'une image reste sur la scène")
    }
}
