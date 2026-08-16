// apps/ios/MeeshyTests/Unit/Focal/FocalConversationStartMountTests.swift

import XCTest
import GRDB
import UIKit
@testable import Meeshy
@testable import MeeshySDK

/// R-d (réserve tracée Porte V1, `tasks/lentille-workshop-execution.md` §8) :
/// « rangée `.conversationStart` non montée ». Re-preuve : le contrat Focal
/// (§4.5 « Inset de tête », §4.8, WS-6 travail 4) attend un 4ᵉ item
/// diffable `MessageListItem.conversationStart` → `FocalConversationStartRow`,
/// APPENDÉ EN QUEUE (jamais en tête — préservation d'offset au prepend) et
/// SEULEMENT quand `hasReachedOldest == true`. Avant ce correctif :
/// `FocalConversationStartRow` (le RENDU pur) existait déjà (`Focal/Row/`),
/// mais `MessageListItem` ne déclarait pas le cas `.conversationStart` et
/// AUCUN site ne le montait — le contrat était vrai sur le papier, faux dans
/// le code.
///
/// **Choix de gating documenté (arbitrage de ce lot)** : `headInset` (§4.5)
/// n'existe qu'en perspective (`readingMode.usesPerspective`, Focal seul —
/// `FocalHostInsetCompositionTests`), et `FocalConversationStartRow` habite
/// précisément cet espace réservé en tête de liste. La rangée est donc
/// montée SOUS LA MÊME GARDE que `headInset` :
/// `readingMode.usesPerspective && hasReachedOldest` — Script (`usesFlatRow`
/// mais pas `usesPerspective`) reste plat par construction (WS-4, aucune
/// perspective), Bulles (flag OFF) ignore ce marqueur, rendu historique
/// inchangé.
///
/// **Pourquoi une mesure de COMPTE plutôt qu'une lecture directe du
/// snapshot.** `dataSource` est `private` à `MessageListViewController` —
/// même `@testable import` ne lève pas une visibilité `private` (portée
/// fichier). Cette suite mesure donc `collectionView.numberOfItems(inSection:)`,
/// un proxy public déjà éprouvé dans ce module (`FocalHostInsetCompositionTests`
/// utilise le même genre de proxy — `contentInset` — plutôt qu'une lecture
/// interne). La position « toujours en QUEUE, jamais en tête » est, elle,
/// garantie PAR CONSTRUCTION (`items.append(.conversationStart)` — jamais un
/// `insert(at: 0, ...)`) et re-prouvée par une garde source dédiée plus bas.
@MainActor
final class FocalConversationStartMountTests: XCTestCase {

    // MARK: - Fabriques

    /// Un message unique confirmé (`state: .sent`) — un seul groupe de jour,
    /// donc `bodyItems = [message, dayHeader]` (2 items) sans `.conversationStart`.
    /// Cette taille fixe (2) est le BASELINE dont chaque test ci-dessous
    /// mesure l'écart.
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

    /// Les flags SONT posés AVANT le montage : `viewDidLoad` (déclenché par
    /// `layoutIfNeeded`) appelle `applySnapshot(animated: false)` en toute
    /// fin de configuration (§WS-6) — c'est ce premier appel que ces tests
    /// observent, avec `readingMode`/`hasReachedOldest` déjà à leur valeur
    /// cible (leurs `didSet` respectifs sont muets tant que `isViewLoaded`
    /// est faux, mais la valeur STOCKÉE est bien celle lue par `applySnapshot`).
    private func mount(
        _ vc: MessageListViewController,
        readingMode: ConversationReadingMode,
        hasReachedOldest: Bool
    ) {
        vc.readingMode = readingMode
        vc.hasReachedOldest = hasReachedOldest
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()
    }

    // MARK: - Montage : ON seulement quand perspective ET page la plus ancienne atteinte

    func test_conversationStart_isAppended_whenFocalAndHasReachedOldest() async throws {
        let vc = makeSUT(store: try await makeSeededStore())
        mount(vc, readingMode: .focal, hasReachedOldest: true)

        let count = try XCTUnwrap(vc.focalCollectionViewForTesting?.numberOfItems(inSection: 0))
        XCTAssertEqual(
            count, 3,
            "readingMode == .focal ET hasReachedOldest == true doit ajouter EXACTEMENT un item " +
            "(baseline 2 : 1 message + 1 dayHeader) — la rangée .conversationStart (contrat §4.5/§4.8)."
        )
    }

    func test_conversationStart_isAbsent_whenHasReachedOldestFalse_evenInFocal() async throws {
        let vc = makeSUT(store: try await makeSeededStore())
        mount(vc, readingMode: .focal, hasReachedOldest: false)

        let count = try XCTUnwrap(vc.focalCollectionViewForTesting?.numberOfItems(inSection: 0))
        XCTAssertEqual(
            count, 2,
            "hasReachedOldest == false ⇒ AUCUN .conversationStart, même en .focal — la rangée ne " +
            "doit jamais anticiper une page non chargée (même garde que headInset, §4.5)."
        )
    }

