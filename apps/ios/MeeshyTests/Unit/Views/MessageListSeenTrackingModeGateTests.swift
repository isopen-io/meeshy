// apps/ios/MeeshyTests/Unit/Views/MessageListSeenTrackingModeGateTests.swift

import XCTest
import GRDB
import UIKit
@testable import Meeshy
@testable import MeeshySDK

/// **Le suivi de lecture ne compte que ce qu'un mode RENDU affiche**
/// (audit 2026-08-25, constat 2b-4).
///
/// Rivière et Résumé sont des panes OPAQUES montés SUR la liste dans le même
/// `ZStack` (`ConversationView`), qui reste montée DESSOUS : ses cellules
/// paraissaient, disparaissaient et nourrissaient l'accumulateur de lecture
/// pour des messages que personne n'a vus — des accusés de lecture partaient
/// donc pour un fil entièrement couvert. Le trou est à la JONCTION : la loi
/// pure est testée côté SDK (`SeenMessageAccumulatorTests`), la loi de sortie
/// par `OutboxDispatcherMarkAsReadEncodingTests` ; entre les deux, personne.
///
/// Le gate se pose au point d'USAGE, jamais dans le cycle de vie : le `didSet`
/// de `readingMode` sort sur `isViewLoaded`, or le mode arrive AVANT le
/// chargement de la vue — et l'ouverture DIRECTE en `.summary` (décision auto
/// au-delà de 25 non-lus) est justement le scénario de masse.
@MainActor
final class MessageListSeenTrackingModeGateTests: XCTestCase {

    // MARK: - Le prédicat

    func test_rendersThread_isFalseForRiverAndSummary_andTrueForTheRenderedModes() {
        XCTAssertFalse(MessageListViewController.rendersThread(.river), "la Rivière couvre le fil d'un pane opaque")
        XCTAssertFalse(MessageListViewController.rendersThread(.summary), "le Résumé aussi")
        XCTAssertTrue(MessageListViewController.rendersThread(.bubbles))
        XCTAssertTrue(MessageListViewController.rendersThread(.script))
        XCTAssertTrue(MessageListViewController.rendersThread(.focal))
    }

    /// Contre-épreuve du prédicat : il doit couvrir TOUS les modes du
    /// catalogue — un mode neuf qui couvrirait le fil devra s'y déclarer.
    func test_everyReadingMode_isClassifiedByThePredicate() {
        for mode in ConversationReadingMode.allCases {
            let rendered = MessageListViewController.rendersThread(mode)
            XCTAssertEqual(rendered, mode != .river && mode != .summary, "\(mode) mal classé")
        }
    }

    // MARK: - Suspension et reprise (comportement)

    /// En Rivière, une cellule qui « paraît » ne note plus RIEN : aucun accusé
    /// ne peut partir pour un message couvert par le pane.
    func test_willDisplay_whenReadingModeIsRiver_emitsNoReadReceipt() async throws {
        let vc = try await makeMountedSUT()
        var emitted: [[String]] = []
        vc.onMessagesSeen = { emitted.append($0) }

        // Le montage en mode rendu a déjà ACQUIS les cellules visibles ; F1 veut
        // qu'elles PARTENT même sous un pane (drain jamais gardé). On draine donc
        // AVANT de basculer : le témoin ne mesure que l'ENTRÉE sous le pane.
        vc.flushSeenNow()
        emitted.removeAll()
        vc.readingMode = .river
        emitted.removeAll()
        noteFirstItemAppeared(on: vc)
        vc.flushSeenNow()

        XCTAssertTrue(emitted.isEmpty, "aucun accusé ne part pour un fil couvert par la Rivière")
    }

    func test_willDisplay_whenReadingModeIsSummary_emitsNoReadReceipt() async throws {
        let vc = try await makeMountedSUT()
        var emitted: [[String]] = []
        vc.onMessagesSeen = { emitted.append($0) }

        // Le montage en mode rendu a déjà ACQUIS les cellules visibles ; F1 veut
        // qu'elles PARTENT même sous un pane (drain jamais gardé). On draine donc
        // AVANT de basculer : le témoin ne mesure que l'ENTRÉE sous le pane.
        vc.flushSeenNow()
        emitted.removeAll()
        vc.readingMode = .summary
        emitted.removeAll()
        noteFirstItemAppeared(on: vc)
        vc.flushSeenNow()

        XCTAssertTrue(emitted.isEmpty, "le Résumé couvre le fil autant que la Rivière")
    }

