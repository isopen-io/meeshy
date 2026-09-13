import XCTest
@testable import Meeshy
import MeeshySDK

/// **La pastille CÂBLE la relance — sur les deux racines à la fois** (#5830).
///
/// `RootView` (iPhone) et `iPadRootView` montent des arbres différents ; un
/// geste écrit deux fois diverge, et la divergence ne rougit nulle part
/// (mesuré le 2026-09-08 sur « Publier un post », dont le drapeau n'avait de
/// lecteur que côté iPhone). La relance vit donc dans `ConnectionBanner`, le
/// seul étage que les deux racines montent — ces témoins interdisent qu'elle en
/// sorte.
@MainActor
final class SyncPillRetryWiringTests: XCTestCase {

    private func banniere() throws -> String {
        AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Components/ConnectionBanner.swift"))
    }

    func test_laBanniereMarqueLesLignesRelancables() throws {
        XCTAssertTrue(try banniere().contains("retryOutboxId: StuckPublicationRetry.retryableOutboxId(for: item)"),
                      "Sans cette marque, l'entrée reste inerte : `item.source` vaut `.unknown` pour "
                          + "une publication, et les deux racines répondaient `break`.")
    }

    func test_laBanniereBrancheLaction() throws {
        XCTAssertTrue(try banniere().contains("onRetry: { StuckPublicationRetry.retry(outboxId: $0) }"),
                      "Marquer l'entrée sans brancher l'action serait pire qu'aujourd'hui : "
                          + "l'indice VoiceOver promettrait une relance qui n'arrive pas.")
    }

    /// La règle vit sur `SyncPillEntry`, pas dans deux `if` de vue : c'est ce
    /// qui la rend jouable sans écran (cf. `StuckPublicationRetryTests`).
    func test_laPastilleDelegueLaDecisionAUneSeuleRegle() throws {
        let pastille = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Components/SyncPill.swift"))
        XCTAssertTrue(pastille.contains("switch entry.tapOutcome"))
        XCTAssertTrue(pastille.contains("switch visibleEntry?.tapOutcome"),
                      "L'indice VoiceOver et l'action doivent lire la MÊME règle — sinon la pastille "
                          + "annonce une chose et en fait une autre.")
    }
}
