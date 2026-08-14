import XCTest
@testable import Meeshy

/// Directive produit 2026-08-14 : « de manière générale c'est une
/// généralisation à faire sur l'application — lorsqu'on a une vue en
/// mouvement, cacher les boutons d'action ».
///
/// La loi vit dans le SDK (`ScrollMotion`, `packages/MeeshySDK/…/MeeshyUI/
/// Primitives/ScrollMotionVisibility.swift`) et se pose en deux moitiés :
/// une SOURCE publie le mouvement (`.scrollMotionActive`), les BOUTONS s'y
/// abonnent (`.hiddenWhileScrolling()`). Ces témoins vérifient que chaque
/// écran à liste porte bien les deux — une source sans abonné n'efface rien,
/// un abonné sans source ne revient jamais.
@MainActor
final class ScrollMotionGeneralizationTests: XCTestCase {

    private func viewSource(_ name: String) throws -> String {
        try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Views/
                .deletingLastPathComponent()   // Unit/
                .deletingLastPathComponent()   // MeeshyTests/
                .deletingLastPathComponent()   // ios/
                .appendingPathComponent("Meeshy/Features/Main/Views/\(name)"),
            encoding: .utf8
        )
    }

    private func assertWiresBothHalves(
        _ fileName: String,
        sourceExpression: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws {
        let source = try viewSource(fileName)
        XCTAssertTrue(
            source.contains(sourceExpression),
            "\(fileName) doit PUBLIER le mouvement de sa liste (\(sourceExpression))",
            file: file, line: line
        )
        XCTAssertTrue(
            source.contains(".hiddenWhileScrolling()"),
            "\(fileName) doit abonner ses boutons d'action à la loi commune",
            file: file, line: line
        )
    }

    /// Conversation : le vrai signal UIKit (drag / décélération) remonte des
    /// délégués `UIScrollView`, pas d'un offset à débouncer.
    func test_conversationHeader_wiresBothHalvesOfTheLaw() throws {
        try assertWiresBothHalves(
            "ConversationView.swift",
            sourceExpression: ".scrollMotionActive(hidesHeaderActionsForScroll)"
        )
    }

    /// Liste de conversations : `ScrollView` SwiftUI, seul l'offset est
    /// disponible — le relay le porte déjà jusqu'au header.
    func test_conversationListHeader_wiresBothHalvesOfTheLaw() throws {
        try assertWiresBothHalves(
            "ConversationListView+Overlays.swift",
            sourceExpression: ".scrollMotionActive(offset: scrollRelay.offset)"
        )
    }

    /// Feed : même famille que la liste, offset porté par un `@State`.
    func test_feedHeader_wiresBothHalvesOfTheLaw() throws {
        try assertWiresBothHalves(
            "FeedView.swift",
            sourceExpression: ".scrollMotionActive(offset: headerScrollOffset)"
        )
    }
}
