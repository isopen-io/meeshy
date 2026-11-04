import XCTest
import SwiftUI
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

    /// #15934 — les favoris et les hashtags offraient « Repartager » sans
    /// écrivain : le choix appelait un rappel absent et le toucher ne faisait
    /// rien. Sans action, le choix est ABSENT, jamais inerte.
    func test_offered_sansEcrivainDeRepartage_neProposePasRepartager() {
        XCTAssertEqual(RepostChoice.offered(canRepost: false, canQuote: true), [.quote])
        XCTAssertEqual(RepostChoice.offered(canRepost: false, canQuote: false), [],
                       "Sans aucune action, le bouton Repost n'a rien à offrir.")
        XCTAssertEqual(RepostChoice.offered(canRepost: true, canQuote: true), [.repost, .quote])
    }

    func test_laRangeeDuFil_neFabriquePasDeRepartageInerte() throws {
        let bar = try sourceWithoutComments("Meeshy/Features/Main/Views/FeedPostActionsBar.swift")
        XCTAssertFalse(bar.contains("onRepost: { onRepost?(postId) }"),
                       "Envelopper un rappel optionnel dans une fermeture TOUJOURS présente offre « Repartager » sans effet.")
        XCTAssertTrue(bar.contains("RepostChoice.offered(canRepost: onRepost != nil, canQuote: onQuote != nil).isEmpty"),
                      "Le bouton Repost est absent quand la carte n'a ni écrivain ni porte de citation.")
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

    // MARK: - Hors du fil : profil, détail, hashtag, favoris (#15911)

    func test_lesPostsDUnProfil_remettentCiterAuxDeuxCartes_etCiterNOuvrePlusLeDetail() throws {
        let path = "Meeshy/Features/Profile/Views/ProfileUserPostsList.swift"
        let source = try sourceWithoutComments(path)
        for card in ["ReelFeedCard(", "FeedPostCard("] {
            XCTAssertTrue(try callArguments(of: card, in: source, path: path).contains("onQuote:"),
                          "Les posts d'un profil doivent remettre « Citer » à \(card)), comme le fil.")
        }
        XCTAssertFalse(source.contains("onQuote: { _ in openPost"),
                       "« Citer » ouvrait le détail du post au lieu de la porte de citation.")
        XCTAssertTrue(source.contains("QuoteComposerCover("),
                      "« Citer » depuis un profil doit ouvrir QuoteComposerDoor.")
    }

    func test_leDetailDUnPost_presenteLeChoixPartage_etCiterOuvreLaPorte() throws {
        let source = try sourceWithoutComments("Meeshy/Features/Main/Views/PostDetailView.swift")
        XCTAssertTrue(source.contains("RepostChoiceDialog("),
                      "Le détail doit présenter le choix Repartager / Citer partagé.")
        XCTAssertFalse(source.contains(#".alert(String(localized: "feed.post.repost""#),
                       "Le détail ne doit plus écrire sa propre alerte de repost.")
        XCTAssertFalse(source.contains("declaredQuote"),
                       "« Citer » publiait une citation sans commentaire au lieu d'ouvrir la porte.")
        let presentations = try sourceWithoutComments("Meeshy/Features/Main/Views/PostDetailView+Presentations.swift")
        XCTAssertTrue(presentations.contains("QuoteComposerCover("),
                      "« Citer » du détail doit ouvrir QuoteComposerDoor.")
    }

    func test_lesResultatsDUnHashtag_etLesFavoris_remettentCiterALaCarte() throws {
        for path in [
            "Meeshy/Features/Main/Views/HashtagResultsView.swift",
            "Meeshy/Features/Main/Views/BookmarksView.swift"
        ] {
            let source = try sourceWithoutComments(path)
            XCTAssertTrue(try callArguments(of: "FeedPostCard(", in: source, path: path).contains("onQuote:"),
                          "\(path) doit remettre « Citer » à FeedPostCard.")
            XCTAssertTrue(source.contains("QuoteComposerCover("),
                          "\(path) : « Citer » doit ouvrir QuoteComposerDoor.")
        }
    }

    func test_lesTroisRacines_posentLaPorteDeCitationAuDessusDeLeursFeuilles() throws {
        for path in [
            "Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift",
            "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift",
            "Meeshy/Features/Main/Views/AdaptiveRootView.swift"
        ] {
            let source = try sourceWithoutComments(path)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            XCTAssertTrue(
                source.contains(#".environment(\.meeshyQuoteComposerHost, quoteHost) .environment(\.presentedSurfaceScope, router.surfaceScope)"#),
                "\(path) doit poser la porte de citation sur sa couche la plus EXTERNE, à côté de la portée de fenêtre : une feuille hérite de l'environnement de son point d'attache."
            )
        }
    }

    @MainActor
    func test_sansRacine_aucunePorteNEstOfferte() {
        XCTAssertNil(EnvironmentValues().meeshyQuoteComposerHost,
                     "Hors racine (aperçus, tests), « Citer » est absent plutôt qu'inerte.")
    }

    // MARK: - Outils

    private func callArguments(of call: String, in source: String, path: String) throws -> Substring {
        let start = try XCTUnwrap(source.range(of: call), "\(path) monte \(call))")
        var depth = 1
        var index = start.upperBound
        while index < source.endIndex, depth > 0 {
            switch source[index] {
            case "(": depth += 1
            case ")": depth -= 1
            default: break
            }
            index = source.index(after: index)
        }
        return source[start.upperBound..<index]
    }

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
