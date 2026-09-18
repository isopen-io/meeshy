import XCTest
import UIKit
import UserNotifications
import MeeshySDK
@testable import Meeshy

/// #6999 — **ouvrir, c'est consommer.**
///
/// Le tap sur une bannière push ne marquait RIEN lu : la ligne restait non lue
/// dans la cloche et le compteur ne bougeait pas, pour une notification que
/// l'utilisateur venait d'ouvrir. `markRead(notificationId:)` n'avait qu'UN
/// appelant dans tout le dépôt — la ligne de cloche. Les types sans
/// `conversationId` ni `postId` (alerte de sécurité, nouvelle connexion, mot de
/// passe changé, double facteur, demande d'ami) n'avaient donc aucun chemin
/// vers « lu » : ils le restaient à vie.
///
/// Et le retrait des bannières se faisait par la seule clé de charge, jamais
/// par le `threadIdentifier` — ce qu'iOS a REGROUPÉ.
///
/// Fichier séparé de `NotificationActionHandlerTests` (1 183 lignes) : le
/// budget du `CLAUDE.md` racine interdit d'ajouter à un fichier qui franchirait
/// 1 200 lignes.
@MainActor
final class NotificationConsumptionWiringTests: XCTestCase {

    // MARK: - Doubles

    private final class NoopBackgroundTasks: BackgroundTaskScheduling {
        func beginTask(name: String, expirationHandler: (() -> Void)?) -> UIBackgroundTaskIdentifier {
            UIBackgroundTaskIdentifier(rawValue: 7)
        }
        func endTask(_ identifier: UIBackgroundTaskIdentifier) {}
    }

    private struct SUTContext {
        let sut: NotificationActionHandler
        let friendService: MockFriendService
        let consumedRefs: () -> [NotificationRef]
        let openedNotifications: () -> Int
    }

    /// `replyQueue` / `messagePersistence` gardent leurs défauts : seuls les
    /// chemins RÉPONSE et COMMENTAIRE les touchent, et ce fichier n'exerce que
    /// le tap et la réponse à une demande d'ami.
    private func makeSUT(isRegisteredUser: Bool = true) -> SUTContext {
        let friendService = MockFriendService()
        var consumed: [NotificationRef] = []
        var opened = 0

        let sut = NotificationActionHandler(
            friendService: friendService,
            backgroundTasks: NoopBackgroundTasks(),
            authTokenProvider: { "jwt-token" },
            applyAuthToken: { _ in },
            currentUserId: { "user1" },
            preferredLanguage: { "fr" },
            isRegisteredUser: { isRegisteredUser },
            openNotification: { _ in opened += 1 },
            localMarkRead: { _ in },
            consume: { consumed.append($0) },
            removeDeliveredForConversation: { _ in },
            removeDeliveredForPost: { _ in },
            removeDeliveredForNotificationIds: { _ in }
        )

        return SUTContext(
            sut: sut,
            friendService: friendService,
            consumedRefs: { consumed },
            openedNotifications: { opened }
        )
    }

    // MARK: - Le tap

