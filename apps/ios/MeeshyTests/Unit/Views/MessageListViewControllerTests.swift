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

    // MARK: - WS-6 (F-085) — flag off ⇒ bit-à-bit identique (contrat §WS-6)

    /// `readingMode` n'est JAMAIS touché dans ce test (reste à son défaut
    /// `.bubbles`) : `scrollToBottom` doit se comporter EXACTEMENT comme
    /// avant F-085 — aucun crash (le pass Focal est retiré, 2026-08-18).
    /// Store SEEDÉ (un message) pour dépasser le garde `numberOfItems > 0`
    /// de `scrollToBottom` et exercer réellement le site 4 (§4.8).
    func test_scrollToBottom_readingModeUntouched_doesNotCrash() async throws {
        let store = try await makeSeededStore()
        let vc = makeSUT(store: store)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()

        vc.scrollToBottom(animated: false)

        XCTAssertNotNil(vc.view) // RETRAIT FOCAL iOS (2026-08-18) : plus de pass — témoin no-crash
    }

    /// `scrollToMessage`/`scrollToMessageFast` conservent `.centeredVertically`
    /// quand `readingMode != .focal` (défaut `.bubbles` ici) — pas de crash
    /// sur une cible absente du snapshot (chemin déjà existant, non touché).
    func test_scrollToMessage_readingModeBubbles_doesNotCrash_targetAbsent() throws {
        let store = try makeEmptyStore()
        let vc = makeSUT(store: store)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()

        vc.scrollToMessage(localId: "does-not-exist")

        XCTAssertNotNil(vc.view) // RETRAIT FOCAL iOS (2026-08-18) : plus de pass — témoin no-crash
    }

    // MARK: - Visée vérifiée (ScrollToMessageSettleLaw)

    /// Un saut vers un message PRÉSENT arme une visée vérifiée, et la visée
    /// se SOLDE : au plus tard via le filet du no-op (`scrollToItem` déjà à
    /// l'offset cible ne livre jamais `scrollViewDidEndScrollingAnimation`),
    /// la loi tranche `.settled` et vide la cible. Une cible qui resterait
    /// pendante re-viserait par-dessus le prochain geste.
    func test_scrollToMessage_targetPresent_settlesAndClearsPendingTarget() async throws {
        let store = try await makeSeededStore()
        let vc = makeSUT(store: store)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()

        // L'apply diffable du premier snapshot peut se poser au tour suivant —
        // on attend la matérialisation de la cellule avant de viser (borné).
        for _ in 0..<20 where vc.focalCollectionViewForTesting?.numberOfItems(inSection: 0) == 0 {
            try await Task.sleep(for: .milliseconds(25))
        }

        vc.scrollToMessage(localId: "m1")
        XCTAssertNotNil(vc.scrollSettleTargetForTesting,
            "un saut vers une cible présente doit armer la visée vérifiée")

        // Filet du no-op à 0.4 s — on attend au-delà puis on vérifie le solde.
        try await Task.sleep(for: .milliseconds(700))
        XCTAssertNil(vc.scrollSettleTargetForTesting,
            "la visée doit se solder (settled/giveUp) — jamais rester pendante")
    }

    /// Cible ABSENTE du snapshot : aucune visée armée (le chemin parent
    /// jumpToQuotedMessage reprend la main avec son propre trigger).
    func test_scrollToMessage_targetAbsent_doesNotArmPendingTarget() throws {
        let store = try makeEmptyStore()
        let vc = makeSUT(store: store)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()

        vc.scrollToMessage(localId: "does-not-exist")

        XCTAssertNil(vc.scrollSettleTargetForTesting)
    }

    // MARK: - Helpers

    private func makeEmptyStore() throws -> MessageStore {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        return MessageStore(conversationId: "c1", persistence: persistence)
    }

    /// Un message unique, confirmé (`state: .sent`) — assez pour dépasser le
    /// garde `collectionView.numberOfItems(inSection: 0) > 0` de
    /// `scrollToBottom`/`scrollToMessage` (WS-6, F-085) sans le poids d'un
    /// corpus complet. Mêmes champs que `PerfMessageRecordFactory.make`
    /// (`MessageListPerformanceTests.swift`, `private` à son fichier — non
    /// réutilisable ici).
    private func makeSeededStore() async throws -> MessageStore {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        try await pool.write { db in
            let record = MessageRecord(
                localId: "m1", serverId: "server_m1",
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
                createdAt: Date(), sentAt: nil,
                deliveredAt: nil, readAt: nil, updatedAt: Date(),
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
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()
        return store
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
