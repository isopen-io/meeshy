// apps/ios/MeeshyTests/Unit/Views/MessageListViewControllerCellRegistrationTests.swift

import XCTest
import GRDB
import UIKit
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class MessageListViewControllerCellRegistrationTests: XCTestCase {

    // MARK: - Caractérisation (verte AVANT le découpage des registrations)

    func test_celluleMessage_modeBulles_configureeSansTagNiMenuNatif() async throws {
        let (vc, _) = try await makeMountedList(count: 6)

        let cell = try XCTUnwrap(cell(of: .message(localId: "m3"), in: vc))

        XCTAssertNotNil(cell.contentConfiguration)
        XCTAssertEqual(cell.tag, 0)
        XCTAssertEqual(cell.layer.zPosition, 0)
        XCTAssertFalse(cell.clipsToBounds)
        XCTAssertFalse(cell.contentView.clipsToBounds)
        XCTAssertEqual(cell.backgroundColor, .clear)
        XCTAssertFalse(cell.interactions.contains { $0 is UIContextMenuInteraction })
    }

    func test_celluleMessage_modeFocal_poseLeTagDeTeteDeGroupe() async throws {
        let (vc, _) = try await makeMountedList(count: 6)

        vc.readingMode = .focal
        vc.applySnapshot(reconfigure: .allItems)
        vc.focalCollectionViewForTesting?.layoutIfNeeded()

        let oldest = try XCTUnwrap(cell(of: .message(localId: "m1"), in: vc))
        let middle = try XCTUnwrap(cell(of: .message(localId: "m3"), in: vc))
        XCTAssertTrue(FocalScrollPerspective.isGroupHead(cellTag: oldest.tag))
        XCTAssertFalse(FocalScrollPerspective.isGroupHead(cellTag: middle.tag))
    }

    func test_chaqueTypeDeLigne_aSonPoolDeReutilisation() async throws {
        let (vc, _) = try await makeMountedList(count: 6)
        vc.conversationViewModel = try await makeConversationViewModel()
        let typers = [TypingParticipant(id: "user_other", displayName: "Autre")]
        vc.conversationViewModel?.typingParticipants = typers
        vc.applySnapshot(reconfigure: .allItems)
        vc.focalCollectionViewForTesting?.layoutIfNeeded()

        let message = try XCTUnwrap(cell(of: .message(localId: "m3"), in: vc))
        let day = try XCTUnwrap(cell(ofKind: { if case .dayHeader = $0 { return true } else { return false } }, in: vc))
        let typing = try XCTUnwrap(cell(of: .typingIndicator, in: vc))

        let identifiers = [message.reuseIdentifier, day.reuseIdentifier, typing.reuseIdentifier]
        XCTAssertEqual(Set(identifiers.compactMap { $0 }).count, 3)
    }

    // MARK: - Fabriques

    private func cell(of item: MessageListItem, in vc: MessageListViewController) -> UICollectionViewCell? {
        guard let indexPath = vc.focalDataSourceForTesting?.indexPath(for: item) else { return nil }
        return vc.focalCollectionViewForTesting?.cellForItem(at: indexPath)
    }

    private func cell(ofKind matches: (MessageListItem) -> Bool, in vc: MessageListViewController) -> UICollectionViewCell? {
        guard let snapshot = vc.focalDataSourceForTesting?.snapshot(),
              let item = snapshot.itemIdentifiers.first(where: matches) else { return nil }
        return cell(of: item, in: vc)
    }

    private func makeMountedList(count: Int) async throws -> (MessageListViewController, UIWindow) {
        let store = try await makeSeededStore(count: count)
        let vc = makeSUT(store: store)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()
        for _ in 0..<20 where vc.focalCollectionViewForTesting?.numberOfItems(inSection: 0) == 0 {
            try await Task.sleep(for: .milliseconds(25))
        }
        vc.focalCollectionViewForTesting?.layoutIfNeeded()
        return (vc, window)
    }

    private func makeEmptyStore() throws -> MessageStore {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        return MessageStore(conversationId: "c1", persistence: persistence)
    }

    private func makeSeededStore(count: Int = 1) async throws -> MessageStore {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let t0 = Date(timeIntervalSince1970: 1_726_000_000)
        try await pool.write { db in
            for i in 1...count {
            let record = MessageRecord(
                localId: "m\(i)", serverId: "server_m\(i)",
                conversationId: "c1", senderId: "user_other",
                content: "Bonjour", originalLanguage: "fr",
                messageType: "text", messageSource: "user", contentType: "text",
                state: .sent, retryCount: 0, lastError: nil,
                isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                replyToId: nil, storyReplyToId: nil,
                forwardedFromId: nil, forwardedFromConversationId: nil,
                replyToJson: nil, forwardedFromJson: nil,
                expiresAt: nil, effectFlags: 0,
                maxViewOnceCount: nil, viewOnceCount: 0,
                isEdited: false, editedAt: nil, deletedAt: nil,
                pinnedAt: nil, pinnedBy: nil,
                senderName: nil, senderUsername: nil,
                senderColor: nil, senderAvatarURL: nil,
                deliveredCount: 1, readCount: 0,
                deliveredToAllAt: nil, readByAllAt: nil,
                createdAt: t0.addingTimeInterval(Double(i)), sentAt: nil,
                deliveredAt: nil, readAt: nil, updatedAt: t0,
                attachmentsJson: nil, reactionsJson: nil,
                reactionCount: 0, currentUserReactionsJson: nil,
                mentionedUsersJson: nil,
                cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                cachedLastLineWidth: nil, cachedLineCount: nil,
                cachedTimestampInline: nil,
                layoutVersion: 0, layoutMaxWidth: nil,
                changeVersion: 0
            )
            try record.insert(db)
            }
        }
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.refreshFromDB()
        return store
    }

    /// **Le ViewModel arrive APRÈS `viewDidLoad`, et ses observations ne se
    /// rejouaient jamais** (#5947).
    ///
    /// `observeStore()` s'exécute une seule fois, au chargement de la vue. En
    /// son MILIEU vit un `guard let vm = conversationViewModel else { return }`,
    /// et tout ce qui suit dépend du ViewModel : le roster de frappe, les
    /// traductions, les transcriptions, les audios traduits, les surcharges de
    /// langue, les anneaux de story. Quand le ViewModel n'est pas encore posé à
    /// cet instant, la fonction sort — et **rien ne la rappelle**.
    ///
    /// Mesuré au simulateur le 2026-09-10, en instrumentant le chemin complet :
    /// la socket reçoit `typing:start`, le décodeur le rend, le puits du
    /// handler s'exécute, le roster est publié avec un frappeur — et
    /// l'abonnement de la VUE à ce roster n'avait jamais été créé. L'indicateur
    /// de frappe ne pouvait donc apparaître dans AUCUNE conversation.
    ///
    /// L'abonnement d'AVANT le `guard` (`store.messagesDidChange`), lui,
    /// existait : c'est ce qui rendait le défaut invisible — les messages
    /// s'affichaient normalement.
    func test_leViewModelPoseApresLeChargement_etablitQuandMemeSesObservations() async throws {
        let store = try makeEmptyStore()
        let vc = makeSUT(store: store)

        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()   // viewDidLoad, ViewModel encore nil

        XCTAssertFalse(
            vc.didObserveConversationViewModel,
            "Sans ViewModel, il n'y a rien à observer — c'est l'état de départ, pas le défaut."
        )

        vc.conversationViewModel = try await makeConversationViewModel()

        XCTAssertTrue(
            vc.didObserveConversationViewModel,
            "Le ViewModel est arrivé après le chargement : ses observations doivent être établies, sinon frappe, traductions et transcriptions ne remontent JAMAIS."
        )
    }

    /// La pose est IDEMPOTENTE : `updateUIViewController` réassigne le même
    /// ViewModel à chaque passe de rendu SwiftUI, et un second abonnement
    /// doublerait chaque re-snapshot.
    func test_reposerLeMemeViewModelNAbonnePasUneSecondeFois() async throws {
        let store = try makeEmptyStore()
        let vc = makeSUT(store: store)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()

        let vm = try await makeConversationViewModel()
        vc.conversationViewModel = vm
        let apresPremiere = vc.conversationViewModelObservationCount
        vc.conversationViewModel = vm
        vc.conversationViewModel = vm

        XCTAssertEqual(vc.conversationViewModelObservationCount, apresPremiere)
    }

    private func makeConversationViewModel() async throws -> ConversationViewModel {
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: "user_me", username: "moi", displayName: "Moi"))
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        return ConversationViewModel(
            conversationId: "c1",
            authManager: auth,
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: FakeOfflineMessageQueue()
        )
    }

    private func makeSUT(store: MessageStore) -> MessageListViewController {
        MessageListViewController(
            store: store,
            currentUserId: "user_me",
            accentColor: "#6366F1",
            isDirect: false,
            isDark: false,
            router: Router(),
            storyViewModel: StoryViewModel(),
            statusViewModel: StatusViewModel(),
            conversationListViewModel: ConversationListViewModel()
        )
    }
}
