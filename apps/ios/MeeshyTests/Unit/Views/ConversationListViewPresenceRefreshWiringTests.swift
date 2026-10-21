import XCTest
@testable import Meeshy

/// Source-analysis guard for the "pastilles de présence jamais rafraîchies
/// sur user:status" fix (audit 2026-07-20). The two integration points below
/// can't be exercised live: `ConversationListView` is a SwiftUI `View` (no
/// hosting in this test target — reading its `@ObservedObject` wiring
/// requires mounting a live hierarchy) and `PresenceManager`'s recalc
/// timer isn't feasible to await in a unit test. `PresenceManagerTests`
/// covers the debounced `refreshSignal` bump end-to-end (real Combine +
/// Task.sleep, no source reading) for the part that IS testable live.
final class ConversationListViewPresenceRefreshWiringTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_conversationListView_observesPresenceRefreshSignal_notPresenceManagerItself() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/ConversationListView.swift")

        XCTAssertTrue(
            viewSource.contains("@ObservedObject private var presencePulse: PresenceRefreshSignal"),
            "ConversationListView must observe the debounced PresenceRefreshSignal companion object"
        )
        // The per-row lookup must stay a PLAIN (unobserved) read — observing
        // PresenceManager itself would re-fire the whole list on every
        // single presenceMap mutation, defeating the debounce entirely.
        XCTAssertTrue(
            viewSource.contains("private var presenceManager: PresenceManager { PresenceManager.shared }"),
            "presenceManager must remain a plain computed property, never @ObservedObject/@EnvironmentObject"
        )
        // Balayage NÉGATIF sur l'UNITÉ : les types extraits de la liste ne doivent pas non plus observer le manager.
        let unitSource = try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView.swift")
        XCTAssertFalse(
            unitSource.contains("@ObservedObject private var presenceManager"),
            "PresenceManager itself must never become the observed object — only the debounced signal"
        )
    }

    /// #11412 — le minuteur re-résout chaque entrée et passe par le MÊME
    /// battement débouncé que les mutations : un état changé depuis le dernier
    /// battement repeint, rien de changé ne repeint rien.
    func test_presenceManager_recalcTimer_reachesTheDebouncedSignalOnAStateChange() throws {
        let managerSource = AppSourceGuard.stripComments(try source("Meeshy/Features/Main/Services/PresenceManager.swift"))

        XCTAssertTrue(managerSource.contains("self.recalculateStates()"), "le tick du minuteur doit re-résoudre les états")
        guard let range = managerSource.range(of: "func recalculateStates(now: Date = Date()) -> Bool {") else {
            XCTFail("recalculateStates(now:) not found")
            return
        }
        let end = managerSource.index(range.lowerBound, offsetBy: 300, limitedBy: managerSource.endIndex)
            ?? managerSource.endIndex
        let block = String(managerSource[range.lowerBound..<end])
        XCTAssertTrue(block.contains("!= publishedStates"), "Block read: \(block)")
        XCTAssertTrue(block.contains("scheduleVersionBump()"), "Block read: \(block)")

        guard let bump = managerSource.range(of: "private nonisolated func scheduleVersionBump() {") else {
            XCTFail("scheduleVersionBump() not found")
            return
        }
        let bumpEnd = managerSource.index(bump.lowerBound, offsetBy: 500, limitedBy: managerSource.endIndex)
            ?? managerSource.endIndex
        let bumpBlock = String(managerSource[bump.lowerBound..<bumpEnd])
        XCTAssertTrue(bumpBlock.contains("self.publishedStates = Self.resolvedStates(of: self.presenceMap, at: Date())"), "Block read: \(bumpBlock)")
        XCTAssertTrue(bumpBlock.contains("self.refreshSignal.bump()"), "Block read: \(bumpBlock)")
    }

    func test_presenceManager_didSet_schedulesVersionBump_alongsidePersist() throws {
        let managerSource = try source("Meeshy/Features/Main/Services/PresenceManager.swift")

        guard let range = managerSource.range(of: "@Published var presenceMap: [String: UserPresence] = [:] {") else {
            XCTFail("presenceMap declaration not found")
            return
        }
        let end = managerSource.index(range.lowerBound, offsetBy: 250, limitedBy: managerSource.endIndex)
            ?? managerSource.endIndex
        let block = String(managerSource[range.lowerBound..<end])

        XCTAssertTrue(block.contains("schedulePersist()"), "Existing disk-persist debounce must be preserved. Block read: \(block)")
        XCTAssertTrue(block.contains("scheduleVersionBump()"), "New debounced signal must hook the SAME didSet. Block read: \(block)")
    }
}

/// #11412 — une pastille lue dans `PresenceManager` pendant le `body` d'un hôte
/// qui n'observe pas la présence reste FIGÉE : ni `user:status`, ni le passage
/// d'un seuil 1/3/5 ne la repeignent. Chaque fichier de l'app qui lit la
/// présence la lit donc sous `LivePresence { … }`, ou observe lui-même le
/// signal débouncé — ou est NOMMÉ ici avec sa raison. Une nouvelle lecture
/// figée rougit.
final class LivePresenceRepaintGuardTests: XCTestCase {

