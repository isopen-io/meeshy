import MeeshySDK
import XCTest
@testable import Meeshy

/// LES TEXTES D'UN CADRE (#8743) — CACHE-FIRST : le nom du groupe, son type et son accent
/// viennent de la conversation en cache, à défaut de ce que le maillage sait déjà ; aucune
/// attente réseau, et rien n'est lu quand l'appel n'a pas de conversation.
@MainActor
final class CallFrameTextsResolverTests: XCTestCase {
    private let clock = Date(timeIntervalSince1970: 1_790_000_000)

    private func makeConversation(type: MeeshyConversation.ConversationType, title: String?, customName: String? = nil) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "conv-1",
            identifier: "ident-conv-1",
            type: type,
            title: title,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        conversation.userState.customName = customName
        return conversation
    }

    private func makeSUT(cached: MeeshyConversation?) -> (sut: CallFrameTextsResolver, cache: MockCallConversationCache) {
        let cache = MockCallConversationCache(result: cached)
        let instant = clock
        let sut = CallFrameTextsResolver(cache: cache, now: { instant })
        return (sut, cache)
    }

    private func context(id: String? = "conv-1", knownTitle: String? = nil, isGroupCall: Bool = false) -> CallFrameCallContext {
        CallFrameCallContext(conversationId: id, knownGroupTitle: knownTitle, isGroupCall: isGroupCall)
    }

    // MARK: - Cache-first

    func test_texts_cachedGroup_usesItsTitleAndAccent() async throws {
        let conversation = makeConversation(type: .group, title: "Les Copains")
        let (sut, cache) = makeSUT(cached: conversation)

        let texts = await sut.texts(for: context(knownTitle: "Titre du maillage"))

        XCTAssertEqual(cache.requestedIds, ["conv-1"])
        XCTAssertEqual(texts.groupName, "Les Copains")
        XCTAssertTrue(texts.isGroup)
        let accent = try XCTUnwrap(texts.accentHex)
        XCTAssertTrue(accent.primary.hasPrefix("#"))
        XCTAssertNotNil(CallFrameColor.parse(accent.primary))
        XCTAssertEqual(accent.primary.dropFirst().uppercased(), conversation.colorPalette.primary.replacingOccurrences(of: "#", with: "").uppercased())
    }

    func test_texts_customName_winsOverTheTitle() async {
        let (sut, _) = makeSUT(cached: makeConversation(type: .group, title: "Titre", customName: "Ma bande"))
        let texts = await sut.texts(for: context())
        XCTAssertEqual(texts.groupName, "Ma bande")
    }

    func test_texts_cachedDirect_isNotAGroup_evenIfTheMeshSaysSo() async {
        let (sut, _) = makeSUT(cached: makeConversation(type: .direct, title: "Karim"))
        let texts = await sut.texts(for: context(knownTitle: "Groupe", isGroupCall: true))
        XCTAssertFalse(texts.isGroup)
        XCTAssertNil(texts.groupName)
    }

    func test_texts_notCached_fallsBackToWhatTheMeshKnows() async {
        let (sut, cache) = makeSUT(cached: nil)
        let texts = await sut.texts(for: context(knownTitle: "Soirée jeux", isGroupCall: true))
        XCTAssertEqual(cache.requestedIds, ["conv-1"])
        XCTAssertTrue(texts.isGroup)
        XCTAssertEqual(texts.groupName, "Soirée jeux")
        XCTAssertNil(texts.accentHex)
    }

    func test_texts_blankTitles_haveNoGroupName() async {
        let (sut, _) = makeSUT(cached: makeConversation(type: .group, title: "  "))
        let texts = await sut.texts(for: context(knownTitle: " "))
        XCTAssertTrue(texts.isGroup)
        XCTAssertNil(texts.groupName)
    }

    func test_texts_withoutConversation_neverReadsTheCache() async {
        let (sut, cache) = makeSUT(cached: makeConversation(type: .group, title: "Les Copains"))
        let texts = await sut.texts(for: context(id: nil, isGroupCall: true))
        XCTAssertTrue(cache.requestedIds.isEmpty)
        XCTAssertTrue(texts.isGroup)
        XCTAssertNil(texts.groupName)
    }

    func test_immediateTexts_neverReadsTheCache_andCarriesTheDate() {
        let (sut, cache) = makeSUT(cached: makeConversation(type: .group, title: "Les Copains"))
        let texts = sut.immediateTexts(for: context(knownTitle: "Soirée jeux", isGroupCall: true))
        XCTAssertTrue(cache.requestedIds.isEmpty)
        XCTAssertEqual(texts.groupName, "Soirée jeux")
        XCTAssertEqual(texts.date, CallFrameTextsRule.dateText(clock))
        XCTAssertFalse(texts.date.isEmpty)
    }

    // MARK: - La règle

    func test_isGroup_directAndBotAreDuo_everythingElseIsAGroup() {
        let duo: [MeeshyConversation.ConversationType] = [.direct, .bot]
        MeeshyConversation.ConversationType.allCases.forEach { type in
            XCTAssertEqual(CallFrameTextsRule.isGroup(type), !duo.contains(type), type.rawValue)
        }
    }

    func test_hex_prefixesTheHash_andRejectsWhatIsNotAColour() {
        XCTAssertEqual(CallFrameTextsRule.hex("6366F1"), "#6366F1")
        XCTAssertEqual(CallFrameTextsRule.hex("#ABC"), "#ABC")
        XCTAssertNil(CallFrameTextsRule.hex("zz"))
        XCTAssertNil(CallFrameTextsRule.hex(""))
    }
}

@MainActor
private final class MockCallConversationCache: CallConversationCacheProviding {
    let result: MeeshyConversation?
    private(set) var requestedIds: [String] = []

    init(result: MeeshyConversation?) {
        self.result = result
    }

    func cachedConversation(id: String) async -> MeeshyConversation? {
        requestedIds.append(id)
        return result
    }
}