    func test_defaultTap_consumesTheTappedNotification() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: UNNotificationDefaultActionIdentifier,
            userInfo: ["type": "security_alert", "notificationId": "n-42"],
            replyText: nil
        )

        XCTAssertEqual(
            ctx.consumedRefs(), [.notification(id: "n-42")],
            "une alerte de sécurité n'a ni conversation ni post : sans `notificationId`, rien ne la marque jamais lue"
        )
        XCTAssertEqual(ctx.openedNotifications(), 1, "la consommation ne remplace pas la navigation")
    }

    func test_viewAction_consumesTheTappedNotification() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.view.rawValue,
            userInfo: ["type": "achievement_unlocked", "notificationId": "n-7"],
            replyText: nil
        )

        XCTAssertEqual(ctx.consumedRefs(), [.notification(id: "n-7")])
    }

    func test_tapWithoutNotificationId_consumesNothing() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: UNNotificationDefaultActionIdentifier,
            userInfo: ["type": "new_message", "conversationId": "c-1"],
            replyText: nil
        )

        XCTAssertTrue(
            ctx.consumedRefs().isEmpty,
            "aucune identité de ligne servie ⇒ rien à marquer ; la portée conversation suit la navigation, pas le tap"
        )
        XCTAssertEqual(ctx.openedNotifications(), 1)
    }

    func test_dismiss_consumesNothing() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: UNNotificationDismissActionIdentifier,
            userInfo: ["type": "security_alert", "notificationId": "n-42"],
            replyText: nil
        )

        XCTAssertTrue(
            ctx.consumedRefs().isEmpty,
            "balayer une bannière n'est pas la lire — le geste dit exactement l'inverse"
        )
    }

    // MARK: - Les actions rapides ami

    private func makeFriendRequest() -> FriendRequest {
        FriendRequest(
            id: "fr-1",
            senderId: "u-2",
            receiverId: "user1",
            status: "pending",
            createdAt: Date()
        )
    }

    func test_friendAccept_consumesTheNotification() async {
        let ctx = makeSUT()
        ctx.friendService.respondResult = .success(makeFriendRequest())

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.accept.rawValue,
            userInfo: [
                "type": "friend_request",
                "notificationId": "n-friend",
                "senderId": "u-2",
                "friendRequestId": "fr-1"
            ],
            replyText: nil
        )

        XCTAssertEqual(
            ctx.consumedRefs(), [.notification(id: "n-friend")],
            "la demande est tranchée : sa ligne de cloche ne peut pas rester non lue"
        )
    }

    func test_friendDecline_consumesTheNotification() async {
        let ctx = makeSUT()
        ctx.friendService.respondResult = .success(makeFriendRequest())

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.decline.rawValue,
            userInfo: [
                "type": "friend_request",
                "notificationId": "n-friend",
                "senderId": "u-2",
                "friendRequestId": "fr-1"
            ],
            replyText: nil
        )

        XCTAssertEqual(ctx.consumedRefs(), [.notification(id: "n-friend")])
    }

    func test_friendResponseThatFails_consumesNothing() async {
        let ctx = makeSUT()
        ctx.friendService.respondResult = .failure(URLError(.notConnectedToInternet))

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.accept.rawValue,
            userInfo: [
                "type": "friend_request",
                "notificationId": "n-friend",
                "senderId": "u-2",
                "friendRequestId": "fr-1"
            ],
            replyText: nil
        )

        XCTAssertTrue(
            ctx.consumedRefs().isEmpty,
            "le serveur a refusé : la demande est toujours en attente, donc sa notification aussi"
        )
    }

    // MARK: - À quel FIL appartient une bannière

    func test_bannerBelongs_byThreadIdentifier() {
        let banner = DeliveredBanner(
            identifier: "d1",
            userInfo: [:],
            threadIdentifier: "conversation:c-1"
        )

        XCTAssertTrue(
            NotificationActionHandler.bannerBelongs(banner, to: .conversation(id: "c-1")),
            "c'est le `threadIdentifier` qui dit ce qu'iOS a REGROUPÉ — une charge sans clé y est quand même rangée"
        )
    }

    func test_bannerBelongs_byPayloadKeyWhenThreadIsMissing() {
        let banner = DeliveredBanner(identifier: "d1", userInfo: ["conversationId": "c-1"])

        XCTAssertTrue(
            NotificationActionHandler.bannerBelongs(banner, to: .conversation(id: "c-1")),
            "une bannière composée sans passer par la NSE n'a pas de fil : la clé de charge reste le second chemin"
        )
    }

    func test_bannerBelongs_isFalseForAnotherThread() {
        let banner = DeliveredBanner(
            identifier: "d1",
            userInfo: ["conversationId": "c-2"],
            threadIdentifier: "conversation:c-2"
        )

        XCTAssertFalse(NotificationActionHandler.bannerBelongs(banner, to: .conversation(id: "c-1")))
    }

    func test_bannerBelongs_matchesAPostThread() {
        let banner = DeliveredBanner(identifier: "d1", userInfo: [:], threadIdentifier: "post:p-9")

        XCTAssertTrue(NotificationActionHandler.bannerBelongs(banner, to: .post(id: "p-9")))
        XCTAssertFalse(NotificationActionHandler.bannerBelongs(banner, to: .conversation(id: "p-9")))
    }

    func test_bannerBelongs_isFalseForReferencesWithoutAThread() {
        let banner = DeliveredBanner(
            identifier: "d1",
            userInfo: ["notificationId": "n-1"],
            threadIdentifier: "conversation:c-1"
        )

        XCTAssertFalse(
            NotificationActionHandler.bannerBelongs(banner, to: .notification(id: "n-1")),
            "une notification isolée ne désigne aucun FIL — répondre « oui » retirerait les bannières voisines"
        )
        XCTAssertFalse(NotificationActionHandler.bannerBelongs(banner, to: .all))
        XCTAssertFalse(NotificationActionHandler.bannerBelongs(banner, to: .types(["friend_request"])))
    }

    // MARK: - Garde de source : la NSE compose les MÊMES fils

    /// **La jumelle non appelable.**
    ///
    /// L'extension de service ne lie pas MeeshySDK : elle ne peut pas appeler
    /// `NotificationThreadIdentifier`, et compose donc ses fils à la main. Deux
    /// écritures d'une même règle dans deux cibles qui ne se voient pas : si
    /// l'une change, aucune compilation ne rougit et le retrait par fil cesse
    /// silencieusement de trouver quoi que ce soit.
    func test_notificationServiceExtension_composesTheSameThreadIdentifiers() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/MeeshyTests/Unit/Services
            .deletingLastPathComponent()  // …/MeeshyTests/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .appendingPathComponent("MeeshyNotificationExtension/NotificationService.swift")
        // Dépouillé des commentaires : une garde de PRÉSENCE qui lit la source
        // brute verdirait sur une composition mise en commentaire.
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))

        XCTAssertTrue(
            source.contains(#"threadIdentifier = "conversation:\(conversationId)""#),
            "la NSE ne compose plus `conversation:<id>` — le retrait par fil de l'app ne trouvera plus rien"
        )
        XCTAssertTrue(
            source.contains(#"threadIdentifier = "post:\(postId)""#),
            "la NSE ne compose plus `post:<id>` — le retrait par fil de l'app ne trouvera plus rien"
        )
        XCTAssertEqual(NotificationThreadIdentifier.conversation("c-1"), "conversation:c-1")
        XCTAssertEqual(NotificationThreadIdentifier.post("p-1"), "post:p-1")
    }
}
