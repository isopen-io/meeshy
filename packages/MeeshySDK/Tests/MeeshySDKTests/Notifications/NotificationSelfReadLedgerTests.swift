import Testing
import Foundation
@testable import MeeshySDK

/// #7000 — le gateway renvoie `notification:read` à la room `user:<id>`, donc
/// AUSSI à l'appareil qui vient de marquer. Le compteur descendait alors de
/// DEUX pour un seul tap. Le registre est la seule pièce capable de dire « cet
/// écho est le mien » : l'événement lui-même ne porte que le `notificationId`.
@Suite("Registre des lectures dont cet appareil est l'auteur")
struct NotificationSelfReadLedgerTests {

    @Test("un écho qui suit notre propre marquage est réclamé")
    func ownEchoIsClaimed() {
        var ledger = NotificationSelfReadLedger()
        let t0 = Date()

        ledger.register("n-1", at: t0)

        #expect(ledger.claimsEcho("n-1", at: t0.addingTimeInterval(0.2)) == true)
    }

    @Test("un écho pour une notification qu'on n'a pas marquée n'est pas réclamé")
    func foreignEchoIsNotClaimed() {
        var ledger = NotificationSelfReadLedger()
        let t0 = Date()

        ledger.register("n-1", at: t0)

        #expect(ledger.claimsEcho("n-2", at: t0) == false)
    }

    @Test("un second écho dans la fenêtre reste réclamé — un mark-read idempotent peut être rejoué")
    func repeatedEchoStaysClaimed() {
        var ledger = NotificationSelfReadLedger()
        let t0 = Date()
        ledger.register("n-1", at: t0)

        _ = ledger.claimsEcho("n-1", at: t0.addingTimeInterval(0.1))

        #expect(
            ledger.claimsEcho("n-1", at: t0.addingTimeInterval(0.4)) == true,
            "retirer l'entrée à la première réclamation laisserait un second écho décrémenter un compteur déjà à jour"
        )
    }

    @Test("passée la fenêtre, l'écho redevient une lecture faite ailleurs")
    func echoAfterWindowIsForeign() {
        var ledger = NotificationSelfReadLedger(window: 1)
        let t0 = Date()
        ledger.register("n-1", at: t0)

        #expect(ledger.claimsEcho("n-1", at: t0.addingTimeInterval(1.5)) == false)
    }

    @Test("un rollback réseau rend l'id au monde extérieur")
    func forgetAfterRollback() {
        var ledger = NotificationSelfReadLedger()
        let t0 = Date()
        ledger.register("n-1", at: t0)

        ledger.forget("n-1")

        #expect(
            ledger.claimsEcho("n-1", at: t0) == false,
            "le `−1` a été rendu : un écho ultérieur doit bien décrémenter"
        )
    }

    @Test("un id vide n'est jamais enregistré")
    func emptyIdIsIgnored() {
        var ledger = NotificationSelfReadLedger()

        ledger.register("", at: Date())

        #expect(ledger.claimsEcho("", at: Date()) == false)
    }

    @Test("le logout vide le registre")
    func removeAllClearsTheLedger() {
        var ledger = NotificationSelfReadLedger()
        let t0 = Date()
        ledger.register("n-1", at: t0)

        ledger.removeAll()

        #expect(ledger.claimsEcho("n-1", at: t0) == false)
    }
}
