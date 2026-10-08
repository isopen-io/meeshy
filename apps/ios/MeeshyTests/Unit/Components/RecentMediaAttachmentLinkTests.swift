import XCTest
import MeeshySDK
@testable import Meeshy

/// Le lien entre la zone d'attachement et la grille de la photothèque (#9683) :
/// une image déjà jointe est marquée, ne se choisit plus deux fois, et se
/// libère dès que sa pièce quitte la zone.
final class RecentMediaAttachmentLinkTests: XCTestCase {

    // MARK: - Ensemble des assets joints

    func test_attachedAssetIds_followsTheLivePiecesInTheirOrder() {
        let links = ["p1": "A", "p2": "B", "p3": "C"]
        XCTAssertEqual(
            RecentMediaAttachmentLink.attachedAssetIds(links: links, liveAttachmentIds: ["p3", "p1"]),
            ["C", "A"]
        )
    }

    func test_attachedAssetIds_removedPiece_freesItsTile() {
        let links = ["p1": "A", "p2": "B"]
        let attached = RecentMediaAttachmentLink.attachedAssetIds(links: links, liveAttachmentIds: ["p2"])
        XCTAssertFalse(attached.contains("A"))
        XCTAssertEqual(attached, ["B"])
    }

    func test_attachedAssetIds_ignoresPiecesThatDoNotComeFromTheLibrary() {
        let links = ["p1": "A"]
        XCTAssertEqual(
            RecentMediaAttachmentLink.attachedAssetIds(links: links, liveAttachmentIds: ["camera", "p1", "file"]),
            ["A"]
        )
    }

    func test_attachedAssetIds_isEmptyOnceTheZoneIsSent() {
        let links = ["p1": "A", "p2": "B"]
        XCTAssertEqual(RecentMediaAttachmentLink.attachedAssetIds(links: links, liveAttachmentIds: []), [])
    }

    // MARK: - Pose d'un lien

    func test_linking_addsTheNewPieceAndPrunesTheDeadOnes() {
        let links = ["sent": "A", "kept": "B"]
        let next = RecentMediaAttachmentLink.linking("C", to: "new", in: links, liveAttachmentIds: ["kept"])
        XCTAssertEqual(next, ["kept": "B", "new": "C"])
    }

    func test_linking_thenDerivation_marksTheNewAssetAsAttached() {
        let next = RecentMediaAttachmentLink.linking("A", to: "prep-1", in: [:], liveAttachmentIds: [])
        XCTAssertEqual(
            RecentMediaAttachmentLink.attachedAssetIds(links: next, liveAttachmentIds: ["prep-1"]),
            ["A"]
        )
    }

    // MARK: - Refus de reprendre

    func test_fresh_dropsAttachedAssetsAndDuplicatesInPickOrder() {
        XCTAssertEqual(
            RecentMediaAttachmentLink.fresh(["C", "A", "B", "C"], excluding: ["A"]),
            ["C", "B"]
        )
    }

    func test_ingestibleIndices_skipsAttachedAndRepeatedIdentifiers() {
        let indices = RecentMediaAttachmentLink.ingestibleIndices(
            of: ["A", "B", nil, "B", "C"],
            excluding: ["A"]
        )
        XCTAssertEqual(indices, [1, 2, 4])
    }

    func test_ingestibleIndices_alwaysKeepsItemsWithoutIdentifier() {
        XCTAssertEqual(
            RecentMediaAttachmentLink.ingestibleIndices(of: [nil, nil], excluding: []),
            [0, 1]
        )
    }

    // MARK: - Présélection du sélecteur système

    func test_pickerPreselection_putsAttachedFirstThenTheGridSelection() {
        XCTAssertEqual(
            RecentMediaAttachmentLink.pickerPreselection(attached: ["A", "B"], selection: ["B", "C"], limit: 10),
            ["A", "B", "C"]
        )
    }

