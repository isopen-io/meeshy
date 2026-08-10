import XCTest
import MeeshySDK
@testable import Meeshy

/// W4 lot 1 — la liste visible ne fusionnait QUE `userState` depuis le store :
/// un `conversation:deleted` laissait la ligne à l'écran. Les métadonnées
/// (renommage, avatar) gardent leurs DEUX écrivains historiques — le sink
/// `conversationUpdated` direct et le rechargement du cache disque — le store
/// s'hydratant en asynchrone, une greffe depuis son snapshot réécrivait un
/// titre périmé par-dessus un rename fraîchement appliqué.
final class ConversationListStoreReconciliationTests: XCTestCase {

    private func makeConversation(id: String, title: String? = "Titre") -> Conversation {
        MeeshyConversation(
            id: id,
            identifier: "ident-\(id)",
            type: .group,
            title: title,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    func test_reconciling_identicalSnapshot_returnsNil() {
        let rows = [makeConversation(id: "c1")]
        XCTAssertNil(
            ConversationListViewModel.reconciling(rows: rows, with: rows, removing: []),
            "un écho inchangé ne doit pas relancer le pipeline de regroupement"
        )
    }

    func test_reconciling_disappearedConversation_isRemovedFromTheVisibleList() {
        let rows = [makeConversation(id: "c-gone"), makeConversation(id: "c-stays")]
        let snapshot = [makeConversation(id: "c-stays")]

        let merged = ConversationListViewModel.reconciling(
            rows: rows, with: snapshot, removing: ["c-gone"]
        )

        XCTAssertEqual(merged?.map(\.id), ["c-stays"])
    }

    func test_reconciling_staleStoreMetadata_neverOverwritesTheRow() {
        let rows = [makeConversation(id: "c1", title: "Nouveau nom")]
        var stale = makeConversation(id: "c1", title: "Ancien nom")
        stale.avatar = "https://cdn/stale.png"
        stale.slowModeSeconds = 30

        let merged = ConversationListViewModel.reconciling(
            rows: rows, with: [stale], removing: []
        )

        XCTAssertNil(
            merged,
            "le store s'hydrate en asynchrone : greffer ses métadonnées réécrirait un rename fraîchement appliqué par le sink socket"
        )
    }

    func test_reconciling_neverGraftsLastMessageFields() {
        var row = makeConversation(id: "c1")
        row.lastMessagePreview = "message le plus récent"
        row.lastMessageAt = Date(timeIntervalSince1970: 1_700_009_999)
        var staleStoreCopy = makeConversation(id: "c1")
        staleStoreCopy.lastMessagePreview = "vieux message"

        let merged = ConversationListViewModel.reconciling(
            rows: [row], with: [staleStoreCopy], removing: []
        )

        XCTAssertNil(
            merged,
            "l'aperçu appartient au cache disque : le greffer depuis un store en retard le ferait régresser"
        )
    }

    func test_reconciling_stillGraftsUserState() {
        let rows = [makeConversation(id: "c1")]
        var pinned = makeConversation(id: "c1")
        pinned.userState.isPinned = true

        let merged = ConversationListViewModel.reconciling(
            rows: rows, with: [pinned], removing: []
        )

        XCTAssertEqual(merged?.first?.userState.isPinned, true)
    }

    func test_reconciling_conversationAbsentFromSnapshot_isKeptWhenNotDeleted() {
        let rows = [makeConversation(id: "c-not-hydrated")]

        let merged = ConversationListViewModel.reconciling(
            rows: rows, with: [], removing: []
        )

        XCTAssertNil(
            merged,
            "un store moins hydraté que la liste ne doit jamais faire disparaître des lignes"
        )
    }
}
