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

        try await Task.sleep(for: .milliseconds(50))

        XCTAssertEqual(weakHandler.precondition, true, "précondition : le modèle portait un handler de socket")
        XCTAssertNil(weakController.value, "le contrôleur de la liste est libéré à la fermeture")
        XCTAssertNil(weakViewModel.value, "le modèle de la conversation est libéré à la fermeture")
        XCTAssertNil(weakHandler.value, "le handler de socket est libéré avec son modèle")
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
    private func mountThenClose() async throws -> (
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
        let viewModel = makeViewModel(pool: pool, persistence: persistence)
        await viewModel.messageStore.refreshFromDB()
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
        window.rootViewController = nil
        window.isHidden = true
        return boxes
    }

    private func makeViewModel(pool: DatabaseQueue, persistence: MessagePersistenceActor) -> ConversationViewModel {
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
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: persistence)
        )
    }
}
