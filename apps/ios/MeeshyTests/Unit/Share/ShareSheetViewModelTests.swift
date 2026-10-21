import XCTest
@testable import Meeshy
@testable import MeeshySDK

// MARK: - Doublures

private final class StubShareDirectory: ShareRecipientSourcing, @unchecked Sendable {
    var cached: [MeeshyConversation] = []
    var fresh: Result<[MeeshyConversation], Error> = .success([])
    var people: [ShareRecipient] = []
    var communities: [ShareCommunity] = []
    var results = ShareSearchResults()
    var channels: [ShareRecipient] = []
    private(set) var searchedQueries: [String] = []

    func cachedConversations() async -> [ShareRecipient] { cached.map { ShareRecipient(conversation: $0) } }
    func freshConversations(currentUserId: String) async throws -> [ShareRecipient] { try fresh.get().map { ShareRecipient(conversation: $0) } }
    func cachedPeople(currentUserId: String) async -> [ShareRecipient] { people }
    func cachedCommunities() async -> [ShareCommunity] { communities }
    func search(_ query: String, currentUserId: String) async -> ShareSearchResults {
        searchedQueries.append(query)
        return results
    }
    func writableChannels(of community: ShareCommunity, currentUserId: String) async -> [ShareRecipient] { channels }
}

@MainActor
private final class SpyShareDispatcher: ShareDispatching {
    nonisolated deinit {}
    var outcomes: [String: ShareDeliveryOutcome] = [:]
    var group: ShareRecipient?
    var publishResult = true
    var link: URL?
    var createsGroups = true
    private(set) var delivered: [(recipient: ShareRecipient, request: ShareSendRequest)] = []
    private(set) var groupedPeople: [[String]] = []
    private(set) var published: [PublicationTarget] = []

    func deliver(_ request: ShareSendRequest, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        delivered.append((recipient, request))
        return outcomes[recipient.id] ?? .sent(conversationId: recipient.conversationId ?? "created-\(recipient.id)")
    }
    func createGroup(with people: [ShareRecipient]) async -> ShareRecipient? {
        groupedPeople.append(people.map(\.id))
        return group
    }
    func publish(attachment: MessageAttachment, to target: PublicationTarget) async -> Bool {
        published.append(target)
        return publishResult
    }
    func resolvedLink(for card: ShareCard) async -> URL? { link }
}

private struct Offline: Error {}

/// L'écran de partage unique (#10947) — cache d'abord, la loi de sortie décide,
/// chaque destinataire a sa ligne, la file continue si la feuille se ferme.
@MainActor
final class ShareSheetViewModelTests: XCTestCase {

    private static let source = "6a0000000000000000000099"

    private func conversation(_ id: String, title: String, type: MeeshyConversation.ConversationType = .group, userId: String? = nil) -> MeeshyConversation {
        var conversation = MeeshyConversation(id: id, identifier: id, type: type, title: title)
        conversation.participantUserId = userId
        conversation.memberCount = 3
        return conversation
    }

    private func message(_ id: String, content: String = "Bonjour", effects: MessageEffects = .none, attachments: [MessageAttachment] = []) -> Message {
        var message = Message(id: id, conversationId: Self.source, senderId: "s", content: content, effects: effects, createdAt: Date(), updatedAt: Date())
        message.attachments = attachments
        return message
    }

    private func person(_ id: String) -> ShareRecipient {
        ShareRecipient(id: "user:\(id)", kind: .person, conversationId: nil, userId: id, title: id.capitalized,
                       detail: .friendWithoutConversation, avatarURL: nil)
    }

    private func makeSUT(
        subject: ShareSubject? = nil,
        directory: StubShareDirectory = StubShareDirectory()
    ) -> (sut: ShareSheetViewModel, directory: StubShareDirectory, dispatcher: SpyShareDispatcher) {
        let dispatcher = SpyShareDispatcher()
        let sut = ShareSheetViewModel(
            subject: subject ?? .messages([message("m1")], sourceConversationId: Self.source, conversationIsEncrypted: false),
            directory: directory,
            dispatcher: dispatcher,
            currentUserId: { "me" },
            presence: { _ in .online },
            composableAttachment: { ComposableAttachment.target(in: $0) }
        )
        return (sut, directory, dispatcher)
    }

