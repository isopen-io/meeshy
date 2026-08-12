import XCTest
import Combine
@testable import Meeshy

@MainActor
final class DraftStoreTests: XCTestCase {

    private func makeSUT() -> DraftStore {
        let store = DraftStore(userDefaults: UserDefaults(suiteName: "DraftStoreTests-\(UUID().uuidString)")!)
        store.clearAll()
        return store
    }

    func test_load_emptyStore_returnsNil() {
        let sut = makeSUT()
        XCTAssertNil(sut.load(for: "conv123"))
    }

    func test_save_thenLoad_returnsSavedDraft() {
        let sut = makeSUT()
        sut.save("Hello draft", for: "conv123")
        XCTAssertEqual(sut.loadText(for: "conv123"), "Hello draft")
    }

    func test_save_emptyString_removesDraft() {
        let sut = makeSUT()
        sut.save("Hello", for: "conv123")
        sut.save("", for: "conv123")
        XCTAssertNil(sut.load(for: "conv123"))
    }

    func test_save_whitespaceOnly_removesDraft() {
        let sut = makeSUT()
        sut.save("Hello", for: "conv123")
        sut.save("   ", for: "conv123")
        XCTAssertNil(sut.load(for: "conv123"))
    }

    func test_multipleConversations_isolatedDrafts() {
        let sut = makeSUT()
        sut.save("Draft A", for: "conv1")
        sut.save("Draft B", for: "conv2")
        XCTAssertEqual(sut.loadText(for: "conv1"), "Draft A")
        XCTAssertEqual(sut.loadText(for: "conv2"), "Draft B")
    }

    func test_remove_clearsDraftForConversation() {
        let sut = makeSUT()
        sut.save("Draft", for: "conv1")
        sut.remove(for: "conv1")
        XCTAssertNil(sut.load(for: "conv1"))
    }

    func test_clearAll_removesAllDrafts() {
        let sut = makeSUT()
        sut.save("A", for: "conv1")
        sut.save("B", for: "conv2")
        sut.clearAll()
        XCTAssertNil(sut.load(for: "conv1"))
        XCTAssertNil(sut.load(for: "conv2"))
    }

    func test_hasDraft_returnsTrueWhenDraftExists() {
        let sut = makeSUT()
        XCTAssertFalse(sut.hasDraft(for: "conv1"))
        sut.save("Draft", for: "conv1")
        XCTAssertTrue(sut.hasDraft(for: "conv1"))
    }

    // MARK: - Overwrite

    func test_save_overwritesExistingDraft() {
        let sut = makeSUT()
        sut.save("First", for: "conv1")
        sut.save("Second", for: "conv1")
        XCTAssertEqual(sut.loadText(for: "conv1"), "Second")
    }

    // MARK: - Remove Non-Existent

    func test_remove_nonExistentConversation_doesNotCrash() {
        let sut = makeSUT()
        sut.remove(for: "doesNotExist")
        XCTAssertNil(sut.load(for: "doesNotExist"))
    }

    // MARK: - Clear All Isolation

    func test_clearAll_doesNotAffectOtherUserDefaultsKeys() {
        let defaults = UserDefaults(suiteName: "DraftStoreTests")!
        defaults.set("preserved", forKey: "other_key")
        let sut = DraftStore(userDefaults: defaults)
        sut.save("Draft", for: "conv1")
        sut.clearAll()
        XCTAssertEqual(defaults.string(forKey: "other_key"), "preserved")
        defaults.removeObject(forKey: "other_key")
    }

    // MARK: - Has Draft After Remove

    func test_hasDraft_afterRemove_returnsFalse() {
        let sut = makeSUT()
        sut.save("Draft", for: "conv1")
        sut.remove(for: "conv1")
        XCTAssertFalse(sut.hasDraft(for: "conv1"))
    }

    // MARK: - Preserves Whitespace In Content

    func test_save_preservesInternalWhitespace() {
        let sut = makeSUT()
        sut.save("Hello   world", for: "conv1")
        XCTAssertEqual(sut.loadText(for: "conv1"), "Hello   world")
    }

    // MARK: - Newlines

    func test_save_newlinesOnly_removesDraft() {
        let sut = makeSUT()
        sut.save("Draft", for: "conv1")
        sut.save("\n\n\n", for: "conv1")
        XCTAssertNil(sut.load(for: "conv1"))
    }

    // MARK: - allNonEmptyDrafts

    func test_allNonEmptyDrafts_excludesEmptyDrafts() {
        let sut = makeSUT()
        sut.save(MessageDraft(text: "hello"), for: "conv1")
        sut.save(MessageDraft(text: "   "), for: "conv2")
        let drafts = sut.allNonEmptyDrafts()
        XCTAssertEqual(Array(drafts.keys), ["conv1"])
        XCTAssertEqual(drafts["conv1"]?.text, "hello")
    }

