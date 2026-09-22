import Foundation
import XCTest
@testable import Meeshy

/// #7365 — QUELLE valeur alimente les coches ✓/✓✓ et leur libellé VoiceOver
/// dans une bulle.
///
/// `content.meta.deliveryStatus` est déjà résolu, tout-ou-rien pour un
/// groupe, par `BubbleContentBuilder` via `DeliveryStatusResolver`
/// (verrouillé par `BubbleContentMatrixTests`). Trois sites relisaient
/// pourtant `message.deliveryStatus` BRUT au lieu de cette valeur résolue —
/// footer standard, libellé VoiceOver, footer sticker — reproduisant le même
/// défaut que la fiche « Vu par » (« Lu » pour 1 lecteur sur 10) à trois
/// endroits distincts, malgré une source déjà correcte deux couches plus
/// haut.
///
/// Rien de ceci ne rougit à l'exécution : `BubbleStandardLayout` a trop de
/// dépendances stockées pour s'instancier proprement en test (30+ propriétés,
/// closures), et `resolvedFooter()`/`deliveryStatusAccessibilityLabel` ne
/// sont d'ailleurs pas tous `internal`. Garde de SOURCE, même patron que
/// `BubbleEffectPerimeterSourceGuardTests` : appariée positif/négatif pour
/// qu'un changement de forme du motif recherché fasse rougir le témoin plutôt
/// que le rendre silencieusement inoffensif.
final class BubbleDeliveryStatusWiringSourceGuardTests: XCTestCase {

    private static let rawRead = "message.deliveryStatus"
    private static let resolvedRead = "content.meta.deliveryStatus"

    private var bubbleRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Bubble
            .deletingLastPathComponent()  // Views
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func strippedSource(_ relativePath: String) throws -> String {
        let url = bubbleRoot.appendingPathComponent(relativePath)
        let raw = try String(contentsOf: url, encoding: .utf8)
        let stripped = AppSourceGuard.stripComments(raw)

        XCTAssertFalse(
            stripped.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            "Balayage vide pour \(relativePath) : le fichier a bougé, ou le dépouillement a tout mangé."
        )
        return stripped
    }

    // MARK: - Footer standard (BubbleStandardLayout.resolvedFooter)

    func test_standardFooter_noLongerReadsRawDeliveryStatus() throws {
        let source = try strippedSource("Bubble/BubbleStandardLayout.swift")

        XCTAssertFalse(
            source.contains("deliveryStatus: \(Self.rawRead),"),
            "`resolvedFooter()` repose `deliveryStatus: message.deliveryStatus,` — le footer "
            + "affiche à nouveau le statut BRUT, faux dès qu'un groupe a un lecteur sur N."
        )
    }

    func test_standardFooter_readsResolvedDeliveryStatus() throws {
        let source = try strippedSource("Bubble/BubbleStandardLayout.swift")

        XCTAssertTrue(
            source.contains("deliveryStatus: \(Self.resolvedRead)"),
            "`resolvedFooter()` ne pose plus `deliveryStatus: content.meta.deliveryStatus` — "
            + "le footer doit lire la valeur déjà résolue par `BubbleContentBuilder`."
        )
    }

    // MARK: - VoiceOver (BubbleStandardLayout.deliveryStatusAccessibilityLabel)

    func test_accessibilityLabel_noLongerSwitchesOnRawDeliveryStatus() throws {
        let source = try strippedSource("Bubble/BubbleStandardLayout.swift")

        XCTAssertFalse(
            source.contains("switch \(Self.rawRead) {"),
            "`deliveryStatusAccessibilityLabel` reswitch sur `message.deliveryStatus` — VoiceOver "
            + "annoncerait « lu » pour 1 lecteur sur 10."
        )
    }

    func test_accessibilityLabel_switchesOnResolvedDeliveryStatus() throws {
        let source = try strippedSource("Bubble/BubbleStandardLayout.swift")

        XCTAssertTrue(
            source.contains("switch \(Self.resolvedRead) {"),
            "`deliveryStatusAccessibilityLabel` ne switch plus sur `content.meta.deliveryStatus` — "
            + "VoiceOver doit annoncer le statut RÉSOLU, pas le brut."
        )
    }

    // MARK: - Sticker (ThemedMessageBubble.stickerLayout)

    func test_stickerFooter_noLongerReadsRawDeliveryStatus() throws {
        let source = try strippedSource("ThemedMessageBubble.swift")

        XCTAssertFalse(
            source.contains("deliveryStatus: \(Self.rawRead),"),
            "`stickerLayout` repose `deliveryStatus: message.deliveryStatus,` — la coche d'un "
            + "sticker resterait fausse pour un groupe, alors que `content: BubbleContent` (déjà "
            + "résolu) est un paramètre de la fonction."
        )
    }

    func test_stickerFooter_readsResolvedDeliveryStatus() throws {
        let source = try strippedSource("ThemedMessageBubble.swift")

        XCTAssertTrue(
            source.contains("deliveryStatus: \(Self.resolvedRead)"),
            "`stickerLayout` ne pose plus `deliveryStatus: content.meta.deliveryStatus` — doit "
            + "réutiliser le `content` déjà résolu plutôt que relire le message brut."
        )
    }
}
