import Combine
import Foundation
import XCTest
@testable import Meeshy
import MeeshySDK

/// #9899 — le coordinateur de la traduction sur l'appareil : ce qu'il montre, ce
/// qu'il partage et ce qu'il se refuse. Les doubles sont privés à ce fichier ;
/// l'attente passe par des expectations remplies depuis les doubles, et un
/// « n'arrive jamais » par une expectation inversée qui couvre le délai de
/// décantation du coordinateur (250 ms).

private enum Ids {
    static let conversation = "64f0c0ffee0000000000c0de"
    static let otherConversation = "64f0c0ffee0000000000c0df"
    static let messageA = "64f0c0ffee0000000000a001"
    static let messageB = "64f0c0ffee0000000000a002"
    static let unknownMessage = "64f0c0ffee0000000000a0ff"
    static let sharedA = "64f0c0ffee0000000000d001"
    static let sharedB = "64f0c0ffee0000000000d002"
    static let peer = "64f0c0ffee0000000000b001"
}

private let patience: TimeInterval = 2
private let quietPeriod: TimeInterval = 0.8

private struct AppliedTranslation: Equatable {
    let id: String
    let messageId: String
    let sourceLanguage: String
    let targetLanguage: String
    let content: String
    let model: String?
    let persisting: Bool
}

private struct TranslateCall: Equatable {
    let requests: [DeviceTranslationRequest]
    let pair: DeviceTranslationPair
}

private struct FetchCall: Equatable {
    let conversationId: String
    let messageIds: [String]
    let languages: [String]
}

private struct ShareCall {
    let conversationId: String
    let body: ShareTranslationBody
}

private struct SharingUnavailable: Error {}

@MainActor
private final class FakeEngine: DeviceTranslationEngineProviding {
    nonisolated deinit {}

    let engineName = "tests-engine"
    var fallbackAvailability: DeviceTranslationAvailability = .ready
    var availabilities: [DeviceTranslationPair: DeviceTranslationAvailability] = [:]
    var respond: ([DeviceTranslationRequest], DeviceTranslationPair) -> [DeviceTranslationResult] = { requests, _ in
        requests.map { DeviceTranslationResult(id: $0.id, text: "Bonjour") }
    }
    var onAvailability: (() -> Void)?
    var onTranslate: (() -> Void)?
    /// Retient la réponse du moteur : le test change le monde PENDANT que
    /// l'appareil traduit, puis la relâche.
    var holdTranslation: (@MainActor () async -> Void)?
    private(set) var availabilityQueries: [DeviceTranslationPair] = []
    private(set) var translateCalls: [TranslateCall] = []
    private(set) var cancelPendingCount = 0

    func availability(of pair: DeviceTranslationPair) async -> DeviceTranslationAvailability {
        availabilityQueries.append(pair)
        onAvailability?()
        return availabilities[pair] ?? fallbackAvailability
    }

    func translate(
        _ requests: [DeviceTranslationRequest],
        pair: DeviceTranslationPair
    ) async -> [DeviceTranslationResult] {
        translateCalls.append(TranslateCall(requests: requests, pair: pair))
        onTranslate?()
        await holdTranslation?()
        return respond(requests, pair)
    }

    func cancelPending() {
        cancelPendingCount += 1
    }
}

@MainActor
private final class FakeConversationSource: DeviceTranslationConversationSource {
    nonisolated deinit {}

    let deviceTranslationConversationId: String
    var messages: [MeeshyMessage]
    var readers: [String]
    var servedLanguages: [String: [String]] = [:]
    var onMessagesRead: (() -> Void)?
    var onApply: (() -> Void)?
    private(set) var applied: [AppliedTranslation] = []
    private let triggers = PassthroughSubject<Void, Never>()

    init(messages: [MeeshyMessage], readers: [String]) {
        deviceTranslationConversationId = Ids.conversation
        self.messages = messages
        self.readers = readers
    }

    var deviceTranslationMessages: [MeeshyMessage] {
        onMessagesRead?()
        return messages
    }

    var deviceTranslationReaderLanguages: [String] { readers }

    var deviceTranslationTriggers: AnyPublisher<Void, Never> { triggers.eraseToAnyPublisher() }

    func fireTrigger() {
        triggers.send(())
    }

    func deviceTranslatedLanguages(of messageId: String) -> [String] {
        servedLanguages[messageId] ?? []
    }

    func applyDeviceTranslation(_ translation: MessageTranslation, persisting: Bool) {
        applied.append(
            AppliedTranslation(
                id: translation.id,
                messageId: translation.messageId,
                sourceLanguage: translation.sourceLanguage,
                targetLanguage: translation.targetLanguage,
                content: translation.translatedContent,
                model: translation.translationModel,
                persisting: persisting
            )
        )
        onApply?()
    }
}

