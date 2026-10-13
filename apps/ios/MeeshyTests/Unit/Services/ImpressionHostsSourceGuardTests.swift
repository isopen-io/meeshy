import XCTest
@testable import Meeshy

/// #10397 / #10398 — chaque surface qui affiche des cartes de post likables
/// compte leur impression, et vide sa file en sortie d'écran.
///
/// Le fil de l'iPhone (`ThemedFeedOverlay`) et la page d'un hashtag affichaient
/// des cartes qu'on pouvait aimer sans qu'aucune impression ne parte : en
/// production, des posts à « 3 likes · 0 impression ». Seul `FeedView`, monté
/// sur iPad, portait le batcher. Garde de SOURCE : ces hôtes sont des vues
/// SwiftUI dont l'`onAppear` ne s'exerce pas sans hébergement réel.
final class ImpressionHostsSourceGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Services
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views")
        return AppSourceGuard.stripComments(
            try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
        )
    }

    private func section(of code: String, from anchor: String, to end: String) -> String? {
        guard let start = code.range(of: anchor),
              let stop = code.range(of: end, range: start.upperBound..<code.endIndex) else { return nil }
        return String(code[start.lowerBound..<stop.lowerBound])
    }

    private struct Host {
        let file: String
        let source: String
        let scope: String
    }

    private let hosts: [Host] = [
        Host(file: "RootViewComponents.swift", source: "feed", scope: "feed.phone"),
        Host(file: "HashtagResultsView.swift", source: "search", scope: "search.hashtag"),
        Host(file: "BookmarksView.swift", source: "profile", scope: "profile.bookmarks"),
    ]

    func test_everyCardHost_ownsABatcherUnderItsOwnPersistenceKey() throws {
        for host in hosts {
            let code = try source(host.file)
            XCTAssertTrue(
                code.contains("ImpressionBatcher(source: \"\(host.source)\", storageScope: \"\(host.scope)\")"),
                "\(host.file) doit porter son batcher `\(host.source)` sous la clé `\(host.scope)`"
            )
        }
    }

    func test_everyCardHost_recordsTheAppearingPost_andFlushesOnDisappear() throws {
        for host in hosts {
            let code = try source(host.file)
            XCTAssertTrue(
                code.contains("impressions.record(post.id)") || code.contains("trackImpression(postId: post.id)"),
                "\(host.file) : une carte qui apparaît doit enregistrer son impression"
            )
            XCTAssertTrue(
                code.contains("await impressions.flushNow()"),
                "\(host.file) : la file en cours de groupement doit partir à la sortie d'écran"
            )
        }
    }

    func test_theIPhoneFeed_recordsInsideItsPostLoop() throws {
        let code = try source("RootViewComponents.swift")
        let loop = try XCTUnwrap(section(of: code, from: "ForEach(viewModel.posts)", to: "viewModel.isLoadingMore"))
        XCTAssertTrue(loop.contains("impressions.record(post.id)"),
                      "le fil de l'iPhone compte l'impression dans la boucle des cartes, réels compris")
    }
}