    private static let readsWithoutLivePresence: [String: String] = [
        "Features/Main/Services/PresenceManager.swift": "le manager lui-même",
        "Features/Main/Services/WidgetDataManager.swift": "hors vue — cliché du widget, republié à son rythme",
        "Features/Main/Navigation/SocialChromeEnvironment.swift": "fournisseur posé à la racine — les vues du SDK se repeignent par MeeshyLivePresence",
        "Features/Main/Views/RootLayers/RootViewLayers.swift": "fournisseur de UserProfileSheet — l'en-tête se repeint par MeeshyLivePresence",
        "Features/Main/Views/RootLayers/iPadRootViewLayers.swift": "fournisseur de UserProfileSheet — l'en-tête se repeint par MeeshyLivePresence",
        "Features/Main/Views/AdaptiveRootView.swift": "fournisseur de UserProfileSheet — l'en-tête se repeint par MeeshyLivePresence",
        "Features/Main/Views/AudioFullscreenPage+Transcription.swift": "fournisseur de UserProfileSheet — l'en-tête se repeint par MeeshyLivePresence",
        "Features/Main/Views/PostDetailView+Presentations.swift": "fournisseur de UserProfileSheet — l'en-tête se repeint par MeeshyLivePresence",
        "Features/Main/Views/CommentRowView.swift": "reçoit sa présence de ThreadedCommentSection, monté sous LivePresence par ses hôtes",
        "Features/Main/Views/StoryTrayView+RingCell.swift": "cellule Equatable — ses hôtes la montent sous LivePresence",
        "Features/Main/Components/MessageDetail/MessageViewsMemberPresence.swift": "règle sans vue — ses deux hôtes lisent sous LivePresence",
        "Features/Main/Views/ConversationListView+Overlays.swift": "extension de ConversationListView, qui observe presencePulse",
        "Features/Main/Views/ConversationView.swift": "headerPresenceState — l'en-tête replié relit la carte (livePresenceState) ; la barre de frappe, transitoire, reste à convertir (suivi #11412)",
        "Features/Main/Views/ConversationView+ReaderLayers.swift": "fil de messages — repeint par MessageListViewController (refreshSignal)",
        "Features/Main/Views/MessageListViewController+MessageCellInputs.swift": "fil de messages — repeint par MessageListViewController (refreshSignal)",
        "Features/Main/Views/Bubble/BubbleStandardLayout+Attachments.swift": "fil de messages — repeint par MessageListViewController (refreshSignal)",
        "Features/Main/Focal/Summary/LivingSummaryAssembly.swift": "assemblage du résumé, résolu à sa construction (suivi #11412)",
        "Features/Main/Components/MessageOverlayMenu.swift": "menu transitoire, résolu à l'ouverture",
        "Features/Main/Views/StoryViewerView.swift": "face voisine du cube, résolue au basculement (directive 2026-07-10)",
        "Features/Main/Views/StoryViewerView+GroupIntro.swift": "interstitiel, résolu au basculement (directive 2026-07-10)",
        "Features/Contacts/DiscoverTab.swift": "politique des points de Découverte, hors de ce lot",
        "Features/Main/Share/ShareSheetHost+App.swift": "écran de partage unique (#10947/#10948) — sa présence est l'affaire de son lot",
        "Features/Main/Share/ShareSheetView.swift": "écran de partage unique (#10947/#10948) — sa présence est l'affaire de son lot",
        "Features/Main/Share/ShareSheetViewModel.swift": "écran de partage unique (#10947/#10948) — sa présence est l'affaire de son lot",
    ]

    private static let presenceRead = #"knownPresenceState\(|presenceState\(for|resolvedState\(|servedPresence\(for|presenceMap\["#
    private static let liveRepaint = #"LivePresence \{|presencePulse|refreshSignal\.\$presenceVersion"#

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func matches(_ pattern: String, _ source: String) -> Bool {
        source.range(of: pattern, options: .regularExpression) != nil
    }

    private func presenceReaders() throws -> [String: String] {
        var readers: [String: String] = [:]
        let enumerator = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)
        while let url = enumerator?.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            guard matches(Self.presenceRead, source) else { continue }
            readers[String(url.path.dropFirst(appRoot.path.count + 1))] = source
        }
        return readers
    }

    func test_everyPresenceReader_repaintsLive_orIsNamedWithItsReason() throws {
        let readers = try presenceReaders()
        XCTAssertGreaterThan(readers.count, 30, "le balayage ne voit pas les lecteurs de présence")

        let frozen = readers
            .filter { !matches(Self.liveRepaint, $0.value) && Self.readsWithoutLivePresence[$0.key] == nil }
            .map { $0.key }
        XCTAssertEqual(frozen.sorted(), [], "pastille lue hors de LivePresence, sans raison nommée")
    }

    func test_namedReasons_stillReadPresence() throws {
        let readers = try presenceReaders()
        let stale = Self.readsWithoutLivePresence.keys.filter { readers[$0] == nil }
        XCTAssertEqual(stale.sorted(), [], "une exception qui ne lit plus la présence doit quitter la liste")
    }

    func test_livePresence_observesTheDebouncedSignal_neverTheManager() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Components/LivePresence.swift"))
        XCTAssertTrue(source.contains("@ObservedObject private var presencePulse: PresenceRefreshSignal = PresenceManager.shared.refreshSignal"))
        XCTAssertFalse(source.contains("@ObservedObject private var presenceManager"))
    }

    func test_socialChrome_handsTheHeartbeatToTheSDKViews() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Navigation/SocialChromeEnvironment.swift"))
        XCTAssertTrue(source.contains("refresh: PresenceManager.shared.refreshPublisher"))
    }

    /// La surface la plus vue : l'auteur d'un post du fil.
    func test_feedPostAuthor_readsItsPresenceUnderLivePresence() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/FeedPostCard+Header.swift"))
        let wrapper = try XCTUnwrap(source.range(of: "LivePresence { MeeshyAvatar("))
        let read = try XCTUnwrap(source.range(of: "PresenceManager.shared.knownPresenceState(for: post.authorId)"))
        XCTAssertLessThan(wrapper.lowerBound, read.lowerBound)
    }
}
