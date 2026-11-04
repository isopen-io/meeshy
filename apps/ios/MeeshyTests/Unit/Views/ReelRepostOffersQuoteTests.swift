import XCTest
@testable import Meeshy

/// **Sur iPhone, un réel se cite depuis son bouton Repost, comme un post** (#15869).
///
/// Recette de #15628 : la carte immersive du fil (`ReelFeedCard`) et le rail du
/// lecteur de réels repostaient au premier toucher, sans proposer « Citer ».
/// Seule `FeedPostCard`, montée pour un réel en largeur RÉGULIÈRE, offrait le
/// choix — donc l'iPad seulement. Deux toucher ont publié deux republications
/// sèches sur le staging.
///
/// Le geste est désormais UN : `RepostChoiceDialog` porte les mots et l'ordre,
/// et les trois boutons Repost (carte du fil, carte de réel, rail du lecteur)
/// le présentent au lieu de reposter.
final class ReelRepostOffersQuoteTests: XCTestCase {

    // MARK: - Le choix offert

    func test_offered_quandLaCitationEstPossible_proposeRepartagerPuisCiter() {
        XCTAssertEqual(RepostChoice.offered(canQuote: true), [.repost, .quote])
    }

    func test_offered_sansPorteDeCitation_neProposeQueRepartager() {
        XCTAssertEqual(
            RepostChoice.offered(canQuote: false), [.repost],
            "« Citer » sans porte serait un contrôle sans effet (loi 4) : il est absent."
        )
    }

    func test_lesMotsDuChoix_sontCeuxDuFilPourUnPost() {
        XCTAssertEqual(RepostChoice.repost.title,
                       String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main))
        XCTAssertEqual(RepostChoice.quote.title,
                       String(localized: "feed.post.quote", defaultValue: "Citer", bundle: .main))
        XCTAssertEqual(RepostChoice.dialogTitle, RepostChoice.repost.title)
    }

    // MARK: - Le geste est le même partout

    func test_laCarteDuFil_laCarteDeReel_etLeRailDuLecteur_presententLeMemeChoix() throws {
        for path in [
            "Meeshy/Features/Main/Views/FeedPostActionsBar.swift",
            "Meeshy/Features/Main/Views/ReelFeedCard.swift",
            "Meeshy/Features/Main/Views/ReelsPlayerView+ActionRail.swift"
        ] {
            let source = try sourceWithoutComments(path)
            XCTAssertTrue(source.contains("RepostChoiceDialog("),
                          "\(path) doit présenter le choix Repartager / Citer partagé.")
            XCTAssertFalse(source.contains(#".alert(String(localized: "feed.post.repost""#),
                           "\(path) ne doit plus écrire sa propre alerte : les mots vivent dans RepostChoiceDialog.")
        }
    }

    func test_leBoutonRepostDUnReel_neRepostePlusAuPremierToucher() throws {
        let card = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelFeedCard.swift")
        XCTAssertFalse(card.contains("participated: isReposted) { onRepost(post.id) }"),
                       "La carte de réel repostait au toucher, sans offrir « Citer ».")
        let rail = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelsPlayerView+ActionRail.swift")
        XCTAssertFalse(rail.contains("action: { viewModel.repost(reel) }"),
                       "Le rail du lecteur repostait au toucher, sans offrir « Citer ».")
    }

    // MARK: - « Citer » mène à la porte de citation

    func test_lesDeuxFilsIPhone_remettentCiterALaCarteDeReel() throws {
        for path in [
            "Meeshy/Features/Main/Views/FeedPostRow.swift",
            "Meeshy/Features/Main/Views/RootViewComponents.swift"
        ] {
            let source = try sourceWithoutComments(path)
            let reelCard = try XCTUnwrap(source.range(of: "ReelFeedCardContainer("),
                                         "\(path) monte la carte de réel")
            let tail = source[reelCard.upperBound...]
            let callEnd = tail.range(of: "\n        )")?.lowerBound ?? tail.endIndex
            XCTAssertTrue(tail[..<callEnd].contains("onQuote:"),
                          "\(path) doit remettre « Citer » à la carte de réel, comme à FeedPostCard.")
        }
    }

    func test_leLecteurDeReels_monteLaPorteDeCitation_etSesTroisRacinesLaLuiDonnent() throws {
        let player = try sourceWithoutComments("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertTrue(player.contains("QuoteComposerCover("),
                      "« Citer » du lecteur doit ouvrir QuoteComposerDoor.")
        for path in [
            "Meeshy/Features/Main/Views/RootView.swift",
            "Meeshy/Features/Main/Views/AdaptiveRootView.swift",
            "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift"
        ] {
            let source = try sourceWithoutComments(path)
            XCTAssertTrue(source.contains("quoteHost: QuoteComposerHost("),
                          "\(path) monte le lecteur de réels : il doit lui remettre la porte de citation.")
        }
    }

    // MARK: - Outils

    private func sourceWithoutComments(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(path)
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw
            .replacingOccurrences(of: #"//[^\n]*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
    }
}
