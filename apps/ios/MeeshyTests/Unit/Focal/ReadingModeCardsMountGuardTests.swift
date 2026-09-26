import XCTest
@testable import Meeshy

/// #8139 — la carte de conversation et la carte de visite se rendent dans
/// TOUS les modes de lecture, par UN point chacune.
///
/// Les modes qui rendent des messages ont deux hôtes de rangée, et deux
/// seulement : `BubbleStandardLayout` (Bulles) et `FocalRow` (Focal, Script,
/// Rivière — le Résumé ne rend aucune rangée de message, il rend un digest).
/// Chaque carte a UN point de rendu que les deux hôtes montent :
/// - la carte de conversation (et l'aperçu de lien, la façade vidéo) :
///   `BubbleLinkEmbed` ;
/// - la carte de visite (et toute pièce non visuelle) : `BubbleAttachmentView`,
///   qui aiguille vers `ContactCardView`.
///
/// La recette du 2026-09-26 a trouvé `BubbleLinkEmbed` monté par la seule
/// peau Bulles : en Focal (mode par défaut) un lien de conversation n'était
/// qu'un texte. Ce témoin lit les hôtes parce que la composition d'une vue
/// SwiftUI ne s'observe pas sans rendu (même contrat que
/// `FocalRowSourceGuardTests`).
@MainActor
final class ReadingModeCardsMountGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/\(relativePath)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private let rowHosts = [
        "Views/Bubble/BubbleStandardLayout.swift",
        "Focal/Row/FocalRow.swift",
    ]

    func test_rowHosts_everyReadingModeHost_mountsTheLinkEmbed() throws {
        for host in rowHosts {
            XCTAssertTrue(
                try source(host).contains("BubbleLinkEmbed("),
                "\(host) doit monter BubbleLinkEmbed : sans lui, un lien de conversation n'y est qu'un texte (#8139)"
            )
        }
    }

    func test_linkEmbed_isTheOnlySiteThatBuildsTheConversationCard() throws {
        for host in rowHosts + ["Focal/Row/FocalNonMediaBlock.swift"] {
            XCTAssertFalse(
                try source(host).contains("ConversationLinkCard("),
                "\(host) ne recopie pas la carte de conversation : elle passe par BubbleLinkEmbed"
            )
        }
    }

    func test_rowHosts_contactCard_goesThroughBubbleAttachmentView() throws {
        XCTAssertTrue(try source("Views/Bubble/BubbleStandardLayout.swift").contains("BubbleAttachmentView("))
        XCTAssertTrue(try source("Focal/Row/FocalNonMediaBlock.swift").contains("BubbleAttachmentView("))
        XCTAssertTrue(try source("Focal/Row/FocalRow.swift").contains("FocalNonMediaBlock("))
        XCTAssertTrue(
            try source("Views/Bubble/BubbleAttachmentView.swift").contains("ContactCardView("),
            "BubbleAttachmentView est le point unique qui aiguille une carte de visite vers ContactCardView"
        )
    }
}
