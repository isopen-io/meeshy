import XCTest
@testable import Meeshy

/// Gardes de câblage — Lot E, Task E3 (« La scène dans la carte »,
/// `MeeshyScenePlayer(.card)`).
///
/// Quatre garanties de SOURCE, ancrées sur `FeedPostCard.swift` (§D lot E) :
/// 1. quand `post.storyEffects?.canvasV3 != nil`, la carte monte
///    `MeeshyScenePlayer(… mode: .card …)` — jamais `.reader` (le mode
///    `.card` verrouille déjà pause/muet/boucle côté SDK, `ScenePlayerConfig`,
///    B4 gelé) ;
/// 2. le player est enveloppé d'un `.frame(height:` EXPLICITE — jamais un
///    `.aspectRatio` seul ni un `GeometryReader` qui reboucleraient sur le
///    layout : `MeeshyScenePlayer` enveloppe un hôte UIKit
///    (`StoryReaderRepresentable`), et le piège de récursion self-sizing
///    (host UIKit imbriqué dans une liste défilante — même famille que le
///    crash SIGTRAP `_updateVisibleCellsNow` ×7 documenté par l'incident
///    `MessageListLayout.swift`, 2026-08-18) interdit de laisser ce contenu
///    dériver sa propre hauteur ;
/// 3. le tap route vers `onTapPost?(post)` — le MÊME callback que le reste
///    de la carte (texte, auteur), donc le plein écran EXISTANT
///    (PostDetailView) — jamais un nouveau `.fullScreenCover`/`.sheet`
///    dédié à la scène (« pas de nouveau viewer ») ;
/// 4. `isPlaying` est un `.constant(false)` figé — jamais un `@State`
///    basculable : la carte de POST naît en pause et le RESTE (surface
///    NEUVE, revue Fable n°25 — le mouvement vit dans la destination du
///    tap, pas dans la carte), donc aucun AVPlayer/décodage actif ici.
final class FeedPostCardScenePlayerGuardTests: XCTestCase {

