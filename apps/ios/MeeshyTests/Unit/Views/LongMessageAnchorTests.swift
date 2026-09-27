import XCTest
import GRDB
import UIKit
@testable import Meeshy
@testable import MeeshySDK

/// #8157 — un message long déplié se DÉROULE sous son extrait, même quand son
/// haut est déjà sous le chrome et que le fil est loin du bas.
///
/// Mesuré au simulateur sur staging (2026-09-26) : la loi d'ancrage calculait
/// le bon décalage, mais le VERROU DE SCÈNE (`enforceSceneLock`, loi du
/// rouleau : loin du bas, tout mouvement d'offset non piloté est annulé)
/// restaurait l'ancre d'avant au tour de `scrollViewDidScroll` suivant — la
/// rangée ancre étant le déplié lui-même, dont le bas n'avait pas bougé. Le
/// message grandissait donc vers le HAUT. Près du bas, le verrou est désarmé :
/// c'est pourquoi le défaut ne se voyait que loin du bas.
@MainActor
final class LongMessageAnchorTests: XCTestCase {

    private nonisolated static let longId = "m30"

    func test_expanding_farFromTheBottom_withTheTopUnderTheChrome_keepsTheExcerptInPlace() async throws {
        let (vc, cv, window) = try await makeScrolledThread()
        defer { window.isHidden = true }
        let before = try visualTop(of: Self.longId, in: vc, cv: cv)
        let collapsedHeight = try frame(of: Self.longId, in: vc, cv: cv).height

        vc.toggleLongMessageExpansion(Self.longId)
        try await settle(vc, cv) { try self.frame(of: Self.longId, in: vc, cv: cv).height > collapsedHeight + 100 }

        let after = try visualTop(of: Self.longId, in: vc, cv: cv)
        XCTAssertGreaterThan(try frame(of: Self.longId, in: vc, cv: cv).height, collapsedHeight + 100, "précondition : le message s'est déplié")
        XCTAssertEqual(after, before, accuracy: 1, "l'extrait reste à sa place ; la suite se déroule dessous, jamais au-dessus")
        XCTAssertFalse(vc.isIntentionalProgrammaticScroll, "le recalage ne laisse pas le verrou de scène désarmé")
    }

    func test_collapsing_farFromTheBottom_keepsTheShowLessEdgeInPlace() async throws {
        let (vc, cv, window) = try await makeScrolledThread()
        defer { window.isHidden = true }
        let collapsedHeight = try frame(of: Self.longId, in: vc, cv: cv).height
        vc.toggleLongMessageExpansion(Self.longId)
        try await settle(vc, cv) { try self.frame(of: Self.longId, in: vc, cv: cv).height > collapsedHeight + 100 }
        let expandedHeight = try frame(of: Self.longId, in: vc, cv: cv).height
        XCTAssertGreaterThan(expandedHeight, collapsedHeight + 100, "précondition : le message s'est déplié avant d'être replié")
        let before = try visualBottom(of: Self.longId, in: vc, cv: cv)

        vc.toggleLongMessageExpansion(Self.longId)
        try await settle(vc, cv) { try self.frame(of: Self.longId, in: vc, cv: cv).height < expandedHeight - 100 }

        let after = try visualBottom(of: Self.longId, in: vc, cv: cv)
        XCTAssertLessThan(try frame(of: Self.longId, in: vc, cv: cv).height, expandedHeight - 100, "précondition : le message s'est replié")
        XCTAssertEqual(after, before, accuracy: 1, "« Réduire » replie vers le haut : le bas du message reste sous le doigt")
    }

    // MARK: - Harnais

