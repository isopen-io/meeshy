import XCTest
import Combine
import os
@testable import MeeshySDK

/// #20341 — **la PREMIÈRE connexion rattrape la même fenêtre qu'une coupure.**
///
/// `wireCatchUp` portait deux branches pour une MÊME fenêtre, et la liste des
/// gestes n'existait que dans l'une : `didReconnect` rejouait l'outbox, les
/// catégories et les préférences servies, pendant que la branche de première
/// hydratation (#18916) ne rejouait que les préférences — et `didReconnect` ne
/// part pas au premier connect (`handleConnectionEstablished` ne l'émet que
/// `if wasReconnect`).
///
/// **Le témoin de la lacune ne peut pas s'écrire sur `didReconnect`** : par
/// construction, les trois gestes y partaient déjà. Il s'écrit donc sur une
/// activation qui ne voit JAMAIS `didReconnect` — c'est le démarrage à froid, et
/// c'est le seul rang où l'ancienne forme et la nouvelle rendent des verdicts
/// différents. (Même raison que la leçon 261 : un témoin de rang s'écrit sur un
/// rang AUTRE que le premier.)
@MainActor
final class ConversationWindowCatchUpTests: XCTestCase {

    // MARK: - Le cliquet de FORME : la couverture est exacte dans les deux ordres

    /// L'ordre des deux déclencheurs n'est contrôlé par personne. Ce témoin dit
    /// que, quel qu'il soit, **chaque geste part exactement une fois** — ni
    /// oublié, ni joué deux fois. C'est ce qu'un témoin de comportement ne peut
    /// pas voir : il atteste les gestes qu'il NOMME, et un quatrième geste
    /// ajouté demain ne serait nommé nulle part.
    func test_everyGestureRunsExactlyOnce_whicheverOrderTheTriggersArrive() {
        let all = Set(ConversationWindowCatchUp.allCases)

        // Ordre A — la connexion d'abord (store encore vide), l'hydratation ensuite.
        let connectFirst = ConversationWindowCatchUp.onConnect(storeHydrated: false)
        let hydrationAfter = ConversationWindowCatchUp.onFirstHydration(socketConnected: true)
        XCTAssertEqual(Set(connectFirst).union(hydrationAfter), all,
                       "ordre « connexion puis hydratation » : un geste n'est joué par aucune branche")
        XCTAssertTrue(Set(connectFirst).isDisjoint(with: hydrationAfter),
                      "ordre « connexion puis hydratation » : un geste est joué deux fois")

        // Ordre B — l'hydratation d'abord (cache disque), la connexion ensuite.
        let hydrationFirst = ConversationWindowCatchUp.onFirstHydration(socketConnected: false)
        let connectAfter = ConversationWindowCatchUp.onConnect(storeHydrated: true)
        XCTAssertEqual(Set(hydrationFirst).union(connectAfter), all,
                       "ordre « hydratation puis connexion » : un geste n'est joué par aucune branche")
        XCTAssertTrue(Set(hydrationFirst).isDisjoint(with: connectAfter),
                      "ordre « hydratation puis connexion » : un geste est joué deux fois")
    }

    /// Le geste qui exige un store peuplé ne part pas avant lui — et sa raison
    /// est une PERTE, pas un confort : `applyServedPreferences` jette une
    /// conversation inconnue du store pendant que le filigrane avance sur les
    /// lignes servies.
    func test_servedPreferences_isTheOnlyGestureThatWaitsForAHydratedStore() {
        XCTAssertEqual(
            ConversationWindowCatchUp.allCases.filter(\.requiresHydratedStore),
            [.servedPreferences])
        XCTAssertFalse(ConversationWindowCatchUp.onConnect(storeHydrated: false).contains(.servedPreferences))
        XCTAssertTrue(ConversationWindowCatchUp.onConnect(storeHydrated: true).contains(.servedPreferences))
    }

    /// Les deux gestes que la branche d'hydratation ne doit PAS porter : son
    /// prédicat (`first { !$0.isEmpty }`) ne tire jamais pour un compte SANS
    /// conversation, alors que des catégories créées sur le web existent sans
    /// aucune conversation — et un `flushOutbox(force:)` de plus par démarrage
    /// à froid repousserait le backoff de chaque ligne pour rien.
    func test_firstHydration_carriesOnlyTheHydrationGatedGesture() {
        XCTAssertEqual(ConversationWindowCatchUp.onFirstHydration(socketConnected: true), [.servedPreferences])
        XCTAssertEqual(ConversationWindowCatchUp.onFirstHydration(socketConnected: false), [])
    }

    // MARK: - Le comportement, geste par geste, sur une PREMIÈRE connexion

    func test_firstConnection_withoutAnyReconnect_flushesTheOutbox() async throws {
        let prefs = MockPreferenceWriter()
        prefs.errorToThrow = MeeshyError.server(statusCode: 503, message: "down")
        let store = ConversationStore(
            preferenceService: prefs,
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(dbPath: Self.tempOutboxPath()))
        await store.hydrate(Self.makeConv(id: "c1"))
        try await store.apply(.setPinned(true), for: "c1")
        XCTAssertEqual(prefs.calls.count, 1, "mise en place : l'appel transitoire doit avoir été tenté")

        prefs.errorToThrow = nil
        let env = CatchUpEnv(store: store, categoryStore: UserCategoryStore(service: MockCategoryWriter()))

        // La PREMIÈRE connexion, et elle seule : `didReconnect` ne part jamais ici.
        env.didConnect.send(())

        let flushed = await Self.waitUntil { prefs.calls.count >= 2 }
        XCTAssertTrue(flushed, """
            une épingle posée hors ligne, l'app tuée, puis relancée sur un réseau sain \
            doit atteindre le serveur à la première connexion — la file est PERSISTÉE \
            (SQLite), donc sans ce geste elle attendait le premier accroc réseau ou un \
            aller-retour en arrière-plan
            """)
    }