    private func source() throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/FeedPostCard.swift")
    }

    /// Le bloc de code entre deux marqueurs (le second exclu). `end == nil`
    /// borne jusqu'à la fin du fichier. Même convention que
    /// `MuteButtonExistenceGuardTests`.
    private func block(from start: String, to end: String?, in text: String) -> String {
        guard let startRange = text.range(of: start) else { return "" }
        let tail = text[startRange.upperBound...]
        guard let end, let endRange = tail.range(of: end) else { return String(tail) }
        return String(tail[..<endRange.lowerBound])
    }

    private func cardScenePlayerBlock(in text: String) throws -> String {
        let block = block(from: "private func cardScenePlayer(document:", to: "var body: some View {", in: text)
        if block.isEmpty {
            XCTFail("cardScenePlayer(document:) introuvable dans FeedPostCard.swift")
        }
        return block
    }

    // MARK: - 1. Mode .card, jamais .reader

    func test_mountsMeeshyScenePlayer_inCardMode() throws {
        let text = try source()
        XCTAssertTrue(
            text.contains("MeeshyScenePlayer("),
            "La carte doit monter MeeshyScenePlayer quand le post porte un canvas v3 propre."
        )
        XCTAssertTrue(
            text.contains("mode: .card"),
            "Le mode passé DOIT être .card — jamais .reader (réservé au viewer story, E4)."
        )
    }

    func test_neverMountsReaderMode() throws {
        let text = try source()
        XCTAssertFalse(
            text.contains("mode: .reader"),
            "FeedPostCard ne doit JAMAIS monter le mode .reader — c'est le mode du viewer " +
            "story (E4), pas de la carte de post."
        )
    }

    func test_gatedOnOwnCanvasV3_notRepostCanvas() throws {
        let text = try source()
        XCTAssertTrue(
            text.contains("post.storyEffects?.canvasV3"),
            "La porte doit lire le storyEffects PROPRE du post — jamais celui d'un repost " +
            "(StoryRepostEmbedCell reste le chemin des reposts de story, hors périmètre E3)."
        )
    }

    // MARK: - 2. Hauteur EXPLICITE — piège de récursion self-sizing

    func test_scenePlayer_hasExplicitFrameHeight() throws {
        let text = try source()
        XCTAssertTrue(
            text.contains("private static let cardSceneHeight"),
            "La hauteur doit être une constante CALCULÉE UNE FOIS — jamais mesurée par un " +
            "GeometryReader qui reboucle sur le layout à chaque frame (piège self-sizing)."
        )
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains(".frame(height: Self.cardSceneHeight)"),
            "Le player DOIT recevoir un .frame(height:) EXPLICITE — jamais laissé s'auto-dimensionner."
        )
    }

    func test_scenePlayer_doesNotDeriveHeightFromMeasuredLayout() throws {
        let text = try source()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertFalse(
            block.contains("GeometryReader"),
            "cardScenePlayer ne doit pas mesurer sa largeur/hauteur via GeometryReader — la " +
            "hauteur est une constante figée (cardSceneHeight), pas un layout mesuré."
        )
        XCTAssertFalse(
            block.contains(".aspectRatio("),
            "cardScenePlayer ne doit pas s'appuyer sur .aspectRatio seul pour sa hauteur — " +
            ".frame(height:) EXPLICITE uniquement (piège self-sizing self-hosting UIKit)."
        )
    }

    // MARK: - 3. Tap → plein écran EXISTANT, pas de nouveau viewer

    func test_tap_routesThroughExistingOnTapPost() throws {
        let text = try source()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains(".onTapGesture { onTapPost?(post) }"),
            "Le tap doit router vers onTapPost?(post) — le MÊME callback que le reste de la " +
            "carte (texte, auteur), donc le plein écran EXISTANT (PostDetailView), jamais un " +
            "nouveau viewer dédié."
        )
    }

    func test_noNewFullscreenCoverIntroducedForScene() throws {
        let text = try source()
        let fullscreenCoverCount = text.components(separatedBy: ".fullScreenCover(").count - 1
        XCTAssertEqual(
            fullscreenCoverCount, 2,
            "E3 ne doit introduire AUCUN nouveau `.fullScreenCover` — seuls les deux déjà " +
            "existants (position, galerie média) doivent rester : la scène route par " +
            "onTapPost?(post), pas par une présentation neuve."
        )
    }

    // MARK: - 4. Née en pause, et le RESTE — aucun AVPlayer/décodage actif dans la carte

    func test_isPlaying_isConstantFalse_neverToggled() throws {
        let text = try source()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains("isPlaying: .constant(false)"),
            "isPlaying doit être un .constant(false) figé — la carte ne joue JAMAIS " +
            "localement, le mouvement vit dans la destination du tap (revue Fable n°25)."
        )
    }

    func test_noLocalPlaybackStateIntroducedForCardScene() throws {
        let text = try source()
        XCTAssertFalse(
            text.contains("@State private var cardSceneIsPlaying"),
            "Aucun état local de lecture ne doit exister pour la scène de carte — isPlaying " +
            "reste un .constant(false) figé, jamais un @State basculable qu'un futur commit " +
            "pourrait faire dériver."
        )
    }

    func test_noDirectAVPlayerConstructionInCard() throws {
        let text = try source()
        XCTAssertFalse(
            text.contains("AVPlayer("),
            "La carte ne doit jamais construire son propre AVPlayer — MeeshyScenePlayer(.card) " +
            "est le SEUL chemin de lecture, et il naît en pause/muet par construction (SDK)."
        )
    }

    // MARK: - Non-régression E1/E2 : l'accent de chrome reste l'accent du post

    func test_scenePlayer_usesPostAccentColor_notBadgeAccent() throws {
        let text = try source()
        let block = try cardScenePlayerBlock(in: text)
        XCTAssertTrue(
            block.contains("accentColorHex: accentColor"),
            "Le player doit recevoir l'accent déterministe du post (revue totale C8), pas " +
            "l'accent AA du badge son (backgroundSoundAccentHex, réservé à BackgroundSoundBadge)."
        )
    }
}
