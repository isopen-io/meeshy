import XCTest
@testable import Meeshy

/// **Une carte à scènes ne dépasse jamais 1,4 × sa largeur en hauteur**
/// (#6767, décision « plafond 1,4 ajusté »).
///
/// La question posée par l'issue : quelle hauteur maximale donner à une carte
/// à scènes dans le fil ? Trois options — garder le 9:16 entier, plafonner à
/// 1,4 comme les cartes d'image, ou une hauteur par page. La troisième est
/// écartée par la doctrine déjà écrite dans ce même fichier : « une hauteur
/// par page ferait SAUTER la carte à chaque glissement… ce que la fluidité
/// interdit » (`SceneCarouselLayout`, § « Pourquoi une forme unique »). La
/// première contredit « des cartes courtes, sans zoom » (directive porteur
/// 2026-09-06) sur son PROPRE cas nominal — un post à plusieurs scènes
/// portrait rendait une carte de 601 pt, ≈ 70 % d'un iPhone 16 Pro. La
/// décision retient donc la seconde : la scène garde son rapport NATUREL —
/// jamais rognée, jamais zoomée — et c'est la BOÎTE qui s'arrête au plafond.
///
/// Ces témoins gardent le câblage de SOURCE — la preuve comportementale (le
/// rapport plafonné, jamais rogné) vit dans `SceneFramingTests` côté SDK, pur
/// et éprouvable sans écran.
final class PostSceneCardHeightCapGuardTests: XCTestCase {

    private func mosaicSource() throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/PostSceneMosaic.swift")
    }

    private func cardSource() throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/FeedSceneAutoplay.swift")
    }

    /// Le bloc entre deux marqueurs (le second exclu). Même convention que
    /// `FeedPostCardScenePlayerGuardTests.block(from:to:in:)`.
    private func block(from start: String, to end: String, in text: String) -> String {
        guard let startRange = text.range(of: start) else { return "" }
        let tail = text[startRange.upperBound...]
        guard let endRange = tail.range(of: end) else { return String(tail) }
        return String(tail[..<endRange.lowerBound])
    }

    // MARK: - La carte mono-scène (`PostSceneCard`)

    func test_postSceneCard_wrapsItsPlayerInTheHeightCap() throws {
        let text = try cardSource()
        let block = block(from: "struct PostSceneCard: View {", to: "extension PostSceneCard: Equatable", in: text)
        XCTAssertTrue(
            block.contains("SceneCardHeightCap(naturalAspect: naturalCardAspect)"),
            "PostSceneCard doit plafonner sa hauteur via SceneCardHeightCap (#6767) — la scène " +
            "garde son rapport naturel, c'est la boîte qui s'arrête à 1,4 × la largeur."
        )
    }

    // MARK: - Le carrousel (`PostSceneMosaic.carrousel`)

    /// **Le fil est plafonné, le détail ne l'est PAS.** Le détail (#6696) veut
    /// la scène ENTIÈRE, bornée par sa propre loi de taille
    /// (`PostDetailSceneFraming`, via `maxBoxHeight`) — pas par le plafond de
    /// carte du fil. Les deux chemins doivent rester DISTINCTS : plafonner le
    /// détail romprait #6696, ne jamais plafonner le fil laisserait dormir le
    /// défaut que #6767 corrige.
    func test_carrousel_capsOnlyTheFeedHost_neverTheDetail() throws {
        let text = try mosaicSource()
        let block = block(from: "private var carrousel: some View {", to: "\n    /// Les pages du carrousel", in: text)
        XCTAssertTrue(
            block.contains("if host == .feed"),
            "Le plafond doit être conditionné à l'hôte FIL — le détail (#6696) veut la scène " +
            "entière, bornée par sa propre loi de taille."
        )
        XCTAssertTrue(
            block.contains("SceneCardHeightCap(naturalAspect: Self.boxAspect(document: document))"),
            "La branche fil doit plafonner via SceneCardHeightCap (#6767)."
        )
        XCTAssertTrue(
            block.contains("pages.aspectRatio(Self.boxAspect(document: document), contentMode: .fit)"),
            "La branche détail doit garder l'ancien rapport NON plafonné, pour ne pas rompre #6696."
        )
    }

    /// La mosaïque à quatre tuiles (`wave`/`hero`/`reel`/`sine`) n'est PAS
    /// concernée : `MosaicLayout.aspectRatio` déclare des rapports
    /// hauteur/largeur ≤ 1,05 pour les quatre modes — déjà sous le plafond de
    /// 1,4, donc rien à y plafonner. Seul le carrousel paginé (`SceneCarouselLayout`,
    /// dont le repli est le gabarit 9:16 = 1,78 en hauteur/largeur) peut
    /// dépasser 1,4 : c'est lui, et lui seul, que #6767 vise.
    func test_gridMosaic_isUntouched_onlyTheCarouselIsCapped() throws {
        let text = try mosaicSource()
        let block = block(from: "private var mosaique: some View {", to: "// MARK: - Une tuile, une page", in: text)
        XCTAssertFalse(
            block.contains("SceneCardHeightCap"),
            "La mosaïque à tuiles n'a pas besoin du plafond (#6767) : ses quatre rapports " +
            "(wave/hero/reel/sine) sont déjà sous 1,4 par construction (MosaicLayout.aspectRatio)."
        )
    }
}
