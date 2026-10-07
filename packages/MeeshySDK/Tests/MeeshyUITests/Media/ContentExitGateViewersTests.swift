import XCTest
import SwiftUI
import WebKit
import MeeshySDK
@testable import MeeshyUI

/// **Aucune visionneuse du SDK n'offre ni n'exécute une sortie sous un
/// portillon fermé** (#9573) — et le portillon est fermé tant qu'un hôte ne l'a
/// pas ouvert. Un témoin par surface : image, vidéo, document (boutons ET vue
/// web), code.
@MainActor
final class ContentExitGateViewersTests: XCTestCase {

    // MARK: - Le défaut

    func test_environment_defaultsToSealed_soAHostThatForgetsOpensNothing() {
        XCTAssertEqual(EnvironmentValues().contentExitGate, .sealed)
        XCTAssertFalse(EnvironmentValues().contentExitGate.mayLeave())
        XCTAssertFalse(EnvironmentValues().contentExitGate.mayLeave("a1"))
    }

    func test_environment_carriesWhatTheHostPoses() {
        var environment = EnvironmentValues()
        environment.contentExitGate = .only(["a1"])
        XCTAssertTrue(environment.contentExitGate.mayLeave("a1"))
        XCTAssertFalse(environment.contentExitGate.mayLeave("a2"))
    }

    // MARK: - Document : la vue web et tout ce qu'elle embarque

    func test_documentWebView_sealed_leavesNothingButReading() {
        let sealed = DocumentWebView.Interaction(mayLeave: false)
        XCTAssertFalse(sealed.selectsText, "ni sélection, ni Copier / Partager / Rechercher / Traduire")
        XCTAssertFalse(sealed.previewsLinks, "ni aperçu ni menu d'un lien à l'appui long")
        XCTAssertFalse(sealed.dragsContent, "ni glisser-déposer vers une autre application")
        let style = sealed.sealingStyle ?? ""
        for rule in ["user-select:none", "-webkit-touch-callout:none", "-webkit-user-drag:none"] {
            XCTAssertTrue(style.contains(rule), "\(rule) — le menu d'une image ou d'un texte à l'appui long")
        }
    }

    func test_documentWebView_open_keepsTheSystemBehaviour() {
        XCTAssertEqual(DocumentWebView.Interaction(mayLeave: true), .open)
        XCTAssertNil(DocumentWebView.Interaction.open.sealingStyle)
    }

    func test_documentWebView_sealed_configuresTheRealWebView() {
        let webView = DocumentWebView.makeWebView(mayLeave: false)
        XCTAssertFalse(webView.configuration.preferences.isTextInteractionEnabled)
        XCTAssertFalse(webView.allowsLinkPreview)
        XCTAssertEqual(webView.configuration.userContentController.userScripts.count, 1)
        XCTAssertTrue(webView.interactions.allSatisfy { !($0 is UIDragInteraction) })
        XCTAssertTrue(webView.scrollView.subviews.allSatisfy { view in
            view.interactions.allSatisfy { !($0 is UIDragInteraction) }
        }, "la vue de contenu ne garde aucune interaction de glisser")
    }

    func test_documentWebView_open_configuresNothing() {
        let webView = DocumentWebView.makeWebView(mayLeave: true)
        XCTAssertTrue(webView.configuration.preferences.isTextInteractionEnabled)
        XCTAssertTrue(webView.allowsLinkPreview)
        XCTAssertTrue(webView.configuration.userContentController.userScripts.isEmpty)
    }

    // MARK: - Chaque sortie passe par le portillon, bouton ET gestionnaire

    private func source(_ name: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent("Sources/MeeshyUI/Media/\(name)")
        let text = try String(contentsOf: url, encoding: .utf8)
        XCTAssertGreaterThan(text.count, 400, "\(name) introuvable — ce témoin ne mesurerait rien")
        return text.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_document_everyExitIsGated() throws {
        let code = try source("DocumentViewerView.swift")
        XCTAssertTrue(code.contains("if!attachment.fileUrl.isEmpty,exitGate.mayLeave(attachment.id){Button{exitGate.perform(attachment.id){"),
                      "Enregistrer : ni rendu ni exécuté sous un portillon fermé")
        XCTAssertTrue(code.contains("privatefuncsaveDocument(){guardexitGate.mayLeave(attachment.id),"),
                      "l'enregistrement direct refuse lui-même")
        XCTAssertTrue(code.contains("ifexitGate.mayLeave(attachment.id),leturlStr=attachment.fileUrl.isEmpty?nil:attachment.fileUrl,leturl=MeeshyConfig.resolveMediaURL(urlStr){ShareLink(item:url)"),
                      "Partager : la feuille système n'est pas montée")
        XCTAssertTrue(code.contains("DocumentWebView(url:url,mayLeave:exitGate.mayLeave(attachment.id))"),
                      "la vue web reçoit le verdict — sélection, menus et glisser compris")
        XCTAssertEqual(code.components(separatedBy: "ShareLink(").count - 1, 1, "une seule feuille de partage, celle qui est gardée")
        XCTAssertTrue(code.contains(".contentExitGate(exitGate)"), "la fiche présentée reçoit le portillon de la carte")
    }

    func test_code_copyIsGated() throws {
        let code = try source("CodeViewerView.swift")
        XCTAssertTrue(code.contains("ifletcode=codeContent,exitGate.mayLeave(attachment.id){Button{exitGate.perform(attachment.id){UIPasteboard.general.string=code"))
        XCTAssertEqual(code.components(separatedBy: "UIPasteboard").count - 1, 1, "une seule copie, celle qui est gardée")
        XCTAssertFalse(code.contains(".textSelection(.enabled)"), "le code affiché ne se sélectionne pas")
        XCTAssertTrue(code.contains(".contentExitGate(exitGate)"))
    }

    func test_image_saveIsGated() throws {
        let code = try source("ImageViewerView.swift")
        XCTAssertTrue(code.contains("ContentExitGated{saveButton}"), "le bouton n'est pas rendu")
        XCTAssertTrue(code.contains("exitGate.perform{ifletonSaveRequested{onSaveRequested()}else{saveToPhotos()}}"),
                      "le geste ne fait rien")
        XCTAssertTrue(code.contains("privatefuncsaveToPhotos(){guardexitGate.mayLeave(),leturl=imageUrlelse{return}"),
                      "l'enregistrement direct refuse lui-même")
        XCTAssertTrue(code.contains(".contentExitGate(exitGate)"), "le plein écran présenté reçoit le portillon de la vignette")
    }

    func test_video_saveAndShareAreGated() throws {
        let code = try source("MeeshyVideoPlayer+Controls.swift")
        XCTAssertTrue(code.contains("ifcontrols.contains(.share),onShare!=nil,exitGate.mayLeave(){"))
        XCTAssertTrue(code.contains("exitGate.perform{onShare?()}"))
        XCTAssertTrue(code.contains("ifcontrols.contains(.save),exitGate.mayLeave(){"))
        XCTAssertTrue(code.contains("exitGate.perform{onSave?()}"))
        XCTAssertEqual(code.components(separatedBy: "onSave?()").count - 1, 1, "aucun autre appel à l'enregistrement")
        XCTAssertEqual(code.components(separatedBy: "onShare?()").count - 1, 1, "aucun autre appel au partage")
    }
}