private final class FakeSharing: SharedTranslationServiceProviding, @unchecked Sendable {
    typealias Hold = @MainActor @Sendable () async -> Void

    var fetchResult: [SharedTranslation] = []
    var fetchFails = false
    var shareFails = false
    /// Le refus que la passerelle oppose au partage, quand ce n'est pas une panne.
    var shareError: (any Error)?
    /// Retient la requête sur le fil, comme `FakeEngine.holdTranslation`.
    var holdShare: Hold?
    var onFetch: (@MainActor () -> Void)?
    var onShare: (@MainActor () -> Void)?
    private(set) var fetchCalls: [FetchCall] = []
    private(set) var shareCalls: [ShareCall] = []

    nonisolated func share(conversationId: String, body: ShareTranslationBody) async throws -> ShareTranslationResult {
        let (failure, hold) = await MainActor.run { () -> ((any Error)?, Hold?) in
            shareCalls.append(ShareCall(conversationId: conversationId, body: body))
            onShare?()
            if shareFails { return (SharingUnavailable(), holdShare) }
            return (shareError, holdShare)
        }
        if let hold { await hold() }
        if let failure { throw failure }
        return ShareTranslationResult(
            sharedTranslation: SharedTranslation(
                id: Ids.sharedA,
                conversationId: conversationId,
                messageId: body.messageId,
                targetLanguage: body.targetLanguage,
                envelope: body.envelope,
                sharedBy: Ids.peer,
                sharedAt: "2026-10-10T10:00:00.000Z"
            ),
            created: true
        )
    }

    nonisolated func fetch(
        conversationId: String,
        messageIds: [String],
        languages: [String]
    ) async throws -> [SharedTranslation] {
        let outcome = await MainActor.run { () -> [SharedTranslation]? in
            fetchCalls.append(FetchCall(conversationId: conversationId, messageIds: messageIds, languages: languages))
            onFetch?()
            return fetchFails ? nil : fetchResult
        }
        guard let outcome else { throw SharingUnavailable() }
        return outcome
    }
}

/// Une porte que le test ouvre : ce qui l'attend reste suspendu jusque-là.
@MainActor
private final class Latch {
    nonisolated deinit {}

    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        guard !isOpen else { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        isOpen = true
        waiters.forEach { $0.resume() }
        waiters.removeAll()
    }
}

@MainActor
private struct TranslationRig {
    let coordinator: DeviceTranslationCoordinator
    let source: FakeConversationSource
    let engine: FakeEngine
    let sharing: FakeSharing
    let events: PassthroughSubject<SharedTranslation, Never>
}

@MainActor
final class DeviceTranslationCoordinatorTests: XCTestCase {

    private func makeMessage(
        id: String = Ids.messageA,
        content: String = "Hello",
        originalLanguage: String = "en",
        age: TimeInterval = 0,
        isMe: Bool = false
    ) -> MeeshyMessage {
        let createdAt = Date().addingTimeInterval(-age)
        return MeeshyMessage(
            id: id,
            conversationId: Ids.conversation,
            senderId: Ids.peer,
            content: content,
            originalLanguage: originalLanguage,
            createdAt: createdAt,
            updatedAt: createdAt,
            isMe: isMe
        )
    }

    private func makeRig(messages: [MeeshyMessage], readers: [String] = ["fr"]) -> TranslationRig {
        let events = PassthroughSubject<SharedTranslation, Never>()
        let engine = FakeEngine()
        let sharing = FakeSharing()
        return TranslationRig(
            coordinator: DeviceTranslationCoordinator(
                engine: engine, sharing: sharing, sharedEvents: events.eraseToAnyPublisher()
            ),
            source: FakeConversationSource(messages: messages, readers: readers),
            engine: engine,
            sharing: sharing,
            events: events
        )
    }

    private func makeSignal(_ description: String, count: Int = 1) -> XCTestExpectation {
        let signal = expectation(description: description)
        signal.expectedFulfillmentCount = count
        signal.assertForOverFulfill = false
        return signal
    }

    private func makeNever(_ description: String) -> XCTestExpectation {
        let never = expectation(description: description)
        never.isInverted = true
        never.assertForOverFulfill = false
        return never
    }

    private func watchThePass(of rig: TranslationRig) -> XCTestExpectation {
        let passed = makeSignal("the pass reads the thread")
        rig.source.onMessagesRead = { passed.fulfill() }
        return passed
    }

    private func watchTheEngine(of rig: TranslationRig) -> XCTestExpectation {
        let never = makeNever("the engine is not consulted")
        rig.engine.onAvailability = { never.fulfill() }
        rig.engine.onTranslate = { never.fulfill() }
        return never
    }