    func test_pickerPreselection_isCappedByThePickerLimit() {
        XCTAssertEqual(
            RecentMediaAttachmentLink.pickerPreselection(attached: ["A", "B"], selection: ["C"], limit: 2),
            ["A", "B"]
        )
    }

    // MARK: - Sélection de la grille

    func test_selection_activate_entersSelectionWithoutPickingAnything() {
        var selection = RecentMediaSelection()
        selection.activate()
        XCTAssertTrue(selection.isActive)
        XCTAssertTrue(selection.isEmpty)
    }

    func test_selection_discard_dropsAssetsThatJoinedTheZoneAndStaysActive() {
        var selection = RecentMediaSelection()
        selection.begin(with: "A")
        selection.toggle("B")
        selection.discard(["A"])
        XCTAssertEqual(selection.ids, ["B"])
        XCTAssertTrue(selection.isActive)
    }

    // MARK: - Fenêtre de pré-chargement

    func test_cachingWindow_coversTwoRowsBeforeAndFourAfter() {
        let ids = (0..<40).map { "a\($0)" }
        let window = RecentMediaCachingWindow.ids(around: "a20", in: ids, columns: 4)
        XCTAssertEqual(window.first, "a12")
        XCTAssertEqual(window.last, "a39")
        XCTAssertEqual(window.count, 28)
    }

    func test_cachingWindow_isClampedToTheSample() {
        let ids = (0..<6).map { "a\($0)" }
        XCTAssertEqual(RecentMediaCachingWindow.ids(around: "a0", in: ids, columns: 4), ids)
        XCTAssertEqual(RecentMediaCachingWindow.ids(around: "missing", in: ids, columns: 4), [])
    }

    func test_cachingDelta_startsWhatEntersAndStopsWhatLeaves() {
        let delta = RecentMediaCachingWindow.delta(from: ["a", "b", "c"], to: ["b", "c", "d"])
        XCTAssertEqual(delta, .init(start: ["d"], stop: ["a"]))
    }
}

/// La zone d'attachement du composeur de conversation porte le lien : ses
/// pièces vivantes disent quels assets sont joints (#9683).
@MainActor
final class ConversationComposerLibraryLinkTests: XCTestCase {

    private func makeImage(_ id: String) -> MessageAttachment {
        MessageAttachment(id: id, mimeType: "image/jpeg")
    }

    func test_linkedPendingPiece_marksItsAssetAsAttached() {
        var state = ConversationComposerState()
        state.pendingAttachments = [makeImage("p1")]
        state.linkLibraryAsset("ASSET-1", to: "p1")
        XCTAssertEqual(state.attachedLibraryAssetIds, ["ASSET-1"])
    }

    func test_removingThePieceFromTheZone_freesTheAsset() {
        var state = ConversationComposerState()
        state.pendingAttachments = [makeImage("p1"), makeImage("p2")]
        state.linkLibraryAsset("ASSET-1", to: "p1")
        state.linkLibraryAsset("ASSET-2", to: "p2")
        state.pendingAttachments.removeAll { $0.id == "p1" }
        XCTAssertEqual(state.attachedLibraryAssetIds, ["ASSET-2"])
    }

    func test_preparingPiece_alreadyCountsAsAttached() {
        var state = ConversationComposerState()
        let prep = PreparingAttachment(id: "prep-1", kind: .image, accentColor: "6366F1")
        state.preparingAttachments = [prep]
        state.linkLibraryAsset("ASSET-1", to: "prep-1")
        XCTAssertEqual(state.attachedLibraryAssetIds, ["ASSET-1"])
    }

    func test_sendingTheZone_freesEveryAsset() {
        var state = ConversationComposerState()
        state.pendingAttachments = [makeImage("p1")]
        state.linkLibraryAsset("ASSET-1", to: "p1")
        state.pendingAttachments.removeAll()
        XCTAssertEqual(state.attachedLibraryAssetIds, [])
    }
}