    // MARK: - Cache d'abord

    func test_load_showsTheCacheThenRevalidatesSilently() async {
        let directory = StubShareDirectory()
        directory.cached = [conversation("c1", title: "Équipe Lyon")]
        directory.fresh = .success([conversation("c2", title: "Famille Diallo"), conversation("c1", title: "Équipe Lyon")])
        let (sut, _, _) = makeSUT(directory: directory)

        await sut.load()

        XCTAssertEqual(sut.conversations.map(\.id), ["conv:c2", "conv:c1"])
        XCTAssertEqual(sut.loadState, .loaded)
        XCTAssertFalse(sut.showsSkeleton)
    }

    func test_load_offlineWithACache_keepsTheCacheWithoutError() async {
        let directory = StubShareDirectory()
        directory.cached = [conversation("c1", title: "Équipe Lyon")]
        directory.fresh = .failure(Offline())
        let (sut, _, _) = makeSUT(directory: directory)

        await sut.load()

        XCTAssertEqual(sut.conversations.map(\.id), ["conv:c1"])
        XCTAssertEqual(sut.loadState, .offline)
    }

    func test_theSourceConversationIsNeverADestination() async {
        let directory = StubShareDirectory()
        directory.cached = [conversation(Self.source, title: "Ici"), conversation("c1", title: "Ailleurs")]
        directory.fresh = .failure(Offline())
        let (sut, _, _) = makeSUT(directory: directory)

        await sut.load()

        XCTAssertEqual(sut.recents.map(\.id), ["conv:c1"])
        XCTAssertEqual(sut.visibleConversations.map(\.id), ["conv:c1"])
    }

    func test_aPersonWhoseDirectConversationIsListed_appearsOnce() async {
        let directory = StubShareDirectory()
        directory.cached = [conversation("d1", title: "Ana", type: .direct, userId: "ana")]
        directory.fresh = .failure(Offline())
        directory.people = [person("ana"), person("yao")]
        let (sut, _, _) = makeSUT(directory: directory)

        await sut.load()

        XCTAssertEqual(sut.visiblePeople.map(\.id), ["user:yao"])
    }

    // MARK: - Deux gestes : toucher un récent, puis Envoyer

    func test_twoGestures_tapARecentThenSend_deliversToIt() async {
        let directory = StubShareDirectory()
        directory.cached = [conversation("c1", title: "Ana")]
        directory.fresh = .failure(Offline())
        let (sut, _, dispatcher) = makeSUT(directory: directory)
        await sut.load()

        sut.toggle(sut.recents[0])
        XCTAssertTrue(sut.plan.canSend)
        await sut.send()

        XCTAssertEqual(dispatcher.delivered.map(\.recipient.id), ["conv:c1"])
        XCTAssertEqual(sut.deliveries["conv:c1"], .sent)
        XCTAssertEqual(sut.firstServed?.conversationId, "c1")
        XCTAssertTrue(sut.isFinished)
    }

    func test_send_withoutRecipient_doesNothing() async {
        let (sut, _, dispatcher) = makeSUT()
        await sut.send()
        XCTAssertTrue(dispatcher.delivered.isEmpty)
    }

    func test_aFailedRecipient_saysWhy_andRetries() async {
        let (sut, _, dispatcher) = makeSUT()
        let ana = person("ana")
        dispatcher.outcomes[ana.id] = .failed(reason: "Refusé : fichier trop lourd")
        sut.toggle(ana)
        await sut.send()
        XCTAssertEqual(sut.deliveries[ana.id], .failed("Refusé : fichier trop lourd"))
        XCTAssertEqual(sut.failedIds, [ana.id])

        dispatcher.outcomes[ana.id] = .queued(conversationId: "c9")
        await sut.retryAll()

        XCTAssertEqual(sut.deliveries[ana.id], .queued)
        XCTAssertEqual(dispatcher.delivered.count, 2)
    }