    private func watchTheGateway(of rig: TranslationRig) -> [XCTestExpectation] {
        let neverShared = makeNever("nothing is shared")
        let neverFetched = makeNever("nothing is read from the gateway")
        rig.sharing.onShare = { neverShared.fulfill() }
        rig.sharing.onFetch = { neverFetched.fulfill() }
        return [neverShared, neverFetched]
    }

    private func makeShared(
        id: String = Ids.sharedA,
        conversationId: String = Ids.conversation,
        messageId: String = Ids.messageA,
        targetLanguage: String = "fr",
        boundTo sourceContent: String = "Hello",
        text: String = "Bonjour partage",
        sourceLanguage: String = "en",
        engine: String = "peer-engine"
    ) throws -> SharedTranslation {
        let envelope = try SharedTranslationSeal.seal(
            binding: SharedTranslationBinding(
                conversationId: conversationId,
                messageId: messageId,
                targetLanguage: targetLanguage,
                sourceContent: sourceContent
            ),
            key: .messageContent,
            inner: SharedTranslationInner(text: text, sourceLanguage: sourceLanguage, engine: engine)
        )
        return SharedTranslation(
            id: id,
            conversationId: conversationId,
            messageId: messageId,
            targetLanguage: targetLanguage,
            envelope: envelope,
            sharedBy: Ids.peer,
            sharedAt: "2026-10-10T10:00:00.000Z"
        )
    }

    private func expectedTranslation(
        id: String,
        messageId: String = Ids.messageA,
        sourceLanguage: String = "en",
        targetLanguage: String = "fr",
        content: String,
        model: String = "tests-engine",
        persisting: Bool = true
    ) -> AppliedTranslation {
        AppliedTranslation(
            id: id,
            messageId: messageId,
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            content: content,
            model: model,
            persisting: persisting
        )
    }

    private func openedEnvelope(
        _ envelope: SharedTranslationEnvelope,
        target: String = "fr",
        sourceContent: String = "Hello"
    ) -> SharedTranslationInner? {
        SharedTranslationSeal.open(
            binding: SharedTranslationBinding(
                conversationId: Ids.conversation,
                messageId: Ids.messageA,
                targetLanguage: target,
                sourceContent: sourceContent
            ),
            key: .messageContent,
            envelope: envelope
        )
    }

    func test_start_aFreshForeignMessage_showsTheDeviceTranslationAndPersistsIt() async {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        let shown = makeSignal("the translation is shown")
        rig.source.onApply = { shown.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [shown], timeout: patience)

        XCTAssertEqual(
            rig.source.applied,
            [expectedTranslation(id: "device:\(Ids.messageA):fr", content: "Bonjour")]
        )
        XCTAssertEqual(
            rig.engine.translateCalls,
            [TranslateCall(
                requests: [DeviceTranslationRequest(id: Ids.messageA, text: "Hello")],
                pair: DeviceTranslationPair(source: "en", target: "fr")
            )]
        )
        XCTAssertTrue(rig.sharing.fetchCalls.isEmpty)
    }

    func test_start_aFreshForeignMessage_sharesOneEnvelopeOnlyTheMessageReadersCanOpen() async throws {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        let shared = makeSignal("the translation is shared")
        rig.sharing.onShare = { shared.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [shared], timeout: patience)
        let notSharedTwice = makeNever("the translation is not shared twice")
        rig.sharing.onShare = { notSharedTwice.fulfill() }
        await fulfillment(of: [notSharedTwice], timeout: quietPeriod)

        XCTAssertEqual(rig.sharing.shareCalls.count, 1)
        let call = try XCTUnwrap(rig.sharing.shareCalls.first)
        XCTAssertEqual(call.conversationId, Ids.conversation)
        XCTAssertEqual(call.body.messageId, Ids.messageA)
        XCTAssertEqual(call.body.targetLanguage, "fr")
        XCTAssertEqual(call.body.envelope.kdf, .messageContent)
        XCTAssertEqual(
            openedEnvelope(call.body.envelope),
            SharedTranslationInner(text: "Bonjour", sourceLanguage: "en", engine: "tests-engine")
        )
        XCTAssertNil(openedEnvelope(call.body.envelope, sourceContent: "Hello!"))
        let wire = String(decoding: try JSONEncoder().encode(call.body), as: UTF8.self)
        XCTAssertFalse(wire.contains("Bonjour"))
        XCTAssertFalse(wire.contains("Hello"))
    }