    /// A swipe-to-reply with NO typed text persists a draft (empty text + a reply
    /// reference) so the composer can restore the reply context — but it must NOT
    /// raise the "Brouillon" badge, which would point the user at a draft message
    /// that doesn't exist.
    func test_allNonEmptyDrafts_excludesReplyOnlyDraft_withNoTypedText() {
        let sut = makeSUT()
        sut.save(MessageDraft(text: "", replyToId: "msg_42"), for: "conv-reply")
        sut.save(MessageDraft(text: "real draft"), for: "conv-text")

        let drafts = sut.allNonEmptyDrafts()

        XCTAssertEqual(Array(drafts.keys), ["conv-text"],
                       "a reply-only draft (no typed text) must not raise the Brouillon badge")
        // The reply reference is still persisted so the composer restores it on open.
        XCTAssertEqual(sut.load(for: "conv-reply")?.replyToId, "msg_42")
    }

    func test_allNonEmptyDrafts_emptyStore_returnsEmpty() {
        let sut = makeSUT()
        XCTAssertTrue(sut.allNonEmptyDrafts().isEmpty)
    }

    // MARK: - changed publisher

    func test_save_emitsChanged() {
        let sut = makeSUT()
        var changeCount = 0
        let c = sut.changed.sink { changeCount += 1 }
        sut.save(MessageDraft(text: "hi"), for: "conv1")
        c.cancel()
        XCTAssertEqual(changeCount, 1)
    }

    func test_remove_emitsChanged() {
        let sut = makeSUT()
        sut.save(MessageDraft(text: "hi"), for: "conv1")
        var changeCount = 0
        let c = sut.changed.sink { changeCount += 1 }
        sut.remove(for: "conv1")
        c.cancel()
        XCTAssertEqual(changeCount, 1)
    }

    // MARK: - DraftSummary

    func test_draftSummary_equatable() {
        let date = Date(timeIntervalSince1970: 100)
        XCTAssertEqual(
            DraftSummary(previewText: "a", updatedAt: date),
            DraftSummary(previewText: "a", updatedAt: date)
        )
        XCTAssertNotEqual(
            DraftSummary(previewText: "a", updatedAt: date),
            DraftSummary(previewText: "b", updatedAt: date)
        )
    }

    // MARK: - Q4 — Per-user isolation (privacy)

    /// Prouve que les brouillons d'un user A ne sont PAS visibles par un
    /// user B sur le même device. Avant ce fix, `UserDefaults` utilisait
    /// la clé `meeshy_draft_<convId>` sans préfixage userId — fuite
    /// privacy ACTIVE en prod.
    func test_drafts_isolatedByUserId_noCrossUserLeak() {
        let suite = "DraftStoreTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }

        // User A drafts a sensitive message
        let userAStore = DraftStore(userDefaults: defaults, userIdProvider: { "userA" })
        userAStore.save("Je veux divorcer", for: "convXYZ")

        // User B opens the same conversation on the same device
        let userBStore = DraftStore(userDefaults: defaults, userIdProvider: { "userB" })
        let leakedDraft = userBStore.loadText(for: "convXYZ")

        XCTAssertEqual(
            leakedDraft, "",
            "user B doit voir un compose vide, PAS le brouillon de user A"
        )

        // Sanity check: user A peut toujours lire son propre brouillon
        XCTAssertEqual(userAStore.loadText(for: "convXYZ"), "Je veux divorcer")
    }

    /// Prouve que `allNonEmptyDrafts()` ne retourne que les brouillons du
    /// user courant — pas ceux des autres users persistés dans le même
    /// `UserDefaults`. La liste de conversations utilise cette méthode
    /// pour afficher le badge "Brouillon", donc fuite UI directe sinon.
    func test_allNonEmptyDrafts_filtersByCurrentUserOnly() {
        let suite = "DraftStoreTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }

        // Two users populate drafts on the same device
        let userAStore = DraftStore(userDefaults: defaults, userIdProvider: { "userA" })
        userAStore.save("A1", for: "conv1")
        userAStore.save("A2", for: "conv2")

        let userBStore = DraftStore(userDefaults: defaults, userIdProvider: { "userB" })
        userBStore.save("B1", for: "conv1")  // different content for same conv

        // User B's view of "all drafts"
        let userBDrafts = userBStore.allNonEmptyDrafts()

        XCTAssertEqual(userBDrafts.count, 1, "user B doit voir SES propres brouillons uniquement")
        XCTAssertEqual(userBDrafts["conv1"]?.text, "B1")
        XCTAssertNil(userBDrafts["conv2"], "conv2 brouillon de user A NE doit PAS apparaître chez user B")
    }

