import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// #8759 — « le bloc "Et maintenant ?" saute parfois, remonte et descend dans
/// la liste des conversations » (retour porteur 2026-09-29).
///
/// Le bloc des accès rapides (`listTail`) est posé JUSTE SOUS le pied de
/// pagination, dans la même `VStack`. Le pied changeait de HAUTEUR à chaque
/// changement d'état : 1 pt (sentinelle `.idle`), ~52 pt (spinner
/// `.loadingMore`), 0 pt (`.exhausted` d'une petite liste), ~48 pt
/// (`.exhausted` au-delà de 30), ~70 pt (`.error`). Or l'état bascule sans
/// geste de l'utilisateur : `reloadFromCache()` (chaque événement socket, le
/// retour d'avant-plan) le remet à `.idle`, la sentinelle réinsérée relance
/// `loadMore()` par son `onAppear`, le spinner pousse le bloc de ~51 pt vers
/// le bas, puis la page arrivée le fait remonter. Le bloc ne bougeait pas de
/// lui-même : il suivait la hauteur du pied.
///
/// La propriété gardée : le pied occupe la MÊME hauteur dans tous ses états.
@MainActor
final class ConversationPaginationFooterSlotTests: XCTestCase {

    private let deviceWidth: CGFloat = 402

    private func measuredHeight<V: View>(_ view: V) -> CGFloat {
        let host = UIHostingController(rootView: view)
        return host.sizeThatFits(in: CGSize(width: deviceWidth, height: .greatestFiniteMagnitude)).height
    }

    private func footer(_ state: PaginationState, hasMore: Bool = true, conversationCount: Int = 12) -> some View {
        ConversationPaginationFooterContent(
            state: state,
            hasMore: hasMore,
            conversationCount: conversationCount,
            onLoadMore: {}
        )
    }

    /// Fusible : le harnais distingue deux hauteurs différentes. Sans lui, une
    /// mesure qui rendrait toujours la même valeur passerait pour une preuve.
    func test_harness_seesTwoDifferentHeights() {
        XCTAssertNotEqual(
            measuredHeight(Color.red.frame(height: 1)),
            measuredHeight(Color.red.frame(height: 52)),
            accuracy: 0.5
        )
    }

    func test_footer_keepsOneHeight_acrossEveryPaginationState() {
        let heights: [(String, CGFloat)] = [
            ("idle + hasMore", measuredHeight(footer(.idle, hasMore: true))),
            ("idle + !hasMore", measuredHeight(footer(.idle, hasMore: false))),
            ("loadingMore", measuredHeight(footer(.loadingMore))),
            ("exhausted ≤ 30", measuredHeight(footer(.exhausted, conversationCount: 12))),
            ("exhausted > 30", measuredHeight(footer(.exhausted, conversationCount: 120))),
            ("error", measuredHeight(footer(.error("réseau")))),
        ]
        let reference = heights[0].1
        XCTAssertGreaterThan(reference, 0, "le pied doit réserver sa place, même invisible")
        for (label, height) in heights {
            XCTAssertEqual(height, reference, accuracy: 0.5,
                           "\(label) : \(height) pt au lieu de \(reference) pt — le bloc « Et maintenant ? » posé dessous sauterait de \(abs(height - reference)) pt")
        }
    }

    /// Le pied que la liste MONTE délègue à la vue mesurée ci-dessus — sinon le
    /// témoin garderait une vue que personne n'affiche.
    func test_mountedFooter_rendersTheMeasuredContent() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationListView+Rows.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        guard let start = code.range(of: "struct ConversationPaginationFooter: View {"),
              let end = code.range(of: "struct ConversationPaginationFooterContent", range: start.upperBound..<code.endIndex)
        else { return XCTFail("ConversationPaginationFooter introuvable") }
        XCTAssertTrue(code[start.upperBound..<end.lowerBound].contains("ConversationPaginationFooterContent("))
    }
}