    /// **Contre-épreuve** : le MÊME geste, en mode rendu, émet bien l'accusé —
    /// sans ce témoin, les deux tests ci-dessus passeraient au vert pour
    /// n'importe quelle raison (accumulateur muet, flush inerte, id nul).
    func test_willDisplay_inARenderedMode_stillEmitsTheReadReceipt() async throws {
        let vc = try await makeMountedSUT()
        var emitted: [[String]] = []
        vc.onMessagesSeen = { emitted.append($0) }

        noteFirstItemAppeared(on: vc)
        vc.flushSeenNow()

        XCTAssertTrue(emitted.flatMap { $0 }.contains("server_m1"), "en mode rendu, la lecture est bien acquise")
    }

    /// Revenir d'un pane opaque REPREND le suivi : le gate suspend, il ne
    /// coupe pas.
    func test_returningToARenderedMode_resumesSeenTracking() async throws {
        // Monté DIRECTEMENT sous le pane : rien n'est acquis au montage (l'entrée
        // est gardée), donc l'accusé du retour est le PREMIER pour `server_m1` —
        // un montage en mode rendu l'aurait déjà signalé, et l'accumulateur
        // déduplique par id (`reported`).
        let vc = try await makeMountedSUT(initialMode: .river)
        var emitted: [[String]] = []
        vc.onMessagesSeen = { emitted.append($0) }

        noteFirstItemAppeared(on: vc)
        vc.flushSeenNow()
        XCTAssertTrue(emitted.isEmpty, "suspendu sous le pane")

        vc.readingMode = .bubbles
        noteFirstItemAppeared(on: vc)
        vc.flushSeenNow()
        XCTAssertTrue(emitted.flatMap { $0 }.contains("server_m1"), "le suivi reprend au retour")
    }

    /// **Le trou INVERSE** : ouvrir DIRECTEMENT sous un pane opaque puis en
    /// sortir. Les cellules déjà à l'écran ne repasseront jamais par
    /// `willDisplay` — sans re-notation, elles resteraient éternellement non
    /// lues. Ici, AUCUN `willDisplay` n'est simulé : le seul chemin possible
    /// est la re-notation du `didSet`.
    func test_returningToARenderedMode_reNotesAlreadyVisibleCells() async throws {
        let vc = try await makeMountedSUT(initialMode: .river)
        var emitted: [[String]] = []
        vc.onMessagesSeen = { emitted.append($0) }

        let visible = vc.focalCollectionViewForTesting?.indexPathsForVisibleItems ?? []
        try XCTSkipIf(visible.isEmpty, "UIKit n'a réalisé aucune cellule : rien à re-noter, le témoin serait vide de sens")

        vc.readingMode = .bubbles
        vc.flushSeenNow()

        XCTAssertTrue(
            emitted.flatMap { $0 }.contains("server_m1"),
            "les cellules déjà à l'écran sont re-notées au retour — sinon elles ne repasseraient jamais par willDisplay"
        )
    }

    /// La re-notation des cellules déjà à l'écran est elle-même gardée : la
    /// rappeler sous un pane opaque ne doit rien acquérir.
    func test_reNoteVisibleCellsAsSeen_underAnOpaquePane_notesNothing() async throws {
        let vc = try await makeMountedSUT()
        var emitted: [[String]] = []
        vc.onMessagesSeen = { emitted.append($0) }

        // Le montage en mode rendu a déjà ACQUIS les cellules visibles ; F1 veut
        // qu'elles PARTENT même sous un pane (drain jamais gardé). On draine donc
        // AVANT de basculer : le témoin ne mesure que l'ENTRÉE sous le pane.
        vc.flushSeenNow()
        emitted.removeAll()
        vc.readingMode = .summary
        emitted.removeAll()
        vc.reNoteVisibleCellsAsSeen()
        vc.flushSeenNow()

        XCTAssertTrue(emitted.isEmpty)
    }

    // MARK: - Gardes de source (les deux sites d'ENTRÉE + la re-notation)

