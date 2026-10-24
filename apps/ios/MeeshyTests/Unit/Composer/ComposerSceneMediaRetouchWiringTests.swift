import XCTest
@testable import Meeshy

/// #12590 — **les quatre portes de « Modifier » mènent à la retouche unique**, et la couverture
/// monte `ConversationPieceRetouch`, jamais l'éditeur de l'avatar. Une garde de source : le câblage
/// est dans des vues SwiftUI qu'un test unitaire ne monte pas.
final class ComposerSceneMediaRetouchWiringTests: XCTestCase {

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_editSceneItem_sendsAMediaToTheRetouche_andKeepsTheInlineEditAsFallback() throws {
        let code = try source("MeeshyComposerHost+SceneColumns.swift")
        XCTAssertTrue(code.contains("ifkind!=.media||!requestSceneMediaRetouch(id){beginInlineEdit(id)}"),
                      "le double toucher, « Modifier » du menu et de VoiceOver passent tous par editSceneItem")
    }

    func test_theBackgroundMenuEdit_sendsTheBackgroundToTheRetouche() throws {
        let code = try source("MeeshyComposerHost+BackgroundMenu.swift")
        XCTAssertTrue(code.contains("case.edit:if!requestSceneMediaRetouch(id){openObjectEditor(id)}"))
        XCTAssertTrue(code.contains("ComposerSceneMediaRetouchCover(request:$sceneMediaRetouch"),
                      "une seule présentation, montée à côté du menu du fond")
    }

    func test_theCover_mountsTheCameraRetouche_notTheAvatarEditor() throws {
        let code = try source("ComposerSceneMediaRetouch.swift")
        XCTAssertTrue(code.contains("ConversationPieceRetouch(source:demande.source"))
        XCTAssertFalse(code.contains("MeeshyImageEditorView"), "l'éditeur d'image ne sert plus que l'avatar")
    }

    func test_abandoningOrClosing_neverRemovesTheMediaFromTheStudio() throws {
        let code = try source("ComposerSceneMediaRetouch.swift")
        XCTAssertTrue(code.contains("onRemove:{request=nil}"))
        XCTAssertTrue(code.contains("onCancel:{request=nil}"))
        XCTAssertFalse(code.contains("retractMedia"))
        XCTAssertFalse(try source("MeeshyComposerHost+MediaRetouch.swift").contains("retractMedia"))
    }

    func test_done_swapsThroughTheMeubleRun_thenSweepsThePreUploads() throws {
        let code = try source("MeeshyComposerHost+MediaRetouch.swift")
        XCTAssertTrue(code.contains("ComposerMediaSwapRun.apply(objectId:objectId"))
        XCTAssertTrue(code.contains("startPendingPreUploads()"))
    }
}
