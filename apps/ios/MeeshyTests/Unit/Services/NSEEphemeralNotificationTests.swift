import XCTest
import MeeshySDK
@testable import Meeshy

/// La bannière d'un message éphémère affiche son échéance et disparaît à
/// l'heure, même sans réseau (#7453, contrat du fil #7451 points 7 et 10).
///
/// ## Ce que ces témoins couvrent, et pourquoi ils sont PURS
///
/// iOS ne sait pas faire battre une seconde dans une bannière standard, et
/// n'offre **aucune échéance native** pour une notification déjà délivrée. Le
/// retrait existait bien (`notification_revoked` → `revokeDeliveredBanners`)
/// mais il ne partait qu'à la DESTRUCTION du message côté serveur : sans
/// réseau, la bannière d'un message éphémère survivait indéfiniment au message
/// qu'elle annonçait — sur l'écran verrouillé, avec le placeholder qui dit
/// exactement qu'il y a quelque chose à cacher.
///
/// Les décisions sont donc des fonctions PURES, et elles vivent à deux
/// endroits pour une raison :
/// - `NotificationPayloadHelpers` (NSE, compilé aussi dans `MeeshyTests` par
///   `project.yml`) CALCULE l'échéance à l'arrivée d'un push et réécrit le
///   corps — deux gestes qui n'ont de sens qu'à ce moment-là ;
/// - `MeeshySDK.EphemeralBannerDeadline` LIT une échéance déjà gravée et dit
///   ce qu'on retire — une règle dont les trois chemins d'exécution (NSE,
///   retour au premier plan, `message:expired`) vivent dans trois cibles, et
///   qui diverge si on la recopie.
///
/// Le runtime `UNNotificationServiceExtension` n'entre jamais dans le
/// processus de test.
final class NSEEphemeralNotificationTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    // MARK: - L'échéance locale

    func test_ephemeralDeadline_avecDurée_rendMaintenantPlusLaDurée() {
        let info: [AnyHashable: Any] = ["ephemeralDuration": "300"]
        XCTAssertEqual(
            NotificationPayloadHelpers.ephemeralDeadline(userInfo: info, now: now),
            now.addingTimeInterval(300)
        )
    }

    /// Le payload push est un `Record<string, string>` côté passerelle, mais
    /// APNs remonte parfois un nombre JSON tel quel : les deux formes doivent
    /// être lues, sans quoi l'échéance dépendrait du sérialiseur.
    func test_ephemeralDeadline_duréeNumérique_estLueAussi() {
        let info: [AnyHashable: Any] = ["ephemeralDuration": 60]
        XCTAssertEqual(
            NotificationPayloadHelpers.ephemeralDeadline(userInfo: info, now: now),
            now.addingTimeInterval(60)
        )
    }

    func test_ephemeralDeadline_sansDurée_rendNil() {
        XCTAssertNil(NotificationPayloadHelpers.ephemeralDeadline(userInfo: [:], now: now))
    }

    /// Une durée nulle ou négative signifierait « déjà mort à la réception ».
    /// Aucun producteur n'a le droit de dire ça par omission : on ne fabrique
    /// pas d'échéance, la bannière reste ordinaire.
    func test_ephemeralDeadline_duréeNonPositive_rendNil() {
        XCTAssertNil(NotificationPayloadHelpers.ephemeralDeadline(userInfo: ["ephemeralDuration": "0"], now: now))
        XCTAssertNil(NotificationPayloadHelpers.ephemeralDeadline(userInfo: ["ephemeralDuration": "-5"], now: now))
        XCTAssertNil(NotificationPayloadHelpers.ephemeralDeadline(userInfo: ["ephemeralDuration": "plus tard"], now: now))
    }

    // MARK: - Le corps réécrit

    func test_ephemeralBody_porteLHeureDÉchéance() {
        let deadline = Date(timeIntervalSince1970: 1_800_005_520)
        let body = NotificationPayloadHelpers.ephemeralBody(
            deadline: deadline,
            locale: Locale(identifier: "fr_FR"),
            timeZone: TimeZone(identifier: "Europe/Paris")!
        )
        // L'heure LOCALE de l'appareil, jamais celle du serveur : la bannière
        // se lit sur l'écran verrouillé, où aucun fuseau ne s'explique.
        XCTAssertTrue(body.contains("10:32"), "corps rendu : \(body)")
    }

    func test_ephemeralBody_neFabriquePasDeSecondes() {
        let deadline = Date(timeIntervalSince1970: 1_800_005_555)
        let body = NotificationPayloadHelpers.ephemeralBody(
            deadline: deadline,
            locale: Locale(identifier: "fr_FR"),
            timeZone: TimeZone(identifier: "Europe/Paris")!
        )
        XCTAssertFalse(body.contains("35"), "l'heure s'affiche en heures et minutes, sans secondes : \(body)")
    }

    // MARK: - Le pré-enregistrement

    /// Le pré-enregistrement écrivait `expiresAt: nil` et `effectFlags: 0` : la
    /// bulle qu'il pose au démarrage à froid perdait sa protection jusqu'à la
    /// synchro REST. Un éphémère s'y affichait donc comme un message ordinaire,
    /// sans décompte — et une vue unique sans voile.
    func test_prePersistedMessagePlan_portLÉchéanceEtLesDrapeaux() {
        let info: [AnyHashable: Any] = [
            "type": "new_message",
            "messageId": "m1",
            "conversationId": "c1",
            "senderId": "u2",
            "content": "…",
            "ephemeralDuration": "300",
            "effectFlags": "1",
        ]
        let plan = NotificationPayloadHelpers.prePersistedMessagePlan(userInfo: info, now: now)
        XCTAssertEqual(plan?.expiresAt, now.addingTimeInterval(300))
        XCTAssertEqual(plan?.effectFlags, 1)
    }

    func test_prePersistedMessagePlan_messageOrdinaire_nInventeNiÉchéanceNiDrapeau() {
        let info: [AnyHashable: Any] = [
            "type": "new_message",
            "messageId": "m1",
            "conversationId": "c1",
            "senderId": "u2",
            "content": "Salut",
        ]
        let plan = NotificationPayloadHelpers.prePersistedMessagePlan(userInfo: info, now: now)
        XCTAssertNil(plan?.expiresAt)
        XCTAssertEqual(plan?.effectFlags, 0)
    }

    // MARK: - La vue unique garde son libellé

    /// La bannière d'une vue unique dit « Vue unique », pas une heure : ce qui
    /// compte pour ce message n'est pas quand il meurt, c'est qu'on ne pourra
    /// le lire qu'une fois (#7453, exigence 3).
    func test_ephemeralBodyOverride_vueUnique_neRéécritPasLeCorps() {
        let deadline = now.addingTimeInterval(300)
        let parLeDrapeau: [AnyHashable: Any] = ["effectFlags": "5"]     // ephemeral | viewOnce
        let parLaClé: [AnyHashable: Any] = ["notificationLocKey": "notification.view_once_message"]
        XCTAssertNil(NotificationPayloadHelpers.ephemeralBodyOverride(userInfo: parLeDrapeau, deadline: deadline))
        XCTAssertNil(NotificationPayloadHelpers.ephemeralBodyOverride(userInfo: parLaClé, deadline: deadline))
    }

    func test_ephemeralBodyOverride_éphémèreOrdinaire_réécritLeCorps() {
        let deadline = now.addingTimeInterval(300)
        let body = NotificationPayloadHelpers.ephemeralBodyOverride(
            userInfo: ["effectFlags": "1"],
            deadline: deadline,
            locale: Locale(identifier: "fr_FR"),
            timeZone: TimeZone(identifier: "Europe/Paris")!
        )
        XCTAssertNotNil(body)
    }

    // MARK: - Aucun média sous une protection

    /// **Le second verrou.** Le serveur ne pose déjà plus d'URL de média pour
    /// un message protégé (`mediaMayTravel`, cycle 125) — mais un champ de
    /// service qui DÉCLARE une restriction ne la fait pas respecter, et c'est
    /// l'hôte qui rend. Une photo à vue unique s'est affichée ENTIÈRE sur un
    /// écran verrouillé sous une bannière qui disait « 👁️ 🖼️ ».
    func test_declaresProtection_reconnaîtLesDeuxDéclarations() {
        XCTAssertTrue(NSEAttachmentPolicy.declaresProtection(userInfo: ["effectFlags": "4"]))   // viewOnce
        XCTAssertTrue(NSEAttachmentPolicy.declaresProtection(userInfo: ["effectFlags": "2"]))   // blurred
        XCTAssertTrue(NSEAttachmentPolicy.declaresProtection(userInfo: ["effectFlags": "1"]))   // ephemeral
        XCTAssertTrue(NSEAttachmentPolicy.declaresProtection(
            userInfo: ["notificationLocKey": "notification.view_once_message"]
        ))
    }

    /// Un effet purement VISUEL (arc-en-ciel, bit 18) n'est pas une
    /// protection : le confondre priverait de vignette un message ordinaire.
    func test_declaresProtection_ignoreLesEffetsQuiNeProtègentRien() {
        XCTAssertFalse(NSEAttachmentPolicy.declaresProtection(userInfo: [:]))
        XCTAssertFalse(NSEAttachmentPolicy.declaresProtection(userInfo: ["effectFlags": "0"]))
        XCTAssertFalse(NSEAttachmentPolicy.declaresProtection(userInfo: ["effectFlags": "\(1 << 18)"]))
        XCTAssertFalse(NSEAttachmentPolicy.declaresProtection(userInfo: ["notificationLocKey": "  "]))
    }

    // MARK: - Le balayage local

    func test_expiredNotificationIdentifiers_retientCeQuiEstÉchu() {
        let entries: [(id: String, userInfo: [AnyHashable: Any])] = [
            ("vieux", ["ephemeralDeadline": now.addingTimeInterval(-1).timeIntervalSince1970]),
            ("pile", ["ephemeralDeadline": now.timeIntervalSince1970]),
            ("vivant", ["ephemeralDeadline": now.addingTimeInterval(120).timeIntervalSince1970]),
            ("ordinaire", [:]),
        ]
        XCTAssertEqual(
            EphemeralBannerDeadline.expiredIdentifiers(from: entries, now: now).sorted(),
            ["pile", "vieux"]
        )
    }

    func test_expiredNotificationIdentifiers_litUneÉchéanceEnChaîneCommeEnNombre() {
        // Un `userInfo` traverse une sérialisation APNs : l'échéance ne doit
        // pas dépendre du sérialiseur qui la rend.
        let entries: [(id: String, userInfo: [AnyHashable: Any])] = [
            ("nombre", [EphemeralBannerDeadline.userInfoKey: now.addingTimeInterval(-1).timeIntervalSince1970]),
            ("chaine", [EphemeralBannerDeadline.userInfoKey: "\(now.addingTimeInterval(-1).timeIntervalSince1970)"]),
        ]
        XCTAssertEqual(
            EphemeralBannerDeadline.expiredIdentifiers(from: entries, now: now).sorted(),
            ["chaine", "nombre"]
        )
    }

    /// Une bannière sans échéance n'est JAMAIS retirée par ce balayage : il ne
    /// connaît que les éphémères, et confondre les deux effacerait des
    /// notifications que personne n'a demandé de retirer — un retrait étant
    /// irréversible pour l'utilisateur.
    func test_expiredNotificationIdentifiers_ignoreCeQuiNAPasDÉchéance() {
        let entries: [(id: String, userInfo: [AnyHashable: Any])] = [
            ("ordinaire", ["type": "new_message"]),
            ("illisible", ["ephemeralDeadline": "bientôt"]),
        ]
        XCTAssertTrue(EphemeralBannerDeadline.expiredIdentifiers(from: entries, now: now).isEmpty)
    }
}
