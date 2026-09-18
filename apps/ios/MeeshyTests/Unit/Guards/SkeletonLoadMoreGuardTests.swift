import XCTest

/// **Pendant que la page suivante arrive, le fil montre des CARTES, pas un
/// spinner sous du fond nu** (#6987).
///
/// `SkeletonColdStartGuardTests` garde le démarrage à froid ; personne ne
/// gardait la PAGINATION. Un lecteur qui atteint la fin des posts chargés
/// avant la page suivante voyait un `ProgressView` de 20 pt puis du fond de
/// page là où des cartes vont apparaître — le porteur : « montrer une vue de
/// chargement avec des cards en préchargement plutôt qu'une page blanche ».
final class SkeletonLoadMoreGuardTests: XCTestCase {

    private func feedViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/FeedView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_laPaginationDuFil_montreDesCartesFantomes_jamaisUnSpinner() throws {
        let source = try feedViewSource()
        guard let debut = source.range(of: "if viewModel.isLoadingMore {") else {
            return XCTFail("FeedView ne rend plus d'état « chargement de la suite ».")
        }
        let suite = source[debut.upperBound...]
        guard let fin = suite.range(of: "\n                    }") else {
            return XCTFail("Bloc `isLoadingMore` sans fin lisible.")
        }
        let bloc = String(suite[..<fin.lowerBound])
        XCTAssertTrue(bloc.contains("SkeletonFeedList("),
                      "Le chargement de la suite doit rendre des cartes fantômes de la hauteur des vraies.")
        XCTAssertFalse(bloc.contains("ProgressView("),
                       "Un spinner sous le dernier post laisse du fond nu là où des cartes vont apparaître.")
    }
}
