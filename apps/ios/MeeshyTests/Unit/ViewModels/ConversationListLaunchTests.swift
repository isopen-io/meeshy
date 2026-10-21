import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// #10927 — au démarrage, la liste s'affiche dès la session restaurée et se
/// répare seule quand le serveur revient.
///
/// Mesuré au simulateur sur staging (2026-10-18) : la session était restaurée
/// à +1,1 s du lancement, mais la liste n'était lue qu'au `.task` de la racine,
/// 0,6 à 2,2 s plus tard. Et une liste tombée en échec au démarrage restait sur
/// « Réessayer » alors que le socket se connectait quelques secondes après.
@MainActor
final class ConversationListLaunchTests: XCTestCase {

    override func setUp() {
        super.setUp()
        ConversationListVMOwner.resetForTesting()
    }

    override func tearDown() {
        ConversationListVMOwner.resetForTesting()
        super.tearDown()
    }

    private func makeList(syncEngine: MockConversationSyncEngine = MockConversationSyncEngine()) -> LaunchCountingListViewModel {
        LaunchCountingListViewModel(syncEngine: syncEngine)
    }

    private func settle() async {
        for _ in 0..<5 { await Task.yield() }
    }

    // MARK: - La liste lue dès la session restaurée

    func test_prewarm_startsLoadingTheList_beforeAnyRootIsMounted() async {
        let list = makeList()

        ConversationListVMOwner.prewarm(userId: "user-a", make: { list })
        await settle()

        XCTAssertEqual(list.loads, 1, "la liste se lit dès la session restaurée, sans attendre la racine")
    }

    func test_theRootOwner_adoptsThePrewarmedList() {
        let list = makeList()
        ConversationListVMOwner.prewarm(userId: "user-a", make: { list })

        let owner = ConversationListVMOwner(make: {
            XCTFail("la liste préchargée existe : aucune autre ne doit naître")
            return self.makeList()
        }, currentUserId: "user-a")

        XCTAssertTrue(owner.viewModel === list)
    }

    func test_theRootLoad_joinsTheLaunchLoad_insteadOfReadingTheListTwice() async {
        let list = makeList()
        ConversationListVMOwner.prewarm(userId: "user-a", make: { list })
        await settle()

        await ConversationListVMOwner.loadAtLaunch(list)
        await ConversationListVMOwner.loadAtLaunch(list)

        XCTAssertEqual(list.loads, 1, "la racine et la liste rejoignent le chargement du lancement")
    }

    func test_onceTheLaunchIsOver_aLoadReadsTheListAgain() async {
        let list = makeList()
        ConversationListVMOwner.prewarm(userId: "user-a", make: { list })
        await settle()
        ConversationListVMOwner.endLaunch()

        await ConversationListVMOwner.loadAtLaunch(list)

        XCTAssertEqual(list.loads, 2)
    }

    func test_aListPrewarmedForAnotherAccount_isNeverAdopted() {
        let foreign = makeList()
        let own = makeList()
        ConversationListVMOwner.prewarm(userId: "user-a", make: { foreign })

        let owner = ConversationListVMOwner(make: { own }, currentUserId: "user-b")

        XCTAssertTrue(owner.viewModel === own, "la liste d'un compte quitté ne s'affiche jamais au suivant")
    }

    // MARK: - La liste en échec se répare au retour du serveur

    private func failedList() async -> (LaunchCountingListViewModel, MockConversationSyncEngine) {
        let engine = MockConversationSyncEngine()
        engine.fullSyncResult = false
        let list = makeList(syncEngine: engine)
        await list.forceRefresh()
        XCTAssertTrue(list.loadFailed)
        engine.fullSyncResult = true
        return (list, engine)
    }

    func test_aFailedList_refreshesItselfWhenTheSocketConnects() async {
        let (list, engine) = await failedList()
        let connected = CurrentValueSubject<Bool, Never>(false)
        let recovery = list.repairsFailedLoadOnReconnect(connected.eraseToAnyPublisher())

        connected.send(true)
        await waitUntil { engine.fullSyncCallCount == 2 }

        XCTAssertEqual(engine.fullSyncCallCount, 2)
        XCTAssertFalse(list.loadFailed, "le serveur répond : l'erreur ne reste pas affichée")
        recovery.cancel()
    }

    func test_aListThatDidNotFail_isNotRefreshedWhenTheSocketConnects() async {
        let engine = MockConversationSyncEngine()
        let list = makeList(syncEngine: engine)
        let connected = CurrentValueSubject<Bool, Never>(false)
        let recovery = list.repairsFailedLoadOnReconnect(connected.eraseToAnyPublisher())

        connected.send(true)
        await settle()
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(engine.fullSyncCallCount, 0)
        recovery.cancel()
    }

    func test_aFailedList_isRefreshedOnTheRisingEdgeOnly_notOnEachRepeatedConnectedValue() async {
        let (list, engine) = await failedList()
        engine.fullSyncResult = false
        let connected = CurrentValueSubject<Bool, Never>(false)
        let recovery = list.repairsFailedLoadOnReconnect(connected.eraseToAnyPublisher())

        connected.send(true)
        await waitUntil { engine.fullSyncCallCount == 2 }
        connected.send(true)
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(engine.fullSyncCallCount, 2, "rester connecté ne relance rien")

        connected.send(false)
        connected.send(true)
        await waitUntil { engine.fullSyncCallCount == 3 }
        XCTAssertEqual(engine.fullSyncCallCount, 3, "une reconnexion est un nouveau front montant")
        recovery.cancel()
    }

    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<200 where !condition() {
            try? await Task.sleep(nanoseconds: 5_000_000)
        }
    }
}

/// Une liste qui compte ses chargements au lieu de lire le cache partagé.
final class LaunchCountingListViewModel: ConversationListViewModel {
    nonisolated deinit {}
    private(set) var loads = 0

    init(syncEngine: MockConversationSyncEngine) {
        let drafts = DraftStore(userDefaults: UserDefaults(suiteName: "ConvListLaunchTests-\(UUID().uuidString)")!)
        drafts.clearAll()
        super.init(
            conversationService: MockConversationService(),
            preferenceService: MockPreferenceService(),
            messageSocket: MockMessageSocket(),
            messageService: MockMessageService(),
            authManager: MockAuthManager(),
            storyService: MockStoryService(),
            syncEngine: syncEngine,
            messageNotificationPublisher: PassthroughSubject<MessageActivitySignal, Never>().eraseToAnyPublisher(),
            draftStore: drafts,
            store: ConversationListViewModelTests.makeTestStore(),
            categoryStore: UserCategoryStore(service: ConvListTestCategoryWriter())
        )
    }

    override func loadConversations() async {
        loads += 1
    }
}
