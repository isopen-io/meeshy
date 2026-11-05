import XCTest
@testable import Meeshy

/// #16341 — le repli de la barre se retient PAR conversation, et survit au
/// redémarrage (une nouvelle instance relit le même stockage).
@MainActor
final class ConversationComposerFoldMemoryTests: XCTestCase {

    private func makeDefaults() -> UserDefaults {
        let name = "fold-memory-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        addTeardownBlock { defaults.removePersistentDomain(forName: name) }
        return defaults
    }

    func test_isFolded_untouchedConversation_isExpandedByDefault() {
        let memory = ConversationComposerFoldMemory(defaults: makeDefaults())
        XCTAssertFalse(memory.isFolded(conversationId: "c1"))
    }

    func test_remember_folded_isRecalledForThatConversationOnly() {
        let memory = ConversationComposerFoldMemory(defaults: makeDefaults())
        memory.remember(folded: true, conversationId: "c1")
        XCTAssertTrue(memory.isFolded(conversationId: "c1"))
        XCTAssertFalse(memory.isFolded(conversationId: "c2"))
    }

    func test_remember_unfolded_forgetsTheFold() {
        let memory = ConversationComposerFoldMemory(defaults: makeDefaults())
        memory.remember(folded: true, conversationId: "c1")
        memory.remember(folded: false, conversationId: "c1")
        XCTAssertFalse(memory.isFolded(conversationId: "c1"))
    }

    func test_isFolded_newInstanceOnSameStorage_survivesRelaunch() {
        let defaults = makeDefaults()
        ConversationComposerFoldMemory(defaults: defaults).remember(folded: true, conversationId: "c1")
        XCTAssertTrue(ConversationComposerFoldMemory(defaults: defaults).isFolded(conversationId: "c1"))
    }

    func test_remember_beyondCapacity_dropsTheOldestFold() {
        let memory = ConversationComposerFoldMemory(defaults: makeDefaults())
        (0...ConversationComposerFoldMemory.capacity).forEach { memory.remember(folded: true, conversationId: "c\($0)") }
        XCTAssertFalse(memory.isFolded(conversationId: "c0"))
        XCTAssertTrue(memory.isFolded(conversationId: "c\(ConversationComposerFoldMemory.capacity)"))
    }

    func test_remember_emptyConversationId_writesNothing() {
        let defaults = makeDefaults()
        ConversationComposerFoldMemory(defaults: defaults).remember(folded: true, conversationId: "")
        XCTAssertNil(defaults.stringArray(forKey: ConversationComposerFoldMemory.storageKey))
    }

    /// La conversation remet SON id au repli : sans lui, rien ne se retient.
    func test_conversationComposer_foldIsKeyedByConversationId() throws {
        let host = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ConversationView+Composer.swift")
        let core = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ConversationLayers/ConversationComposerLayers.swift")
        XCTAssertTrue(host.contains("foldMemoryKey: viewModel.conversationId"))
        XCTAssertTrue(core.contains("memoryKey: foldMemoryKey"))
    }
}
