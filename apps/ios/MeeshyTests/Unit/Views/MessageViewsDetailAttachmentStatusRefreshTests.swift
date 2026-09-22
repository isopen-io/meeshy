import XCTest
@testable import Meeshy

/// I4 (#7360) — the same defect I3 (#7349) fixed for the "Vu par" text
/// tabs, one tab over: `MessageViewsDetailView`'s consumption cards
/// (« écouté jusqu'à », « Nx ») only loaded at `.onAppear`. Once a vocal's
/// info sheet was open, it stayed frozen even while the sole other
/// recipient listened to it in full — closing and reopening was the only
/// way to see the position bar and the count move.
///
/// `loadAttachmentStatuses()` has no `hasExisting` guard (only an in-flight
/// one — see its doc comment), so a live re-invocation is already a
/// refetch; the fix is wiring the subscription, not adding a `force` flag.
/// Mirrors the SOURCE-guard idiom `MessageViewsDetailLiveRefreshWiringTests`
/// already uses for `readStatusUpdated`: the view sits at the repo's
/// 1200-line budget, so a behavioral SwiftUI harness isn't where this lives
/// either — the guard proves the relay is wired to the right event, not
/// that a pixel moves.
@MainActor
final class MessageViewsDetailAttachmentStatusRefreshTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(
                "Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func bodyContent(in src: String) throws -> String {
        let marker = "var body: some View {"
        guard let start = src.range(of: marker) else {
            XCTFail("Signature de `body` introuvable — MessageViewsDetailView.swift a changé de forme.")
            throw XCTSkip("marker")
        }
        guard let end = src.range(of: "private var viewsTabContent: some View {",
                                  range: start.upperBound..<src.endIndex) else {
            XCTFail("Fin du corps de `body` introuvable — MessageViewsDetailView.swift a changé de forme.")
            throw XCTSkip("marker")
        }
        return String(src[start.upperBound..<end.lowerBound])
    }

    func test_readSourceIsNonEmpty() throws {
        XCTAssertGreaterThan(try source().count, 1000,
            "la garde lit un chemin FAUX si la source revient vide")
    }

    func test_body_subscribesToAttachmentStatusUpdated_forThisConversation_andReloads() throws {
        let body = try bodyContent(in: try source())

        XCTAssertTrue(body.contains("MessageSocketManager.shared.attachmentStatusUpdated"),
            "sans cet abonnement la fiche « Écouté » / « Vu » ne bouge qu'en la refermant — " +
            "c'est le critère de fin de #7360")
        XCTAssertTrue(body.contains("$0.conversationId == conversationId"),
            "l'événement est filtré par conversation : une fiche ne doit pas repartir " +
            "au réseau pour le fil d'à côté")
        XCTAssertTrue(body.contains("loadAttachmentStatuses()"),
            "le relais doit appeler la même fonction que `.onAppear` — " +
            "elle n'a pas de garde « déjà chargé », donc rien d'autre n'est requis pour rafraîchir")
    }
}