    // MARK: - D6 : le protégé est retiré, le reste part dans l'ordre

    func test_aMixedSelection_withdrawsTheViewOnce_andSendsTheRestInOrder() async {
        let messages = [message("a"), message("b"), message("c", effects: MessageEffects(flags: .viewOnce)), message("d")]
        let (sut, _, dispatcher) = makeSUT(subject: .messages(messages, sourceConversationId: Self.source, conversationIsEncrypted: false))
        sut.toggle(person("ana"))

        await sut.send()

        XCTAssertEqual(sut.plan.withdrawn, [ShareWithdrawal(id: "c", reason: .viewOnce)])
        XCTAssertEqual(dispatcher.delivered.first?.request.keptMessageIds, ["a", "b", "d"])
    }

    func test_removingAMessage_takesItOutOfWhatLeaves() {
        let (sut, _, _) = makeSUT(subject: .messages([message("a"), message("b")], sourceConversationId: nil, conversationIsEncrypted: false))
        sut.removeMessage("a")
        XCTAssertEqual(sut.plan.kept, ["b"])
        sut.removeMessage("b")
        XCTAssertEqual(sut.plan.kept, ["b"], "le dernier message ne se retire pas : il reste quelque chose à envoyer")
    }

    // MARK: - V7 : la flamme part à sa durée, présélectionnée

    func test_aTimedFlame_leavesWithTheSourceDurationByDefault() async {
        let flame = message("f", effects: MessageEffects(flags: .ephemeral, ephemeralDuration: 3600))
        let (sut, _, dispatcher) = makeSUT(subject: .messages([flame], sourceConversationId: nil, conversationIsEncrypted: false))
        sut.toggle(person("ana"))

        await sut.send()

        XCTAssertEqual(dispatcher.delivered.first?.request.chosenDurationSeconds, 3600)
        XCTAssertFalse(sut.plan.offers(.copyText))
    }

    // MARK: - V2 : une pièce, « Tout le message »

    func test_aPiece_widensToTheWholeMessage_withoutClosing() {
        let photo = MessageAttachment(id: "p3", mimeType: "image/jpeg", fileSize: 1000)
        let carrier = message("m", content: "", attachments: [MessageAttachment(id: "p1", mimeType: "image/jpeg"), photo])
        let (sut, _, _) = makeSUT(subject: .piece(carrier, attachmentId: "p3", sourceConversationId: nil, conversationIsEncrypted: false))
        XCTAssertEqual(sut.plan.kept, ["p3"])
        XCTAssertEqual(sut.offeredPublications, [.story, .post])

        sut.widenToWholeMessage()

        XCTAssertEqual(sut.plan.kept, ["m"])
    }

    func test_aChosenPublication_isPublishedWithTheSend() async {
        let photo = MessageAttachment(id: "p3", mimeType: "image/jpeg", fileSize: 1000)
        let (sut, _, dispatcher) = makeSUT(subject: .piece(message("m", attachments: [photo]), attachmentId: "p3", sourceConversationId: nil, conversationIsEncrypted: false))
        sut.togglePublication(.story)
        XCTAssertTrue(sut.plan.canSend, "« Ma story » se coche comme un destinataire (D2)")

        await sut.send()

        XCTAssertEqual(dispatcher.published, [.story])
        XCTAssertEqual(sut.deliveries["pub:STORY"], .sent)
    }

    // MARK: - D12 : créer un groupe avec deux personnes

    func test_creatingAGroup_sendsOnceToTheNewGroup() async {
        let (sut, _, dispatcher) = makeSUT()
        let group = ShareRecipient(id: "conv:g1", kind: .conversation, conversationId: "g1", userId: nil, title: "Léa, Léon",
                                   detail: .group(members: 3), avatarURL: nil)
        dispatcher.group = group
        sut.toggle(person("lea"))
        XCTAssertFalse(sut.offersGroupCreation)
        sut.toggle(person("leon"))
        XCTAssertTrue(sut.offersGroupCreation)
        sut.createsGroup = true

        await sut.send()

        XCTAssertEqual(dispatcher.groupedPeople, [["user:lea", "user:leon"]])
        XCTAssertEqual(dispatcher.delivered.map(\.recipient.id), ["conv:g1"])
        XCTAssertEqual(sut.deliveries["user:lea"], .sent)
        XCTAssertEqual(sut.deliveries["user:leon"], .sent)
    }