    func test_start_aRegionalReaderRank_showsTheReadersSpellingAndSharesTheNormalizedLanguage() async throws {
        let rig = makeRig(messages: [makeMessage()], readers: ["pt-BR"])
        defer { rig.coordinator.stop() }
        let shared = makeSignal("the translation is shared")
        rig.sharing.onShare = { shared.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [shared], timeout: patience)

        XCTAssertEqual(rig.engine.translateCalls.map(\.pair), [DeviceTranslationPair(source: "en", target: "pt")])
        XCTAssertEqual(rig.source.applied.map(\.id), ["device:\(Ids.messageA):pt"])
        XCTAssertEqual(rig.source.applied.map(\.targetLanguage), ["pt-BR"])
        let body = try XCTUnwrap(rig.sharing.shareCalls.first?.body)
        XCTAssertEqual(body.targetLanguage, "pt")
        XCTAssertEqual(openedEnvelope(body.envelope, target: "pt")?.text, "Bonjour")
    }

    func test_start_inAnEndToEndEncryptedConversation_showsTheTranslationInMemoryOnly() async {
        let rig = makeRig(messages: [makeMessage(age: 120)])
        defer { rig.coordinator.stop() }
        let shown = makeSignal("the translation is shown")
        rig.source.onApply = { shown.fulfill() }
        let neverOnTheGateway = watchTheGateway(of: rig)

        rig.coordinator.start(source: rig.source, encryptionMode: "e2ee")
        await fulfillment(of: [shown], timeout: patience)
        await fulfillment(of: neverOnTheGateway, timeout: quietPeriod)

        XCTAssertEqual(
            rig.source.applied,
            [expectedTranslation(id: "device:\(Ids.messageA):fr", content: "Bonjour", persisting: false)]
        )
        XCTAssertTrue(rig.sharing.shareCalls.isEmpty)
        XCTAssertTrue(rig.sharing.fetchCalls.isEmpty)
    }

    func test_start_inAnEndToEndEncryptedConversation_aCiphertextLookingBodyIsNeverTranslated() async {
        let rig = makeRig(messages: [makeMessage(content: String(repeating: "A", count: 44))])
        defer { rig.coordinator.stop() }
        let passed = watchThePass(of: rig)
        let neverConsulted = watchTheEngine(of: rig)

        rig.coordinator.start(source: rig.source, encryptionMode: "e2ee")
        await fulfillment(of: [passed], timeout: patience)
        await fulfillment(of: [neverConsulted], timeout: quietPeriod)

        XCTAssertTrue(rig.source.applied.isEmpty)
    }

    func test_update_toEndToEndEncryptionBeforeTheFirstPass_keepsTheTranslationInMemoryOnly() async {
        let rig = makeRig(messages: [makeMessage(age: 120)])
        defer { rig.coordinator.stop() }
        let shown = makeSignal("the translation is shown")
        rig.source.onApply = { shown.fulfill() }
        let neverOnTheGateway = watchTheGateway(of: rig)

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        rig.coordinator.update(encryptionMode: "e2ee")
        await fulfillment(of: [shown], timeout: patience)
        await fulfillment(of: neverOnTheGateway, timeout: quietPeriod)

        XCTAssertEqual(rig.source.applied.map(\.persisting), [false])
        XCTAssertTrue(rig.sharing.shareCalls.isEmpty)
        XCTAssertTrue(rig.sharing.fetchCalls.isEmpty)
    }

    func test_update_toEndToEndWhileTheEngineTranslates_keepsTheTranslationInMemoryAndSharesNothing() async {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        let latch = Latch()
        let translating = makeSignal("the engine is translating")
        rig.engine.onTranslate = { translating.fulfill() }
        rig.engine.holdTranslation = { await latch.wait() }
        let shown = makeSignal("the translation is shown")
        rig.source.onApply = { shown.fulfill() }
        let neverShared = makeNever("nothing is shared")
        rig.sharing.onShare = { neverShared.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [translating], timeout: patience)
        rig.coordinator.update(encryptionMode: "e2ee")
        latch.open()
        await fulfillment(of: [shown], timeout: patience)
        await fulfillment(of: [neverShared], timeout: quietPeriod)

        XCTAssertEqual(
            rig.source.applied,
            [expectedTranslation(id: "device:\(Ids.messageA):fr", content: "Bonjour", persisting: false)]
        )
        XCTAssertTrue(rig.sharing.shareCalls.isEmpty)
    }

    func test_update_toEndToEndWhileSharesWaitInTheQueue_postsNoneOfThem() async {
        let older = makeMessage(id: Ids.messageA, age: 5)
        let newest = makeMessage(id: Ids.messageB, content: "Good morning")
        let rig = makeRig(messages: [older, newest])
        defer { rig.coordinator.stop() }
        let latch = Latch()
        let onTheWire = makeSignal("the first share is on the wire")
        rig.sharing.onShare = { onTheWire.fulfill() }
        rig.sharing.holdShare = { await latch.wait() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [onTheWire], timeout: patience)
        rig.coordinator.update(encryptionMode: "e2ee")
        let neverPostedAgain = makeNever("the queued share is not posted")
        rig.sharing.onShare = { neverPostedAgain.fulfill() }
        latch.open()
        await fulfillment(of: [neverPostedAgain], timeout: quietPeriod)

        XCTAssertEqual(rig.sharing.shareCalls.map(\.body.messageId), [Ids.messageB])
    }

