import Combine
import Foundation
import GRDB
import XCTest
@testable import Meeshy
import MeeshySDK

/// La conversation, source de la traduction sur l'appareil (#9899) : ce que
/// `applyDeviceTranslation` fait d'une traduction selon que le message est
/// lisible par le serveur (canal des traductions du serveur) ou chiffré de bout
/// en bout (mémoire seule), et ce que la conversation projette au coordinateur
/// (identifiant, messages, prisme du lecteur, langues servies, signaux).
@MainActor
final class ConversationViewModelDeviceTranslationTests: XCTestCase {

    private enum Ids {
        static let conversation = "64f0c0ffee0000000000c0de"
        static let reader = "64f0c0ffee0000000000b0b0"
        static let peer = "64f0c0ffee0000000000b001"
        static let messageA = "64f0c0ffee0000000000a001"
        static let messageB = "64f0c0ffee0000000000a002"
    }

    private func makeUser(
        systemLanguage: String? = "fr",
        regionalLanguage: String? = nil,
        deviceLocale: String? = "fr"
    ) -> MeeshyUser {
        MeeshyUser(
            id: Ids.reader,
            username: "reader",
            systemLanguage: systemLanguage,
            regionalLanguage: regionalLanguage,
            deviceLocale: deviceLocale
        )
    }

