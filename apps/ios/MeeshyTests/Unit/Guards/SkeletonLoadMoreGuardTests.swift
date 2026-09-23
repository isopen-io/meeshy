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

    /// Les DEUX hôtes du fil : `FeedView` (iPad) et `ThemedFeedOverlay`
    /// (iPhone, dans `RootViewComponents.swift`). La garde n'en lisait qu'un —
    /// l'iPhone, hôte de la quasi-totalité des lectures, gardait son spinner
    /// sous du fond nu sans que rien ne rougisse (#7657).
    private static let feedHosts = [
        "Meeshy/Features/Main/Views/FeedView.swift",
        "Meeshy/Features/Main/Views/RootViewComponents.swift",
    ]

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Le bloc qui rend les publications : du dernier `ForEach` qui précède
    /// l'état « chargement de la suite » jusqu'à lui.
    private func postRows(in source: String) -> String? {
        guard let fin = source.range(of: "if viewModel.isLoadingMore {") else { return nil }
        let avant = source[..<fin.lowerBound]
        guard let debut = avant.range(of: "ForEach(", options: .backwards) else { return nil }
        return String(avant[debut.lowerBound...])
    }

    func test_laPaginationDuFil_montreDesCartesFantomes_jamaisUnSpinner() throws {
        for host in Self.feedHosts {
            let source = try source(host)
            guard let debut = source.range(of: "if viewModel.isLoadingMore {") else {
                return XCTFail("\(host) ne rend plus d'état « chargement de la suite ».")
            }
            let suite = source[debut.upperBound...]
            guard let fin = suite.range(of: "\n                    }") else {
                return XCTFail("\(host) : bloc `isLoadingMore` sans fin lisible.")
            }
            let bloc = String(suite[..<fin.lowerBound])
            XCTAssertTrue(bloc.contains("SkeletonFeedList("),
                          "\(host) : le chargement de la suite doit rendre des cartes fantômes de la hauteur des vraies.")
            XCTAssertFalse(bloc.contains("ProgressView("),
                           "\(host) : un spinner sous le dernier post laisse du fond nu là où des cartes vont apparaître.")
        }
    }

    // MARK: - #7657 — une rangée du fil est PEINTE dès qu'elle est disposée

    /// **La cause du fond nu au défilement rapide.** Chaque publication du fil
    /// iPhone portait `.staggeredAppear(index: index, baseDelay: 0.06)` : une
    /// opacité 0 levée par un ressort RETARDÉ de `index × 60 ms`. Dans une pile
    /// paresseuse, une rangée naît quand elle entre dans la zone — la 30e
    /// restait donc TRANSPARENTE 1,8 s, la 60e 3,6 s, pendant que le fil
    /// principal, oisif, attendait un délai d'animation. C'est la signature
    /// relevée : rangées disposées, non peintes, jusqu'à plusieurs secondes
    /// après l'arrêt.
    func test_uneRangeeDuFil_nAttendJamaisUneAnimationPourEtrePeinte() throws {
        for host in Self.feedHosts {
            let source = try source(host)
            guard let rows = postRows(in: source) else {
                return XCTFail("\(host) : bloc des publications introuvable.")
            }
            XCTAssertFalse(rows.contains("staggeredAppear("),
                           "\(host) : une apparition échelonnée par index rend la rangée N transparente N × délai après sa naissance — du fond nu au défilement.")
            XCTAssertFalse(rows.contains(".opacity(0"),
                           "\(host) : une rangée du fil ne naît jamais transparente.")
        }
    }

    /// Cache vide et chargement en cours : l'iPhone ne rendait RIEN sous le
    /// composer — ni carte, ni squelette. Les deux hôtes montent la même
    /// décision (`SkeletonVisibilityResolver`) et les mêmes cartes fantômes.
    func test_chaqueHoteDuFil_montreSesCartesFantomesAFroid() throws {
        for host in Self.feedHosts {
            let source = try source(host)
            guard let rows = postRows(in: source),
                  let debut = source.range(of: rows) else {
                return XCTFail("\(host) : bloc des publications introuvable.")
            }
            let avant = String(source[..<debut.lowerBound])
            XCTAssertTrue(avant.contains("SkeletonVisibilityResolver.shouldShowSkeleton("),
                          "\(host) : le démarrage à froid doit décider du squelette par la loi commune.")
            XCTAssertTrue(avant.contains("SkeletonFeedList("),
                          "\(host) : cache vide ⇒ des cartes fantômes, jamais du fond nu.")
        }
    }

    /// Le préchargement des médias voisins (`prefetchMedia(around:)`, fenêtre
    /// −2…+6) n'était appelé que par l'hôte iPad : sur iPhone, chaque image
    /// partait au moment où sa rangée naissait.
    func test_chaqueHoteDuFil_prechargeLesMediasVoisins() throws {
        for host in Self.feedHosts {
            let source = try source(host)
            guard let rows = postRows(in: source) else {
                return XCTFail("\(host) : bloc des publications introuvable.")
            }
            XCTAssertTrue(rows.contains("prefetchMediaForPost("),
                          "\(host) : la rangée qui naît doit précharger les médias de ses voisines.")
            XCTAssertTrue(rows.contains("loadMoreIfNeeded(currentPost:"),
                          "\(host) : la page suivante se demande à cinq publications de la fin.")
        }
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