    func test_firstConnection_withoutAnyReconnect_rehydratesTheCategoryStore() async {
        let service = MockCategoryWriter()
        service.listResult = [ConversationCategory(
            id: "cat-1", name: "Work", color: nil, icon: nil, order: 0, isExpanded: true)]
        let categoryStore = UserCategoryStore(service: service)
        let env = CatchUpEnv(store: Self.makeStore(), categoryStore: categoryStore)

        env.didConnect.send(())

        let hydrated = await Self.waitUntil { service.listCallCount >= 1 }
        XCTAssertTrue(hydrated, """
            une catégorie supprimée depuis un autre appareil pendant la fenêtre doit \
            disparaître dès la première connexion : la relecture du démarrage à froid \
            (`loadCategories`) part AVANT l'entrée dans les rooms
            """)
        let resynced = await Self.waitUntil { await categoryStore.categories().contains { $0.id == "cat-1" } }
        XCTAssertTrue(resynced, "le store doit porter la liste fraîche après la première connexion")
    }

    /// Le geste gardé part bien quand le store est DÉJÀ peuplé à la connexion —
    /// l'ordre nominal d'un démarrage à froid, où la liste vient du cache
    /// disque avant que le socket soit prêt.
    func test_firstConnection_whenStoreAlreadyHydrated_catchesUpServedPreferencesOnce() async {
        let store = Self.makeStore()
        await store.hydrate(Self.makeConv(id: "c1"))
        let feed = ServedPreferencesFeed([[]])
        let env = CatchUpEnv(
            store: store,
            categoryStore: UserCategoryStore(service: MockCategoryWriter()),
            servedPreferences: feed)

        env.didConnect.send(())

        let asked = await Self.waitUntil { feed.asked.count == 1 }
        XCTAssertTrue(asked, "la connexion doit relire les préférences servies quand le store est peuplé")
        try? await Task.sleep(nanoseconds: 400_000_000)
        XCTAssertEqual(feed.asked.count, 1, """
            et une seule fois : l'hydratation ayant précédé la connexion, sa branche \
            doit se taire — sinon chaque démarrage à froid paie deux relectures
            """)
    }

    /// L'ordre inverse : la connexion trouve un store VIDE, le geste gardé est
    /// différé à l'hydratation — et part là, une fois.
    func test_connectionBeforeHydration_defersServedPreferencesToTheHydration() async {
        let store = Self.makeStore()
        let feed = ServedPreferencesFeed([[]])
        let env = CatchUpEnv(
            store: store,
            categoryStore: UserCategoryStore(service: MockCategoryWriter()),
            servedPreferences: feed)

        env.didConnect.send(())
        try? await Task.sleep(nanoseconds: 400_000_000)
        XCTAssertEqual(feed.asked.count, 0, """
            un store vide ne peut pas recevoir de préférences : les servir ici ne les \
            retarderait pas, il les PERDRAIT (le filigrane avance sur les lignes servies)
            """)

        await store.hydrate(Self.makeConv(id: "c1"))

        let asked = await Self.waitUntil { feed.asked.count == 1 }
        XCTAssertTrue(asked, "l'hydratation qui suit une connexion doit jouer le geste différé")
    }

    // MARK: - Harnais

    /// Le pont câblé sur des publishers injectés, SANS `didReconnect` : une
    /// activation de démarrage à froid ne le voit jamais.
    @MainActor
    private struct CatchUpEnv {
        let bridge: ConversationStoreSocketBridge
        let didConnect = PassthroughSubject<Void, Never>()

        init(
            store: ConversationStore,
            categoryStore: UserCategoryStore,
            servedPreferences: ServedPreferencesFeed = ServedPreferencesFeed([])
        ) {
            bridge = ConversationStoreSocketBridge(
                store: store,
                categoryStore: categoryStore,
                currentUserId: { "me" },
                fetchChangedPreferences: { changedSince in servedPreferences.serve(changedSince: changedSince) })
            bridge.activate(
                conversationUpdated: Empty().eraseToAnyPublisher(),
                conversationDeleted: Empty().eraseToAnyPublisher(),
                userPreferencesUpdated: Empty().eraseToAnyPublisher(),
                userPreferencesReordered: Empty().eraseToAnyPublisher(),
                readStatusUpdated: Empty().eraseToAnyPublisher(),
                categoryCreated: Empty().eraseToAnyPublisher(),
                categoryUpdated: Empty().eraseToAnyPublisher(),
                categoryDeleted: Empty().eraseToAnyPublisher(),
                categoriesReordered: Empty().eraseToAnyPublisher(),
                didConnect: didConnect.eraseToAnyPublisher())
        }
    }

    private static func tempOutboxPath() -> String {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("catchup-window-\(UUID().uuidString).db").path
    }

    private static func makeStore() -> ConversationStore {
        ConversationStore(
            preferenceService: MockPreferenceWriter(),
            conversationService: MockLifecycleWriter(),
            outbox: ConversationStateOutbox(dbPath: tempOutboxPath()))
    }

    private static func makeConv(id: String) -> MeeshyConversation {
        MeeshyConversation(
            id: id, identifier: id, type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: ConversationUserState(version: 1))
    }

    /// Le rattrapage traverse un `debounce` de 250 ms puis une file sérialisée :
    /// la condition se sonde, elle ne se suppose pas.
    private static func waitUntil(timeout: TimeInterval = 3, _ condition: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        return await condition()
    }
}
