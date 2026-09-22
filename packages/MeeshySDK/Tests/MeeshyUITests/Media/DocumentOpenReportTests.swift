import XCTest
import SwiftUI
import UIKit
import MeeshySDK
@testable import MeeshyUI

/// #7362 — ouvrir un document depuis le fil remonte son OUVERTURE (`viewed`) :
/// c'est ce que l'onglet « Ouvert » de « Vu par » lit (`viewedAt`,
/// `viewCount`). Avant le lot, seul le bouton Enregistrer rapportait — et il
/// rapportait `downloaded`, que l'onglet ne compte pas comme une ouverture.
final class DocumentOpenReportTests: XCTestCase {

    func test_bodyForOpening_ownDocument_isSilent() {
        XCTAssertNil(DocumentOpenReport.bodyForOpening(isMine: true))
    }

    func test_bodyForOpening_receivedDocument_reportsViewed() {
        let body = DocumentOpenReport.bodyForOpening(isMine: false)
        XCTAssertEqual(body?.action, "viewed")
        XCTAssertEqual(body?.complete, true)
    }
}

/// Le chemin RÉEL : la fiche plein écran MONTÉE dans une fenêtre, le rapport
/// capté à l'entonnoir unique (`AttachmentStatusReporter.sink`). Une garde de
/// source dirait que l'appel est écrit ; celle-ci dit qu'il PART.
final class DocumentFullSheetOpenReportMountingTests: XCTestCase {

    private actor Captured {
        private(set) var actions: [String] = []
        func add(_ action: String) { actions.append(action) }
    }

    private var retainedWindows: [UIWindow] = []

    @MainActor
    private func mountSheet(attachmentId: String, isMe: Bool) {
        let attachment = MeeshyMessageAttachment(
            id: attachmentId,
            fileName: "rapport.pdf",
            mimeType: "application/pdf",
            fileUrl: ""
        )
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        window.rootViewController = UIHostingController(
            rootView: DocumentFullSheet(attachment: attachment, docType: .pdf, accentColor: "6366F1", isMe: isMe)
        )
        window.isHidden = false
        window.layoutIfNeeded()
        retainedWindows.append(window)
    }

    @MainActor
    private func actionsReported(for attachmentId: String, whileMounting isMe: Bool) async throws -> [String] {
        let captured = Captured()
        let previous = AttachmentStatusReporter.sink
        AttachmentStatusReporter.sink = { id, body in
            guard id == attachmentId else { return }
            await captured.add(body.action)
        }
        defer { AttachmentStatusReporter.sink = previous }

        mountSheet(attachmentId: attachmentId, isMe: isMe)
        for _ in 0..<25 {
            if await !captured.actions.isEmpty { break }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        return await captured.actions
    }

    @MainActor
    func test_mountingTheSheet_forAReceivedDocument_reportsItsOpening() async throws {
        let actions = try await actionsReported(for: "doc-open-7362-received", whileMounting: false)
        XCTAssertEqual(actions, ["viewed"])
    }

    @MainActor
    func test_mountingTheSheet_forOwnDocument_reportsNothing() async throws {
        let actions = try await actionsReported(for: "doc-open-7362-mine", whileMounting: true)
        XCTAssertEqual(actions, [])
    }
}
