import XCTest
import SwiftUI
@testable import MeeshyUI

/// La vidéo exportée se consulte comme n'importe quelle vidéo (retour user
/// 2026-07-11) : présentation PLEIN ÉCRAN dès la fin de l'export, bouton
/// Enregistrer dans Photos avec états, partage standard.
@MainActor
final class TimelineExportPreviewTests: XCTestCase {

    // MARK: - Présentation

    func test_finishedExport_presentsFullscreen() {
        XCTAssertTrue(TimelineSheetContent.presentsFinishedExportFullscreen,
                      "L'export terminé se présente en fullScreenCover, pas en sheet")
    }

    // MARK: - Bouton Enregistrer (états)

    func test_saveIcon_perState() {
        XCTAssertEqual(TimelineExportPreviewSheet.saveIconName(for: .idle), "arrow.down.to.line")
        XCTAssertNil(TimelineExportPreviewSheet.saveIconName(for: .saving),
                     "En cours d'enregistrement : ProgressView, pas d'icône")
        XCTAssertEqual(TimelineExportPreviewSheet.saveIconName(for: .saved), "checkmark")
        XCTAssertEqual(TimelineExportPreviewSheet.saveIconName(for: .failed), "xmark")
    }

    func test_saveButton_disabled_whileSavingOrAlreadySaved() {
        XCTAssertFalse(TimelineExportPreviewSheet.isSaveDisabled(.idle))
        XCTAssertTrue(TimelineExportPreviewSheet.isSaveDisabled(.saving))
        XCTAssertTrue(TimelineExportPreviewSheet.isSaveDisabled(.saved),
                      "Déjà dans Photos — pas de double enregistrement")
        XCTAssertFalse(TimelineExportPreviewSheet.isSaveDisabled(.failed),
                       "Un échec doit rester réessayable")
    }

    // MARK: - Smoke

    func test_previewScreen_rendersBody() {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("preview-test-\(UUID().uuidString).mp4")
        let screen = TimelineExportPreviewSheet(url: url)
        _ = screen.body
    }
}
