// apps/ios/MeeshyTests/Unit/Views/MessageListViewControllerTests.swift

import XCTest
import GRDB
import UIKit
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class MessageListViewControllerTests: XCTestCase {

    /// Régression 2026-08-04 : `onNewMessagesBadge` ne s'invoquait que sur une
    /// AUGMENTATION du compteur (nouveau message hors écran) ou sur les deux
    /// resets explicites (tap "défiler en bas" / retour à l'ancrage bas) —
    /// jamais sur un chargement initial qui n'a rien à signaler. Le `@State`
    /// SwiftUI d'un `ConversationView` réutilisé pouvait donc garder une
    /// pastille non-lue périmée indéfiniment, même conversation ouverte et
    /// défilée tout en bas, tant que l'utilisateur ne déclenchait pas
    /// manuellement un des deux resets.
    func test_viewDidLoad_freshController_forceSyncsBadgeToZero() throws {
        let store = try makeEmptyStore()
        let vc = makeSUT(store: store)

        var reportedCounts: [Int] = []
        vc.onNewMessagesBadge = { reportedCounts.append($0) }

        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()

        XCTAssertEqual(reportedCounts, [0],
            "viewDidLoad doit forcer une synchronisation à 0, même sans nouveau message — sinon un @State SwiftUI réutilisé garde une pastille périmée")
    }

    // MARK: - Helpers

    private func makeEmptyStore() throws -> MessageStore {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        return MessageStore(conversationId: "c1", persistence: persistence)
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