    private func makeRig(user: MeeshyUser? = nil) throws -> ConversationRig {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: user ?? makeUser())
        let socket = MockMessageSocket()
        let sut = ConversationViewModel(
            conversationId: Ids.conversation,
            authManager: auth,
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: socket,
            dependencies: ConversationDependencies(
                dbPool: pool,
                persistence: MessagePersistenceActor(dbWriter: pool)
            )
        )
        return ConversationRig(sut: sut, socket: socket, auth: auth)
    }

    private func makeMessage(id: String = Ids.messageA) -> MeeshyMessage {
        MeeshyMessage(
            id: id,
            conversationId: Ids.conversation,
            senderId: Ids.peer,
            content: "Hello",
            originalLanguage: "en"
        )
    }

    private func makeTranslation(
        messageId: String = Ids.messageA,
        targetLanguage: String = "fr",
        content: String = "Bonjour",
        model: String? = "tests-engine",
        confidence: Double? = nil
    ) -> MessageTranslation {
        MessageTranslation(
            id: "device:\(messageId):\(targetLanguage)",
            messageId: messageId,
            sourceLanguage: "en",
            targetLanguage: targetLanguage,
            translatedContent: content,
            translationModel: model,
            confidenceScore: confidence
        )
    }

    private func source(of rig: ConversationRig) -> any DeviceTranslationConversationSource {
        rig.sut
    }

    private func watchTheServerChannel(of rig: ConversationRig, into log: TranslationEventLog) -> AnyCancellable {
        rig.socket.translationReceived.sink { log.events.append($0) }
    }

    private func watchTheTriggers(of rig: ConversationRig, into counter: SignalCounter) -> AnyCancellable {
        source(of: rig).deviceTranslationTriggers.sink { _ in counter.count += 1 }
    }

    func test_applyDeviceTranslation_notPersisting_putsTheTranslationInMemoryUnderItsMessage() throws {
        let rig = try makeRig()

        rig.sut.applyDeviceTranslation(makeTranslation(confidence: nil), persisting: false)

        XCTAssertEqual(rig.sut.messageTranslations.count, 1)
        let stored = try XCTUnwrap(rig.sut.messageTranslations[Ids.messageA]?.first)
        XCTAssertEqual(rig.sut.messageTranslations[Ids.messageA]?.count, 1)
        XCTAssertEqual(stored.id, "device:\(Ids.messageA):fr")
        XCTAssertEqual(stored.messageId, Ids.messageA)
        XCTAssertEqual(stored.sourceLanguage, "en")
        XCTAssertEqual(stored.targetLanguage, "fr")
        XCTAssertEqual(stored.translatedContent, "Bonjour")
        XCTAssertEqual(stored.translationModel, "tests-engine")
        XCTAssertNil(stored.confidenceScore)
    }

    func test_applyDeviceTranslation_notPersisting_sendsNothingOnTheTranslationChannel() throws {
        let rig = try makeRig()
        let log = TranslationEventLog()
        let subscription = watchTheServerChannel(of: rig, into: log)
        defer { subscription.cancel() }

        rig.sut.applyDeviceTranslation(makeTranslation(), persisting: false)

        XCTAssertTrue(log.events.isEmpty)
    }

    func test_applyDeviceTranslation_notPersisting_replacesTheTranslationOfTheSameLanguage() throws {
        let rig = try makeRig()

        rig.sut.applyDeviceTranslation(makeTranslation(content: "Bonjour"), persisting: false)
        rig.sut.applyDeviceTranslation(makeTranslation(content: "Salut"), persisting: false)

        XCTAssertEqual(rig.sut.messageTranslations[Ids.messageA]?.map(\.translatedContent), ["Salut"])
    }

    func test_applyDeviceTranslation_notPersisting_keepsTheTranslationsOfTheOtherLanguages() throws {
        let rig = try makeRig()
        rig.sut.messageTranslations = [
            Ids.messageA: [makeTranslation(targetLanguage: "es", content: "Hola")]
        ]

        rig.sut.applyDeviceTranslation(makeTranslation(targetLanguage: "fr", content: "Bonjour"), persisting: false)

        XCTAssertEqual(rig.sut.messageTranslations[Ids.messageA]?.map(\.targetLanguage), ["es", "fr"])
        XCTAssertEqual(rig.sut.messageTranslations[Ids.messageA]?.map(\.translatedContent), ["Hola", "Bonjour"])
    }

    func test_applyDeviceTranslation_notPersisting_leavesTheTranslationsOfOtherMessagesAlone() throws {
        let rig = try makeRig()
        rig.sut.messageTranslations = [
            Ids.messageB: [makeTranslation(messageId: Ids.messageB, targetLanguage: "es", content: "Hola")]
        ]

        rig.sut.applyDeviceTranslation(makeTranslation(messageId: Ids.messageA), persisting: false)

        XCTAssertEqual(rig.sut.messageTranslations.keys.sorted(), [Ids.messageA, Ids.messageB])
        XCTAssertEqual(rig.sut.messageTranslations[Ids.messageB]?.map(\.translatedContent), ["Hola"])
        XCTAssertEqual(rig.sut.messageTranslations[Ids.messageA]?.map(\.translatedContent), ["Bonjour"])
    }

    func test_applyDeviceTranslation_notPersisting_isServedByThePrismAsSoonAsItIsMerged() throws {
        let rig = try makeRig()
        XCTAssertNil(rig.sut.preferredTranslation(for: Ids.messageA))

        rig.sut.applyDeviceTranslation(makeTranslation(content: "Bonjour"), persisting: false)

        XCTAssertEqual(rig.sut.preferredTranslation(for: Ids.messageA)?.translatedContent, "Bonjour")
    }

    func test_applyDeviceTranslation_persisting_sendsOneEventOnTheTranslationChannel() throws {
        let rig = try makeRig()
        let log = TranslationEventLog()
        let subscription = watchTheServerChannel(of: rig, into: log)
        defer { subscription.cancel() }

        rig.sut.applyDeviceTranslation(makeTranslation(), persisting: true)

        XCTAssertEqual(log.events.count, 1)
        XCTAssertEqual(log.events.first?.messageId, Ids.messageA)
        XCTAssertEqual(log.events.first?.translations.count, 1)
    }

    func test_applyDeviceTranslation_persisting_carriesEveryFieldOfTheTranslation() throws {
        let rig = try makeRig()
        let log = TranslationEventLog()
        let subscription = watchTheServerChannel(of: rig, into: log)
        defer { subscription.cancel() }
        let translation = makeTranslation(
            targetLanguage: "fr", content: "Bonjour", model: "tests-engine", confidence: 0.87
        )

        rig.sut.applyDeviceTranslation(translation, persisting: true)

        let event = try XCTUnwrap(log.events.first)
        let data = try XCTUnwrap(event.translations.first)
        XCTAssertEqual(event.messageId, translation.messageId)
        XCTAssertEqual(data.id, translation.id)
        XCTAssertEqual(data.messageId, translation.messageId)
        XCTAssertEqual(data.sourceLanguage, "en")
        XCTAssertEqual(data.targetLanguage, "fr")
        XCTAssertEqual(data.translatedContent, "Bonjour")
        XCTAssertEqual(data.translationModel, "tests-engine")
        XCTAssertEqual(data.confidenceScore, 0.87)
    }

    func test_applyDeviceTranslation_persisting_withoutAModel_sendsAnEmptyModelName() throws {
        let rig = try makeRig()
        let log = TranslationEventLog()
        let subscription = watchTheServerChannel(of: rig, into: log)
        defer { subscription.cancel() }

        rig.sut.applyDeviceTranslation(makeTranslation(model: nil), persisting: true)

        let data = try XCTUnwrap(log.events.first?.translations.first)
        XCTAssertEqual(data.translationModel, "")
        XCTAssertNil(data.confidenceScore)
    }

    // MARK: - Langue d'origine au rang 1, résolue avant la fenêtre (#8896)

    private func makeFrenchMessage() -> MeeshyMessage {
        MeeshyMessage(id: Ids.messageA, conversationId: Ids.conversation, senderId: Ids.peer,
                      content: "Bonjour de Dakar", originalLanguage: "fr")
    }

    private func makeEnglishTranslation(from sourceLanguage: String) -> MessageTranslation {
        MessageTranslation(id: "srv:\(Ids.messageA):en", messageId: Ids.messageA,
                           sourceLanguage: sourceLanguage, targetLanguage: "en",
                           translatedContent: "Hello from Dakar", translationModel: nil, confidenceScore: nil)
    }

    func test_preferredTranslation_resolvedBeforeTheMessageEntersTheWindow_servesTheOriginalOnceItIsThere() throws {
        let rig = try makeRig(user: makeUser(systemLanguage: "fr", regionalLanguage: "en", deviceLocale: "fr"))
        rig.sut.messageTranslations = [Ids.messageA: [makeEnglishTranslation(from: "auto")]]
        _ = rig.sut.preferredTranslation(for: Ids.messageA)

        rig.sut.messages = [makeFrenchMessage()]

        XCTAssertNil(rig.sut.preferredTranslation(for: Ids.messageA))
    }

    func test_preferredTranslation_messageOutsideTheWindow_readsItsOriginFromItsTranslations() throws {
        let rig = try makeRig(user: makeUser(systemLanguage: "fr", regionalLanguage: "en", deviceLocale: "fr"))
        rig.sut.messageTranslations = [Ids.messageA: [makeEnglishTranslation(from: "fr")]]

        XCTAssertNil(rig.sut.preferredTranslation(for: Ids.messageA))
    }

    func test_preferredTranslation_originAtRankTwo_servesTheRankOneTranslation() throws {
        let rig = try makeRig(user: makeUser(systemLanguage: "fr", regionalLanguage: "en", deviceLocale: "fr"))
        rig.sut.messages = [makeMessage()]
        rig.sut.messageTranslations = [Ids.messageA: [makeTranslation(content: "Bonjour")]]

        XCTAssertEqual(rig.sut.preferredTranslation(for: Ids.messageA)?.translatedContent, "Bonjour")
    }

    // MARK: - Connexion neuve : la bulle sert la traduction de l'aperçu (#9191)

    private func makeKoreanMessage(originalLanguage: String) -> MeeshyMessage {
        MeeshyMessage(id: Ids.messageA, conversationId: Ids.conversation, senderId: Ids.peer,
                      content: "오늘 밤 한국어 연습할래?", originalLanguage: originalLanguage)
    }

    private func makeKoreanSourcedTranslations() -> [MessageTranslation] {
        [("fr", "Tu veux faire des exercices de coréen avec moi ce soir ?"),
         ("en", "Do you want to practice Korean with me tonight?")].map { pair in
            MessageTranslation(id: "srv:\(Ids.messageA):\(pair.0)", messageId: Ids.messageA,
                               sourceLanguage: "ko", targetLanguage: pair.0,
                               translatedContent: pair.1, translationModel: nil, confidenceScore: nil)
        }
    }

    func test_preferredTranslation_originCorrectedByTheStoreAfterAFirstResolution_servesTheReaderTranslation() throws {
        let rig = try makeRig(user: makeUser(systemLanguage: "fr", regionalLanguage: "en", deviceLocale: "fr"))
        rig.sut.messages = [makeKoreanMessage(originalLanguage: "fr")]
        rig.sut.messageTranslations = [Ids.messageA: makeKoreanSourcedTranslations()]
        XCTAssertNil(rig.sut.preferredTranslation(for: Ids.messageA))

        rig.sut.messages = [makeKoreanMessage(originalLanguage: "ko")]

        XCTAssertEqual(rig.sut.preferredTranslation(for: Ids.messageA)?.targetLanguage, "fr")
    }

    func test_preferredTranslation_profileArrivesAfterTheMessages_servesTheReaderTranslation() throws {
        let rig = try makeRig(user: makeUser(systemLanguage: nil, regionalLanguage: nil, deviceLocale: "ko"))
        rig.sut.messages = [makeKoreanMessage(originalLanguage: "ko")]
        rig.sut.messageTranslations = [Ids.messageA: makeKoreanSourcedTranslations()]
        XCTAssertNil(rig.sut.preferredTranslation(for: Ids.messageA))

        rig.auth.currentUser = makeUser(systemLanguage: "fr", regionalLanguage: "en", deviceLocale: "fr")

        XCTAssertEqual(rig.sut.preferredTranslation(for: Ids.messageA)?.targetLanguage, "fr")
    }

    func test_messageIdsWhoseOriginChanged_listsOnlyTheMessagesPresentOnBothSidesWithAnotherOrigin() {
        let before = [makeKoreanMessage(originalLanguage: "fr"), makeMessage(id: Ids.messageB)]
        let after = [makeKoreanMessage(originalLanguage: "KO"), makeMessage(id: Ids.messageB)]

        XCTAssertEqual(ConversationViewModel.messageIdsWhoseOriginChanged(from: before, to: after), [Ids.messageA])
    }

    func test_deviceTranslationConversationId_ofAConversation_isItsId() throws {
        let rig = try makeRig()

        XCTAssertEqual(source(of: rig).deviceTranslationConversationId, Ids.conversation)
    }

    func test_deviceTranslationMessages_whenTheThreadHasMessages_areThoseOfTheThread() throws {
        let rig = try makeRig()
        XCTAssertTrue(source(of: rig).deviceTranslationMessages.isEmpty)

        rig.sut.messages = [makeMessage(id: Ids.messageA), makeMessage(id: Ids.messageB)]

        XCTAssertEqual(source(of: rig).deviceTranslationMessages.map(\.id), [Ids.messageA, Ids.messageB])
    }

    func test_deviceTranslationReaderLanguages_withSeveralConfiguredLanguages_followThePrismOrder() throws {
        let rig = try makeRig(
            user: makeUser(systemLanguage: "fr", regionalLanguage: "es", deviceLocale: "en_US")
        )

        XCTAssertEqual(source(of: rig).deviceTranslationReaderLanguages, ["fr", "es", "en"])
    }

    func test_deviceTranslationReaderLanguages_afterAProfileLanguageChange_followTheNewPrism() throws {
        let rig = try makeRig()
        XCTAssertEqual(source(of: rig).deviceTranslationReaderLanguages, ["fr"])

        rig.auth.simulateLoggedIn(user: makeUser(systemLanguage: "es", deviceLocale: "es"))

        XCTAssertEqual(source(of: rig).deviceTranslationReaderLanguages, ["es"])
    }

    func test_deviceTranslatedLanguages_forATranslatedMessage_listsTheServedLanguages() throws {
        let rig = try makeRig()
        rig.sut.messageTranslations = [
            Ids.messageA: [
                makeTranslation(targetLanguage: "es", content: "Hola"),
                makeTranslation(targetLanguage: "fr", content: "Bonjour")
            ]
        ]

        XCTAssertEqual(source(of: rig).deviceTranslatedLanguages(of: Ids.messageA), ["es", "fr"])
    }

    func test_deviceTranslatedLanguages_forAMessageWithoutTranslation_isEmpty() throws {
        let rig = try makeRig()
        rig.sut.messageTranslations = [
            Ids.messageA: [makeTranslation(targetLanguage: "es", content: "Hola")]
        ]

        XCTAssertTrue(source(of: rig).deviceTranslatedLanguages(of: Ids.messageB).isEmpty)
    }

    func test_deviceTranslatedLanguages_afterAnInMemoryDeviceTranslation_includeItsLanguage() throws {
        let rig = try makeRig()
        XCTAssertTrue(source(of: rig).deviceTranslatedLanguages(of: Ids.messageA).isEmpty)

        source(of: rig).applyDeviceTranslation(makeTranslation(targetLanguage: "fr"), persisting: false)

        XCTAssertEqual(source(of: rig).deviceTranslatedLanguages(of: Ids.messageA), ["fr"])
    }

    func test_deviceTranslationTriggers_whenTheMessagesChange_fire() throws {
        let rig = try makeRig()
        let counter = SignalCounter()
        let subscription = watchTheTriggers(of: rig, into: counter)
        defer { subscription.cancel() }
        let baseline = counter.count

        rig.sut.messages = [makeMessage()]

        XCTAssertGreaterThan(counter.count, baseline)
    }

    func test_deviceTranslationTriggers_whenTheTranslationsChange_fire() throws {
        let rig = try makeRig()
        let counter = SignalCounter()
        let subscription = watchTheTriggers(of: rig, into: counter)
        defer { subscription.cancel() }
        let baseline = counter.count

        rig.sut.messageTranslations = [Ids.messageA: [makeTranslation()]]

        XCTAssertGreaterThan(counter.count, baseline)
    }

    func test_deviceTranslationTriggers_whenAnUnrelatedStateChanges_stayQuiet() throws {
        let rig = try makeRig()
        let counter = SignalCounter()
        let subscription = watchTheTriggers(of: rig, into: counter)
        defer { subscription.cancel() }
        let baseline = counter.count

        rig.sut.isLoadingReactions = true

        XCTAssertEqual(counter.count, baseline)
    }
}

@MainActor
private struct ConversationRig {
    let sut: ConversationViewModel
    let socket: MockMessageSocket
    let auth: MockAuthManager
}

private final class TranslationEventLog {
    var events: [TranslationEvent] = []
}

private final class SignalCounter {
    var count = 0
}
