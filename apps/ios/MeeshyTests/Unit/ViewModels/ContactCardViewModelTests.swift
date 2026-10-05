import XCTest
@testable import Meeshy
import MeeshySDK

// MARK: - Doubles

final class MockVCardAttachmentLoader: VCardAttachmentLoading, @unchecked Sendable {
    var cachedResult: VCard?
    var loadResult: VCard?
    private(set) var loadCallCount = 0

    func cachedCard(for attachment: MessageAttachment) -> VCard? { cachedResult }

    func loadCard(for attachment: MessageAttachment) async -> VCard? {
        loadCallCount += 1
        return loadResult
    }
}

final class MockContactResolveService: ContactResolveServiceProviding, @unchecked Sendable {
    var cachedResult: [PublicContactAccount]?
    var resolveResult: [PublicContactAccount] = []
    private(set) var resolveCallCount = 0
    private(set) var lastRequest: ContactResolveRequest?
    private(set) var relationUpdates: [(String, ContactRelation)] = []

    func cachedAccounts(for request: ContactResolveRequest) -> [PublicContactAccount]? { cachedResult }

    func resolve(_ request: ContactResolveRequest) async -> [PublicContactAccount] {
        resolveCallCount += 1
        lastRequest = request
        return resolveResult
    }

    func updateRelation(userId: String, to relation: ContactRelation) {
        relationUpdates.append((userId, relation))
    }
}

@MainActor
final class MockContactCardActionPerformer: ContactCardActionPerforming {
    var sendResult: Result<Void, Error> = .success(())
    var openResult: Conversation?
    private(set) var sendCallCount = 0
    private(set) var openCallCount = 0
    var onSend: (() -> Void)?

    func sendFriendRequest(to userId: String) async -> Bool {
        sendCallCount += 1
        onSend?()
        if case .success = sendResult { return true }
        return false
    }

    func openDirectConversation(with userId: String) async -> Conversation? {
        openCallCount += 1
        return openResult
    }
}

// MARK: - Témoins

@MainActor
final class ContactCardViewModelTests: XCTestCase {

    private struct Failure: Error {}

    private func makeCard() -> VCard {
        VCard(formattedName: "Awa Diallo", phones: [VCardEntry(value: "+33 6 12 34 56 78")], emails: [VCardEntry(value: "awa@example.com")])
    }

    private func makeAccount(relation: ContactRelation = .none) -> PublicContactAccount {
        PublicContactAccount(userId: "u1", displayName: "Awa", username: "awa", relation: relation)
    }

    private func makeSUT(
        cachedCard: VCard? = nil,
        loadedCard: VCard? = nil,
        cachedAccounts: [PublicContactAccount]? = nil,
        resolved: [PublicContactAccount] = []
    ) -> (ContactCardViewModel, MockVCardAttachmentLoader, MockContactResolveService, MockContactCardActionPerformer) {
        let loader = MockVCardAttachmentLoader()
        loader.cachedResult = cachedCard
        loader.loadResult = loadedCard
        let resolver = MockContactResolveService()
        resolver.cachedResult = cachedAccounts
        resolver.resolveResult = resolved
        let performer = MockContactCardActionPerformer()
        let attachment = MessageAttachment(id: "a1", fileName: "Awa.vcf", originalName: "Awa.vcf", mimeType: "text/vcard", fileUrl: "https://x/a.vcf")
        let sut = ContactCardViewModel(attachment: attachment, loader: loader, resolver: resolver, performer: performer, defaultCountry: "FR")
        return (sut, loader, resolver, performer)
    }

    // MARK: - Cache-first

    func test_init_cachedCardAndAccounts_areServedWithoutWaiting() {
        let (sut, loader, _, _) = makeSUT(cachedCard: makeCard(), cachedAccounts: [makeAccount()])
        XCTAssertEqual(sut.card?.displayName, "Awa Diallo")
        XCTAssertEqual(sut.primaryAccount?.userId, "u1")
        XCTAssertEqual(loader.loadCallCount, 0)
    }