    func test_start_calledTwice_relaysTheEncryptionModeOfTheSecondCall() async {
        let rig = makeRig(messages: [makeMessage(age: 120)])
        defer { rig.coordinator.stop() }
        let shown = makeSignal("the translation is shown")
        rig.source.onApply = { shown.fulfill() }
        let neverOnTheGateway = watchTheGateway(of: rig)

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        rig.coordinator.start(source: rig.source, encryptionMode: "e2ee")
        await fulfillment(of: [shown], timeout: patience)
        await fulfillment(of: neverOnTheGateway, timeout: quietPeriod)

        XCTAssertEqual(rig.source.applied.map(\.persisting), [false])
        XCTAssertEqual(rig.engine.translateCalls.count, 1)
        XCTAssertTrue(rig.sharing.shareCalls.isEmpty)
        XCTAssertTrue(rig.sharing.fetchCalls.isEmpty)
    }

    func test_start_aMessageAlreadyWrittenInTheReadersLanguage_isNotTranslated() async {
        let rig = makeRig(messages: [makeMessage(content: "Bonjour", originalLanguage: "fr")])
        defer { rig.coordinator.stop() }
        let passed = watchThePass(of: rig)
        let neverConsulted = watchTheEngine(of: rig)

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [passed], timeout: patience)
        await fulfillment(of: [neverConsulted], timeout: quietPeriod)