    func test_groupCreationIsOffByDefault_eachPersonGetsTheirOwn() async {
        let (sut, _, dispatcher) = makeSUT()
        sut.toggle(person("lea"))
        sut.toggle(person("leon"))

        await sut.send()

        XCTAssertTrue(dispatcher.groupedPeople.isEmpty)
        XCTAssertEqual(dispatcher.delivered.map(\.recipient.id), ["user:lea", "user:leon"])
    }

    // MARK: - V8 : chiffré

    func test_anEncryptedSource_copiesOnTheDevice() async {
        let (sut, _, dispatcher) = makeSUT(subject: .messages([message("e")], sourceConversationId: nil, conversationIsEncrypted: true))
        sut.toggle(person("ana"))

        await sut.send()

        XCTAssertEqual(dispatcher.delivered.first?.request.copyOnDevice, true)
        XCTAssertEqual(sut.plan.encryption?.warnDestinationIds, ["user:ana"])
        XCTAssertTrue(sut.offeredPublications.isEmpty)
    }

    // MARK: - D10 : plafonds

    func test_beyondTenRecipients_theSendWaits() {
        let (sut, _, _) = makeSUT()
        (0..<11).forEach { sut.toggle(person("p\($0)")) }
        XCTAssertEqual(sut.plan.limits.overRecipients, 1)
        XCTAssertFalse(sut.plan.canSend)
    }

    // MARK: - V5 : recherche fusionnée

    func test_search_mergesServerResults_belowTwoCharactersStaysLocal() async {
        let directory = StubShareDirectory()
        directory.results = ShareSearchResults(people: [person("lelia")], conversations: [], communities: [ShareCommunity(id: "k", name: "Lectures", avatarURL: nil)])
        let (sut, _, _) = makeSUT(directory: directory)

        await sut.search("l", debounce: .zero)
        XCTAssertNil(sut.searchResults)
        XCTAssertTrue(directory.searchedQueries.isEmpty)

        await sut.search("lé", debounce: .zero)
        XCTAssertEqual(directory.searchedQueries, ["lé"])
        XCTAssertEqual(sut.visiblePeople.map(\.id), ["user:lelia"])
        XCTAssertEqual(sut.visibleCommunities.map(\.id), ["k"])
    }

    func test_search_cancelledDuringDebounce_neverQueriesDirectory() async {
        let (sut, directory, _) = makeSUT()
        let task = Task { await sut.search("ab", debounce: .seconds(5)) }
        await Task.yield()
        task.cancel()
        await task.value
        XCTAssertTrue(directory.searchedQueries.isEmpty)
    }

    // MARK: - Une story : le lien suivi remplace l'adresse directe

    func test_aStory_usesItsTrackedLinkOnceResolved() async {
        let (sut, _, dispatcher) = makeSUT(subject: .story(id: "s1", authorName: "Moussa"))
        dispatcher.link = URL(string: "https://meeshy.me/l/abc")

        await sut.load()

        guard case .card(let card) = sut.subject else { return XCTFail("la story reste une carte") }
        XCTAssertEqual(card.url?.absoluteString, "https://meeshy.me/l/abc")
        XCTAssertTrue(card.messageText?.contains("Moussa") == true)
        XCTAssertEqual(sut.plan.title, .send)
        XCTAssertFalse(sut.plan.offers(.publishStory), "D14 : la story d'autrui ne se republie pas")
    }

    // MARK: - Depuis une autre app (V1, V9) — l'extension de partage

    private func incoming(_ count: Int, bytes: Int = 1_000, text: String? = nil) -> ShareSubject {
        .incoming(ShareIncoming(
            media: (0..<count).map { ShareIncomingMedia(id: "f\($0)", mimeType: "image/jpeg", bytes: bytes, fileURL: nil) },
            text: text
        ))
    }