    /// Soixante messages, le trentième long : le fil est posé loin du bas
    /// (verrou armé), le haut du long message au-dessus de l'écran et son
    /// « Lire la suite » visible — la configuration de la capture 21.
    ///
    /// La fenêtre est rattachée à la `UIWindowScene` de l'app hôte, comme
    /// `RenderedScreen` et `MessageListCellSizingTests` : une `UIWindow(frame:)`
    /// nue n'est affichée par aucune scène, et ce témoin doit mesurer le fil
    /// tel que l'app le monte. Ce n'était PAS la cause du rouge de #8329 :
    /// même rattaché et après 2 s d'attente, le message ne se dépliait pas —
    /// la passe de layout que #8162 avait retirée manquait au CODE.
    /// L'appelant masque la fenêtre en fin de test.
    private func makeScrolledThread() async throws -> (MessageListViewController, UICollectionView, UIWindow) {
        let vc = makeSUT(store: try await makeSeededStore())
        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first,
            "la suite tourne dans l'app hôte : une scène existe"
        )
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        window.rootViewController = vc
        window.isHidden = false
        vc.view.layoutIfNeeded()
        let cv = try XCTUnwrap(vc.focalCollectionViewForTesting)
        let indexPath = try XCTUnwrap(vc.dataSource.indexPath(for: .message(localId: Self.longId)))
        cv.scrollToItem(at: indexPath, at: .centeredVertically, animated: false)
        cv.layoutIfNeeded()
        let frame = try XCTUnwrap(cv.layoutAttributesForItem(at: indexPath)?.frame)
        vc.isIntentionalProgrammaticScroll = true
        cv.contentOffset.y = frame.maxY - cv.bounds.height - 80
        cv.layoutIfNeeded()
        vc.scrollViewDidScroll(cv)
        vc.isIntentionalProgrammaticScroll = false
        vc.isCurrentlyNearBottom = false
        let top = try visualTop(of: Self.longId, in: vc, cv: cv)
        XCTAssertLessThan(top, 0, "précondition : le haut du message est hors champ")
        return (vc, cv, window)
    }

    /// Laisse la re-mesure SwiftUI poser la nouvelle hauteur, puis rejoue un
    /// tour de défilement : c'est là que le verrou de scène restaurait l'ancre
    /// d'avant.
    ///
    /// On attend la CONDITION (la hauteur a changé), bornée, plutôt qu'une
    /// durée fixe : 50 ms étaient un pari sur la vitesse du simulateur de CI.
    /// La borne reste sous la fenêtre de tenue du bord
    /// (`LongMessageExpansionLaw.holdWindow`) tant que la hauteur se pose dans
    /// l'image suivante — une hauteur posée plus tard sortirait de la tenue, et
    /// l'assertion d'ancrage le dirait.
    private func settle(
        _ vc: MessageListViewController,
        _ cv: UICollectionView,
        until resized: () throws -> Bool
    ) async throws {
        let deadline = Date().addingTimeInterval(2)
        repeat {
            try await Task.sleep(for: .milliseconds(16))
            cv.layoutIfNeeded()
        } while (try? resized()) != true && Date() < deadline
        vc.scrollViewDidScroll(cv)
        cv.layoutIfNeeded()
    }

    private func frame(of localId: String, in vc: MessageListViewController, cv: UICollectionView) throws -> CGRect {
        let indexPath = try XCTUnwrap(vc.dataSource.indexPath(for: .message(localId: localId)))
        let cell = try XCTUnwrap(cv.cellForItem(at: indexPath), "la cellule du long message doit être visible")
        return cv.convert(cell.frame, to: vc.view)
    }

    private func visualTop(of localId: String, in vc: MessageListViewController, cv: UICollectionView) throws -> CGFloat {
        try frame(of: localId, in: vc, cv: cv).minY
    }

    private func visualBottom(of localId: String, in vc: MessageListViewController, cv: UICollectionView) throws -> CGFloat {
        try frame(of: localId, in: vc, cv: cv).maxY
    }

    private nonisolated static let longText = String(
        repeating: "Voici une phrase assez longue pour un message qui se déplie sur place dans le fil. ",
        count: 14
    )

    private func makeSeededStore() async throws -> MessageStore {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let t0 = Date(timeIntervalSince1970: 1_726_000_000)
        try await pool.write { db in
            for i in 1...60 {
                try Self.record(index: i, at: t0, content: "m\(i)" == Self.longId ? Self.longText : "Bonjour \(i)").insert(db)
            }
        }
        let store = MessageStore(conversationId: "c1", persistence: MessagePersistenceActor(dbWriter: pool))
        await store.refreshFromDB()
        return store
    }

    private nonisolated static func record(index i: Int, at t0: Date, content: String) -> MessageRecord {
        MessageRecord(
            localId: "m\(i)", serverId: "server_m\(i)",
            conversationId: "c1", senderId: "user_other",
            content: content, originalLanguage: "fr",
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
            createdAt: t0.addingTimeInterval(Double(i) * 3_600), sentAt: nil,
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
