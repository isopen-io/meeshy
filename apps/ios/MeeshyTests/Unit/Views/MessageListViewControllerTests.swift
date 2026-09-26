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

    // MARK: - Séparateur de premier non-lu (#7222, D-L1..3)

    /// La loi de POSITIONNEMENT : « après » en INDEX du tableau place l'item
    /// plus HAUT à l'écran (le flux est inversé) — donc juste AU-DESSUS du
    /// premier message non lu, jamais en dessous. Même règle que
    /// `.dayHeader` (`MessageListSnapshotPrep`).
    func test_itemsWithUnreadSeparator_insertsRightAfterTheFrozenTargetMessage() throws {
        let store = try makeEmptyStore()
        let vc = makeSUT(store: store)
        vc.frozenUnreadSeparator = UnreadSeparatorBoundary(localId: "m2", count: 3)

        let items: [MessageListItem] = [
            .message(localId: "m3"), .message(localId: "m2"), .message(localId: "m1")
        ]
        let result = vc.itemsWithUnreadSeparator(items)

        XCTAssertEqual(result, [
            .message(localId: "m3"),
            .message(localId: "m2"),
            .firstUnreadSeparator(afterLocalId: "m2"),
            .message(localId: "m1")
        ])
    }

    /// Sans frontière gelée (fil sans non-lus, ou pas encore résolue) :
    /// `items` ressort BIT-À-BIT IDENTIQUE — jamais de séparateur fantôme.
    func test_itemsWithUnreadSeparator_noFrozenBoundary_returnsItemsUnchanged() throws {
        let store = try makeEmptyStore()
        let vc = makeSUT(store: store)
        XCTAssertNil(vc.frozenUnreadSeparator)

        let items: [MessageListItem] = [.message(localId: "m1"), .message(localId: "m2")]
        XCTAssertEqual(vc.itemsWithUnreadSeparator(items), items)
    }

    /// Le message-cible gelé est HORS de la fenêtre courante (page plus
    /// ancienne pas encore chargée) : un item introuvable ne serait jamais
    /// matérialisé et casserait le diff — `items` ressort inchangé plutôt
    /// que d'insérer un séparateur orphelin.
    func test_itemsWithUnreadSeparator_targetAbsentFromWindow_returnsItemsUnchanged() throws {
        let store = try makeEmptyStore()
        let vc = makeSUT(store: store)
        vc.frozenUnreadSeparator = UnreadSeparatorBoundary(localId: "does-not-exist", count: 1)

        let items: [MessageListItem] = [.message(localId: "m1"), .message(localId: "m2")]
        XCTAssertEqual(vc.itemsWithUnreadSeparator(items), items)
    }

    /// **La frontière RÉELLE, pas la fausse position arithmétique.** Le
    /// ViewModel publie `firstUnreadMessageId` (posé par
    /// `FirstUnreadBoundary.resolve`, S1) — le contrôleur le CAPTURE en gelant
    /// `frozenUnreadSeparator`, avec le COMPTE affiché au même geste.
    func test_conversationViewModel_publishesFirstUnread_freezesBoundaryWithItsCount() async throws {
        let store = try makeEmptyStore()
        let vc = makeSUT(store: store)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()

        let vm = try await makeConversationViewModel()
        vc.conversationViewModel = vm
        XCTAssertNil(vc.frozenUnreadSeparator, "rien à geler avant que le ViewModel ne publie une frontière")

        vm.unreadSeparatorCount = 4
        vm.firstUnreadMessageId = "m7"
        try await Task.sleep(for: .milliseconds(50))

        XCTAssertEqual(vc.frozenUnreadSeparator, UnreadSeparatorBoundary(localId: "m7", count: 4))
    }

    /// La frontière ne se gèle qu'UNE fois : un second message non lu publié
    /// plus tard (nouvel arrivant pendant que le fil est ouvert) ne DOIT PAS
    /// faire bouger un séparateur déjà posé sous les yeux du lecteur — c'est
    /// la pastille flottante `pendingUnreadCount` qui porte le VIVANT.
    func test_conversationViewModel_secondFirstUnreadPublish_doesNotUnfreezeTheBoundary() async throws {
        let store = try makeEmptyStore()
        let vc = makeSUT(store: store)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()

        let vm = try await makeConversationViewModel()
        vc.conversationViewModel = vm
        vm.unreadSeparatorCount = 2
        vm.firstUnreadMessageId = "m3"
        try await Task.sleep(for: .milliseconds(50))
        XCTAssertEqual(vc.frozenUnreadSeparator, UnreadSeparatorBoundary(localId: "m3", count: 2))

        vm.unreadSeparatorCount = 9
        vm.firstUnreadMessageId = "m9"
        try await Task.sleep(for: .milliseconds(50))

        XCTAssertEqual(
            vc.frozenUnreadSeparator, UnreadSeparatorBoundary(localId: "m3", count: 2),
            "la frontière déjà gelée ne doit pas être remplacée par une publication ultérieure"
        )
    }

    /// **Le séparateur atteint le PIXEL, pas seulement le tableau d'items.**
    ///
    /// `itemsWithUnreadSeparator` est une fonction pure : ses trois témoins
    /// ci-dessus prouvent la LOI de position, aucun ne prouve que
    /// `applySnapshot` l'appelle — retirer l'appel les laisserait tous verts
    /// pendant que le fil n'afficherait plus rien. Ce témoin-ci interroge la
    /// source de données APPLIQUÉE : c'est elle qui décide s'il existe une
    /// cellule.
    func test_frontiereGelee_leSeparateurEntreDansLaSourceDeDonnees() async throws {
        let store = try await makeSeededStore(count: 6)
        let vc = makeSUT(store: store)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()

        let vm = try await makeConversationViewModel()
        vc.conversationViewModel = vm
        vm.unreadSeparatorCount = 3
        vm.firstUnreadMessageId = "m4"
        try await Task.sleep(for: .milliseconds(120))

        let applique = vc.focalDataSourceForTesting?.snapshot().itemIdentifiers ?? []
        XCTAssertTrue(
            applique.contains(.firstUnreadSeparator(afterLocalId: "m4")),
            "la frontière gelée doit produire une CELLULE dans la source de données appliquée — sinon le séparateur n'existe que dans un tableau que personne ne rend"
        )
    }

    /// **D-L2 — une conversation à non-lus s'OUVRE sur le séparateur**, pas
    /// en bas. Le témoin lit l'OFFSET, la seule chose que l'utilisateur voit :
    /// dans le flux inversé, le bas du fil est `contentOffset.y == 0`.
    ///
    /// Il couvre aussi l'ÉPILOGUE du défilement voulu : une fois la scène
    /// rendue au verrou, un tour de `scrollViewDidScroll` ne doit pas
    /// restaurer l'ancre du BAS — sans l'adoption de la nouvelle ancre, le
    /// lecteur repartait tout en bas à la première correction self-sizing.
    func test_frontiereGelee_ouvreSurLeSeparateurEtLeVerrouAdopteLaPosition() async throws {
        let store = try await makeSeededStore(count: 60)
        let vc = makeSUT(store: store)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()

        let vm = try await makeConversationViewModel()
        vc.conversationViewModel = vm
        vm.unreadSeparatorCount = 2
        vm.firstUnreadMessageId = "m3"
        try await Task.sleep(for: .milliseconds(300))

        let cv = try XCTUnwrap(vc.focalCollectionViewForTesting)
        let pose = cv.contentOffset.y
        XCTAssertGreaterThan(
            pose, 0,
            "D-L2 : l'ouverture doit se poser SUR le séparateur — rester à l'offset 0, c'est rester en bas"
        )
        XCTAssertFalse(
            vc.isIntentionalProgrammaticScroll,
            "le drapeau de défilement voulu doit RETOMBER : fuir à true désarme le verrou de scène pour toute la session"
        )

        vc.scrollViewDidScroll(cv)
        XCTAssertEqual(
            cv.contentOffset.y, pose, accuracy: 2,
            "le verrou de scène doit avoir ADOPTÉ la position du séparateur, jamais restaurer l'ancre du bas"
        )
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
