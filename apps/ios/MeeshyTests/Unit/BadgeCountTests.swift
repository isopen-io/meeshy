import XCTest
import MeeshySDK

/// **D-L1 (#7236) — le badge d'icône compte des CONVERSATIONS non lues, hors
/// muettes, jamais la somme de leurs messages.**
///
/// Le témoin vit au niveau de l'APP parce que c'est la question qui manquait :
/// le registre sait compter, mais **qui AFFICHE ce qu'il compte ?** La valeur
/// rendue à l'icône est `NotificationCoordinator.badgeTotal` ; c'est donc elle
/// qu'on mesure, à travers le chemin nominal (une liste de conversations
/// republiée), et pas la fonction du registre prise à part — celle-là a ses
/// propres témoins dans le paquet.
///
/// Le nombre doit être le MÊME que celui que le serveur pousse dans
/// `aps.badge` (`computeConversationUnreadBadge`, gateway G3 #7218) : app
/// fermée et app au premier plan ne peuvent pas afficher deux chiffres pour un
/// état identique.
@MainActor
final class BadgeCountTests: XCTestCase {

    private var createdSuiteNames: [String] = []

    override func tearDown() {
        for suite in createdSuiteNames {
            UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite)
        }
        createdSuiteNames.removeAll()
        super.tearDown()
    }

    /// Un registre NEUF par coordinateur : la production partage `.shared`,
    /// deux tests qui se le partageraient hériteraient l'un de l'état de
    /// l'autre et l'ordre d'exécution déciderait du verdict.
    private func makeCoordinator() -> NotificationCoordinator {
        makeCoordinator(writer: RecordingBadgeWriter()).0
    }

    /// L'écrivain de badge est TOUJOURS un double : le vrai passerait par
    /// `UNUserNotificationCenter` et poserait un badge sur l'hôte de test.
    private func makeCoordinator(
        writer: RecordingBadgeWriter
    ) -> (NotificationCoordinator, String) {
        let suite = "group.test.meeshy.badge.\(UUID().uuidString)"
        createdSuiteNames.append(suite)
        UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite)
        let coordinator = NotificationCoordinator(
            badgeWriter: writer,
            appGroupSuiteName: suite,
            badgeEnabledProvider: { true },
            openConversationIdProvider: { nil },
            ledger: ConversationReadLedger()
        )
        return (coordinator, suite)
    }

    private func conversation(_ id: String, unread: Int, muted: Bool = false) -> MeeshyConversation {
        MeeshyConversation(
            id: id,
            identifier: id,
            type: .direct,
            title: "Conv \(id)",
            unreadCount: unread,
            isMuted: muted
        )
    }

    /// Le critère de #7236, à la lettre : trois conversations dont une muette
    /// et une à douze messages ⇒ badge **2**. Le témoin ne peut pas verdir sur
    /// une somme — elle dirait 17.
    func test_badgeTotal_countsConversations_notMessages() {
        let sut = makeCoordinator()

        sut.registerConversations([
            conversation("c1", unread: 12),
            conversation("c2", unread: 1),
            conversation("c3", unread: 4, muted: true)
        ])

        XCTAssertEqual(
            sut.badgeTotal, 2,
            "deux conversations non lues : la muette ne compte pas, et celle à douze " +
            "messages pèse UN — la somme (17) n'est pas ce que l'icône montre"
        )
    }

    /// La pastille de LIGNE, elle, garde sa somme de messages : le badge
    /// d'icône change de question, pas la liste.
    func test_rowCount_keepsItsMessageSum() {
        let sut = makeCoordinator()

        sut.registerConversations([conversation("c1", unread: 12)])

        XCTAssertEqual(sut.conversationUnreadCounts["c1"], 12)
        XCTAssertEqual(sut.badgeTotal, 1)
    }

    /// Une conversation entièrement lue ne pèse rien — sans quoi le badge
    /// compterait les conversations TOUT COURT.
    func test_badgeTotal_ignoresFullyReadConversations() {
        let sut = makeCoordinator()

        sut.registerConversations([
            conversation("c1", unread: 3),
            conversation("c2", unread: 0)
        ])

        XCTAssertEqual(sut.badgeTotal, 1)
    }

    /// Ce que l'icône REÇOIT, et pas seulement ce que le coordinateur calcule :
    /// `syncNow` écrit le même compte dans l'écrivain de badge et dans le
    /// miroir App Group que lit le widget.
    func test_syncNow_writesTheConversationCountToTheIcon() async {
        let writer = RecordingBadgeWriter()
        let (sut, suite) = makeCoordinator(writer: writer)

        sut.registerConversations([
            conversation("c1", unread: 12),
            conversation("c2", unread: 1),
            conversation("c3", unread: 4, muted: true)
        ])
        await sut.syncNow()

        XCTAssertEqual(writer.writes.last, 2, "l'icône reçoit le compte de conversations")
        XCTAssertEqual(
            UserDefaults(suiteName: suite)?.integer(forKey: "unread_count"), 2,
            "le miroir App Group porte le MÊME nombre que l'aps.badge du serveur"
        )
    }
}

/// Écrivain de badge à double : enregistre ce qui part vers l'icône sans
/// toucher au badge réel du simulateur.
private final class RecordingBadgeWriter: NotificationBadgeWriting, @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [Int] = []
    var writes: [Int] { lock.withLock { recorded } }

    func setBadgeCount(_ count: Int) async {
        lock.withLock { recorded.append(count) }
    }
}
