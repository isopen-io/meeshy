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
        let construction: String
        let records: String
        let flushes: String
    }

    /// #10483 — chaque hôte porte sa SURFACE, qui donne à sa file sa propre
    /// clé de persistance (`ImpressionBatcher.storageKey(source:surface:)`).
    private let hosts: [Host] = [
        Host(file: "RootViewComponents.swift",
             construction: "ImpressionBatcher(source: \"feed\", surface: .feed)",
             records: ".countsListedImpression(of: post.id, isVideo: post.isReel, in: impressions)",
             flushes: "await impressions.flushNow()"),
        Host(file: "HashtagResultsView.swift",
             construction: "HashtagResultsViewModel(tag: tag)",
             records: ".countsListedImpression(of: post.id, isVideo: post.isReel, in: viewModel.impressions)",
             flushes: "await viewModel.flushImpressions()"),
        Host(file: "BookmarksView.swift",
             construction: "ImpressionBatcher(source: \"profile\", surface: .bookmarks)",
             records: ".countsListedImpression(of: post.id, isVideo: post.isReel, in: impressions)",
             flushes: "await impressions.flushNow()"),
    ]

    func test_everyCardHost_ownsABatcherUnderItsOwnSurface() throws {
        for host in hosts {
            let code = try source(host.file)
            XCTAssertTrue(code.contains(host.construction),
                          "\(host.file) doit porter son batcher sous sa surface : `\(host.construction)`")
        }
    }

    func test_everyCardHost_recordsTheAppearingPost_andFlushesOnDisappear() throws {
        for host in hosts {
            let code = try source(host.file)
            XCTAssertTrue(code.contains(host.records),
                          "\(host.file) : une carte qui apparaît doit enregistrer son impression")
            XCTAssertTrue(code.contains(host.flushes),
                          "\(host.file) : la file en cours de groupement doit partir à la sortie d'écran")
        }
    }

    func test_theIPhoneFeed_recordsInsideItsPostLoop() throws {
        let code = try source("RootViewComponents.swift")
        let loop = try XCTUnwrap(section(of: code, from: "ForEach(viewModel.posts)", to: "viewModel.isLoadingMore"))
        XCTAssertTrue(loop.contains(".countsListedImpression(of: post.id, isVideo: post.isReel, in: impressions)"),
                      "le fil de l'iPhone compte l'impression dans la boucle des cartes, réels compris")
    }
}