    func test_load_cachedCard_doesNotReadTheFileAgainButRevalidatesAccounts() async {
        let (sut, loader, resolver, _) = makeSUT(cachedCard: makeCard(), cachedAccounts: [makeAccount()], resolved: [makeAccount(relation: .friend)])
        await sut.load()
        XCTAssertEqual(loader.loadCallCount, 0)
        XCTAssertEqual(resolver.resolveCallCount, 1)
        XCTAssertEqual(sut.primaryAccount?.relation, .friend)
    }

    func test_load_coldCard_readsParsesAndResolvesItsIdentifiers() async {
        let (sut, _, resolver, _) = makeSUT(loadedCard: makeCard(), resolved: [makeAccount()])
        await sut.load()
        XCTAssertEqual(sut.card?.displayName, "Awa Diallo")
        XCTAssertEqual(resolver.lastRequest?.phones, ["+33 6 12 34 56 78"])
        XCTAssertEqual(resolver.lastRequest?.emails, ["awa@example.com"])
        XCTAssertEqual(resolver.lastRequest?.defaultCountry, "FR")
        XCTAssertEqual(sut.accounts, [makeAccount()])
    }

    func test_load_serverWithoutRoute_showsTheCardWithoutMeeshySection() async {
        let (sut, _, _, _) = makeSUT(loadedCard: makeCard(), resolved: [])
        await sut.load()
        XCTAssertNotNil(sut.card)
        XCTAssertNil(sut.primaryAccount)
        XCTAssertFalse(sut.didFailToRead)
    }

    func test_load_unreadableFile_flagsFailureAndSkipsResolution() async {
        let (sut, _, resolver, _) = makeSUT(loadedCard: nil)
        await sut.load()
        XCTAssertTrue(sut.didFailToRead)
        XCTAssertEqual(resolver.resolveCallCount, 0)
    }

    // MARK: - Actions

    func test_actions_requestReceived_isAStateNotAnAcceptButton() {
        let (sut, _, _, _) = makeSUT()
        XCTAssertEqual(sut.actions(for: makeAccount(relation: .requestReceived)).connect, .received)
    }

    func test_connect_success_marksRequestSentBeforeTheNetworkAnswers() async {
        let (sut, _, resolver, performer) = makeSUT(cachedCard: makeCard(), cachedAccounts: [makeAccount()])
        var relationSeenDuringSend: ContactRelation?
        performer.onSend = { relationSeenDuringSend = sut.primaryAccount?.relation }

        let ok = await sut.connect(makeAccount())

        XCTAssertTrue(ok)
        XCTAssertEqual(relationSeenDuringSend, .requestSent)
        XCTAssertEqual(sut.primaryAccount?.relation, .requestSent)
        XCTAssertEqual(resolver.relationUpdates.last?.1, .requestSent)
        XCTAssertEqual(performer.sendCallCount, 1)
    }

    func test_connect_failure_rollsBackTheRelation() async {
        let (sut, _, resolver, performer) = makeSUT(cachedCard: makeCard(), cachedAccounts: [makeAccount()])
        performer.sendResult = .failure(Failure())

        let ok = await sut.connect(makeAccount())

        XCTAssertFalse(ok)
        XCTAssertEqual(sut.primaryAccount?.relation, ContactRelation.none)
        XCTAssertEqual(resolver.relationUpdates.last?.1, ContactRelation.none)
    }

    func test_openConversation_delegatesToTheExistingDirectConversationFlow() async {
        let (sut, _, _, performer) = makeSUT(cachedCard: makeCard(), cachedAccounts: [makeAccount(relation: .friend)])
        _ = await sut.openConversation(with: makeAccount(relation: .friend))
        XCTAssertEqual(performer.openCallCount, 1)
        XCTAssertTrue(sut.busyUserIds.isEmpty)
    }
}