        XCTAssertTrue(rig.engine.translateCalls.isEmpty)
        XCTAssertTrue(rig.source.applied.isEmpty)
    }

    func test_start_aMessageTheConversationAlreadyServesInTheReadersLanguage_isNotTranslated() async {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        rig.source.servedLanguages[Ids.messageA] = ["fr"]
        let passed = watchThePass(of: rig)
        let neverConsulted = watchTheEngine(of: rig)

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [passed], timeout: patience)
        await fulfillment(of: [neverConsulted], timeout: quietPeriod)

        XCTAssertTrue(rig.engine.translateCalls.isEmpty)
        XCTAssertTrue(rig.source.applied.isEmpty)
    }

    func test_start_theReadersOwnMessage_isNeverTranslated() async {
        let own = makeMessage(id: Ids.messageA, isMe: true)
        let foreign = makeMessage(id: Ids.messageB, content: "Good morning")
        let rig = makeRig(messages: [own, foreign])
        defer { rig.coordinator.stop() }
        let shown = makeSignal("the foreign message is translated")
        rig.source.onApply = { shown.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [shown], timeout: patience)

        XCTAssertEqual(rig.engine.translateCalls.flatMap { $0.requests.map(\.id) }, [Ids.messageB])
        XCTAssertEqual(rig.source.applied.map(\.messageId), [Ids.messageB])
    }

    func test_start_aTextBeyondTheSourceLimit_isNeitherTranslatedNorShared() async {
        let oversized = String(repeating: "a", count: DeviceTranslationPolicy.maxSourceLength + 1)
        let rig = makeRig(messages: [makeMessage(content: oversized)])
        defer { rig.coordinator.stop() }
        let passed = watchThePass(of: rig)
        let neverConsulted = watchTheEngine(of: rig)

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [passed], timeout: patience)
        await fulfillment(of: [neverConsulted], timeout: quietPeriod)

        XCTAssertTrue(rig.engine.translateCalls.isEmpty)
        XCTAssertTrue(rig.sharing.shareCalls.isEmpty)
    }

    func test_start_aPairTheEngineCannotTranslate_translatesAndSharesNothing() async {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        rig.engine.fallbackAvailability = .unsupported
        let consulted = makeSignal("the engine is consulted about the pair")
        let neverTranslated = makeNever("nothing is translated")
        rig.engine.onAvailability = { consulted.fulfill() }
        rig.engine.onTranslate = { neverTranslated.fulfill() }
        let neverOnTheGateway = watchTheGateway(of: rig)

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [consulted], timeout: patience)
        await fulfillment(of: [neverTranslated] + neverOnTheGateway, timeout: quietPeriod)

        XCTAssertEqual(rig.engine.availabilityQueries, [DeviceTranslationPair(source: "en", target: "fr")])
        XCTAssertTrue(rig.engine.translateCalls.isEmpty)
        XCTAssertTrue(rig.source.applied.isEmpty)
        XCTAssertTrue(rig.sharing.shareCalls.isEmpty)
    }

    func test_start_whenTheEngineReturnsNothing_appliesNothingAndDoesNotAskAgainForTheSameVersion() async {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        rig.engine.respond = { _, _ in [] }
        let firstAsk = makeSignal("the engine is asked once")
        rig.engine.onTranslate = { firstAsk.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [firstAsk], timeout: patience)

        let secondPass = makeSignal("a second pass reads the thread")
        let neverAskedAgain = makeNever("the engine is not asked again")
        rig.source.onMessagesRead = { secondPass.fulfill() }
        rig.engine.onTranslate = { neverAskedAgain.fulfill() }
        rig.source.fireTrigger()
        await fulfillment(of: [secondPass], timeout: patience)
        await fulfillment(of: [neverAskedAgain], timeout: quietPeriod)

        XCTAssertEqual(rig.engine.translateCalls.count, 1)
        XCTAssertTrue(rig.source.applied.isEmpty)
    }

    func test_trigger_afterTheMessageIsEdited_asksTheEngineAgainForTheNewText() async {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        rig.engine.respond = { _, _ in [] }
        let firstAsk = makeSignal("the engine is asked for the original text")
        rig.engine.onTranslate = { firstAsk.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [firstAsk], timeout: patience)

        let secondAsk = makeSignal("the engine is asked for the edited text")
        rig.engine.onTranslate = { secondAsk.fulfill() }
        rig.source.messages = [makeMessage(content: "Hello again")]
        rig.source.fireTrigger()
        await fulfillment(of: [secondAsk], timeout: patience)

        XCTAssertEqual(
            rig.engine.translateCalls.map { $0.requests.map(\.text) },
            [["Hello"], ["Hello again"]]
        )
    }

    func test_trigger_aBurstOfChangesDuringTheSettleDelay_isFoldedIntoOnePass() async {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        rig.engine.fallbackAvailability = .unsupported
        let passed = watchThePass(of: rig)

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        for _ in 0..<5 { rig.source.fireTrigger() }
        await fulfillment(of: [passed], timeout: patience)
        let neverASecondPass = makeNever("no second pass reads the thread")
        rig.source.onMessagesRead = { neverASecondPass.fulfill() }
        await fulfillment(of: [neverASecondPass], timeout: quietPeriod)

        XCTAssertEqual(rig.engine.availabilityQueries.count, 1)
    }

    func test_start_whenTheTopRankIsUnsupported_translatesIntoTheNextRank() async {
        let rig = makeRig(messages: [makeMessage()], readers: ["fr", "es"])
        defer { rig.coordinator.stop() }
        rig.engine.availabilities[DeviceTranslationPair(source: "en", target: "fr")] = .unsupported
        rig.engine.respond = { requests, _ in
            requests.map { DeviceTranslationResult(id: $0.id, text: "Hola") }
        }
        let shown = makeSignal("the translation is shown")
        rig.source.onApply = { shown.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [shown], timeout: patience)

        XCTAssertEqual(rig.engine.translateCalls.map(\.pair), [DeviceTranslationPair(source: "en", target: "es")])
        XCTAssertEqual(
            rig.source.applied,
            [expectedTranslation(id: "device:\(Ids.messageA):es", targetLanguage: "es", content: "Hola")]
        )
    }

    func test_start_whenTheEngineIsSilentOnTheTopRank_retriesOnTheNextRank() async {
        let rig = makeRig(messages: [makeMessage()], readers: ["fr", "es"])
        defer { rig.coordinator.stop() }
        rig.engine.respond = { requests, pair in
            guard pair.target == "es" else { return [] }
            return requests.map { DeviceTranslationResult(id: $0.id, text: "Hola") }
        }
        let shown = makeSignal("the translation is shown")
        rig.source.onApply = { shown.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [shown], timeout: patience)

        XCTAssertEqual(rig.engine.translateCalls.map(\.pair.target), ["fr", "es"])
        XCTAssertEqual(rig.source.applied.map(\.targetLanguage), ["es"])
        XCTAssertEqual(rig.source.applied.map(\.content), ["Hola"])
    }

    func test_start_anOldMessageSomeoneAlreadyTranslated_showsTheSharedTextWithoutAskingTheEngine() async throws {
        let rig = makeRig(messages: [makeMessage(age: 120)])
        defer { rig.coordinator.stop() }
        rig.sharing.fetchResult = [try makeShared(text: "Bonjour partage")]
        let shown = makeSignal("the shared translation is shown")
        rig.source.onApply = { shown.fulfill() }
        let neverConsulted = watchTheEngine(of: rig)

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [shown], timeout: patience)
        await fulfillment(of: [neverConsulted], timeout: quietPeriod)

        XCTAssertEqual(
            rig.source.applied,
            [expectedTranslation(id: "shared:\(Ids.sharedA)", content: "Bonjour partage", model: "peer-engine")]
        )
        XCTAssertEqual(
            rig.sharing.fetchCalls,
            [FetchCall(conversationId: Ids.conversation, messageIds: [Ids.messageA], languages: ["fr"])]
        )
        XCTAssertTrue(rig.engine.translateCalls.isEmpty)
        XCTAssertTrue(rig.sharing.shareCalls.isEmpty)
    }

    func test_start_aSharedTranslationSealedOverAnotherText_isRefusedAndTheEngineTakesOver() async throws {
        let rig = makeRig(messages: [makeMessage(age: 120)])
        defer { rig.coordinator.stop() }
        rig.sharing.fetchResult = [try makeShared(boundTo: "Something else entirely", text: "Texte trompeur")]
        let shown = makeSignal("a translation is shown")
        rig.source.onApply = { shown.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [shown], timeout: patience)

        XCTAssertEqual(rig.sharing.fetchCalls.count, 1)
        XCTAssertEqual(
            rig.source.applied,
            [expectedTranslation(id: "device:\(Ids.messageA):fr", content: "Bonjour")]
        )
        XCTAssertEqual(rig.engine.translateCalls.count, 1)
    }

    func test_start_whenSharedTranslationsCannotBeRead_translatesOnTheDevice() async {
        let rig = makeRig(messages: [makeMessage(age: 120)])
        defer { rig.coordinator.stop() }
        rig.sharing.fetchFails = true
        let shown = makeSignal("the translation is shown")
        rig.source.onApply = { shown.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [shown], timeout: patience)

        XCTAssertEqual(rig.sharing.fetchCalls.count, 1)
        XCTAssertEqual(
            rig.source.applied,
            [expectedTranslation(id: "device:\(Ids.messageA):fr", content: "Bonjour")]
        )
    }

    func test_start_whenSharingFails_keepsTheTranslationsShownAndPostsTheRestOfTheQueue() async {
        let older = makeMessage(id: Ids.messageA, age: 5)
        let newest = makeMessage(id: Ids.messageB, content: "Good morning")
        let rig = makeRig(messages: [older, newest])
        defer { rig.coordinator.stop() }
        rig.sharing.shareFails = true
        let attempted = makeSignal("both shares are attempted", count: 2)
        rig.sharing.onShare = { attempted.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [attempted], timeout: patience)

        XCTAssertEqual(rig.sharing.shareCalls.map(\.body.messageId), [Ids.messageB, Ids.messageA])
        XCTAssertEqual(rig.source.applied.map(\.messageId), [Ids.messageB, Ids.messageA])
        XCTAssertEqual(rig.engine.translateCalls.map { $0.requests.map(\.id) }, [[Ids.messageB, Ids.messageA]])
    }

    func test_share_refusedBecauseTheReadReceiptsAreOff_sharesNothingMoreButKeepsTranslating() async {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        rig.sharing.shareError = SharedTranslationShareRefusal.readReceiptsOff
        let refused = makeSignal("the first share is refused")
        rig.sharing.onShare = { refused.fulfill() }

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [refused], timeout: patience)
        let neverSharedAgain = makeNever("nothing more is shared")
        rig.sharing.onShare = { neverSharedAgain.fulfill() }
        let shown = makeSignal("the next message is still translated")
        rig.source.onApply = { shown.fulfill() }
        rig.source.messages.append(makeMessage(id: Ids.messageB, content: "Good morning"))
        rig.source.fireTrigger()
        await fulfillment(of: [shown], timeout: patience)
        await fulfillment(of: [neverSharedAgain], timeout: quietPeriod)

        XCTAssertEqual(rig.sharing.shareCalls.map(\.body.messageId), [Ids.messageA])
        XCTAssertEqual(rig.source.applied.map(\.messageId), [Ids.messageA, Ids.messageB])
        XCTAssertEqual(rig.source.applied.map(\.persisting), [true, true])
    }

    func test_sharedEvent_sealedOverADifferentSourceText_isRefusedWhileTheRightOneIsShown() async throws {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        rig.engine.fallbackAvailability = .unsupported
        let passed = watchThePass(of: rig)
        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [passed], timeout: patience)
        let misleading = try makeShared(id: Ids.sharedA, boundTo: "Something else entirely", text: "Texte trompeur")
        let right = try makeShared(id: Ids.sharedB, text: "Bonjour partage")
        let shown = makeSignal("the right translation is shown")
        rig.source.onApply = { shown.fulfill() }

        rig.events.send(misleading)
        rig.events.send(right)
        await fulfillment(of: [shown], timeout: patience)

        XCTAssertEqual(
            rig.source.applied,
            [expectedTranslation(id: "shared:\(Ids.sharedB)", content: "Bonjour partage", model: "peer-engine")]
        )
    }

    func test_sharedEvent_forARankTheConversationAlreadyServes_isRefused() async throws {
        let served = makeMessage(id: Ids.messageA)
        let unserved = makeMessage(id: Ids.messageB, content: "Good morning")
        let rig = makeRig(messages: [served, unserved])
        defer { rig.coordinator.stop() }
        rig.source.servedLanguages[Ids.messageA] = ["fr"]
        rig.engine.fallbackAvailability = .unsupported
        let passed = watchThePass(of: rig)
        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [passed], timeout: patience)
        let redundant = try makeShared(id: Ids.sharedA, messageId: Ids.messageA, text: "Texte redondant")
        let wanted = try makeShared(
            id: Ids.sharedB, messageId: Ids.messageB, boundTo: "Good morning", text: "Bonjour partage"
        )
        let shown = makeSignal("the wanted translation is shown")
        rig.source.onApply = { shown.fulfill() }

        rig.events.send(redundant)
        rig.events.send(wanted)
        await fulfillment(of: [shown], timeout: patience)

        XCTAssertEqual(rig.source.applied.map(\.messageId), [Ids.messageB])
        XCTAssertEqual(rig.source.applied.map(\.content), ["Bonjour partage"])
    }

    func test_sharedEvent_fromAnotherConversation_isRefused() async throws {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        rig.engine.fallbackAvailability = .unsupported
        let passed = watchThePass(of: rig)
        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [passed], timeout: patience)
        let foreign = try makeShared(id: Ids.sharedA, conversationId: Ids.otherConversation, text: "Texte d'ailleurs")
        let right = try makeShared(id: Ids.sharedB, text: "Bonjour partage")
        let shown = makeSignal("the right translation is shown")
        rig.source.onApply = { shown.fulfill() }

        rig.events.send(foreign)
        rig.events.send(right)
        await fulfillment(of: [shown], timeout: patience)

        XCTAssertEqual(rig.source.applied.map(\.id), ["shared:\(Ids.sharedB)"])
    }

    func test_sharedEvent_forAMessageNotInTheThread_isIgnored() async throws {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        rig.engine.fallbackAvailability = .unsupported
        let passed = watchThePass(of: rig)
        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        await fulfillment(of: [passed], timeout: patience)
        let stray = try makeShared(id: Ids.sharedA, messageId: Ids.unknownMessage, text: "Texte egare")
        let right = try makeShared(id: Ids.sharedB, text: "Bonjour partage")
        let shown = makeSignal("the right translation is shown")
        rig.source.onApply = { shown.fulfill() }

        rig.events.send(stray)
        rig.events.send(right)
        await fulfillment(of: [shown], timeout: patience)

        XCTAssertEqual(rig.source.applied.map(\.messageId), [Ids.messageA])
        XCTAssertEqual(rig.source.applied.map(\.id), ["shared:\(Ids.sharedB)"])
    }

    func test_sharedEvent_inAnEndToEndEncryptedConversation_isRefused() async throws {
        let rig = makeRig(messages: [makeMessage()])
        defer { rig.coordinator.stop() }
        rig.engine.fallbackAvailability = .unsupported
        let passed = watchThePass(of: rig)
        rig.coordinator.start(source: rig.source, encryptionMode: "e2ee")
        await fulfillment(of: [passed], timeout: patience)
        let neverShown = makeNever("nothing is shown")
        rig.source.onApply = { neverShown.fulfill() }

        rig.events.send(try makeShared(text: "Bonjour partage"))
        await fulfillment(of: [neverShown], timeout: quietPeriod)

        XCTAssertTrue(rig.source.applied.isEmpty)
    }

    func test_stop_whileRunning_cancelsWhatTheEngineIsDoing() {
        let rig = makeRig(messages: [makeMessage()])
        rig.coordinator.start(source: rig.source, encryptionMode: nil)

        rig.coordinator.stop()

        XCTAssertEqual(rig.engine.cancelPendingCount, 1)
    }

    func test_stop_whenNeverStartedOrAlreadyStopped_cancelsNothingMore() {
        let rig = makeRig(messages: [makeMessage()])
        rig.coordinator.stop()
        XCTAssertEqual(rig.engine.cancelPendingCount, 0)

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        rig.coordinator.stop()
        rig.coordinator.stop()

        XCTAssertEqual(rig.engine.cancelPendingCount, 1)
    }

    func test_stop_beforeTheSettleDelay_translatesNothingEvenWhenTheThreadChanges() async {
        let rig = makeRig(messages: [makeMessage()])
        let neverConsulted = watchTheEngine(of: rig)

        rig.coordinator.start(source: rig.source, encryptionMode: nil)
        rig.coordinator.stop()
        rig.source.fireTrigger()
        await fulfillment(of: [neverConsulted], timeout: quietPeriod)

        XCTAssertTrue(rig.source.applied.isEmpty)
        XCTAssertTrue(rig.engine.translateCalls.isEmpty)
    }
}