    func test_incomingMedia_isSent_withTheCaptionInTheMessageText() async {
        let (sut, _, dispatcher) = makeSUT(subject: incoming(2, text: "https://meeshy.me"))
        XCTAssertEqual(sut.plan.title, .send)
        XCTAssertEqual(sut.plan.caption?.placement, .messageText)
        XCTAssertTrue(sut.plan.offers(.studio))
        sut.caption = "Regarde"
        sut.toggle(person("ana"))

        await sut.send()

        let request = dispatcher.delivered.first?.request
        XCTAssertEqual(request?.subject.composedText(caption: request?.caption ?? ""), "Regarde\nhttps://meeshy.me")
        XCTAssertEqual(request?.subject.incomingMediaIds, ["f0", "f1"])
    }

    func test_incomingBeyondTwentyFiles_theSendWaits_untilTheLastOnesAreRemoved() {
        let (sut, _, _) = makeSUT(subject: incoming(22))
        sut.toggle(person("ana"))
        XCTAssertEqual(sut.plan.limits.trimCount, 2)
        XCTAssertFalse(sut.plan.canSend)

        sut.trimOverflow()

        XCTAssertEqual(sut.subject.incomingMediaIds, (0..<20).map { "f\($0)" })
        XCTAssertEqual(sut.plan.limits.trimCount, 0)
        XCTAssertTrue(sut.plan.canSend)
    }

    func test_incomingBeyondFiveHundredMegabytes_trimsUntilItFits() {
        let (sut, _, _) = makeSUT(subject: incoming(3, bytes: 200 * 1024 * 1024))
        XCTAssertEqual(sut.plan.limits.trimCount, 1)
        sut.trimOverflow()
        XCTAssertEqual(sut.subject.incomingMediaIds, ["f0", "f1"])
    }

    func test_anIncomingPiece_isRemovedOrMoved_butTheLastOneStays() {
        let (sut, _, _) = makeSUT(subject: incoming(3))
        sut.moveIncoming("f2", by: -1)
        XCTAssertEqual(sut.subject.incomingMediaIds, ["f0", "f2", "f1"])
        sut.moveIncoming("f0", by: -1)
        XCTAssertEqual(sut.subject.incomingMediaIds, ["f0", "f2", "f1"], "la première pièce ne recule pas")
        sut.removeIncoming("f2")
        sut.removeIncoming("f0")
        sut.removeIncoming("f1")
        XCTAssertEqual(sut.subject.incomingMediaIds, ["f1"], "la dernière pièce ne se retire pas : il reste quelque chose à envoyer")
    }

    func test_incomingText_isAText_andALink_isALink() {
        XCTAssertEqual(ShareSubject.incoming(ShareIncoming(media: [], text: "Bonjour")).entry(), .text("Bonjour"))
        XCTAssertEqual(ShareSubject.incoming(ShareIncoming(media: [], text: "https://meeshy.me/x")).entry(),
                       .link(url: "https://meeshy.me/x", text: nil))
    }

    func test_groupCreation_isNotOffered_whenTheHostCannotCreateGroups() {
        let (sut, _, dispatcher) = makeSUT()
        dispatcher.createsGroups = false
        sut.toggle(person("lea"))
        sut.toggle(person("leon"))
        XCTAssertFalse(sut.offersGroupCreation)
    }

    /// Un partage relayé par l'extension (D7, fragment 3) rouvre l'écran de
    /// l'app sur les conversations déjà choisies — un geste de moins.
    func test_aRelayedShare_reopensWithItsConversationsChosen() async {
        let directory = StubShareDirectory()
        directory.cached = [conversation("c1", title: "Comptabilité"), conversation("c2", title: "Équipe Lyon")]
        directory.fresh = .failure(Offline())
        let relayed = ShareSubject.incoming(ShareIncoming(media: [], text: "Le devis", preselectedConversationIds: ["c2"]))
        let (sut, _, _) = makeSUT(subject: relayed, directory: directory)

        await sut.load()

        XCTAssertEqual(sut.selection.map(\.id), ["conv:c2"])
    }
}
