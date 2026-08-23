import XCTest
@testable import Meeshy

/// Le composer appelle `save` à chaque frappe : l'écriture `UserDefaults` est
/// débouncée, mais la sémantique observable (read-your-writes, effacement
/// immédiat) doit rester celle d'une écriture synchrone.
@MainActor
final class CommentDraftStoreTests: XCTestCase {

    private func makeSUT(debounceMilliseconds: UInt64 = 0) -> (sut: CommentDraftStore, defaults: UserDefaults) {
        let suiteName = "CommentDraftStoreTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let sut = CommentDraftStore(defaults: defaults, debounceMilliseconds: debounceMilliseconds)
        return (sut, defaults)
    }

    func test_save_thenLoad_returnsTextBeforeDebounceLands() {
        let (sut, _) = makeSUT(debounceMilliseconds: 60_000)
        sut.save(postId: "p1", text: "brouillon en cours")
        XCTAssertEqual(sut.load(postId: "p1"), "brouillon en cours",
            "read-your-writes : le texte en vol doit être lisible immédiatement")
    }

    func test_save_debounced_landsInDefaultsAfterFlush() async {
        let (sut, defaults) = makeSUT()
        sut.save(postId: "p1", text: "persisté")
        await sut.pendingSaves["p1"]?.value
        XCTAssertEqual(defaults.string(forKey: "meeshy.commentDraft.v1.p1"), "persisté")
        XCTAssertEqual(sut.load(postId: "p1"), "persisté")
    }

    func test_save_emptyText_clearsImmediately() async {
        let (sut, defaults) = makeSUT()
        sut.save(postId: "p1", text: "à effacer")
        await sut.pendingSaves["p1"]?.value
        sut.save(postId: "p1", text: "   ")
        XCTAssertNil(defaults.string(forKey: "meeshy.commentDraft.v1.p1"),
            "l'effacement n'attend pas le debounce — pas de brouillon fantôme après envoi")
        XCTAssertNil(sut.load(postId: "p1"))
    }

    func test_save_burst_lastTextWins() async {
        let (sut, defaults) = makeSUT()
        sut.save(postId: "p1", text: "a")
        sut.save(postId: "p1", text: "ab")
        sut.save(postId: "p1", text: "abc")
        await sut.pendingSaves["p1"]?.value
        XCTAssertEqual(defaults.string(forKey: "meeshy.commentDraft.v1.p1"), "abc")
    }

    func test_clear_cancelsPendingSave() async {
        let (sut, defaults) = makeSUT(debounceMilliseconds: 0)
        sut.save(postId: "p1", text: "à annuler")
        let pending = sut.pendingSaves["p1"]
        sut.clear(postId: "p1")
        await pending?.value
        XCTAssertNil(defaults.string(forKey: "meeshy.commentDraft.v1.p1"),
            "une écriture en vol annulée par clear ne doit jamais atterrir")
        XCTAssertNil(sut.load(postId: "p1"))
    }

    func test_load_unknownPost_returnsNil() {
        let (sut, _) = makeSUT()
        XCTAssertNil(sut.load(postId: "inconnu"))
    }

    /// Filet kill-safety : le flush (passage en arrière-plan) fait atterrir
    /// immédiatement toute écriture en vol, sans attendre le debounce.
    func test_flushPendingSaves_writesInFlightDraftImmediately() {
        let (sut, defaults) = makeSUT(debounceMilliseconds: 60_000)
        sut.save(postId: "p1", text: "brouillon long")
        XCTAssertNil(defaults.string(forKey: "meeshy.commentDraft.v1.p1"),
            "précondition : rien n'a encore atterri pendant le debounce")

        sut.flushPendingSaves()

        XCTAssertEqual(defaults.string(forKey: "meeshy.commentDraft.v1.p1"), "brouillon long")
        XCTAssertTrue(sut.pendingSaves.isEmpty)
        XCTAssertEqual(sut.load(postId: "p1"), "brouillon long")
    }
}
