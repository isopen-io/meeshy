import XCTest
import GRDB
import UIKit
@testable import Meeshy
import MeeshySDK

/// #10853 — fermer une conversation libère son écran.
///
/// Mesuré au simulateur : cinq ouvertures puis fermetures de la même
/// conversation laissaient cinq `ConversationViewModel`, cinq
/// `ConversationSocketHandler` et cinq `MessageListViewController` en vie,
/// abonnés au socket, à la base et au retour au premier plan.
///
/// Le détenteur : la cellule de message. Son `UIHostingConfiguration` monte un
/// `BubbleSwipeContainer` dont le contenu est une fermeture STOCKÉE ; elle
/// lisait `self.longMessageExpansion(for:)` et capturait donc le contrôleur en
/// fort. Contrôleur → collection → cellule → fermeture → contrôleur : le cycle
/// survivait au retrait de l'écran, et avec lui chaque rappel posé par
/// `ConversationView` — une copie de la vue, ses `@StateObject`, son modèle.
@MainActor
final class MessageListRetentionTests: XCTestCase {

    private let conversationId = "000000000000000000000001"

    func test_closingTheThread_releasesTheControllerTheViewModelAndItsSocketHandler() async throws {
        let (weakController, weakViewModel, weakHandler) = try await mountThenClose()

        // Une libération DIFFÉRÉE (tâches encore en vol sur un hôte qui démarre) n'est pas une fuite : on attend,
        // bornée — 50 ms fixes échouaient sous charge alors que tout se libérait juste après.
        _ = await waitUntil { weakController.value == nil && weakViewModel.value == nil && weakHandler.value == nil }

        XCTAssertEqual(weakHandler.precondition, true, "précondition : le modèle portait un handler de socket")
        XCTAssertNil(weakController.value, "le contrôleur de la liste est libéré à la fermeture")
        XCTAssertNil(weakViewModel.value, "le modèle de la conversation est libéré à la fermeture")
        XCTAssertNil(weakHandler.value, "le handler de socket est libéré avec son modèle")
    }

    /// Le moteur de synchro tient l'ENSEMBLE des conversations ouvertes, une ouverture par écran, rendue par la
    /// `deinit` du modèle. Un écran qui fuit garderait donc sa conversation « ouverte » — lue à zéro, hors du
    /// décompte — jusqu'au relancement. Ouvrir (`start()`) puis fermer N fois : chaque contrôleur, chaque modèle et
    /// chaque handler est libéré, et l'ensemble revient vide.
    func test_openingAndClosingNTimes_releasesEveryScreen_andLeavesNoConversationOpen() async throws {
        // Le double compte les ouvertures PAR conversation comme le moteur (`openConversation` / `closeConversation`).
        let engine = MockConversationSyncEngine()
        var boxes: [(WeakBox<MessageListViewController>, WeakBox<ConversationViewModel>, WeakBox<ConversationSocketHandler>)] = []
        for _ in 1...5 {
            let mounted = try await mountThenClose(starting: engine) {
                XCTAssertTrue(engine.openConversationIds.contains(self.conversationId), "précondition : l'écran a déclaré son ouverture")
            }
            boxes.append(mounted)
        }

        let released = await waitUntil {
            boxes.allSatisfy { $0.0.value == nil && $0.1.value == nil && $0.2.value == nil }
        }
        for (index, box) in boxes.enumerated() {
            XCTAssertNil(box.0.value, "ouverture \(index + 1) : le contrôleur est libéré")
            XCTAssertNil(box.1.value, "ouverture \(index + 1) : le modèle est libéré")
            XCTAssertNil(box.2.value, "ouverture \(index + 1) : le handler de socket est libéré")
        }
        XCTAssertTrue(released)
        XCTAssertTrue(engine.openConversationIds.isEmpty, "aucune conversation ne reste « ouverte » après ses fermetures")
        XCTAssertEqual(engine.openConversationCalls.count, 5)
        XCTAssertEqual(engine.closeConversationCalls.count, 5, "une fermeture par ouverture — chaque `deinit` a tourné")
    }

    private func waitUntil(timeout: TimeInterval = 3, _ condition: () -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            try? await Task.sleep(for: .milliseconds(25))
        }
        return condition()
    }

    // MARK: - Harnais

    private final class WeakBox<T: AnyObject> {
        weak var value: T?
        let precondition: Bool?
        init(_ value: T?, precondition: Bool? = nil) {
            self.value = value
            self.precondition = precondition
        }
    }

    /// Monte le fil comme `MessageListView.makeUIViewController` : rappels
    /// qui RETIENNENT le modèle (ce que fait la copie de `ConversationView`
    /// capturée par chaque fermeture), cellules configurées dans une fenêtre,
    /// puis la fenêtre rend le contrôleur — la fermeture de l'écran.
    private func mountThenClose(
        starting engine: MockConversationSyncEngine? = nil,
        whileOpen: () -> Void = {}
    ) async throws -> (
        WeakBox<MessageListViewController>,
        WeakBox<ConversationViewModel>,
        WeakBox<ConversationSocketHandler>
    ) {
        let pool = try MessageStoreObservationHelper.makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let t0 = Date(timeIntervalSince1970: 1_726_000_000)
        for index in 1...6 {
            try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
                localId: "m\(index)",
                conversationId: conversationId,
                content: "Bonjour \(index)",
                createdAt: t0.addingTimeInterval(Double(index) * 60)
            ))
        }
        let viewModel = makeViewModel(pool: pool, persistence: persistence, syncEngine: engine)
        await viewModel.messageStore.refreshFromDB()
        if engine != nil { viewModel.start() }
        let controller = MessageListViewController(
            store: viewModel.messageStore,
            currentUserId: "000000000000000000000099",
            accentColor: "#6366F1",
            isDirect: false,
            isDark: false,
            router: Router(),
            storyViewModel: StoryViewModel(),
            statusViewModel: StatusViewModel(),
            conversationListViewModel: ConversationListViewModel()
        )
        controller.conversationViewModel = viewModel
        controller.onNewMessagesBadge = { _ in _ = viewModel }
        controller.onLongPress = { _, _ in _ = viewModel }

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first,
            "la suite tourne dans l'app hôte : une scène existe"
        )
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        window.rootViewController = controller
        window.isHidden = false
        controller.view.layoutIfNeeded()
        let collection = try XCTUnwrap(controller.focalCollectionViewForTesting)
        collection.layoutIfNeeded()
        XCTAssertFalse(collection.visibleCells.isEmpty, "précondition : des cellules de message sont configurées")

        let boxes = (
            WeakBox(controller),
            WeakBox(viewModel),
            WeakBox(viewModel.socketHandler, precondition: viewModel.socketHandler != nil)
        )
        whileOpen()
        window.rootViewController = nil
        window.isHidden = true
        return boxes
    }

    private func makeViewModel(pool: DatabaseQueue, persistence: MessagePersistenceActor,
                               syncEngine: MockConversationSyncEngine? = nil) -> ConversationViewModel {
        let authManager = MockAuthManager()
        authManager.simulateLoggedIn(
            user: MeeshyUser(id: "000000000000000000000099", username: "me", displayName: "Me")
        )
        return ConversationViewModel(
            conversationId: conversationId,
            unreadCount: 0,
            isDirect: false,
            participantUserId: nil,
            anonymousSession: nil,
            authManager: authManager,
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            syncEngine: syncEngine.map { $0 as ConversationSyncEngineProviding } ?? ConversationSyncEngine.shared,
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(persistence: persistence)
        )
    }
}
