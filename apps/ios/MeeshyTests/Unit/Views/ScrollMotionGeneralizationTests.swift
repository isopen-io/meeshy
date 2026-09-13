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

    /// **La loi se lit sur l'UNITÉ, pas sur un fichier.**
    ///
    /// Les deux moitiés — publier le mouvement, y abonner les boutons — n'ont
    /// aucune raison de vivre dans le même fichier, et depuis le 2026-09-13
    /// elles n'y vivent plus pour la conversation : la grappe a été extraite
    /// dans `ConversationExpandedHeaderBand.swift` (type nominal
    /// `ConversationHeaderActionsCluster`) pour cesser de peser sur la LARGEUR
    /// de la valeur `ConversationView`, cause du débordement de pile à
    /// l'ouverture (#6213 bis). La loi, elle, n'a pas bougé d'un pouce.
    ///
    /// > Un témoin qui lit UN fichier mesure un découpage autant qu'une règle.
    /// > Quand le code déménage, il n'a pas la décence de se taire : il affirme
    /// > que la loi a disparu.
    private func assertWiresBothHalves(
        _ fileName: String,
        sourceExpression: String,
        companions: [String] = [],
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws {
        let source = try ([fileName] + companions)
            .map { try viewSource($0) }
            .joined(separator: "\n")
        let unitName = ([fileName] + companions).joined(separator: " + ")
        XCTAssertTrue(
            source.contains(sourceExpression),
            "\(unitName) doit PUBLIER le mouvement de sa liste (\(sourceExpression))",
            file: file, line: line
        )
        XCTAssertTrue(
            source.contains(".hiddenWhileScrolling()"),
            "\(unitName) doit abonner ses boutons d'action à la loi commune",
            file: file, line: line
        )
    }

    /// Conversation : le vrai signal UIKit (drag / décélération) remonte des
    /// délégués `UIScrollView`, pas d'un offset à débouncer.
    func test_conversationHeader_wiresBothHalvesOfTheLaw() throws {
        // La valeur publiée s'appelle `hidesHeaderActions` DANS le type extrait,
        // et `ConversationView` la lui remet sous son nom d'origine
        // (`hidesHeaderActions: hidesHeaderActionsForScroll`). C'est la CHAÎNE
        // qui est gardée — l'hôte calcule, le type publie — et non l'orthographe
        // d'un seul maillon, qui changerait au prochain déplacement.
        try assertWiresBothHalves(
            "ConversationView.swift",
            sourceExpression: "hidesHeaderActions: hidesHeaderActionsForScroll",
            companions: ["ConversationExpandedHeaderBand.swift"]
        )
        let band = try viewSource("ConversationExpandedHeaderBand.swift")
        XCTAssertTrue(
            band.contains(".scrollMotionActive(hidesHeaderActions)"),
            "Le type nominal du header doit publier le mouvement à la loi commune."
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