    /// Migration ascendante : un brouillon écrit par une version legacy
    /// (sans userId préfixé dans la clé) doit être attribué au user
    /// courant au premier `load()`, puis supprimé de l'ancien emplacement.
    /// Sinon, les drafts existants en prod seraient perdus à la sortie
    /// de cette migration.
    func test_load_migratesLegacyKeyToCurrentUser() throws {
        let suite = "DraftStoreTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }

        // Simulate a legacy draft persisted by an older build (no userId)
        let legacyDraft = MessageDraft(text: "Legacy draft", updatedAt: Date())
        let legacyKey = "meeshy_draft_convLegacy"
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(legacyDraft)
        defaults.set(data, forKey: legacyKey)

        // First load under user A should pick up the legacy draft and migrate it
        let userAStore = DraftStore(userDefaults: defaults, userIdProvider: { "userA" })
        let loaded = userAStore.loadText(for: "convLegacy")

        XCTAssertEqual(loaded, "Legacy draft", "the legacy draft must be readable")
        XCTAssertNil(
            defaults.data(forKey: legacyKey),
            "after migration, the legacy unprefixed key must be removed"
        )
        XCTAssertNotNil(
            defaults.data(forKey: "meeshy_draft_userA_convLegacy"),
            "after migration, the per-user key must hold the draft"
        )

        // User B on same device must NOT inherit the migrated draft
        let userBStore = DraftStore(userDefaults: defaults, userIdProvider: { "userB" })
        XCTAssertEqual(userBStore.loadText(for: "convLegacy"), "")
    }
}

// MARK: - ConversationComposerTextModel (politique de persistance du brouillon)
//
// Le modèle isole le texte du composer de l'arbre racine de ConversationView
// et porte la politique de persistance : immédiate à chaque fin de mot
// (espace/retour) ou champ vidé, débouncée 400 ms en milieu de mot, flush
// immédiat aux sorties de vue (l'ancien `.onChange` racine ne peut plus
// exister : la racine ne se ré-évalue plus à la frappe).
@MainActor
final class ConversationComposerTextModelTests: XCTestCase {

    func test_midWordBurst_firesOnce_withLastValue() async {
        let model = ConversationComposerTextModel()
        let fired = expectation(description: "debounced persist fired")
        fired.assertForOverFulfill = true
        var received: [String] = []
        model.onPersistNeeded = { text in
            received.append(text)
            fired.fulfill()
        }

        model.text = "B"
        model.text = "Bo"
        model.text = "Bon"
        model.text = "Bonjour"

        await fulfillment(of: [fired], timeout: 2.0)
        XCTAssertEqual(received, ["Bonjour"],
            "une rafale en milieu de mot ne doit produire qu'UNE persistance, avec le dernier texte")
    }

    func test_wordBoundary_space_persistsImmediately() async {
        let model = ConversationComposerTextModel()
        let fired = expectation(description: "space persisted immediately")
        fired.assertForOverFulfill = true
        var received: [String] = []
        model.onPersistNeeded = { text in
            received.append(text)
            fired.fulfill()
        }

        model.text = "Bonjour "

        // Timeout 0.2s << fenêtre de débounce 400ms : prouve l'immédiateté.
        await fulfillment(of: [fired], timeout: 0.2)
        XCTAssertEqual(received, ["Bonjour "])
    }

    func test_clearedText_persistsImmediately() async {
        let model = ConversationComposerTextModel()
        model.text = "Bonjour " // persistée immédiatement (espace)
        try? await Task.sleep(nanoseconds: 50_000_000)

        let cleared = expectation(description: "empty text persisted immediately")
        cleared.assertForOverFulfill = true
        model.onPersistNeeded = { text in
            guard text.isEmpty else { return }
            cleared.fulfill()
        }

        model.text = ""

        // L'envoi vide le champ : le brouillon doit être purgé tout de suite,
        // pas 400ms plus tard.
        await fulfillment(of: [cleared], timeout: 0.2)
    }

    func test_flushPendingChange_emitsImmediately_andCancelsPendingWindow() async {
        let model = ConversationComposerTextModel()
        let fired = expectation(description: "flush emitted current text")
        fired.assertForOverFulfill = true
        var received: [String] = []
        model.onPersistNeeded = { text in
            received.append(text)
            fired.fulfill()
        }

        model.text = "Brouillon"
        model.flushPendingChange()

        await fulfillment(of: [fired], timeout: 0.2)
        XCTAssertEqual(received, ["Brouillon"])

        // La fenêtre de débounce annulée ne doit PAS re-émettre derrière.
        try? await Task.sleep(nanoseconds: 600_000_000)
        XCTAssertEqual(received.count, 1,
            "le flush annule la fenêtre en vol — pas de double persistance")
    }

    func test_initialValue_doesNotFirePersist() async {
        let model = ConversationComposerTextModel()
        let notFired = expectation(description: "no persist for untouched text")
        notFired.isInverted = true
        model.onPersistNeeded = { _ in notFired.fulfill() }

        await fulfillment(of: [notFired], timeout: 0.6)
    }
}