    func test_conversationStart_isAbsent_inScriptMode_evenWhenHasReachedOldest() async throws {
        let vc = makeSUT(store: try await makeSeededStore())
        mount(vc, readingMode: .script, hasReachedOldest: true)

        let count = try XCTUnwrap(vc.focalCollectionViewForTesting?.numberOfItems(inSection: 0))
        XCTAssertEqual(
            count, 2,
            "readingMode == .script (plat, WS-4, zéro perspective) doit rester à 2 — " +
            ".conversationStart vit dans l'espace réservé par headInset, qui n'existe qu'en " +
            "perspective (Focal seul)."
        )
    }

    func test_conversationStart_isAbsent_inBubblesMode_evenWhenHasReachedOldestTrue() async throws {
        let vc = makeSUT(store: try await makeSeededStore())
        mount(vc, readingMode: .bubbles, hasReachedOldest: true)

        let count = try XCTUnwrap(vc.focalCollectionViewForTesting?.numberOfItems(inSection: 0))
        XCTAssertEqual(
            count, 2,
            "readingMode == .bubbles (drapeau OFF, défaut) doit rester bit-à-bit identique à " +
            "aujourd'hui : AUCUNE rangée .conversationStart, même hasReachedOldest == true."
        )
    }

    // MARK: - Garde source : « en queue », jamais en tête

    private func viewControllerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/MessageListViewController.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// `.conversationStart` doit être ajouté par `.append(...)` — JAMAIS par
    /// `.insert(..., at: 0)` ni en préfixant le tableau (`[.conversationStart] + items`),
    /// qui casseraient l'invariant « jamais en tête / préservation d'offset
    /// au prepend » (§4.5) prouvé par construction plutôt que par une mesure
    /// d'IndexPath (`dataSource` est `private`, hors de portée des tests).
    func test_conversationStart_isAddedByAppend_neverByInsertAtHead() throws {
        let stripped = AppSourceGuard.stripComments(try viewControllerSource())
        XCTAssertTrue(
            stripped.contains("items.append(.conversationStart)"),
            "MessageListViewController.swift doit ajouter `.conversationStart` par " +
            "`items.append(.conversationStart)` — pattern introuvable, la garde « en queue » a " +
            "peut-être été contournée."
        )
        XCTAssertFalse(
            stripped.contains("[.conversationStart] +") || stripped.contains(", at: 0"),
            "`.conversationStart` ne doit JAMAIS être préfixé au tableau d'items ni inséré à " +
            "l'index 0 — cela romprait la préservation d'offset au prepend (§4.5)."
        )
    }

    func test_conversationStart_gatedByUsesPerspectiveAndHasReachedOldest() throws {
        let stripped = AppSourceGuard.stripComments(try viewControllerSource())
        XCTAssertTrue(
            stripped.contains("if readingMode.usesPerspective && hasReachedOldest {\n            items.append(.conversationStart)"),
            "la garde `readingMode.usesPerspective && hasReachedOldest` doit précéder " +
            "IMMÉDIATEMENT `items.append(.conversationStart)` — même garde que headInset (§4.5), " +
            "aucune condition intermédiaire qui la contournerait."
        )
    }

    // MARK: - Le mux de datasource sait déqueuer `.conversationStart`

    func test_dataSourceSwitch_dequeuesConversationStartViaStartRegistration() throws {
        let stripped = AppSourceGuard.stripComments(try viewControllerSource())
        XCTAssertTrue(
            stripped.contains("case .conversationStart:") &&
            stripped.contains("dequeueConfiguredReusableCell(using: startRegistration, for: indexPath, item: item)"),
            "le mux `UICollectionViewDiffableDataSource` doit dequeuer `.conversationStart` via " +
            "`startRegistration` — sans ce cas, l'enum ne serait plus exhaustif et le fichier ne " +
            "compilerait pas ; ce témoin documente le câblage attendu."
        )
    }

    func test_startRegistration_rendersFocalConversationStartRow() throws {
        let stripped = AppSourceGuard.stripComments(try viewControllerSource())
        XCTAssertTrue(
            stripped.contains("FocalConversationStartRow(conversationName: name, isDark: dark)"),
            "`startRegistration` doit configurer sa cellule avec `FocalConversationStartRow` " +
            "(vue pure, `Focal/Row/FocalConversationStartRow.swift`) — le RENDU était déjà prêt " +
            "avant ce lot, seul le MONTAGE manquait (R-d)."
        )
    }
}
