import XCTest
import MeeshyUI

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

    // MARK: - #7625 — un reflet de chargement n'anime que LUI-MÊME

    /// Un `withAnimation` à courbe infinie posé dans `onAppear` anime TOUTE la
    /// transaction en cours — dans le fil paresseux, celle qui fait aussi
    /// naître les rangées voisines, qui hériteraient d'une animation sans fin.
    /// Chaque placeholder d'image du fil scintille au moment exact où sa
    /// rangée naît. Les deux reflets du SDK portent leur courbe par
    /// `.animation(_:value:)`, bornée au reflet.
    func test_lesRefletsDeChargement_nOuvrentJamaisDeTransactionAnimee() throws {
        let sdk = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI")
        let sites: [(file: String, type: String)] = [
            ("Primitives/SkeletonView.swift", "public struct ShimmerModifier"),
            ("Theme/ViewModifiers.swift", "public struct ShimmerEffect"),
        ]
        for site in sites {
            let source = try String(contentsOf: sdk.appendingPathComponent(site.file), encoding: .utf8)
            guard let start = source.range(of: site.type) else {
                return XCTFail("\(site.type) introuvable dans \(site.file)")
            }
            let rest = source[start.upperBound...]
            let end = rest.range(of: "\n}\n")?.lowerBound ?? rest.endIndex
            let body = String(rest[..<end])
            XCTAssertFalse(body.contains("withAnimation("),
                           "\(site.type) démarre son reflet par une transaction animée : elle fuit sur les rangées voisines du fil.")
            XCTAssertTrue(body.contains(".animation(ShimmerCycle.sweep("),
                          "\(site.type) doit porter sa courbe sur le reflet lui-même.")
        }
    }

    func test_shimmerCycle_auRepos_nAnimeRien_enCourse_boucle() {
        XCTAssertNil(ShimmerCycle.sweep(duration: 1.5, running: false),
                     "le retour au repos (onDisappear) ne doit pas rejouer la courbe infinie")
        XCTAssertNotNil(ShimmerCycle.sweep(duration: 1.5, running: true))
    }
}