    /// Le drain (`flushSeenMessages`, `drainSeenNow`) n'est PLUS gardé sur
    /// `rendersThread` depuis le 2026-08-25 (F1, revue adversariale) : le
    /// garder perdait silencieusement une lecture RÉELLEMENT acquise en
    /// Bulles/Script/Focal si le lecteur passait par la Rivière ou le Résumé
    /// avant de fermer la conversation — `flushSeenMessages` est le SEUL
    /// site de vidange au démontage
    /// (`MessageListView.dismantleUIViewController`) et sortait alors
    /// immédiatement, sans rien signaler. Le gate d'ENTRÉE ci-dessous suffit
    /// déjà à garantir que l'accumulateur ne contient QUE des messages
    /// réellement affichés — voir
    /// `test_readsAcquiredBeforeSwitchingToRiver_areStillFlushedAtDismantle`.
    func test_theTwoEntrySites_areGatedOnRendersThread() throws {
        let host = try normalizedHost()
        XCTAssertTrue(
            host.contains("guard rendersThread, let serverId = serverMessageId(at: indexPath) else { return } let now = Self.nowMs() lastSeenActivityMs = now seenAccumulator.appeared("),
            "willDisplay ne note plus une apparition sous un pane opaque"
        )
        XCTAssertTrue(
            host.contains("guard rendersThread, let serverId = serverMessageId(at: indexPath) else { return } let now = Self.nowMs() lastSeenActivityMs = now seenAccumulator.disappeared("),
            "didEndDisplaying non plus"
        )
    }

    /// **Le trou que F1 corrige** : une lecture ACQUISE (seuil `dwellMs`
    /// franchi) avant de rejoindre la Rivière ne doit pas être perdue à la
    /// fermeture de la conversation. Sans ce témoin, réintroduire
    /// `guard rendersThread` dans le drain (la régression que F1 corrige)
    /// passerait toute cette suite au vert : rien d'autre ici n'observe un
    /// `flush` APPELÉ APRÈS une bascule vers un pane opaque.
    func test_readsAcquiredBeforeSwitchingToRiver_areStillFlushedAtDismantle() async throws {
        let vc = try await makeMountedSUT()
        var emitted: [[String]] = []
        vc.onMessagesSeen = { emitted.append($0) }

        // Acquiert la lecture en Bulles : apparition puis disparition
        // séparées de plus de `dwellMs` (300 ms par défaut,
        // `SeenMessageAccumulator()`) — le temps réel s'écoule, aucune
        // horloge n'est simulable ici, les deux appels du délégué mesurant
        // eux-mêmes `Self.nowMs()`.
        noteFirstItemAppeared(on: vc)
        try await Task.sleep(nanoseconds: 350_000_000)
        let probe = UICollectionView(frame: .zero, collectionViewLayout: UICollectionViewFlowLayout())
        vc.collectionView(probe, didEndDisplaying: UICollectionViewCell(), forItemAt: IndexPath(item: 0, section: 0))

        // Bascule vers un pane opaque SANS jamais drainer entre-temps — le
        // scénario nominal « lire en Bulles, jeter un œil à la Rivière,
        // fermer ».
        vc.readingMode = .river
        emitted.removeAll()

        vc.flushSeenMessages()

        XCTAssertTrue(
            emitted.flatMap { $0 }.contains("server_m1"),
            "une lecture acquise AVANT de rejoindre la Rivière doit survivre au flush de démontage"
        )
    }

    /// **Garde NÉGATIVE** — le gate ne doit JAMAIS passer par
    /// `stopSeenTracking()` : ce timer porte aussi le `.tick` de la pilule
    /// jour·heure et du révélé d'horodatage (il est délibérément partagé).
    /// L'arrêter retirerait un effet visuel, hors directive.
    func test_theModeGate_neverStopsTheSharedTimer() throws {
        let host = try normalizedHost()
        let observer = try Self.block(after: "var readingMode: ConversationReadingMode = .bubbles { didSet {", in: host)
        XCTAssertTrue(
            Self.modeGateKeepsTheTimerAndReNotes(observer),
            "le `didSet` doit (a) NE PAS toucher `stopSeenTracking()` — ce timer porte aussi le "
            + "`.tick` de la pilule jour·heure et du révélé d'horodatage, l'arrêter retirerait un "
            + "effet visuel hors directive — et (b) re-noter les cellules déjà à l'écran au RETOUR "
            + "vers un mode rendu, sinon elles ne repasseraient jamais par `willDisplay` et "
            + "resteraient éternellement non lues. Corps lu : \(observer)"
        )
    }

