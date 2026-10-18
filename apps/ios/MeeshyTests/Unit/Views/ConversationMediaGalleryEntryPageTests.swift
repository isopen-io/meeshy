import SwiftUI
import UIKit
import XCTest
import MeeshySDK
@testable import Meeshy

/// **Taper la pièce de rang k ouvre le plein écran SUR la pièce de rang k** (#6686).
///
/// Recette du 2026-09-15 : sur un message à trois images, taper la deuxième
/// ouvrait le plein écran sur la PREMIÈRE, pendant que la barre de réponse citait
/// bien la deuxième. L'index tapé arrivait jusqu'au pager (`currentPageID`) ;
/// c'est le défilement qui ne s'y posait pas — `scrollPosition(id:)` n'honore pas
/// toujours la valeur posée avant la première mise en page.
///
/// Le témoin pose l'index d'entrée et lit la page RENDUE : quelle pièce occupe
/// l'écran, par le libellé que VoiceOver annonce (la légende de la pièce). Un
/// grep sur le paramètre transporté ne prouverait rien — c'est précisément le
/// paramètre qui arrivait.
@MainActor
final class ConversationMediaGalleryEntryPageTests: XCTestCase {

    private static let window = CGSize(width: 402, height: 874)
    private static let captions = ["Pièce jaune", "Pièce bleue", "Pièce verte"]

    /// Trois images SANS fichier distant — une empreinte seule : la page rend
    /// son image libellée sans réseau, donc sans l'état d'échec qui remplacerait
    /// le libellé par « média indisponible ».
    private static func lot() -> [MessageAttachment] {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let flat = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 48), format: format).image { context in
            UIColor(red: 0.31, green: 0.27, blue: 0.9, alpha: 1).setFill()
            context.cgContext.fill(CGRect(x: 0, y: 0, width: 64, height: 48))
        }
        let hash = flat.toThumbHash()
        return (0..<captions.count).map { index in
            MessageAttachment(
                id: "entry-piece-\(index)",
                mimeType: "image/jpeg",
                fileSize: 204_800,
                fileUrl: "",
                width: 1_600,
                height: 1_200,
                thumbHash: hash,
                uploadedBy: "u-fixture"
            )
        }
    }

    private static func visible(_ screen: RenderedScreen) -> [RenderedScreen.Node] {
        screen.nodes.filter { node in
            node.frame.width > 0 && node.frame.midX > 0 && node.frame.midX < window.width
        }
    }

    private static func shows(_ rank: Int, in nodes: [RenderedScreen.Node]) -> Bool {
        let labels = Set(nodes.compactMap(\.label))
        return labels.contains(captions[rank])
            && captions.enumerated().allSatisfy { $0.offset == rank || !labels.contains($0.element) }
    }

    func test_tappingThePieceOfRankK_opensTheFullscreenOnThatPiece_forEveryK() {
        let lot = Self.lot()
        let captionMap = Dictionary(uniqueKeysWithValues: zip(lot.map(\.id), Self.captions))

        for (rank, piece) in lot.enumerated() {
            let screen = RenderedScreen(
                ConversationMediaGalleryView(
                    allAttachments: lot,
                    startAttachmentId: piece.id,
                    accentColor: "6366F1",
                    captionMap: captionMap,
                    // La légende est au chrome, posé par le toucher (#10930).
                    entryPresentation: .carded
                ),
                size: Self.window
            )
            defer { screen.dismount() }

            // Le pager rejoint sa page après la première mise en page : on
            // attend l'écran STABLE (borné), puis on juge ce qu'il montre.
            var onScreen = Self.visible(screen)
            let deadline = Date().addingTimeInterval(5)
            while !Self.shows(rank, in: onScreen), Date() < deadline {
                RunLoop.current.run(until: Date().addingTimeInterval(0.05))
                onScreen = Self.visible(screen)
            }
            for (other, caption) in Self.captions.enumerated() where other != rank {
                XCTAssertFalse(
                    onScreen.contains { $0.label == caption },
                    "ouvert sur la pièce \(rank + 1), le plein écran montre « \(caption) » — la page rendue n'est pas celle tapée"
                )
            }
            XCTAssertTrue(
                onScreen.contains { $0.label == Self.captions[rank] },
                "ouvert sur la pièce \(rank + 1), « \(Self.captions[rank]) » n'est pas à l'écran — libellés vus : \(onScreen.compactMap(\.label))"
            )
        }
    }
}