    /// **Contre-épreuve** — la garde ci-dessus rougit dans les DEUX sens : si
    /// le timer partagé est arrêté, et si la re-notation du retour disparaît.
    /// Une garde négative qui ne sait pas dire NON meurt en silence.
    func test_theGuardAbove_wouldCatchTheTimerBeingStopped_orTheReNotationDisappearing() {
        let intact = "guard oldValue != readingMode, isViewLoaded else { return } "
            + "if Self.rendersThread(readingMode), !Self.rendersThread(oldValue) { reNoteVisibleCellsAsSeen() }"
        XCTAssertTrue(Self.modeGateKeepsTheTimerAndReNotes(intact), "le `didSet` conforme doit passer")
        XCTAssertFalse(
            Self.modeGateKeepsTheTimerAndReNotes(intact + " stopSeenTracking()"),
            "un `didSet` qui arrête le timer PARTAGÉ doit faire rougir la garde"
        )
        XCTAssertFalse(
            Self.modeGateKeepsTheTimerAndReNotes("guard oldValue != readingMode, isViewLoaded else { return }"),
            "un `didSet` qui a perdu la re-notation du retour aussi — c'est le trou INVERSE"
        )
    }

    /// Prédicat PARTAGÉ par la garde et sa contre-épreuve : c'est ce partage
    /// qui rend la seconde capable de faire rougir la première.
    private static func modeGateKeepsTheTimerAndReNotes(_ observer: String) -> Bool {
        !observer.contains("stopSeenTracking()")
            && observer.contains(
                "if Self.rendersThread(readingMode), !Self.rendersThread(oldValue) { reNoteVisibleCellsAsSeen() }"
            )
    }

    // MARK: - Helpers

    private func normalizedHost() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit/Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/MessageListViewController.swift")
        let raw = try String(contentsOf: url, encoding: .utf8)
        return AppSourceGuard.stripComments(raw)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    /// Corps d'une déclaration, par PARENTHÉSAGE d'accolades — une garde de
    /// forme vise le BLOC, jamais le fichier ni une fenêtre de N caractères
    /// (qui déborderait sur les déclarations voisines et diluerait la garde
    /// NÉGATIVE : un `stopSeenTracking()` du voisinage la ferait rougir à
    /// tort, et un `}` avalé lui ferait rater ce qu'elle interdit).
    private static func block(after signature: String, in code: String) throws -> String {
        let start = try XCTUnwrap(
            code.range(of: signature),
            "signature « \(signature) » introuvable — la garde ne peut pas lire un bloc absent"
        )
        var depth = 1
        var index = start.upperBound
        while index < code.endIndex {
            if code[index] == "{" { depth += 1 }
            if code[index] == "}" {
                depth -= 1
                if depth == 0 { break }
            }
            index = code.index(after: index)
        }
        return String(code[start.upperBound ..< index])
    }

    /// La cellule d'index 0 est le message le plus récent (liste inversée,
    /// `applySnapshot` : « index 0 = visuel bas »). On appelle le délégué
    /// directement : la réalisation d'une cellule par UIKit n'est pas un
    /// événement qu'un test peut exiger.
    private func noteFirstItemAppeared(on vc: MessageListViewController) {
        let probe = UICollectionView(frame: .zero, collectionViewLayout: UICollectionViewFlowLayout())
        vc.collectionView(probe, willDisplay: UICollectionViewCell(), forItemAt: IndexPath(item: 0, section: 0))
    }

    private func makeMountedSUT(initialMode: ConversationReadingMode? = nil) async throws -> MessageListViewController {
        let store = try await makeSeededStore()
        let vc = MessageListViewController(
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
        // Posé AVANT le chargement de la vue — c'est le scénario nominal :
        // le mode arrive avant `viewDidLoad`, et le `didSet` y sort sur
        // `isViewLoaded`. Aucun gate de cycle de vie ne peut donc s'y poser.
        if let initialMode { vc.readingMode = initialMode }
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()
        // Le réveil périodique n'a rien à faire dans un test synchrone : il
        // viderait l'accumulateur sous les pieds des assertions.
        //
        // Et on ne VIDE PAS l'accumulateur ici : `SeenMessageAccumulator`
        // retient ce qu'il a déjà rendu (`reported`), si bien qu'un drain de
        // mise en scène rendrait SOURD tout `appeared` ultérieur du même
        // identifiant — les témoins passeraient au vert par surdité.
        vc.stopSeenTracking()
        return vc
    }

    /// Un message unique, confirmé — mêmes champs que
    /// `MessageListViewControllerTests.makeSeededStore` (privée à son fichier).
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
}
